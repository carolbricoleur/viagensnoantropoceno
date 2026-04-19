import { useState, useRef, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Plus, GripVertical, Trash2, Download, Tag, FolderPlus, ChevronDown, ChevronUp, X, SendHorizonal, Pencil, Check } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'
import { loadPautas, savePautas, loadConteudos, saveConteudos } from '@/lib/storage'
import { sendMentionNotification } from '@/lib/emailjs'
import { extractMentions, generateId, todayISO, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { MarkdownEditor, MarkdownRenderer } from '@/components/shared/MarkdownEditor'
import { UserChip, UserPicker } from '@/components/shared/UserPicker'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type { PautaData, PautaItem, PautaSection, PautaTag, ConteudoItem } from '@/types'

const TAG_COLORS = [
  { bg: 'bg-purple-100', text: 'text-purple-700', value: 'purple' },
  { bg: 'bg-blue-100', text: 'text-blue-700', value: 'blue' },
  { bg: 'bg-green-100', text: 'text-green-700', value: 'green' },
  { bg: 'bg-amber-100', text: 'text-amber-700', value: 'amber' },
  { bg: 'bg-red-100', text: 'text-red-700', value: 'red' },
  { bg: 'bg-pink-100', text: 'text-pink-700', value: 'pink' },
  { bg: 'bg-teal-100', text: 'text-teal-700', value: 'teal' },
]

function getTagColor(color: string) {
  return TAG_COLORS.find(c => c.value === color) ?? TAG_COLORS[0]
}

export function Pautas() {
  const { session } = useAuth()
  const { projectId, projectMeta } = useProject()
  const queryClient = useQueryClient()
  const { toasts, toast, dismiss } = useToast()
  const navigate = useNavigate()

  const [forwarding, setForwarding] = useState<string | null>(null) // item.id being forwarded

  const [quickAdd, setQuickAdd] = useState('')
  const [quickSectionId, setQuickSectionId] = useState<string | undefined>(undefined)
  const quickRef = useRef<HTMLInputElement>(null)

  const [itemDialog, setItemDialog] = useState(false)
  const [editItem, setEditItem] = useState<PautaItem | null>(null)
  const [itemTitle, setItemTitle] = useState('')
  const [itemBody, setItemBody] = useState('')
  const [itemTags, setItemTags] = useState<string[]>([])
  const [itemDueDate, setItemDueDate] = useState('')
  const [itemSectionId, setItemSectionId] = useState<string | undefined>(undefined)
  const [itemAtribuicao, setItemAtribuicao] = useState<string | undefined>(undefined)
  const [savingItem, setSavingItem] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // @ mention dropdown (shared between title field in dialog and quick-add inline input)
  const [atOpen, setAtOpen] = useState(false)
  const [atSource, setAtSource] = useState<'dialog' | 'quickadd'>('dialog')
  const [atPos, setAtPos] = useState({ top: 0, left: 0 })
  const [atQuery, setAtQuery] = useState('')
  const [atExternalInput, setAtExternalInput] = useState('')
  const atDropRef = useRef<HTMLDivElement>(null)

  const [quickAtribuicao, setQuickAtribuicao] = useState<string | undefined>(undefined)

  const [tagDialog, setTagDialog] = useState(false)
  const [newTagLabel, setNewTagLabel] = useState('')
  const [newTagColor, setNewTagColor] = useState('purple')

  const [sectionDialog, setSectionDialog] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')

  const [renamingSection, setRenamingSection] = useState<string | null>(null)
  const [renameSectionTitle, setRenameSectionTitle] = useState('')

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportOpen])

  useEffect(() => {
    if (!atOpen) return
    function handleClick(e: MouseEvent) {
      if (atDropRef.current && !atDropRef.current.contains(e.target as Node)) {
        setAtOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [atOpen])

  const { data: pautaData, isLoading } = useQuery({
    queryKey: ['pautas', projectId],
    queryFn: () => loadPautas(projectId),
  })

  const data: PautaData = pautaData ?? { sections: [], items: [], tags: [] }

  async function saveData(newData: PautaData) {
    await savePautas(projectId, newData)
    queryClient.setQueryData(['pautas', projectId], newData)
  }

  // Items without a section + items by section
  const unsectioned = useMemo(() => data.items.filter(i => !i.sectionId).sort((a, b) => a.order - b.order), [data.items])
  const bySectionId = useMemo(() => {
    const map = new Map<string, PautaItem[]>()
    for (const s of data.sections) map.set(s.id, [])
    for (const item of data.items) {
      if (item.sectionId) {
        if (!map.has(item.sectionId)) map.set(item.sectionId, [])
        map.get(item.sectionId)!.push(item)
      }
    }
    for (const [, arr] of map) arr.sort((a, b) => a.order - b.order)
    return map
  }, [data.items, data.sections])

  async function handleQuickAdd(sectionId?: string) {
    if (!quickAdd.trim()) return
    const now = new Date().toISOString()
    const newItem: PautaItem = {
      id: generateId(),
      title: quickAdd.trim(),
      order: data.items.length,
      sectionId,
      tags: [],
      attachments: [],
      mentions: [],
      atribuicao: quickAtribuicao,
      createdAt: now,
      updatedAt: now,
    }
    const newData = { ...data, items: [...data.items, newItem] }
    await saveData(newData)
    setQuickAdd('')
    setQuickAtribuicao(undefined)
    setQuickSectionId(undefined)
  }

  function openNewItem(sectionId?: string) {
    setEditItem(null)
    setItemTitle('')
    setItemBody('')
    setItemTags([])
    setItemDueDate('')
    setItemSectionId(sectionId)
    setItemAtribuicao(undefined)
    setItemDialog(true)
  }

  function openEditItem(item: PautaItem) {
    setEditItem(item)
    setItemTitle(item.title)
    setItemBody(item.body ?? '')
    setItemTags(item.tags)
    setItemDueDate(item.dueDate ?? '')
    setItemSectionId(item.sectionId)
    setItemAtribuicao(item.atribuicao)
    setItemDialog(true)
  }

  async function handleSaveItem() {
    if (!itemTitle.trim()) return
    setSavingItem(true)
    try {
      const now = new Date().toISOString()
      const prevMentions = editItem?.mentions ?? []
      const newMentions = extractMentions(itemBody)
      const added = newMentions.filter(e => !prevMentions.includes(e))

      const item: PautaItem = editItem
        ? { ...editItem, title: itemTitle.trim(), body: itemBody, tags: itemTags, dueDate: itemDueDate || undefined, sectionId: itemSectionId, mentions: newMentions, atribuicao: itemAtribuicao, updatedAt: now }
        : {
          id: generateId(),
          title: itemTitle.trim(),
          body: itemBody,
          order: data.items.length,
          sectionId: itemSectionId,
          tags: itemTags,
          attachments: [],
          mentions: newMentions,
          atribuicao: itemAtribuicao,
          dueDate: itemDueDate || undefined,
          createdAt: now,
          updatedAt: now,
        }

      const newItems = editItem
        ? data.items.map(i => i.id === item.id ? item : i)
        : [...data.items, item]

      await saveData({ ...data, items: newItems })

      for (const email of added) {
        await sendMentionNotification({
          mentionerEmail: session!.email,
          mentionedEmail: email,
          projectName: projectMeta?.name ?? projectId,
          moduleName: 'Pautas',
          excerpt: itemBody.slice(0, 200),
        })
      }

      setItemDialog(false)
      toast({ title: editItem ? 'Item atualizado' : 'Item adicionado' })
    } catch (err) {
      toast({ title: 'Erro', description: String(err), variant: 'destructive' })
    }
    setSavingItem(false)
  }

  async function handleDeleteItem(id: string) {
    const newItems = data.items.filter(i => i.id !== id)
    await saveData({ ...data, items: newItems })
    setItemDialog(false)
  }

  async function handleForwardToConteudos(item: PautaItem) {
    if (forwarding) return
    setForwarding(item.id)
    try {
      const conteudos = await loadConteudos(projectId)
      // Avoid duplicate forwarding
      if (conteudos.items.some(c => c.pautaId === item.id)) {
        toast({ title: 'Pauta já encaminhada', description: 'Esta pauta já foi enviada para Conteúdos.', variant: 'destructive' })
        return
      }
      const now = new Date().toISOString()
      const newConteudo: ConteudoItem = {
        id: generateId(),
        descricao: item.title,
        body: item.body,
        atribuicao: item.atribuicao,
        importancia: 'baixa',
        progresso: 'na-fila',
        pautaId: item.id,
        order: conteudos.items.length,
        createdAt: now,
        updatedAt: now,
      }
      const updatedConteudos = { ...conteudos, items: [...conteudos.items, newConteudo] }
      await saveConteudos(projectId, updatedConteudos)
      // Update React Query cache so Conteúdos page shows new item immediately
      queryClient.setQueryData(['conteudos', projectId], updatedConteudos)
      // Remove from Pautas
      await handleDeleteItem(item.id)
      // Notify assigned user (if any) that a task was assigned to them in Conteúdos
      if (item.atribuicao) {
        try {
          await sendMentionNotification({
            mentionerEmail: session!.email,
            mentionedEmail: item.atribuicao,
            projectName: projectMeta?.name ?? projectId,
            moduleName: 'Conteúdos',
            excerpt: `Você foi atribuído ao conteúdo "${item.title}" (encaminhado de Pautas).`,
          })
        } catch { /* notification failure should not block forwarding */ }
      }
      toast({ title: 'Pauta enviada para Conteúdos' })
      navigate('../conteudos')
    } catch (err) {
      toast({ title: 'Erro ao encaminhar', description: String(err), variant: 'destructive' })
    } finally {
      setForwarding(null)
    }
  }

  async function handleAddSection() {
    if (!newSectionTitle.trim()) return
    const section: PautaSection = {
      id: generateId(),
      title: newSectionTitle.trim(),
      order: data.sections.length,
    }
    await saveData({ ...data, sections: [...data.sections, section] })
    setNewSectionTitle('')
    setSectionDialog(false)
  }

  async function handleDeleteSection(id: string) {
    const newSections = data.sections.filter(s => s.id !== id)
    const newItems = data.items.map(i => i.sectionId === id ? { ...i, sectionId: undefined } : i)
    await saveData({ ...data, sections: newSections, items: newItems })
  }

  async function handleRenameSection(id: string, newTitle: string) {
    const trimmed = newTitle.trim()
    if (!trimmed) { setRenamingSection(null); return }
    await saveData({ ...data, sections: data.sections.map(s => s.id === id ? { ...s, title: trimmed } : s) })
    setRenamingSection(null)
  }

  function toggleCollapse(id: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAddTag() {
    if (!newTagLabel.trim()) return
    const tag: PautaTag = { id: generateId(), label: newTagLabel.trim(), color: newTagColor }
    await saveData({ ...data, tags: [...data.tags, tag] })
    setNewTagLabel('')
    setTagDialog(false)
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const { source, destination, draggableId, type } = result

    // Handle section reordering
    if (type === 'SECTION') {
      const ordered = [...data.sections].sort((a, b) => a.order - b.order)
      const [moved] = ordered.splice(source.index, 1)
      ordered.splice(destination.index, 0, moved)
      const reordered = ordered.map((s, i) => ({ ...s, order: i }))
      const newData = { ...data, sections: reordered }
      queryClient.setQueryData(['pautas', projectId], newData)
      savePautas(projectId, newData).catch(() =>
        toast({ title: 'Erro ao reordenar seções', variant: 'destructive' })
      )
      return
    }

    const item = data.items.find(i => i.id === draggableId)
    if (!item) return

    const srcList = source.droppableId === 'unsectioned'
      ? unsectioned
      : (bySectionId.get(source.droppableId) ?? [])
    const dstList = destination.droppableId === 'unsectioned'
      ? unsectioned
      : (bySectionId.get(destination.droppableId) ?? [])

    const newSectionId = destination.droppableId === 'unsectioned' ? undefined : destination.droppableId

    // Remove from source, insert into destination
    const srcIds = srcList.map(i => i.id).filter(id => id !== draggableId)
    let dstIds = dstList.map(i => i.id)
    if (source.droppableId === destination.droppableId) {
      dstIds = srcIds
    } else {
      dstIds = dstIds.filter(id => id !== draggableId)
    }
    dstIds.splice(destination.index, 0, draggableId)

    const updatedItems = data.items.map(i => {
      if (i.id === draggableId) return { ...i, sectionId: newSectionId, order: dstIds.indexOf(i.id) }
      if (dstIds.includes(i.id)) return { ...i, order: dstIds.indexOf(i.id) }
      if (srcIds.includes(i.id)) return { ...i, order: srcIds.indexOf(i.id) }
      return i
    })

    const newData = { ...data, items: updatedItems }
    queryClient.setQueryData(['pautas', projectId], newData)
    savePautas(projectId, newData).catch(() => {
      toast({ title: 'Erro ao reordenar', variant: 'destructive' })
    })
  }

  function exportMarkdown() {
    const lines = ['# Pautas\n']
    for (const item of data.items.sort((a, b) => a.order - b.order)) {
      lines.push(`- ${item.title}${item.dueDate ? ` (${formatDate(item.dueDate)})` : ''}`)
      if (item.body) lines.push(`  ${item.body}`)
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'pautas.md'; a.click()
    URL.revokeObjectURL(url)
  }

  async function exportPDF() {
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' })
      const pageW = pdf.internal.pageSize.getWidth()
      const margin = 20
      let y = margin

      pdf.setFontSize(18)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Pautas', margin, y)
      y += 10

      const addText = (text: string, size: number, bold = false) => {
        if (y > 270) { pdf.addPage(); y = margin }
        pdf.setFontSize(size)
        pdf.setFont('helvetica', bold ? 'bold' : 'normal')
        const lines = pdf.splitTextToSize(text, pageW - margin * 2)
        pdf.text(lines, margin, y)
        y += lines.length * (size * 0.4) + 2
      }

      // Unsectioned items
      for (const item of data.items.filter(i => !i.sectionId).sort((a, b) => a.order - b.order)) {
        addText(`• ${item.title}${item.dueDate ? ` (${formatDate(item.dueDate)})` : ''}`, 11)
        if (item.body) addText(`  ${item.body.slice(0, 200)}`, 9)
      }

      // Sections
      for (const section of [...data.sections].sort((a, b) => a.order - b.order)) {
        y += 4
        addText(section.title, 13, true)
        const items = (bySectionId.get(section.id) ?? [])
        for (const item of items) {
          addText(`• ${item.title}${item.dueDate ? ` (${formatDate(item.dueDate)})` : ''}`, 11)
          if (item.body) addText(`  ${item.body.slice(0, 200)}`, 9)
        }
      }

      pdf.save('pautas.pdf')
    } catch (err) {
      toast({ title: 'Erro ao exportar PDF', description: String(err), variant: 'destructive' })
    }
  }

  async function exportXLS() {
    try {
      const { utils, writeFile } = await import('xlsx')
      const rows: unknown[][] = [['Seção', 'Título', 'Descrição', 'Data', 'Tags']]
      const sortedSections2 = [...data.sections].sort((a, b) => a.order - b.order)
      for (const item of data.items.filter(i => !i.sectionId).sort((a, b) => a.order - b.order)) {
        const tags = item.tags.map(tid => data.tags.find(t => t.id === tid)?.label ?? tid).join(', ')
        rows.push(['', item.title, item.body ?? '', item.dueDate ? formatDate(item.dueDate) : '', tags])
      }
      for (const section of sortedSections2) {
        for (const item of (bySectionId.get(section.id) ?? [])) {
          const tags = item.tags.map(tid => data.tags.find(t => t.id === tid)?.label ?? tid).join(', ')
          rows.push([section.title, item.title, item.body ?? '', item.dueDate ? formatDate(item.dueDate) : '', tags])
        }
      }
      const ws = utils.aoa_to_sheet(rows)
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Pautas')
      writeFile(wb, 'pautas.xlsx')
    } catch (err) {
      toast({ title: 'Erro ao exportar XLS', description: String(err), variant: 'destructive' })
    }
  }

  function exportCSV() {
    try {
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
      const rows = [['Seção', 'Título', 'Descrição', 'Data', 'Tags'].map(escape).join(',')]
      const sortedSections2 = [...data.sections].sort((a, b) => a.order - b.order)
      for (const item of data.items.filter(i => !i.sectionId).sort((a, b) => a.order - b.order)) {
        const tags = item.tags.map(tid => data.tags.find(t => t.id === tid)?.label ?? tid).join('; ')
        rows.push(['', item.title, item.body ?? '', item.dueDate ? formatDate(item.dueDate) : '', tags].map(escape).join(','))
      }
      for (const section of sortedSections2) {
        for (const item of (bySectionId.get(section.id) ?? [])) {
          const tags = item.tags.map(tid => data.tags.find(t => t.id === tid)?.label ?? tid).join('; ')
          rows.push([section.title, item.title, item.body ?? '', item.dueDate ? formatDate(item.dueDate) : '', tags].map(escape).join(','))
        }
      }
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'pautas.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast({ title: 'Erro ao exportar CSV', description: String(err), variant: 'destructive' })
    }
  }

  function handleTitleAtChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setItemTitle(val)
    const caret = e.target.selectionStart ?? val.length
    const before = val.slice(0, caret)
    const match = before.match(/@([\w.+-]*)$/)
    if (match) {
      setAtQuery(match[1])
      setAtSource('dialog')
      const rect = e.target.getBoundingClientRect()
      setAtPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX })
      setAtOpen(true)
    } else {
      setAtOpen(false)
      setAtQuery('')
    }
  }

  function handleAtSelect(email: string) {
    const caret = titleInputRef.current?.selectionStart ?? itemTitle.length
    const before = itemTitle.slice(0, caret)
    const atIdx = before.lastIndexOf('@')
    const after = itemTitle.slice(caret)
    const newTitle = (itemTitle.slice(0, atIdx) + after).trim()
    setItemTitle(newTitle)
    setItemAtribuicao(email)
    setAtOpen(false)
    setAtQuery('')
    setAtExternalInput('')
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  function handleQuickAddAtChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuickAdd(val)
    setQuickSectionId(undefined)
    const caret = e.target.selectionStart ?? val.length
    const before = val.slice(0, caret)
    const match = before.match(/@([\w.+-]*)$/)
    if (match) {
      setAtQuery(match[1])
      setAtSource('quickadd')
      const rect = e.target.getBoundingClientRect()
      setAtPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX })
      setAtOpen(true)
    } else {
      setAtOpen(false)
      setAtQuery('')
    }
  }

  function handleQuickAtSelect(email: string) {
    const el = quickRef.current
    const caret = el?.selectionStart ?? quickAdd.length
    const before = quickAdd.slice(0, caret)
    const atIdx = before.lastIndexOf('@')
    const after = quickAdd.slice(caret)
    const newTitle = (quickAdd.slice(0, atIdx) + after).trim()
    setQuickAdd(newTitle)
    setQuickAtribuicao(email)
    setAtOpen(false)
    setAtQuery('')
    setAtExternalInput('')
    setTimeout(() => quickRef.current?.focus(), 0)
  }

  function renderItem(item: PautaItem, index: number) {
    return (
      <Draggable key={item.id} draggableId={item.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={cn(
              'flex items-start gap-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg p-3 group transition-shadow',
              snapshot.isDragging && 'shadow-lg border-purple-200'
            )}
          >
            <div {...provided.dragHandleProps} className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-400">
              <GripVertical className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditItem(item)}>
              <p className="font-medium text-gray-900 dark:text-white text-sm">{item.title}</p>
              {item.body && <MarkdownRenderer content={item.body.slice(0, 100)} className="text-xs text-gray-500 mt-0.5" />}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {item.tags.map(tagId => {
                  const tag = data.tags.find(t => t.id === tagId)
                  if (!tag) return null
                  const col = getTagColor(tag.color)
                  return (
                    <span key={tagId} className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', col.bg, col.text)}>
                      {tag.label}
                    </span>
                  )
                })}
                {item.dueDate && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(item.dueDate)}</span>
                )}
                {item.atribuicao && (
                  <UserChip email={item.atribuicao} isExternal={!(projectMeta?.users ?? []).includes(item.atribuicao)} />
                )}
              </div>
            </div>
            <button
              onClick={() => handleForwardToConteudos(item)}
              disabled={!!forwarding}
              className={cn(
                'opacity-0 group-hover:opacity-100 transition-all flex-shrink-0',
                forwarding === item.id
                  ? 'text-violet-400 animate-pulse cursor-wait'
                  : 'text-gray-300 dark:text-gray-600 hover:text-violet-500',
                forwarding && forwarding !== item.id && 'pointer-events-none'
              )}
              title={forwarding === item.id ? 'Enviando…' : 'Enviar para Conteúdos'}
            >
              <SendHorizonal className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeleteItem(item.id)}
              className="opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </Draggable>
    )
  }

  if (isLoading) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  const sortedSections = [...data.sections].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pautas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{data.items.length} itens</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTagDialog(true)}>
            <Tag className="w-4 h-4" />
            Tags
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSectionDialog(true)}>
            <FolderPlus className="w-4 h-4" />
            Seção
          </Button>
          <div className="relative" ref={exportRef}>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(v => !v)}>
              <Download className="w-4 h-4" />
              Exportar
            </Button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30 py-1 min-w-[150px]">
                {[
                  { label: 'PDF', fn: exportPDF },
                  { label: 'Excel (XLS)', fn: exportXLS },
                  { label: 'CSV', fn: exportCSV },
                  { label: 'Markdown', fn: exportMarkdown },
                ].map(({ label, fn }) => (
                  <button
                    key={label}
                    onClick={() => { fn(); setExportOpen(false) }}
                    className="w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" onClick={() => openNewItem()}>
            <Plus className="w-4 h-4" />
            Novo
          </Button>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        {/* Quick add (unsectioned) */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                ref={quickRef}
                placeholder="Adicionar item rápido… pressione Enter, @ para atribuir"
                value={quickSectionId === undefined ? quickAdd : ''}
                onChange={handleQuickAddAtChange}
                onKeyDown={e => e.key === 'Enter' && handleQuickAdd(undefined)}
                className="w-full"
              />
              {quickAtribuicao && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <UserChip
                    email={quickAtribuicao}
                    isExternal={!(projectMeta?.users ?? []).includes(quickAtribuicao)}
                    onClear={() => setQuickAtribuicao(undefined)}
                  />
                </span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => handleQuickAdd(undefined)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <Droppable droppableId="unsectioned">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={cn('space-y-2 min-h-[40px] rounded-lg transition-colors', snapshot.isDraggingOver && 'bg-purple-50')}
              >
                {unsectioned.map((item, i) => renderItem(item, i))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </div>

        {/* Sections */}
        <Droppable droppableId="sections" type="SECTION">
          {(sectionsProvided) => (
            <div ref={sectionsProvided.innerRef} {...sectionsProvided.droppableProps} className="space-y-4">
              {sortedSections.map((section, idx) => {
                const items = bySectionId.get(section.id) ?? []
                const isCollapsed = collapsedSections.has(section.id)
                const isRenaming = renamingSection === section.id
                return (
                  <Draggable key={section.id} draggableId={`sec-${section.id}`} index={idx}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={cn(
                          'border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden',
                          snapshot.isDragging && 'shadow-lg ring-1 ring-purple-300 dark:ring-purple-700'
                        )}
                      >
                        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                          {/* Drag handle */}
                          <div
                            {...provided.dragHandleProps}
                            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-400 transition-colors"
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>

                          {/* Title: input quando renomeando, botão de colapso otherwise */}
                          {isRenaming ? (
                            <div className="flex-1 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <input
                                autoFocus
                                className="flex-1 text-sm font-semibold bg-transparent border-b border-purple-400 outline-none text-gray-700 dark:text-gray-200"
                                value={renameSectionTitle}
                                onChange={e => setRenameSectionTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleRenameSection(section.id, renameSectionTitle)
                                  if (e.key === 'Escape') setRenamingSection(null)
                                }}
                                onBlur={() => handleRenameSection(section.id, renameSectionTitle)}
                              />
                              <button onClick={() => handleRenameSection(section.id, renameSectionTitle)} className="p-1 text-green-500 hover:text-green-700 transition-colors" title="Confirmar">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setRenamingSection(null)} className="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Cancelar">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => toggleCollapse(section.id)} className="flex-1 flex items-center gap-2 text-left">
                              {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                              <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">{section.title}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{items.length}</Badge>
                            </button>
                          )}

                          {!isRenaming && (
                            <button
                              onClick={() => { setRenamingSection(section.id); setRenameSectionTitle(section.title) }}
                              className="p-1 text-gray-300 dark:text-gray-600 hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
                              title="Renomear seção"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => openNewItem(section.id)} className="p-1 text-gray-400 hover:text-purple-600 transition-colors" title="Adicionar item nesta seção">
                            <Plus className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteSection(section.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors" title="Excluir seção">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {!isCollapsed && (
                          <div className="p-3 space-y-2">
                            <Droppable droppableId={section.id}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className={cn('space-y-2 min-h-[40px] rounded-lg transition-colors', snapshot.isDraggingOver && 'bg-purple-50 dark:bg-purple-950/20')}
                                >
                                  {items.map((item, i) => renderItem(item, i))}
                                  {provided.placeholder}
                                  {items.length === 0 && !snapshot.isDraggingOver && (
                                    <p className="text-xs text-gray-300 dark:text-gray-600 text-center py-3 italic">Seção vazia — arraste itens aqui</p>
                                  )}
                                </div>
                              )}
                            </Droppable>
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                )
              })}
              {sectionsProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Item dialog */}
      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Item' : 'Novo Item de Pauta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título <span className="text-[10px] text-gray-400 font-normal">— digite @ para atribuir</span></Label>
              <Input ref={titleInputRef} value={itemTitle} onChange={handleTitleAtChange} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Atribuição</Label>
              <UserPicker
                users={projectMeta?.users ?? []}
                value={itemAtribuicao}
                onChange={setItemAtribuicao}
                placeholder="Ninguém atribuído"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={itemDueDate} onChange={e => setItemDueDate(e.target.value)} min={todayISO()} />
              </div>
              <div className="space-y-1.5">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {data.tags.map(tag => {
                    const col = getTagColor(tag.color)
                    const selected = itemTags.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setItemTags(prev => selected ? prev.filter(t => t !== tag.id) : [...prev, tag.id])}
                        className={cn('text-xs px-2 py-0.5 rounded-full border transition-all', col.bg, col.text, selected ? 'ring-2 ring-offset-1 ring-current' : 'opacity-60')}
                      >
                        {tag.label}
                      </button>
                    )
                  })}
                  {data.tags.length === 0 && <span className="text-xs text-gray-400">Nenhuma tag criada</span>}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <MarkdownEditor
                value={itemBody}
                onChange={setItemBody}
                placeholder="Detalhes, links, contexto… use @email para mencionar"
                minHeight={120}
                projectUsers={projectMeta?.users ?? []}
              />
            </div>
          </div>
          <DialogFooter>
            {editItem && (
              <Button variant="outline" className="text-red-500 mr-auto" onClick={() => handleDeleteItem(editItem.id)}>
                <X className="w-4 h-4" /> Remover
              </Button>
            )}
            <Button variant="outline" onClick={() => setItemDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveItem} disabled={savingItem || !itemTitle.trim()}>
              {savingItem ? 'Salvando…' : editItem ? 'Atualizar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tag dialog */}
      <Dialog open={tagDialog} onOpenChange={setTagDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerenciar Tags</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {data.tags.map(tag => {
                const col = getTagColor(tag.color)
                return (
                  <div key={tag.id} className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-full', col.bg, col.text)}>
                    {tag.label}
                    <button onClick={async () => {
                      await saveData({ ...data, tags: data.tags.filter(t => t.id !== tag.id) })
                    }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="space-y-2">
              <Label>Nova Tag</Label>
              <div className="flex gap-2">
                <Input placeholder="Nome da tag" value={newTagLabel} onChange={e => setNewTagLabel(e.target.value)} />
                <Button onClick={handleAddTag} disabled={!newTagLabel.trim()}>Criar</Button>
              </div>
              <div className="flex gap-1.5">
                {TAG_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setNewTagColor(c.value)}
                    className={cn('w-6 h-6 rounded-full', c.bg, newTagColor === c.value && 'ring-2 ring-offset-1 ring-gray-400')}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Section dialog */}
      <Dialog open={sectionDialog} onOpenChange={setSectionDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Seção</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Nome da Seção</Label>
            <Input placeholder="ex: Redes Sociais" value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionDialog(false)}>Cancelar</Button>
            <Button onClick={handleAddSection} disabled={!newSectionTitle.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* @ mention dropdown (shared: dialog title + quick-add) */}
      {atOpen && createPortal(
        <div
          ref={atDropRef}
          style={{ position: 'absolute', top: atPos.top, left: atPos.left, width: 240, zIndex: 9999 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl"
        >
          <div className="max-h-48 overflow-y-auto py-1">
            {(projectMeta?.users ?? [])
              .filter(u => !atQuery || u.toLowerCase().includes(atQuery.toLowerCase()))
              .map(u => (
                <button
                  key={u}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => atSource === 'quickadd' ? handleQuickAtSelect(u) : handleAtSelect(u)}
                  className="w-full px-3 py-1.5 text-xs hover:bg-violet-50 dark:hover:bg-violet-900/30 text-left flex items-center gap-2"
                >
                  <UserChip email={u} />
                </button>
              ))
            }
            {(projectMeta?.users ?? []).filter(u => !atQuery || u.toLowerCase().includes(atQuery.toLowerCase())).length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">Nenhum usuário encontrado</p>
            )}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700 px-2 py-1.5">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">Usuário externo</p>
            <input
              type="email"
              placeholder="outro@email.com"
              value={atExternalInput}
              onChange={e => setAtExternalInput(e.target.value)}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none focus:ring-1 focus:ring-purple-400"
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const val = atExternalInput.trim()
                  if (val) atSource === 'quickadd' ? handleQuickAtSelect(val) : handleAtSelect(val)
                }
                if (e.key === 'Escape') setAtOpen(false)
              }}
            />
          </div>
        </div>,
        document.body
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
