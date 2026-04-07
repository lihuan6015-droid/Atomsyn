import { CheckCircle2, ChevronRight, CircleDashed, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import type { Atom, Practice } from '@/types'

interface Props {
  practice: Practice
  atom?: Atom
}

const STATUS_ICON = {
  'in-progress': <CircleDashed className="w-4 h-4 text-amber-500" />,
  completed: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  abandoned: <XCircle className="w-4 h-4 text-neutral-500" />,
}

const STATUS_LABEL = {
  'in-progress': '进行中',
  completed: '已完成',
  abandoned: '放弃',
}

export function PracticeRow({ practice, atom }: Props) {
  const [open, setOpen] = useState(false)
  const hasDetails =
    practice.context ||
    practice.executionSummary ||
    practice.keyInsights?.length ||
    practice.whatWorked ||
    practice.whatFailed

  return (
    <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/40 dark:bg-neutral-900/40 overflow-hidden">
      <button
        onClick={() => hasDetails && setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
          hasDetails && 'hover:bg-neutral-100/50 dark:hover:bg-neutral-800/40'
        )}
      >
        <ChevronRight
          className={cn(
            'chevron w-4 h-4 text-neutral-400 shrink-0',
            open && 'open',
            !hasDetails && 'opacity-0'
          )}
        />
        {STATUS_ICON[practice.status]}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{practice.title}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-2">
            {atom ? (
              <Link
                to={`/atoms/${atom.id}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:text-stage-discover transition-colors truncate"
              >
                {atom.name}
              </Link>
            ) : (
              <span className="font-mono">{practice.atomId}</span>
            )}
            <span>·</span>
            <span>{STATUS_LABEL[practice.status]}</span>
            <span>·</span>
            <span>{new Date(practice.createdAt).toLocaleDateString('zh-CN')}</span>
          </div>
        </div>
      </button>

      <div className={cn('collapse-content', open && 'open')}>
        <div className="collapse-inner">
          <div className="px-4 pb-4 pt-1 pl-11 space-y-3 text-sm">
            {practice.context && (
              <DetailBlock label="情境">{practice.context}</DetailBlock>
            )}
            {practice.executionSummary && (
              <DetailBlock label="执行">{practice.executionSummary}</DetailBlock>
            )}
            {practice.keyInsights && practice.keyInsights.length > 0 && (
              <DetailBlock label="关键洞察">
                <ul className="list-disc list-inside space-y-1">
                  {practice.keyInsights.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </DetailBlock>
            )}
            {(practice.whatWorked || practice.whatFailed) && (
              <div className="grid grid-cols-2 gap-3">
                {practice.whatWorked && (
                  <DetailBlock label="有效">{practice.whatWorked}</DetailBlock>
                )}
                {practice.whatFailed && (
                  <DetailBlock label="失效">{practice.whatFailed}</DetailBlock>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
        {label}
      </div>
      <div className="text-neutral-700 dark:text-neutral-300 leading-relaxed">{children}</div>
    </div>
  )
}
