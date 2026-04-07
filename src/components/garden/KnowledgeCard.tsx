/**
 * V2.0 M3 · Universal Knowledge Card.
 *
 * Renders any atom type (methodology, experience, fragment) in a compact,
 * clickable card format for the generic grid view.
 */

import { useNavigate } from 'react-router-dom'
import { BookOpen, Zap, FlaskConical } from 'lucide-react'
import type { AtomAny } from '@/types'
import { isMethodologyAtom, isExperienceAtom, isExperienceFragment } from '@/types'
import { getInsightColor } from '@/lib/insightColors'
import { cn } from '@/lib/cn'

interface Props {
  atom: AtomAny
}

export function KnowledgeCard({ atom }: Props) {
  const navigate = useNavigate()

  const name = (atom as any).name || (atom as any).title || atom.id
  const tags = atom.tags?.slice(0, 3) ?? []

  let icon = <BookOpen className="w-3.5 h-3.5" />
  let kindLabel = '方法论'
  let accentClass = 'text-violet-500'
  let borderAccent = ''

  if (isExperienceFragment(atom)) {
    icon = <Zap className="w-3.5 h-3.5" />
    kindLabel = atom.insight_type || '碎片'
    const ic = getInsightColor(atom.insight_type)
    accentClass = ic.text
    if (atom.private) borderAccent = 'border-l-2 border-l-pink-400/60'
  } else if (isExperienceAtom(atom)) {
    icon = <FlaskConical className="w-3.5 h-3.5" />
    kindLabel = '经验'
    accentClass = 'text-sky-500'
  }

  return (
    <button
      onClick={() => navigate(`/atoms/${atom.id}`)}
      className={cn(
        'w-full text-left rounded-xl border border-neutral-200/60 dark:border-white/8 px-4 py-3',
        'bg-white/80 dark:bg-white/[0.02] hover:border-neutral-300 dark:hover:border-white/15',
        'transition-all hover:shadow-sm group',
        borderAccent,
      )}
    >
      {/* Row 1: icon + name */}
      <div className="flex items-center gap-2">
        <span className={cn('shrink-0', accentClass)}>{icon}</span>
        <span className="text-sm font-medium truncate flex-1">{name}</span>
      </div>

      {/* Row 2: kind + tags */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className={cn('text-[10px] font-medium', accentClass)}>{kindLabel}</span>
        {tags.map((t) => (
          <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 dark:bg-white/5 text-neutral-500 font-mono">
            {t}
          </span>
        ))}
      </div>

      {/* Row 3: summary (if fragment/experience) */}
      {isExperienceFragment(atom) && atom.summary && (
        <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
          {atom.summary}
        </p>
      )}
      {isExperienceAtom(atom) && (atom as any).sourceContext && (
        <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
          {(atom as any).sourceContext}
        </p>
      )}
    </button>
  )
}
