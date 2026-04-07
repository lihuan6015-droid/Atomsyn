import { cn } from '@/lib/cn'
import type { InnovationStage } from '@/types'

const STAGES: { id: Exclude<InnovationStage, 'ideation' | 'archived'>; label: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'define', label: 'Define' },
  { id: 'ideate', label: 'Ideate' },
  { id: 'develop', label: 'Develop' },
  { id: 'validate', label: 'Validate' },
  { id: 'evolve', label: 'Evolve' },
]

const STAGE_BG: Record<string, string> = {
  discover: 'bg-stage-discover',
  define: 'bg-stage-define',
  ideate: 'bg-stage-ideate',
  develop: 'bg-stage-develop',
  validate: 'bg-stage-validate',
  evolve: 'bg-stage-evolve',
}
const STAGE_BG_SOFT: Record<string, string> = {
  discover: 'bg-stage-discover/40',
  define: 'bg-stage-define/40',
  ideate: 'bg-stage-ideate/40',
  develop: 'bg-stage-develop/40',
  validate: 'bg-stage-validate/40',
  evolve: 'bg-stage-evolve/40',
}

interface Props {
  current: InnovationStage
  history?: InnovationStage[]
}

export function StageProgress({ current, history = [] }: Props) {
  const completedSet = new Set(history)
  return (
    <div className="flex items-center gap-1.5 w-full overflow-x-auto scrollbar-hide">
      {STAGES.map((s, i) => {
        const isCurrent = current === s.id
        const isCompleted = completedSet.has(s.id) && !isCurrent
        const filled = isCurrent
          ? STAGE_BG[s.id]
          : isCompleted
            ? STAGE_BG_SOFT[s.id]
            : 'bg-neutral-200/60 dark:bg-neutral-800/60'
        return (
          <div key={s.id} className="flex items-center gap-1.5 flex-1 min-w-[80px]">
            <div className="flex flex-col items-start gap-1 flex-1">
              <div
                className={cn(
                  'h-1.5 w-full rounded-full transition-all duration-500 ease-spring',
                  filled
                )}
              />
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'text-[10px] font-mono uppercase tracking-wider',
                    isCurrent
                      ? `text-stage-${s.id}`
                      : isCompleted
                        ? 'text-neutral-500 dark:text-neutral-400'
                        : 'text-neutral-400 dark:text-neutral-600'
                  )}
                >
                  {String(i + 1).padStart(2, '0')} {s.label}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const STAGE_LABELS: Record<string, string> = {
  ideation: '构思',
  discover: '发现',
  define: '定义',
  ideate: '创意',
  develop: '开发',
  validate: '验证',
  evolve: '进化',
  archived: '归档',
}

export const STAGE_TEXT_CLASS: Record<string, string> = {
  ideation: 'text-neutral-500',
  discover: 'text-stage-discover',
  define: 'text-stage-define',
  ideate: 'text-stage-ideate',
  develop: 'text-stage-develop',
  validate: 'text-stage-validate',
  evolve: 'text-stage-evolve',
  archived: 'text-neutral-500',
}

export const STAGE_BG_CLASS: Record<string, string> = {
  ideation: 'bg-neutral-500/10 text-neutral-500',
  discover: 'bg-stage-discover/10 text-stage-discover',
  define: 'bg-stage-define/10 text-stage-define',
  ideate: 'bg-stage-ideate/10 text-stage-ideate',
  develop: 'bg-stage-develop/10 text-stage-develop',
  validate: 'bg-stage-validate/10 text-stage-validate',
  evolve: 'bg-stage-evolve/10 text-stage-evolve',
  archived: 'bg-neutral-500/10 text-neutral-500',
}
