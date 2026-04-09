import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { atomsApi } from '@/lib/dataApi'
import { CollapseSection } from '@/components/shared/CollapseSection'
import type { Atom } from '@/types'

interface Props {
  atomIds: string[]
}

interface MethodologyInfo {
  id: string
  name: string
  nameEn?: string
  cellId?: number | string
  frameworkId?: string
  coreIdea?: string
  tags?: string[]
}

export function LinkedMethodologiesSection({ atomIds }: Props) {
  const [methods, setMethods] = useState<MethodologyInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.allSettled(atomIds.map((id) => atomsApi.get(id)))
      .then((results) => {
        if (cancelled) return
        const loaded: MethodologyInfo[] = []
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            const a = r.value as Atom & Record<string, any>
            loaded.push({
              id: a.id, name: a.name, nameEn: a.nameEn,
              cellId: a.cellId, frameworkId: a.frameworkId,
              coreIdea: a.coreIdea, tags: a.tags,
            })
          }
        }
        setMethods(loaded)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [atomIds])

  if (loading || methods.length === 0) return null

  return (
    <CollapseSection
      title="关联方法论"
      icon={<BookOpen className="w-4 h-4" />}
      badge={`${methods.length}`}
    >
      <div className="space-y-2">
        {methods.map((m) => (
          <Link
            key={m.id}
            to={`/atom/atoms/${m.id}`}
            className="group flex items-start gap-3 p-3 rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/50 dark:bg-white/[0.02] hover:bg-violet-50 dark:hover:bg-violet-500/5 hover:border-violet-200 dark:hover:border-violet-800/60 transition-all"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center mt-0.5">
              {m.cellId ? (
                <span className="text-[0.6875rem] font-mono font-bold text-violet-600 dark:text-violet-400">
                  {String(m.cellId).padStart(2, '0')}
                </span>
              ) : (
                <BookOpen className="w-3.5 h-3.5 text-violet-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors">
                {m.name}
                {m.nameEn && (
                  <span className="text-neutral-400 dark:text-neutral-500 font-normal ml-1.5 text-xs font-mono">
                    {m.nameEn}
                  </span>
                )}
              </div>
              {m.coreIdea && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">
                  {m.coreIdea.slice(0, 120)}
                </p>
              )}
              {m.tags && m.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {m.tags.slice(0, 4).map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded text-[0.625rem] bg-violet-500/5 text-violet-500 dark:text-violet-400 font-mono">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </CollapseSection>
  )
}
