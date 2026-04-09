import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, Unlock, Paperclip } from 'lucide-react'
import { atomsApi } from '@/lib/dataApi'
import { getInsightColor } from '@/lib/insightColors'
import { CollapseSection } from '@/components/shared/CollapseSection'
import type { AtomAny } from '@/types'

interface RelatedFragment {
  atom: AtomAny & Record<string, any>
  confidence: number
  locked: boolean
}

interface Props {
  methodologyAtomId: string
}

export function RelatedFragmentsPanel({ methodologyAtomId }: Props) {
  const [fragments, setFragments] = useState<RelatedFragment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    atomsApi
      .relatedFragments(methodologyAtomId)
      .then((data) => { if (!cancelled) setFragments(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [methodologyAtomId])

  const handleToggleLock = async (frag: RelatedFragment) => {
    const nextLocked = !frag.locked
    try {
      await atomsApi.calibrate(frag.atom.id, { locked: nextLocked })
      setFragments((prev) =>
        prev.map((f) =>
          f.atom.id === frag.atom.id
            ? { ...f, locked: nextLocked, confidence: nextLocked ? 1.0 : f.confidence }
            : f
        )
      )
    } catch { /* non-fatal */ }
  }

  if (loading || fragments.length === 0) return null

  return (
    <CollapseSection
      title="关联碎片"
      icon={<Paperclip className="w-4 h-4" />}
      badge={`${fragments.length}`}
    >
      <div className="space-y-2">
        {fragments.map((frag) => {
          const ic = getInsightColor(frag.atom.insight_type || '')
          const dims = [frag.atom.role, frag.atom.situation].filter(Boolean).join(' · ')
          const date = (frag.atom.createdAt || '').slice(0, 10)

          return (
            <div
              key={frag.atom.id}
              className="group flex items-start gap-3 p-3 rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/50 dark:bg-white/[0.02] hover:bg-neutral-50 dark:hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Link
                    to={`/atom/atoms/${frag.atom.id}`}
                    className="text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate"
                  >
                    {frag.atom.title || frag.atom.name || '(无标题)'}
                  </Link>
                  {frag.locked && (
                    <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[0.625rem] font-mono ${ic.bg} ${ic.text} ${ic.darkBg} ${ic.darkText}`}>
                    {frag.atom.insight_type}
                  </span>
                  {dims && (
                    <span className="text-[0.625rem] text-neutral-500 dark:text-neutral-400">{dims}</span>
                  )}
                  <span className="text-[0.625rem] text-neutral-400 dark:text-neutral-500">{date}</span>
                </div>
                {(frag.atom.summary || frag.atom.insight) && (
                  <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2">
                    {(frag.atom.summary || frag.atom.insight || '').slice(0, 150)}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[0.625rem] text-neutral-400 font-mono">
                    confidence: {frag.confidence.toFixed(2)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleToggleLock(frag)}
                className="flex-shrink-0 w-7 h-7 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                title={frag.locked ? '解除锁定' : '锁定此关联'}
              >
                {frag.locked ? (
                  <Unlock className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-neutral-400" />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </CollapseSection>
  )
}
