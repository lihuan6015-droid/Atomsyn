/**
 * V2.0 M3 · Role View — shows all atoms grouped by situation within a role.
 *
 * Includes multi-dimension filter chips (situation, activity, insight_type)
 * for fine-grained browsing within a role category.
 */

import { useMemo, useState } from 'react'
import { Inbox, X } from 'lucide-react'
import type { AtomAny } from '@/types'
import { KnowledgeCard } from './KnowledgeCard'
import { cn } from '@/lib/cn'

interface Props {
  atoms: AtomAny[]
  role: string
}

interface FilterState {
  situation: string | null
  activity: string | null
  insight_type: string | null
}

export function RoleView({ atoms, role }: Props) {
  const [filters, setFilters] = useState<FilterState>({
    situation: null,
    activity: null,
    insight_type: null,
  })

  const allInRole = useMemo(() => {
    // Exclude methodology (has its own Framework skeleton) and skill-inventory
    const validAtoms = atoms.filter((a) => a.kind !== 'skill-inventory' && a.kind !== 'methodology')
    if (role === '未分类') {
      return validAtoms.filter((a) => !(a as any).role)
    }
    return validAtoms.filter((a) => (a as any).role === role)
  }, [atoms, role])

  // Collect unique dimension values with counts
  const dimensions = useMemo(() => {
    const situations = new Map<string, number>()
    const activities = new Map<string, number>()
    const insightTypes = new Map<string, number>()

    for (const a of allInRole) {
      const s = (a as any).situation as string
      const act = (a as any).activity as string
      const it = (a as any).insight_type as string
      if (s) situations.set(s, (situations.get(s) || 0) + 1)
      if (act) activities.set(act, (activities.get(act) || 0) + 1)
      if (it) insightTypes.set(it, (insightTypes.get(it) || 0) + 1)
    }

    return {
      situations: Array.from(situations.entries()).sort((a, b) => b[1] - a[1]),
      activities: Array.from(activities.entries()).sort((a, b) => b[1] - a[1]),
      insightTypes: Array.from(insightTypes.entries()).sort((a, b) => b[1] - a[1]),
    }
  }, [allInRole])

  // Apply filters
  const filtered = useMemo(() => {
    return allInRole.filter((a) => {
      if (filters.situation && (a as any).situation !== filters.situation) return false
      if (filters.activity && (a as any).activity !== filters.activity) return false
      if (filters.insight_type && (a as any).insight_type !== filters.insight_type) return false
      return true
    })
  }, [allInRole, filters])

  // Sub-group by situation
  const groups = useMemo(() => {
    const map = new Map<string, AtomAny[]>()
    for (const a of filtered) {
      const situation = (a as any).situation as string || '通用'
      if (!map.has(situation)) map.set(situation, [])
      map.get(situation)!.push(a)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [filtered])

  const hasAnyFilter = filters.situation || filters.activity || filters.insight_type
  const hasAnyDimension = dimensions.situations.length > 0 || dimensions.activities.length > 0 || dimensions.insightTypes.length > 0

  function toggleFilter(key: keyof FilterState, value: string) {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }))
  }

  function clearFilters() {
    setFilters({ situation: null, activity: null, insight_type: null })
  }

  if (allInRole.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
        <Inbox className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">{role} 分类下暂无知识</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Multi-dimension filter chips */}
      {hasAnyDimension && (
        <div className="space-y-2 pb-3 border-b border-neutral-200/50 dark:border-neutral-800/50">
          {/* Situation chips */}
          {dimensions.situations.length > 0 && (
            <FilterRow
              label="情境"
              items={dimensions.situations}
              activeValue={filters.situation}
              onToggle={(v) => toggleFilter('situation', v)}
              colorClass="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
              activeColorClass="bg-sky-500 text-white border-sky-500"
            />
          )}

          {/* Activity chips */}
          {dimensions.activities.length > 0 && (
            <FilterRow
              label="活动"
              items={dimensions.activities}
              activeValue={filters.activity}
              onToggle={(v) => toggleFilter('activity', v)}
              colorClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              activeColorClass="bg-emerald-500 text-white border-emerald-500"
            />
          )}

          {/* Insight type chips */}
          {dimensions.insightTypes.length > 0 && (
            <FilterRow
              label="洞察"
              items={dimensions.insightTypes}
              activeValue={filters.insight_type}
              onToggle={(v) => toggleFilter('insight_type', v)}
              colorClass="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              activeColorClass="bg-amber-500 text-white border-amber-500"
            />
          )}

          {/* Clear all filters */}
          {hasAnyFilter && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-neutral-500 hover:text-red-500 transition-colors"
            >
              <X className="w-3 h-3" />
              清除筛选
            </button>
          )}
        </div>
      )}

      {/* Results count when filtered */}
      {hasAnyFilter && (
        <div className="text-[11px] text-neutral-400 dark:text-neutral-500">
          筛选结果: {filtered.length} / {allInRole.length} 条
        </div>
      )}

      {/* Grouped cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
          <Inbox className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">当前筛选条件下无匹配知识</p>
          <button
            onClick={clearFilters}
            className="mt-2 text-xs text-violet-500 hover:text-violet-600"
          >
            清除筛选
          </button>
        </div>
      ) : (
        groups.map(([situation, groupAtoms]) => (
          <section key={situation}>
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
              {situation}
              <span className="ml-2 text-neutral-400 font-mono">{groupAtoms.length}</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {groupAtoms.map((a) => (
                <KnowledgeCard key={a.id} atom={a} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function FilterRow({
  label,
  items,
  activeValue,
  onToggle,
  colorClass,
  activeColorClass,
}: {
  label: string
  items: [string, number][]
  activeValue: string | null
  onToggle: (v: string) => void
  colorClass: string
  activeColorClass: string
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 w-8 shrink-0">
        {label}
      </span>
      {items.map(([value, count]) => {
        const isActive = activeValue === value
        return (
          <button
            key={value}
            onClick={() => onToggle(value)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium transition-all',
              isActive ? activeColorClass : colorClass,
              'hover:scale-[1.03] active:scale-95',
            )}
          >
            {value}
            <span className={cn('text-[10px] font-mono', isActive ? 'opacity-80' : 'opacity-60')}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
