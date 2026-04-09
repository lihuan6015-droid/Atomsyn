/**
 * V2.0 M6-Pre Phase 2 · Atom mode sidebar
 *
 * - Search CTA (triggers Spotlight)
 * - 方法库 (violet theme): system frameworks + custom skeletons
 * - 记忆花园 (emerald theme): role-based grouping
 * - 项目演练场 / 成长档案 / Skill 地图
 * - Right-click context menus on sidebar items
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  BookOpen,
  ChevronDown,
  Flower2,
  FolderOpen,
  GitBranch,
  Grid3X3,
  List,
  Pen,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Sprout,
  Tag,
  Trash2,
  Wrench,
  RefreshCw,
  FolderOpenDot,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/useAppStore'
import { atomsApi, frameworksApi, indexApi } from '@/lib/dataApi'
import { openContainingFolder } from '@/lib/openPath'
import { getDataDirInfo } from '@/lib/dataPath'
import type { Framework, AtomAny } from '@/types'
import { getFrameworkNodeCount } from '@/types'
import { ContextMenu, type ContextMenuItem } from '@/components/shared/ContextMenu'

/** Map layoutType → lucide icon */
const LAYOUT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  matrix: Grid3X3,
  list: List,
  tree: GitBranch,
}

export function AtomSidebar() {
  const nav = useNavigate()
  const loc = useLocation()

  const activeFrameworkId = useAppStore((s) => s.activeFrameworkId)
  const activeRole = useAppStore((s) => s.activeRole)
  const activeSkeletonId = useAppStore((s) => s.activeSkeletonId)
  const activeSectionFocus = useAppStore((s) => s.activeSectionFocus)
  const customSkeletons = useAppStore((s) => s.customSkeletons)
  const setActiveFramework = useAppStore((s) => s.setActiveFramework)
  const setActiveRole = useAppStore((s) => s.setActiveRole)
  const setActiveSkeleton = useAppStore((s) => s.setActiveSkeleton)
  const setActiveSectionFocus = useAppStore((s) => s.setActiveSectionFocus)
  const renameCustomSkeleton = useAppStore((s) => s.renameCustomSkeleton)
  const removeCustomSkeleton = useAppStore((s) => s.removeCustomSkeleton)

  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [allAtoms, setAllAtoms] = useState<AtomAny[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const [methodLibExpanded, setMethodLibExpanded] = useState(false)
  const [gardenExpanded, setGardenExpanded] = useState(false)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  const loadData = useCallback(() => {
    frameworksApi.list().then(setFrameworks).catch(() => setFrameworks([]))
    atomsApi.list().then((a) => setAllAtoms(a as AtomAny[])).catch(() => setAllAtoms([]))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const roleGroups = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of allAtoms) {
      if (a.kind === 'skill-inventory' || a.kind === 'methodology') continue
      const role = (a as any).role as string | undefined
      const key = role || '未分类'
      map.set(key, (map.get(key) || 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => ({ role, count }))
  }, [allAtoms])

  function startRename(id: string, currentName: string) {
    setEditingId(id)
    setEditName(currentName)
  }

  function commitRename(id: string) {
    const name = editName.trim()
    if (name) renameCustomSkeleton(id, name)
    setEditingId(null)
  }

  function handleRefresh() {
    indexApi.rebuild().catch(() => undefined)
    loadData()
    setCtxMenu(null)
  }

  async function handleOpenDir(relativePath: string) {
    setCtxMenu(null)
    const info = await getDataDirInfo()
    // In Tauri mode, info.path is absolute; in dev mode, data is relative to CWD
    const base = info.source === 'dev-web' ? '' : info.path
    const absPath = base ? `${base}/${relativePath}` : relativePath
    const result = await openContainingFolder(absPath + '/placeholder')
    // Show feedback via toast
    useAppStore.getState().showToast(result.message)
  }

  function showFrameworkCtxMenu(e: React.MouseEvent, fw: Framework) {
    e.preventDefault()
    const items: ContextMenuItem[] = [
      {
        label: '编辑',
        icon: Pencil,
        action: () => {
          setCtxMenu(null)
          window.dispatchEvent(new CustomEvent('atomsyn:edit-framework', { detail: { frameworkId: fw.id } }))
        },
      },
      { label: '刷新', icon: RefreshCw, action: handleRefresh },
      { label: '打开本地目录', icon: FolderOpenDot, action: () => handleOpenDir(`atoms/${fw.id}`) },
    ]
    // Only allow deleting non-seed frameworks (seed frameworks have a non-empty source field)
    if (!fw.source) {
      items.push({
        label: '删除',
        icon: Trash2,
        danger: true,
        action: async () => {
          setCtxMenu(null)
          try {
            await frameworksApi.remove(fw.id)
            loadData()
            useAppStore.getState().showToast(`已删除方法库「${fw.name}」`)
          } catch (err) {
            useAppStore.getState().showToast(`删除失败: ${(err as Error).message}`)
          }
        },
      })
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }

  function showRoleCtxMenu(e: React.MouseEvent) {
    e.preventDefault()
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: '刷新', icon: RefreshCw, action: handleRefresh },
        { label: '打开本地目录', icon: FolderOpenDot, action: () => handleOpenDir('atoms/experience') },
      ],
    })
  }

  function showSkeletonCtxMenu(e: React.MouseEvent, skId: string, skName: string) {
    e.preventDefault()
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: '重命名', icon: Pen, action: () => { startRename(skId, skName); setCtxMenu(null) } },
        { label: '删除', icon: Trash2, action: () => { removeCustomSkeleton(skId); setCtxMenu(null) }, danger: true },
      ],
    })
  }

  const isGardenActive = loc.pathname.startsWith('/atom/garden')
  const isMethodLibFocused = activeSectionFocus === 'method-library' && isGardenActive
  const isGardenFocused = activeSectionFocus === 'memory-garden' && isGardenActive

  return (
    <div className="px-3 py-2 space-y-1" onContextMenu={(e) => e.preventDefault()}>
      {/* Search CTA (triggers Spotlight) */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('ccl:open-spotlight'))}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-500/20 via-sky-500/15 to-emerald-500/20 dark:from-violet-500/25 dark:via-sky-500/20 dark:to-emerald-500/25 border border-white/60 dark:border-white/10 shadow-sm shadow-sky-500/8 text-violet-600 dark:text-violet-300 hover:shadow-lg hover:shadow-sky-500/12 hover:scale-[1.01] active:scale-[0.98] transition-all mb-1"
      >
        <Search className="w-4 h-4 text-violet-500 dark:text-violet-400" />
        <span className="flex-1 text-left text-[0.8125rem]">搜索认知资产...</span>
        <kbd className="text-[0.625rem] font-mono opacity-60 bg-white/50 dark:bg-white/10 px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>

      {/* Group label: 认知来源 */}
      <div className="px-3 pt-2 pb-1">
        <span className="text-[0.625rem] font-semibold uppercase tracking-widest text-neutral-400/70 dark:text-neutral-600">
          认知来源
        </span>
      </div>

      {/* ─── 方法库 (violet) ─── */}
      <SectionHeader
        icon={BookOpen}
        label="方法库"
        expanded={methodLibExpanded}
        onToggle={() => setMethodLibExpanded((v) => !v)}
        active={isMethodLibFocused || (!!activeFrameworkId && isGardenActive) || (!!activeSkeletonId && isGardenActive)}
        color="violet"
        onClick={() => { nav('/atom/garden'); setActiveSectionFocus('method-library') }}
        onContextMenu={(e) => {
          e.preventDefault()
          setCtxMenu({
            x: e.clientX, y: e.clientY,
            items: [
              { label: '刷新', icon: RefreshCw, action: handleRefresh },
              { label: '打开本地目录', icon: FolderOpenDot, action: () => handleOpenDir('frameworks') },
            ],
          })
        }}
      />
      {methodLibExpanded && (
        <div className="pl-4 pr-1 space-y-px">
          {frameworks.map((f) => {
            const isActive = f.id === activeFrameworkId && isGardenActive
            const LayoutIcon = LAYOUT_ICON[f.layoutType] || Grid3X3
            return (
              <button
                key={f.id}
                onClick={() => { nav('/atom/garden'); setActiveFramework(f.id) }}
                onContextMenu={(e) => showFrameworkCtxMenu(e, f)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors text-[0.8125rem]',
                  isActive
                    ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300 font-medium'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
                )}
              >
                <LayoutIcon className={cn('w-3 h-3 shrink-0', isActive ? 'text-violet-500' : 'text-neutral-400')} />
                <span className="truncate flex-1">{f.name}</span>
                <span className="text-[0.625rem] text-neutral-400 font-mono">{getFrameworkNodeCount(f)}</span>
              </button>
            )
          })}

          {customSkeletons.map((sk) => {
            const isActive = sk.id === activeSkeletonId && isGardenActive
            const isEditing = editingId === sk.id
            return (
              <div
                key={sk.id}
                onContextMenu={(e) => showSkeletonCtxMenu(e, sk.id, sk.name)}
                className={cn(
                  'group flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors text-[0.8125rem]',
                  isActive
                    ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300 font-medium'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
                )}
              >
                <button
                  onClick={() => { nav('/atom/garden'); setActiveSkeleton(sk.id) }}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                >
                  <FolderOpen className={cn('w-3 h-3 shrink-0', isActive ? 'text-violet-500' : 'text-neutral-400')} />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => commitRename(sk.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(sk.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="text-[0.8125rem] bg-transparent border-b border-violet-400 focus:outline-none w-full"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate">{sk.name}</span>
                  )}
                </button>
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); startRename(sk.id, sk.name) }}
                    className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    title="重命名"
                  >
                    <Pen className="w-2.5 h-2.5 text-neutral-400" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCustomSkeleton(sk.id) }}
                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-500/10"
                    title="删除"
                  >
                    <Trash2 className="w-2.5 h-2.5 text-neutral-400 hover:text-red-500" />
                  </button>
                </div>
              </div>
            )
          })}

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('atomsyn:create-framework'))}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-violet-500 transition-colors text-[0.8125rem]"
          >
            <Plus className="w-3 h-3 shrink-0" />
            <span>新建方法库</span>
          </button>
        </div>
      )}

      {/* ─── 记忆花园 (emerald) ─── */}
      <SectionHeader
        icon={Flower2}
        label="记忆花园"
        expanded={gardenExpanded}
        onToggle={() => setGardenExpanded((v) => !v)}
        active={isGardenFocused || (!!activeRole && isGardenActive)}
        color="emerald"
        onClick={() => { nav('/atom/garden'); setActiveSectionFocus('memory-garden') }}
        onContextMenu={(e) => {
          e.preventDefault()
          setCtxMenu({
            x: e.clientX, y: e.clientY,
            items: [
              { label: '刷新', icon: RefreshCw, action: handleRefresh },
              { label: '打开本地目录', icon: FolderOpenDot, action: () => handleOpenDir('atoms/experience') },
            ],
          })
        }}
      />
      {gardenExpanded && (
        <div className="pl-4 pr-1 space-y-px">
          {roleGroups.map(({ role, count }) => {
            const isActive = activeRole === role && isGardenActive
            return (
              <button
                key={role}
                onClick={() => { nav('/atom/garden'); setActiveRole(role) }}
                onContextMenu={showRoleCtxMenu}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors text-[0.8125rem]',
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
                )}
              >
                <Tag className={cn('w-3 h-3 shrink-0', isActive ? 'text-emerald-500' : 'text-neutral-400')} />
                <span className="truncate flex-1">{role}</span>
                <span className="text-[0.625rem] text-neutral-400 font-mono">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ─── 书架 (sky) ─── */}
      <SidebarNavItem to="/atom/bookshelf" icon={BookOpen} label="书架" />

      {/* Group label: 成长工具 */}
      <div className="px-3 pt-3 pb-1">
        <span className="text-[0.625rem] font-semibold uppercase tracking-widest text-neutral-400/70 dark:text-neutral-600">
          成长工具
        </span>
      </div>

      {/* Growth tools */}
      <SidebarNavItem to="/atom/playground" icon={Wrench} label="项目演练场" />
      <SidebarNavItem to="/atom/growth" icon={Sprout} label="成长档案" />
      <SidebarNavItem to="/atom/skills" icon={Sparkles} label="Skill 地图" />

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}

/** Collapsible section header with color theme */
function SectionHeader({
  icon: Icon,
  label,
  expanded,
  onToggle,
  active,
  color = 'violet',
  onClick,
  onContextMenu,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  expanded: boolean
  onToggle: () => void
  active?: boolean
  color?: 'violet' | 'emerald'
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  const colors = {
    violet: { bg: 'bg-violet-500/8', text: 'text-violet-700 dark:text-violet-300', icon: 'text-violet-500' },
    emerald: { bg: 'bg-emerald-500/8', text: 'text-emerald-700 dark:text-emerald-300', icon: 'text-emerald-500' },
  }
  const c = colors[color]

  return (
    <button
      onClick={() => {
        onClick?.()
        onToggle()
      }}
      onContextMenu={onContextMenu}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all group',
        active ? `${c.bg} ${c.text} font-medium` : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
      )}
    >
      <Icon className={cn('w-4 h-4', active ? c.icon : 'text-neutral-400')} />
      {label}
      <ChevronDown
        className={cn(
          'w-3.5 h-3.5 ml-auto text-neutral-400 transition-transform duration-200',
          expanded ? 'rotate-0' : '-rotate-90'
        )}
      />
    </button>
  )
}

function SidebarNavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all',
          isActive
            ? 'bg-neutral-100 dark:bg-white/5 text-neutral-900 dark:text-white font-medium'
            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('w-4 h-4', isActive ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-400')} />
          {label}
        </>
      )}
    </NavLink>
  )
}
