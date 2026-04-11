import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { User, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UserChip({ email, isExternal, onClear }: { email: string; isExternal?: boolean; onClear?: () => void }) {
  if (isExternal) {
    return (
      <span className="inline-flex items-center gap-1 min-w-0">
        <span className="w-5 h-5 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400 flex-shrink-0">
          <User className="w-3 h-3" />
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]" title={email}>{email}</span>
        {onClear && (
          <button onClick={onClear} className="text-gray-300 hover:text-red-400 flex-shrink-0">
            <X className="w-3 h-3" />
          </button>
        )}
      </span>
    )
  }
  const colors = ['bg-violet-200 text-violet-800', 'bg-blue-200 text-blue-800', 'bg-green-200 text-green-800', 'bg-amber-200 text-amber-800', 'bg-pink-200 text-pink-800']
  const idx = email.charCodeAt(0) % colors.length
  const initials = email.slice(0, 2).toUpperCase()
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0', colors[idx])}>
        {initials}
      </span>
      <span className="text-xs text-gray-700 dark:text-gray-200 truncate max-w-[90px]">{email.split('@')[0]}</span>
      {onClear && (
        <button onClick={onClear} className="text-gray-300 hover:text-red-400 flex-shrink-0">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

export function UserPicker({
  users, value, onChange, placeholder = 'Indefinido',
}: {
  users: string[]; value?: string; onChange: (v: string | undefined) => void; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [externalInput, setExternalInput] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: Math.max(220, rect.width),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePos()
    const handleClose = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    const handleScroll = () => updatePos()
    document.addEventListener('mousedown', handleClose)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClose)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, updatePos])

  const filtered = users.filter(u =>
    !query.trim() || u.toLowerCase().includes(query.replace('@', '').toLowerCase())
  )

  const dropdown = open ? createPortal(
    <div
      ref={dropRef}
      style={{ position: 'absolute', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl"
    >
      <div className="p-2 border-b border-gray-100 dark:border-gray-700">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="@usuário..."
          className="w-full text-xs outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600 bg-transparent dark:text-white"
        />
      </div>
      <div className="max-h-48 overflow-y-auto py-1">
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => { onChange(undefined); setOpen(false); setQuery('') }}
          className="w-full px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
        >
          Indefinido
        </button>
        {filtered.length === 0 && (
          <p className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">Nenhum usuário encontrado</p>
        )}
        {filtered.map(u => (
          <button
            key={u}
            onMouseDown={e => e.preventDefault()}
            onClick={() => { onChange(u); setOpen(false); setQuery('') }}
            className="w-full px-3 py-1.5 text-xs hover:bg-violet-50 dark:hover:bg-violet-900/30 text-left flex items-center gap-2"
          >
            <UserChip email={u} />
          </button>
        ))}
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 px-2 py-1.5">
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">Usuário externo</p>
        <input
          type="email"
          placeholder="outro@email.com"
          value={externalInput}
          onChange={e => setExternalInput(e.target.value)}
          className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none focus:ring-1 focus:ring-purple-400"
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const val = externalInput.trim()
              if (val) { onChange(val); setOpen(false); setQuery(''); setExternalInput('') }
            }
          }}
        />
      </div>
    </div>,
    document.body
  ) : null

  const isExternal = !!value && !users.includes(value)

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => {
          const willOpen = !open
          setOpen(willOpen)
          setQuery('')
          if (willOpen && value && !users.includes(value)) setExternalInput(value)
          else if (willOpen) setExternalInput('')
        }}
        className="flex items-center gap-1 text-xs min-w-0"
      >
        {value
          ? <UserChip email={value} isExternal={isExternal} />
          : <span className="text-gray-400 flex items-center gap-1"><User className="w-3 h-3" />{placeholder}</span>
        }
      </button>
      {dropdown}
    </div>
  )
}
