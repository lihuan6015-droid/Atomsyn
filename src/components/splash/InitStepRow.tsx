import {
  Bot,
  CheckCircle2,
  Database,
  Folder,
  Library,
  Loader2,
  MinusCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type { InitStep, InitStepId } from '@/lib/initRunner'

const STEP_ICONS: Record<InitStepId, LucideIcon> = {
  'data-dir': Folder,
  frameworks: Database,
  methodology: Library,
  'skill-check': Bot,
}

const STEP_LABELS: Record<InitStepId, string> = {
  'data-dir': '准备数据目录',
  frameworks: '初始化方法论骨架',
  methodology: '加载知识图书馆',
  'skill-check': '检测 Agent Skill 安装',
}

interface Props {
  step: InitStep
  index: number
}

export function InitStepRow({ step, index }: Props) {
  const Icon = STEP_ICONS[step.id]
  const isRunning = step.status === 'running'
  const isOk = step.status === 'ok'
  const isSkipped = step.status === 'skipped'
  const isError = step.status === 'error'
  const isPending = step.status === 'pending'

  return (
    <div
      className={cn(
        'splash-row flex items-center gap-4 rounded-xl glass px-4 py-3',
        'border border-neutral-200/60 dark:border-white/5',
        'bg-white/60 dark:bg-white/[0.02]',
        isError && 'border-rose-500/40',
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
          isPending && 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400',
          isRunning && 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
          isOk && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
          isSkipped && 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400',
          isError && 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {STEP_LABELS[step.id]}
        </div>
        {step.detail && (
          <div
            className={cn(
              'truncate text-xs font-mono mt-0.5',
              isError
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-neutral-500 dark:text-neutral-400',
            )}
          >
            {step.detail}
          </div>
        )}
      </div>

      <div className="shrink-0">
        {isPending && (
          <div
            className="h-5 w-5 rounded-full border border-neutral-400/50 dark:border-neutral-500/40"
            aria-label="pending"
          />
        )}
        {isRunning && (
          <Loader2
            className="h-5 w-5 animate-spin text-violet-600 dark:text-violet-400"
            aria-label="running"
          />
        )}
        {isOk && (
          <CheckCircle2
            className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
            aria-label="ok"
          />
        )}
        {isSkipped && (
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <MinusCircle className="h-5 w-5" aria-label="skipped" />
            <span>跳过</span>
          </div>
        )}
        {isError && (
          <XCircle
            className="h-5 w-5 text-rose-600 dark:text-rose-400"
            aria-label="error"
          />
        )}
      </div>
    </div>
  )
}
