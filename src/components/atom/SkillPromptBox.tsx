import { useState } from 'react'
import { Sparkles, Copy, Target, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'
import { FillPromptDialog } from './FillPromptDialog'
import { trackUsage } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'

interface Props {
  atomId: string
  prompt: string
}

export function SkillPromptBox({ atomId, prompt }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [fillOpen, setFillOpen] = useState(false)
  const showToast = useAppStore((s) => s.showToast)

  const placeholderCount = (prompt.match(/\{[^}]+\}/g) || []).length
  const charCount = prompt.length

  const copy = (text: string, type: 'atom-prompt-copy' | 'atom-prompt-copy-filled') => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast(
          type === 'atom-prompt-copy-filled' ? '✓ 已填充并复制完整 Prompt' : '✓ Skill Prompt 已复制'
        )
        trackUsage({ type, atomId })
      })
      .catch(() => showToast('复制失败，请手动选择'))
  }

  return (
    <section className="mb-10 animate-fade-in">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500/20 to-sky-500/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            AI Skill Prompt
          </h2>
          <span className="text-[0.625rem] text-neutral-400 dark:text-neutral-500 font-mono">
            · 复制后粘到任意 AI 对话框
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => copy(prompt, 'atom-prompt-copy')}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-violet-400 dark:hover:border-violet-500 transition-colors text-[0.6875rem] font-medium"
          >
            <Copy className="w-3 h-3" />
            复制
          </button>
          <button
            onClick={() => setFillOpen(true)}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-violet-500 hover:bg-violet-600 text-white transition-colors text-[0.6875rem] font-medium shadow-lg shadow-violet-500/25"
          >
            <Target className="w-3 h-3" />
            填充后复制
          </button>
        </div>
      </div>

      <div className="relative rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-white to-neutral-50/50 dark:from-neutral-900/80 dark:to-neutral-950/80 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-violet-500 via-sky-400 to-emerald-400" />

        <pre
          className={
            'scrollbar-subtle p-5 pl-6 font-mono text-[12.5px] leading-relaxed text-neutral-700 dark:text-neutral-300 transition-[max-height] duration-300 whitespace-pre-wrap ' +
            (expanded ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden')
          }
          style={{ maxHeight: expanded ? '60vh' : '120px' }}
        >
          {prompt}
        </pre>

        <div className="flex items-center justify-between px-5 py-2.5 border-t border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50">
          <div className="flex items-center gap-2 text-[0.625rem] text-neutral-400 dark:text-neutral-500">
            <CheckCircle2 className="w-3 h-3" />
            <span>
              共 {charCount} 字 · {placeholderCount} 个占位符
            </span>
          </div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-[0.625rem] text-violet-500 hover:text-violet-600 font-medium flex items-center gap-1"
          >
            {expanded ? '收起' : '展开全部'}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <FillPromptDialog
        open={fillOpen}
        rawPrompt={prompt}
        onClose={() => setFillOpen(false)}
        onCopy={(filled) => {
          copy(filled, 'atom-prompt-copy-filled')
          setFillOpen(false)
        }}
      />
    </section>
  )
}
