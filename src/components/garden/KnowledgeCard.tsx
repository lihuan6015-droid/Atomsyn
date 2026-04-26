/**
 * V2.0 M3 · Universal Knowledge Card.
 *
 * Renders any atom type (methodology, experience, fragment) in a compact,
 * clickable card format for the generic grid view.
 */

import { useNavigate } from 'react-router-dom'
import { BookOpen, Zap, FlaskConical, Thermometer, Archive, ArrowRight } from 'lucide-react'
import type { AtomAny } from '@/types'
import { isExperienceAtom, isExperienceFragment } from '@/types'
import { getInsightColor } from '@/lib/insightColors'
import { computeStaleness } from '@/lib/atomEvolution'
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

  // V2.x cognitive-evolution · staleness signal + archived/supersededBy state
  const stale = computeStaleness(atom)
  const archivedAt = (atom as { archivedAt?: string }).archivedAt
  const supersededBy = (atom as { supersededBy?: string }).supersededBy
  const isArchived = Boolean(archivedAt)
  const isSuperseded = Boolean(supersededBy)
  const isStale = stale.is_stale && !isArchived

  return (
    <button
      onClick={() => navigate(`/atom/atoms/${atom.id}`)}
      className={cn(
        'w-full text-left rounded-xl border border-neutral-200/60 dark:border-white/8 px-4 py-3',
        'bg-white/80 dark:bg-white/[0.02] hover:border-neutral-300 dark:hover:border-white/15',
        'transition-all hover:shadow-sm group',
        borderAccent,
        isArchived && 'opacity-60 grayscale-[0.4] border-l-2 border-l-neutral-400/40',
      )}
      title={
        isArchived
          ? `已归档于 ${new Date(archivedAt!).toLocaleDateString()}`
          : isStale
            ? `本条经验沉淀已 ${stale.age_days} 天, confidence 衰减 ${(stale.confidence_decay * 100).toFixed(0)}%。建议在当前情境再校准一次。`
            : undefined
      }
    >
      {/* V2.x · archived banner */}
      {isArchived && (
        <div className="flex items-center gap-1.5 mb-1.5 text-[0.625rem] text-neutral-500 dark:text-neutral-400">
          <Archive className="w-3 h-3" />
          <span>已归档于 {new Date(archivedAt!).toLocaleDateString()}</span>
        </div>
      )}

      {/* Row 1: icon + (🌡) + name */}
      <div className="flex items-center gap-2">
        <span className={cn('shrink-0', accentClass)}>{icon}</span>
        {isStale && (
          <Thermometer
            className="w-3.5 h-3.5 shrink-0 text-amber-500"
            aria-label="staleness signal"
          />
        )}
        <span className="text-sm font-medium truncate flex-1">{name}</span>
      </div>

      {/* Row 2: kind + tags + supersededBy chip */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className={cn('text-[0.625rem] font-medium', accentClass)}>{kindLabel}</span>
        {tags.map((t) => (
          <span key={t} className="px-1.5 py-0.5 rounded text-[0.625rem] bg-neutral-100 dark:bg-white/5 text-neutral-500 font-mono">
            {t}
          </span>
        ))}
        {isSuperseded && (
          <span className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[0.625rem] bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-500/20">
            <ArrowRight className="w-2.5 h-2.5" />已被取代
          </span>
        )}
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
