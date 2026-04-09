/**
 * V2.x · AtomChip — clickable inline pill referencing a knowledge atom.
 *
 * Renders as a compact inline chip with kind-based icon (BookOpen / Zap),
 * label text, and right chevron. Gradient border on hover (violet->sky).
 * Navigates to atom detail on click.
 */

import { useNavigate } from 'react-router-dom'
import { BookOpen, Zap, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface AtomChipProps {
  atomId: string
  label: string
  kind?: 'methodology' | 'experience'
  onClick?: () => void
}

export function AtomChip({ atomId, label, kind = 'methodology', onClick }: AtomChipProps) {
  const navigate = useNavigate()

  const Icon = kind === 'experience' ? Zap : BookOpen

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (onClick) {
      onClick()
    } else {
      navigate(`/atom/atoms/${atomId}`)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
        'text-xs font-medium leading-tight align-middle',
        'border border-neutral-200/80 dark:border-white/10',
        'bg-white/80 dark:bg-white/[0.04]',
        'text-neutral-700 dark:text-neutral-300',
        'transition-all duration-200',
        'hover:border-transparent hover:shadow-sm',
        'hover:bg-gradient-to-r hover:from-violet-500/10 hover:to-sky-500/10',
        'dark:hover:from-violet-500/15 dark:hover:to-sky-500/15',
        // gradient border on hover via ring trick
        'hover:ring-1 hover:ring-violet-400/40 dark:hover:ring-violet-400/30',
        'cursor-pointer select-none',
      )}
    >
      <Icon
        size={12}
        className={cn(
          'shrink-0',
          kind === 'experience'
            ? 'text-amber-500 dark:text-amber-400'
            : 'text-violet-500 dark:text-violet-400',
        )}
      />
      <span className="truncate max-w-[160px]">{label}</span>
      <ChevronRight size={10} className="shrink-0 opacity-40" />
    </button>
  )
}
