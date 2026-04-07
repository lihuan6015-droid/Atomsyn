/**
 * V2.0 M3 · Unified Sidebar.
 *
 * Section 1: Named skeletons (system presets + user-created)
 * Section 2: Auto-grouped by role dimension
 */

import { Bot, FolderOpen, Palette, Pen, Plus, Star, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { atomsApi, frameworksApi } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import { cn } from '@/lib/cn'
import type { Framework, AtomAny } from '@/types'

const FUTURE_SKELETONS = [
  { id: 'ui-ux-patterns', name: 'UI/UX 模式', icon: Palette },
  { id: 'agent-development', name: 'Agent 开发', icon: Bot },
] as const

export function Sidebar() {
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [allAtoms, setAllAtoms] = useState<AtomAny[]>([])
  const [newSkeletonName, setNewSkeletonName] = useState('')
  const [showNewInput, setShowNewInput] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const activeFrameworkId = useAppStore((s) => s.activeFrameworkId)
  const activeRole = useAppStore((s) => s.activeRole)
  const activeSkeletonId = useAppStore((s) => s.activeSkeletonId)
  const customSkeletons = useAppStore((s) => s.customSkeletons)
  const setActiveFramework = useAppStore((s) => s.setActiveFramework)
  const setActiveRole = useAppStore((s) => s.setActiveRole)
  const setActiveSkeleton = useAppStore((s) => s.setActiveSkeleton)
  const addCustomSkeleton = useAppStore((s) => s.addCustomSkeleton)
  const renameCustomSkeleton = useAppStore((s) => s.renameCustomSkeleton)
  const removeCustomSkeleton = useAppStore((s) => s.removeCustomSkeleton)

  useEffect(() => {
    frameworksApi.list().then(setFrameworks).catch(() => setFrameworks([]))
    atomsApi.list().then((a) => setAllAtoms(a as AtomAny[])).catch(() => setAllAtoms([]))
  }, [])

  // Auto-group by role (exclude skill-inventory — has its own Skill Map page)
  const roleGroups = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of allAtoms) {
      if (a.kind === 'skill-inventory') continue
      const role = (a as any).role as string | undefined
      const key = role || '未分类'
      map.set(key, (map.get(key) || 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => ({ role, count }))
  }, [allAtoms])

  function handleAddSkeleton() {
    const name = newSkeletonName.trim()
    if (!name) return
    addCustomSkeleton(name)
    setNewSkeletonName('')
    setShowNewInput(false)
  }

  function startRename(id: string, currentName: string) {
    setEditingId(id)
    setEditName(currentName)
  }

  function commitRename(id: string) {
    const name = editName.trim()
    if (name) renameCustomSkeleton(id, name)
    setEditingId(null)
  }

  return (
    <aside className="w-56 shrink-0 hidden md:block border-r border-neutral-200/60 dark:border-neutral-800/60 bg-white/40 dark:bg-neutral-950/40 overflow-y-auto scrollbar-hide">
      {/* Section 1: Named skeletons */}
      <div className="p-4 pb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2 px-2">
          骨架
        </div>
        <div className="space-y-0.5">
          {/* System preset frameworks */}
          {frameworks.map((f) => {
            const isActive = f.id === activeFrameworkId
            return (
              <button
                key={f.id}
                onClick={() => setActiveFramework(f.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors',
                  isActive
                    ? 'bg-gradient-to-r from-violet-500/10 to-transparent'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-900',
                )}
              >
                <Star
                  className={cn(
                    'w-3.5 h-3.5 shrink-0',
                    isActive ? 'text-violet-500 fill-violet-500' : 'text-neutral-400',
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className={cn('text-sm truncate', isActive ? 'font-medium' : 'text-neutral-600 dark:text-neutral-300')}>
                    {f.name}
                  </div>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                    {f.matrix?.cells?.length ?? 0} 格
                  </div>
                </div>
              </button>
            )
          })}

          {/* Future system presets */}
          {FUTURE_SKELETONS.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left opacity-50 cursor-default"
                title="即将推出"
              >
                <Icon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-neutral-500 truncate">{s.name}</div>
                  <div className="text-[10px] text-neutral-400">即将推出</div>
                </div>
              </button>
            )
          })}

          {/* User-created skeletons */}
          {customSkeletons.map((sk) => {
            const isActive = sk.id === activeSkeletonId
            const isEditing = editingId === sk.id
            return (
              <div
                key={sk.id}
                className={cn(
                  'group flex items-center gap-1.5 px-2.5 py-2 rounded-lg transition-colors',
                  isActive
                    ? 'bg-gradient-to-r from-sky-500/10 to-transparent'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-900',
                )}
              >
                <button
                  onClick={() => setActiveSkeleton(sk.id)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                >
                  <FolderOpen className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-sky-500' : 'text-neutral-400')} />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => commitRename(sk.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(sk.id); if (e.key === 'Escape') setEditingId(null) }}
                      className="text-sm bg-transparent border-b border-violet-400 focus:outline-none w-full"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-sm truncate', isActive ? 'font-medium' : 'text-neutral-600 dark:text-neutral-300')}>
                        {sk.name}
                      </div>
                      <div className="text-[10px] text-neutral-400">{sk.atomIds.length} 卡片</div>
                    </div>
                  )}
                </button>
                {/* Edit/delete controls (visible on hover) */}
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); startRename(sk.id, sk.name) }}
                    className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    title="重命名"
                  >
                    <Pen className="w-3 h-3 text-neutral-400" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCustomSkeleton(sk.id) }}
                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-500/10"
                    title="删除"
                  >
                    <Trash2 className="w-3 h-3 text-neutral-400 hover:text-red-500" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* New skeleton input */}
        {showNewInput ? (
          <div className="mt-2 flex items-center gap-1.5 px-2">
            <input
              autoFocus
              value={newSkeletonName}
              onChange={(e) => setNewSkeletonName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSkeleton(); if (e.key === 'Escape') setShowNewInput(false) }}
              placeholder="骨架名称…"
              className="flex-1 text-sm bg-transparent border-b border-violet-400 focus:outline-none px-1 py-1"
            />
            <button onClick={handleAddSkeleton} className="p-1 text-violet-500 hover:text-violet-600">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowNewInput(false)} className="p-1 text-neutral-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewInput(true)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-violet-400 hover:text-violet-500 transition-colors text-xs"
          >
            <Plus className="w-3 h-3" />
            新骨架
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-neutral-200/50 dark:border-neutral-800/50" />

      {/* Section 2: Auto-grouped by role */}
      <div className="p-4 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2 px-2">
          按角色
        </div>
        <div className="space-y-0.5">
          {roleGroups.map(({ role, count }) => {
            const isActive = activeRole === role
            return (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors',
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500/10 to-transparent'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-900',
                )}
              >
                <Tag className={cn('w-3 h-3 shrink-0', isActive ? 'text-emerald-500' : 'text-neutral-400')} />
                <span className={cn('text-sm flex-1 truncate', isActive ? 'font-medium' : 'text-neutral-600 dark:text-neutral-300')}>
                  {role}
                </span>
                <span className="text-[10px] text-neutral-400 font-mono shrink-0">{count}</span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
