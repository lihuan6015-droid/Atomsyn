/**
 * V2.0 M3 · Custom Skeleton View — shows atoms in a user-created skeleton container.
 */

import { useEffect, useMemo, useState } from 'react'
import { Inbox, Plus, Search } from 'lucide-react'
import type { AtomAny } from '@/types'
import type { CustomSkeleton } from '@/stores/useAppStore'
import { useAppStore } from '@/stores/useAppStore'
import { atomsApi } from '@/lib/dataApi'
import { KnowledgeCard } from './KnowledgeCard'
import { cn } from '@/lib/cn'

interface Props {
  skeleton: CustomSkeleton
  allAtoms: AtomAny[]
}

export function SkeletonView({ skeleton, allAtoms }: Props) {
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const addAtomToSkeleton = useAppStore((s) => s.addAtomToSkeleton)
  const removeAtomFromSkeleton = useAppStore((s) => s.removeAtomFromSkeleton)

  const skeletonAtoms = useMemo(
    () => allAtoms.filter((a) => skeleton.atomIds.includes(a.id)),
    [allAtoms, skeleton.atomIds],
  )

  // Search results for adding new atoms
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return allAtoms
      .filter((a) => !skeleton.atomIds.includes(a.id))
      .filter((a) => {
        const name = ((a as any).name || (a as any).title || '').toLowerCase()
        const tags = (a.tags || []).join(' ').toLowerCase()
        return name.includes(q) || tags.includes(q)
      })
      .slice(0, 10)
  }, [allAtoms, skeleton.atomIds, searchQuery])

  if (skeletonAtoms.length === 0 && !showAddPanel) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
        <Inbox className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">骨架 "{skeleton.name}" 还没有卡片</p>
        <button
          onClick={() => setShowAddPanel(true)}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs hover:bg-violet-500/20"
        >
          <Plus className="w-3 h-3" /> 添加卡片
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {skeletonAtoms.map((a) => (
          <KnowledgeCard key={a.id} atom={a} />
        ))}
      </div>

      {/* Add panel */}
      {showAddPanel ? (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-neutral-400" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索知识卡片…"
              className="flex-1 text-sm bg-transparent focus:outline-none"
            />
            <button
              onClick={() => { setShowAddPanel(false); setSearchQuery('') }}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              关闭
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {searchResults.map((a) => (
                <button
                  key={a.id}
                  onClick={() => addAtomToSkeleton(skeleton.id, a.id)}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-violet-500/10 text-sm"
                >
                  <Plus className="w-3 h-3 text-violet-500 shrink-0" />
                  <span className="truncate">{(a as any).name || (a as any).title}</span>
                  <span className="text-[10px] text-neutral-400 font-mono shrink-0 ml-auto">
                    {a.tags?.[0]}
                  </span>
                </button>
              ))}
            </div>
          )}
          {searchQuery && searchResults.length === 0 && (
            <p className="text-xs text-neutral-400">无匹配结果</p>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowAddPanel(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 text-xs hover:border-violet-400 hover:text-violet-500 transition-colors"
        >
          <Plus className="w-3 h-3" /> 添加卡片
        </button>
      )}
    </div>
  )
}
