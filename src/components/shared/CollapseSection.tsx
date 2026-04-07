import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  title: string
  badge?: ReactNode
  icon?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * Progressive-disclosure collapse panel.
 * Uses CSS grid-template-rows trick for smooth height animation
 * with no measurement / no fixed max-height.
 */
export function CollapseSection({ title, badge, icon, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/40 dark:bg-neutral-900/40 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-100/50 dark:hover:bg-neutral-800/40 transition-colors"
      >
        <ChevronRight className={cn('chevron w-4 h-4 text-neutral-400', open && 'open')} />
        {icon && <span className="text-neutral-500">{icon}</span>}
        <span className="text-sm font-medium flex-1">{title}</span>
        {badge && <span className="text-[10px] text-neutral-400 font-mono">{badge}</span>}
      </button>
      <div className={cn('collapse-content', open && 'open')}>
        <div className="collapse-inner">
          <div className="px-4 pb-4 pt-1 pl-11">{children}</div>
        </div>
      </div>
    </div>
  )
}
