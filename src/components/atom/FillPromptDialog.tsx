import { useEffect, useRef } from 'react'
import { Target, Copy, X } from 'lucide-react'

interface Props {
  open: boolean
  rawPrompt: string
  onClose: () => void
  onCopy: (filled: string, scenario: string) => void
}

export function FillPromptDialog({ open, rawPrompt, onClose, onCopy }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleCopy = () => {
    const val = ref.current?.value.trim() || '(空)'
    const filled = rawPrompt.replace('{请在此处填入}', val)
    onCopy(filled, val)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden animate-fade-in">
        <div className="p-5 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-violet-500" />
              <h3 className="font-semibold text-sm">填充占位符</h3>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400">
            填入场景描述，Prompt 会自动拼装后复制
          </p>
        </div>
        <div className="p-5">
          <label className="text-[0.625rem] uppercase tracking-wider text-neutral-500 font-semibold">
            场景 (scenario)
          </label>
          <textarea
            ref={ref}
            rows={4}
            placeholder="例如：我正在做一款面向年轻上班族的早餐订阅产品..."
            className="mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50">
          <button
            onClick={onClose}
            className="px-3 h-8 rounded-lg text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleCopy}
            className="px-3 h-8 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium shadow-lg shadow-violet-500/25 transition-colors flex items-center gap-1.5"
          >
            <Copy className="w-3 h-3" />
            填充并复制
          </button>
        </div>
      </div>
    </div>
  )
}
