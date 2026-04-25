import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, FileX } from 'lucide-react'
import { loadRecursos } from '@/lib/storage'
import { readFile, getGitHubConfig } from '@/lib/github'
import { Button } from '@/components/ui/button'

export function FileDownload() {
  const { projectId, templateId } = useParams<{ projectId: string; templateId: string }>()
  const navigate = useNavigate()

  const [status, setStatus] = useState<'loading' | 'ready' | 'downloading' | 'done' | 'error'>('loading')
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState('')
  const [filePath, setFilePath] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function load() {
      if (!projectId || !templateId) { setStatus('error'); setErrorMsg('Link inválido.'); return }
      try {
        const data = await loadRecursos(projectId)
        const tpl = data.templates.find(t => t.id === templateId)
        if (!tpl) { setStatus('error'); setErrorMsg('Arquivo não encontrado.'); return }
        setFileName(tpl.name)
        setFileType(tpl.type)
        setFilePath(tpl.path)
        setStatus('ready')
      } catch (e) {
        setStatus('error')
        setErrorMsg('Erro ao carregar informações do arquivo.')
      }
    }
    load()
  }, [projectId, templateId])

  async function handleDownload() {
    setStatus('downloading')
    try {
      const cfg = getGitHubConfig()
      if (!cfg) throw new Error('Não autenticado')
      const ghFile = await readFile(cfg, filePath)
      const raw = ghFile.content.replace(/\n/g, '')
      const binary = atob(raw)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: fileType || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName; a.click()
      URL.revokeObjectURL(url)
      setStatus('done')
    } catch (e) {
      setStatus('error')
      setErrorMsg('Erro ao baixar o arquivo: ' + String(e))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-8 max-w-sm w-full text-center space-y-5">
        {status === 'loading' && (
          <>
            <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Carregando arquivo…</p>
          </>
        )}

        {(status === 'ready' || status === 'downloading' || status === 'done') && (
          <>
            <div className="w-14 h-14 bg-purple-50 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center mx-auto">
              <Download className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{fileName}</p>
              {status === 'done' && <p className="text-xs text-green-600 dark:text-green-400 mt-1">Download iniciado!</p>}
            </div>
            {status !== 'done' && (
              <Button onClick={handleDownload} disabled={status === 'downloading'} className="w-full">
                {status === 'downloading' ? 'Baixando…' : 'Baixar arquivo'}
              </Button>
            )}
            {status === 'done' && (
              <Button variant="outline" onClick={handleDownload} className="w-full">
                Baixar novamente
              </Button>
            )}
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto">
              <FileX className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">Não foi possível carregar</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{errorMsg}</p>
            </div>
          </>
        )}

        <button onClick={() => navigate(-1)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          ← Voltar
        </button>
      </div>
    </div>
  )
}
