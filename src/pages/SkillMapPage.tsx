import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ExternalLink,
  Hourglass,
  Loader2,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import { atomsApi, skillScanApi } from '@/lib/dataApi'
import { openContainingFolder } from '@/lib/openPath'
import { enrichSkill } from '@/lib/skillEnrichment'
import { cn } from '@/lib/cn'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { SkillFormDialog } from '@/components/skill/SkillFormDialog'
import {
  isSkillInventoryItem,
  type Atom,
  type AtomAny,
  type SkillInventoryItem,
  type SkillToolName,
  type SkillUserMarkedState,
} from '@/types'

// V2.0 · Tool color scheme
// - dotBg: tiny solid swatch shown in filter bar
// - avatarBg: full skill avatar background (may include dark: variants + ring)
// - avatarText: letter color that stays legible against avatarBg in both themes
// Design constraints:
// - Codex uses white bg + ring so dark text stays readable
// - OpenCode flips black↔light in dark mode to keep contrast with card bg
const TOOL_META: Record<
  SkillToolName,
  {
    label: string
    colorVar: string
    dotBg: string
    avatarBg: string
    avatarText: string
  }
> = {
  claude: {
    label: 'Claude',
    colorVar: 'rgba(251, 146, 60, 0.45)',
    dotBg: 'bg-orange-500',
    avatarBg: 'bg-orange-500',
    avatarText: 'text-white',
  },
  cursor: {
    label: 'Cursor',
    colorVar: 'rgba(156, 163, 175, 0.45)',
    dotBg: 'bg-neutral-500',
    avatarBg: 'bg-neutral-500',
    avatarText: 'text-white',
  },
  codex: {
    label: 'Codex',
    colorVar: 'rgba(229, 231, 235, 0.55)',
    dotBg: 'bg-white ring-1 ring-inset ring-neutral-300 dark:ring-neutral-500',
    avatarBg: 'bg-white ring-1 ring-inset ring-neutral-300 dark:ring-neutral-500',
    avatarText: 'text-neutral-700',
  },
  trae: {
    label: 'Trae',
    colorVar: 'rgba(52, 211, 153, 0.45)',
    dotBg: 'bg-emerald-500',
    avatarBg: 'bg-emerald-500',
    avatarText: 'text-white',
  },
  openclaw: {
    label: 'OpenClaw',
    colorVar: 'rgba(239, 68, 68, 0.45)',
    dotBg: 'bg-red-500',
    avatarBg: 'bg-red-500',
    avatarText: 'text-white',
  },
  opencode: {
    label: 'OpenCode',
    colorVar: 'rgba(64, 64, 64, 0.55)',
    dotBg: 'bg-neutral-900 ring-1 ring-inset ring-white/20 dark:bg-neutral-100 dark:ring-neutral-400',
    avatarBg: 'bg-neutral-900 ring-1 ring-inset ring-white/10 dark:bg-neutral-100 dark:ring-neutral-300',
    avatarText: 'text-white dark:text-neutral-900',
  },
  custom: {
    label: 'Custom',
    colorVar: 'rgba(236, 72, 153, 0.45)',
    dotBg: 'bg-pink-500',
    avatarBg: 'bg-pink-500',
    avatarText: 'text-white',
  },
}

type ToolFilter = 'all' | SkillToolName
type MarkFilter = 'all' | SkillUserMarkedState

const MARK_FILTERS: { id: MarkFilter; label: string; icon: string }[] = [
  { id: 'all', label: '全部', icon: '•' },
  { id: 'favorite', label: '常用', icon: '⭐' },
  { id: 'forgotten', label: '已遗忘', icon: '🌙' },
  { id: 'unused', label: '未使用', icon: '💤' },
]

/** Derive the single-letter avatar from the skill's actual name (not tool). */
function getInitial(name: string): string {
  const t = name.trim()
  if (!t) return '·'
  return t[0].toUpperCase()
}

/** Read the user-facing `type` field from the SKILL.md frontmatter, if any. */
function getSkillType(item: SkillInventoryItem): string {
  const raw = (item.frontmatter as Record<string, unknown> | undefined)?.type
  return typeof raw === 'string' ? raw : ''
}

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(days / 365)} 年前`
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium shadow-2xl glass animate-in fade-in slide-in-from-bottom-4">
      {message}
    </div>
  )
}

export default function SkillMapPage() {
  const [items, setItems] = useState<SkillInventoryItem[]>([])
  const [toolFilter, setToolFilter] = useState<ToolFilter>('all')
  const [markFilter, setMarkFilter] = useState<MarkFilter>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [enrichingId, setEnrichingId] = useState<string | null>(null)

  // CRUD state
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formInitial, setFormInitial] = useState<SkillInventoryItem | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<SkillInventoryItem | null>(null)

  async function refreshSkills() {
    try {
      const all = await atomsApi.list()
      const skills = (all as unknown as AtomAny[]).filter(isSkillInventoryItem)
      setItems(skills)
    } catch {}
  }

  function openCreate() {
    setFormMode('create')
    setFormInitial(undefined)
    setFormOpen(true)
  }

  function openEdit(item: SkillInventoryItem) {
    if (item.stats?.locked) return
    // V2.0 fix: close the detail overlay first so the edit modal is not
    // covered by the z-[110] overlay. Without this the form dialog opens
    // behind the overlay and users cannot interact with it.
    setExpanded(null)
    setFormMode('edit')
    setFormInitial(item)
    setFormOpen(true)
  }

  function requestDelete(item: SkillInventoryItem) {
    if (item.stats?.locked) return
    setDeleteTarget(item)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await atomsApi.remove(deleteTarget.id)
      setItems((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      setToast('✓ 已删除')
      setDeleteTarget(null)
    } catch (e) {
      setToast(e instanceof Error ? '删除失败：' + e.message : '删除失败')
    }
  }

  async function handleFormSave(item: SkillInventoryItem) {
    setFormOpen(false)
    setToast(formMode === 'edit' ? '✓ 已更新' : '✓ 已创建')
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === item.id)
      if (idx >= 0) {
        const next = prev.slice()
        next[idx] = item
        return next
      }
      return [item, ...prev]
    })
    await refreshSkills()
  }

  useEffect(() => {
    atomsApi
      .list()
      .then((all) => {
        const skills = (all as unknown as AtomAny[]).filter(isSkillInventoryItem)
        setItems(skills)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  const counts = useMemo(() => {
    const byTool: Record<string, number> = {}
    for (const it of items) byTool[it.toolName] = (byTool[it.toolName] || 0) + 1
    return byTool
  }, [items])

  // All distinct `type` values harvested from the currently loaded skills'
  // frontmatter. Drives the type filter dropdown. Enumerated lazily so new
  // types appear as soon as a rescan picks them up.
  const typeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      const t = getSkillType(it)
      if (t) set.add(t)
    }
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (toolFilter !== 'all' && it.toolName !== toolFilter) return false
      if (markFilter !== 'all' && it.userMarked !== markFilter) return false
      if (typeFilter !== 'all' && getSkillType(it) !== typeFilter) return false
      if (q) {
        const hay = `${it.name} ${it.rawDescription || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, toolFilter, markFilter, typeFilter, query])

  async function persistMark(item: SkillInventoryItem, mark: SkillUserMarkedState) {
    const nextMark = item.userMarked === mark ? undefined : mark
    const updated: SkillInventoryItem = {
      ...item,
      userMarked: nextMark,
      updatedAt: new Date().toISOString(),
    }
    setItems((prev) => prev.map((p) => (p.id === item.id ? updated : p)))
    try {
      await atomsApi.update(item.id, updated as unknown as Atom)
      setToast(nextMark ? `已标记: ${MARK_FILTERS.find((m) => m.id === nextMark)?.label ?? ''}` : '已清除标记')
    } catch (e) {
      setToast('保存失败')
      setItems((prev) => prev.map((p) => (p.id === item.id ? item : p)))
    }
  }

  async function requestAiEnrichment(item: SkillInventoryItem) {
    if (enrichingId) return
    setEnrichingId(item.id)
    setToast(`正在为 ${item.name} 生成 AI 摘要…`)
    try {
      const result = await enrichSkill(item, {
        onProgress: (stage) => {
          if (stage === 'calling-llm') setToast(`正在调用 LLM…`)
          else if (stage === 'parsing') setToast(`正在解析 AI 输出…`)
          else if (stage === 'persisting') setToast(`正在保存…`)
        },
      })
      const updated: SkillInventoryItem = {
        ...item,
        ...result,
        updatedAt: new Date().toISOString(),
      }
      await atomsApi.update(item.id, updated as unknown as Atom)
      setItems((prev) => prev.map((s) => (s.id === item.id ? updated : s)))
      setToast(`✓ 已生成 ${item.name} 的 AI 摘要`)
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'AI 摘要生成失败')
    } finally {
      setEnrichingId(null)
    }
  }

  const toolSummary = Object.entries(counts)
    .map(([k, v]) => `${v} ${TOOL_META[k as SkillToolName]?.label ?? k}`)
    .join(' · ')

  return (
    <div className="hero-gradient min-h-[calc(100vh-3.5rem)]">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-sky-400 to-emerald-400 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Skill 地图</h1>
            <button
              type="button"
              onClick={openCreate}
              className="ml-2 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[0.6875rem] font-medium border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:border-violet-400 hover:text-violet-500 dark:hover:border-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 transition-colors"
              title="手动添加 skill（非常规路径，建议用重新扫描）"
            >
              <Plus className="w-3 h-3" />
              手动添加
            </button>
            <RescanButton
              onDone={async () => {
                try {
                  const all = await atomsApi.list()
                  const skills = (all as unknown as AtomAny[]).filter(isSkillInventoryItem)
                  setItems(skills)
                  setToast('✓ 已重新扫描本地 skill')
                  setTimeout(() => setToast(null), 2400)
                } catch {}
              }}
              onError={(msg) => {
                setToast(msg)
                setTimeout(() => setToast(null), 3000)
              }}
            />
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {loading
              ? '正在加载本地 skills…'
              : `${items.length} skills${toolSummary ? ' · ' + toolSummary : ''}`}
          </p>
        </div>

        {/* Filter bar · sticky to top of <main> scroll container (which starts
            right below TopNav, so top-0 — NOT top-14 — is what lines up with
            the nav bottom edge. top-14 leaks 56px extra space as user scrolls) */}
        <div className="sticky top-0 z-30 -mx-6 px-6 py-3 mb-6 bg-white/80 dark:bg-[#0a0a0b]/80 backdrop-blur-md glass border-b border-neutral-200/60 dark:border-neutral-800/60">
          {/* Row 1 · filters — flex-1 on tool pill group so it stretches
              to fill whatever space mark + type don't claim. Both rows
              share the same parent width, guaranteeing pixel-level alignment
              with the search bar below. Future: if tool count overflows,
              swap the last N into a "更多 ▾" popover. */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl">
              <button
                onClick={() => setToolFilter('all')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  toolFilter === 'all'
                    ? 'bg-white dark:bg-neutral-800 shadow-sm text-neutral-900 dark:text-white'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                )}
              >
                全部
              </button>
              {(Object.keys(TOOL_META) as SkillToolName[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setToolFilter(t)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5',
                    toolFilter === t
                      ? 'bg-white dark:bg-neutral-800 shadow-sm text-neutral-900 dark:text-white'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  )}
                >
                  <span className={cn('w-3 h-3 rounded-sm', TOOL_META[t].dotBg)} />
                  {TOOL_META[t].label}
                  {counts[t] ? (
                    <span className="text-[0.625rem] text-neutral-400 font-mono">{counts[t]}</span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Mark filter */}
            <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl">
              {MARK_FILTERS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMarkFilter(m.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1',
                    markFilter === m.id
                      ? 'bg-white dark:bg-neutral-800 shadow-sm text-neutral-900 dark:text-white'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  )}
                >
                  <span>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Type filter · enumerated from actual loaded skills' frontmatter.type */}
            {typeOptions.length > 0 && (
              <div className="relative">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-9 pl-3 pr-8 text-xs font-medium rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-transparent focus:border-neutral-300 dark:focus:border-neutral-700 focus:outline-none transition-colors appearance-none cursor-pointer"
                >
                  <option value="all">类型 · 全部</option>
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              </div>
            )}

          </div>

          {/* Row 2 · search — always full width, pixel-aligned with row 1 */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 skill 名称或描述…"
              className="w-full h-9 pl-9 pr-3 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-transparent focus:border-neutral-300 dark:focus:border-neutral-700 focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {loading ? '加载中…' : '没有匹配的 skill · 调整筛选条件试试'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((it) => {
              const meta = TOOL_META[it.toolName] ?? TOOL_META.custom
              const isOpen = expanded === it.id
              return (
                <div
                  key={it.id}
                  className={cn(
                    'group cell-glow rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/60 backdrop-blur transition-all',
                    isOpen && 'ring-1 ring-neutral-300 dark:ring-neutral-700'
                  )}
                  style={{ ['--glow-color' as any]: meta.colorVar }}
                >
                  <button
                    onClick={() => setExpanded((prev) => (prev === it.id ? null : it.id))}
                    className="w-full text-left p-4"
                  >
                    {/* L0: always visible */}
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold shadow-sm shrink-0',
                          meta.avatarBg,
                          meta.avatarText,
                        )}
                      >
                        {getInitial(it.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-semibold truncate">{it.name}</h3>
                          {it.userMarked === 'favorite' && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                          {it.userMarked === 'forgotten' && <Moon className="w-3 h-3 text-sky-500" />}
                          {it.userMarked === 'unused' && <Hourglass className="w-3 h-3 text-neutral-400" />}
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-0.5">
                          {it.rawDescription || '（无描述）'}
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 text-neutral-400 shrink-0 transition-transform',
                          isOpen && 'rotate-180',
                        )}
                      />
                    </div>

                    {/* Always-visible bottom info row: type chip + mtime.
                        Replaces the old hover-only L1 tag row so the card
                        footer is never empty and users can scan types fast. */}
                    <div className="mt-3 flex items-center justify-between gap-2 text-[0.625rem]">
                      {(() => {
                        const skType = getSkillType(it)
                        return skType ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/20 truncate max-w-[70%]">
                            {skType}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-neutral-100 dark:bg-white/5 text-neutral-400 dark:text-neutral-500 ring-1 ring-neutral-200/60 dark:ring-white/5">
                            未分类
                          </span>
                        )
                      })()}
                      <span className="font-mono text-neutral-400 shrink-0">{daysAgo(it.fileMtime)}</span>
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <SkillFormDialog
        open={formOpen}
        mode={formMode}
        initial={formInitial}
        onClose={() => setFormOpen(false)}
        onSave={handleFormSave}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="从 Skill 地图移除"
        description={
          deleteTarget
            ? `将从 Atomsyn 索引中移除「${deleteTarget.name}」的记录。\n\n⚠️ 重要: 这只是移除 Atomsyn 本地缓存的索引条目,你的 SKILL.md 源文件不会被触碰,仍保留在:\n${deleteTarget.localPath}\n\n下次点击"重新扫描"时,这条记录会自动恢复。若要真正卸载这个 skill,请手动删除上面这个目录。`
            : undefined
        }
        confirmLabel="仅从索引移除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      <SkillDetailOverlay
        item={expanded ? items.find((i) => i.id === expanded) ?? null : null}
        enrichingId={enrichingId}
        onClose={() => setExpanded(null)}
        onMark={persistMark}
        onEnrich={requestAiEnrichment}
        onEdit={openEdit}
        onDelete={requestDelete}
        onOpenFolder={async (p) => {
          const r = await openContainingFolder(p)
          setToast(r.message)
          setTimeout(() => setToast(null), 2800)
        }}
      />

      {toast && <Toast message={toast} />}
    </div>
  )
}

// ────────────────────── Skill detail overlay (modal) ──────────────────────
//
// Replaces the legacy in-place card expansion (which caused layout shift in
// the CSS grid). Click on any card opens this overlay; cards themselves stay
// compact and never resize. Mark actions are consolidated into a single
// segmented control at the top of the overlay to reduce visual noise.

function SkillDetailOverlay({
  item,
  enrichingId,
  onClose,
  onMark,
  onEnrich,
  onEdit,
  onDelete,
  onOpenFolder,
}: {
  item: SkillInventoryItem | null
  enrichingId: string | null
  onClose: () => void
  onMark: (it: SkillInventoryItem, mark: SkillUserMarkedState) => void
  onEnrich: (it: SkillInventoryItem) => void
  onEdit: (it: SkillInventoryItem) => void
  onDelete: (it: SkillInventoryItem) => void
  onOpenFolder: (p: string) => void
}) {
  // ESC to close
  useEffect(() => {
    if (!item) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [item, onClose])

  // Local UI state for the overlay — showRawFrontmatter collapses the
  // raw JSON frontmatter behind a toggle so non-technical users are not
  // greeted by a wall of JSON on open.
  const [showRawFrontmatter, setShowRawFrontmatter] = useState(false)
  useEffect(() => {
    // Reset on item change so the next skill doesn't inherit the toggle
    // state from a previous one.
    setShowRawFrontmatter(false)
  }, [item?.id])

  if (!item) return null
  const meta = TOOL_META[item.toolName] ?? TOOL_META.custom
  const locked = !!item.stats?.locked
  const skillType = getSkillType(item)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-detail-title"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-neutral-950/50 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[calc(100vh-4rem)] flex flex-col rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white dark:bg-neutral-950/95 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
        style={{
          ['--glow-color' as any]: meta.colorVar,
        }}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start gap-3 p-5 border-b border-neutral-200/60 dark:border-neutral-800/60">
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center text-base font-semibold shadow-sm shrink-0',
              meta.avatarBg,
              meta.avatarText,
            )}
          >
            {getInitial(item.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="skill-detail-title"
              className="text-[0.9375rem] font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 flex items-center gap-1.5"
            >
              {item.name}
              {item.userMarked === 'favorite' && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
              {item.userMarked === 'forgotten' && <Moon className="w-3.5 h-3.5 text-sky-500" />}
              {item.userMarked === 'unused' && <Hourglass className="w-3.5 h-3.5 text-neutral-400" />}
            </h2>
            <p className="text-[0.6875rem] text-neutral-400 dark:text-neutral-500 mt-0.5 flex items-center gap-2">
              <span>{meta.label}</span>
              {skillType && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/20">
                    {skillType}
                  </span>
                </>
              )}
              <span>·</span>
              <span>{daysAgo(item.fileMtime)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Body · takes remaining height, scrolls internally when content
            exceeds the flex column. Replaces the old max-h-[70vh] which
            could overflow the viewport on small screens combined with
            the header/footer heights. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* Mark segmented control */}
          <div>
            <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 mb-1.5">标记</div>
            <div className="inline-flex items-center gap-0.5 p-0.5 bg-neutral-100 dark:bg-white/[0.04] rounded-lg">
              {(
                [
                  { id: null, label: '无', icon: '—' },
                  { id: 'favorite', label: '常用', icon: '⭐' },
                  { id: 'forgotten', label: '已遗忘', icon: '🌙' },
                  { id: 'unused', label: '未使用', icon: '💤' },
                ] as const
              ).map((opt) => {
                const active =
                  (opt.id === null && !item.userMarked) || item.userMarked === opt.id
                return (
                  <button
                    key={opt.id ?? 'none'}
                    type="button"
                    onClick={() => {
                      if (opt.id === null) {
                        // clear: toggle off whatever is set
                        if (item.userMarked) onMark(item, item.userMarked)
                      } else {
                        onMark(item, opt.id)
                      }
                    }}
                    className={cn(
                      'px-2.5 py-1 text-[0.6875rem] font-medium rounded-md transition-colors flex items-center gap-1',
                      active
                        ? 'bg-white dark:bg-white/10 shadow-sm text-neutral-900 dark:text-white'
                        : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white',
                    )}
                  >
                    <span>{opt.icon}</span>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description — shown prominently for non-technical users.
              Falls back to an empty-state line if the SKILL.md has no
              frontmatter description (the scanner will usually fill it
              from the first paragraph of the body). */}
          <div>
            <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 mb-1.5">描述</div>
            {item.rawDescription ? (
              <p className="text-[0.8125rem] text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {item.rawDescription}
              </p>
            ) : (
              <p className="text-[0.75rem] italic text-neutral-400">（这个 skill 没有提供描述）</p>
            )}
          </div>

          {/* Raw frontmatter · collapsed by default to keep the modal
              friendly for non-technical users. Click to toggle. */}
          <div>
            <button
              type="button"
              onClick={() => setShowRawFrontmatter((s) => !s)}
              className="text-[0.625rem] uppercase tracking-wider text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 mb-1.5 flex items-center gap-1 transition-colors"
            >
              <ChevronDown
                className={cn(
                  'w-3 h-3 transition-transform',
                  showRawFrontmatter ? 'rotate-0' : '-rotate-90',
                )}
              />
              原始 Frontmatter (JSON)
            </button>
            {showRawFrontmatter && (
              <pre className="text-[0.6875rem] font-mono bg-neutral-50 dark:bg-white/[0.02] rounded-lg p-3 overflow-x-auto text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap break-words border border-neutral-200/70 dark:border-white/5">
{JSON.stringify(item.frontmatter, null, 2)}
              </pre>
            )}
          </div>

          {/* AI summary */}
          <div>
            <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 mb-1.5">AI 摘要</div>
            {item.aiGeneratedSummary ? (
              <p className="text-[0.8125rem] text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {item.aiGeneratedSummary}
              </p>
            ) : (
              <p className="text-[0.75rem] italic text-neutral-400">AI 尚未生成摘要</p>
            )}
          </div>

          {/* Typical scenarios */}
          {item.typicalScenarios?.length ? (
            <div>
              <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 mb-1.5">典型场景</div>
              <ul className="text-[0.8125rem] text-neutral-600 dark:text-neutral-400 space-y-1 list-disc list-inside">
                {item.typicalScenarios.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Local path */}
          <div>
            <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 mb-1.5">本地路径</div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/70 dark:border-white/5">
              <code className="text-[0.6875rem] font-mono text-neutral-500 dark:text-neutral-400 truncate flex-1">
                {item.localPath}
              </code>
              <button
                type="button"
                onClick={() => onOpenFolder(item.localPath)}
                className="shrink-0 px-2 py-1 rounded-md text-[0.6875rem] font-medium border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                打开
              </button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="shrink-0 flex items-center justify-between gap-2 p-4 border-t border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-white/[0.01] rounded-b-2xl">
          <button
            type="button"
            disabled={locked}
            title={locked ? '已锁定，不可删除' : '从 Atomsyn 索引移除 (不删除磁盘源文件)'}
            onClick={() => onDelete(item)}
            className="px-3 py-1.5 rounded-lg text-[0.75rem] font-medium border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            从索引移除
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={enrichingId !== null}
              onClick={() => onEnrich(item)}
              className="px-3 py-1.5 rounded-lg text-[0.75rem] font-medium bg-gradient-to-r from-violet-500/10 to-sky-500/10 border border-violet-500/30 text-violet-600 dark:text-violet-400 hover:from-violet-500/20 hover:to-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              {enrichingId === item.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {enrichingId === item.id ? '生成中…' : '让 AI 理解'}
            </button>
            <button
              type="button"
              disabled={locked}
              title={locked ? '已锁定，不可编辑' : undefined}
              onClick={() => onEdit(item)}
              className="px-3 py-1.5 rounded-lg text-[0.75rem] font-medium border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5" />
              编辑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RescanButton({
  onDone,
  onError,
}: {
  onDone: () => Promise<void> | void
  onError: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await skillScanApi.rescan()
          await onDone()
        } catch (err) {
          onError(err instanceof Error ? err.message : '扫描失败')
        } finally {
          setBusy(false)
        }
      }}
      className={cn(
        'ml-2 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[0.6875rem] font-medium transition-colors',
        'border border-neutral-200 dark:border-neutral-800',
        'text-neutral-600 dark:text-neutral-300',
        'hover:border-violet-400 hover:text-violet-500 dark:hover:border-violet-500',
        busy && 'opacity-60 cursor-progress',
      )}
      title="重新扫描本地 skill 目录"
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <RefreshCw className="w-3 h-3" />
      )}
      {busy ? '扫描中' : '重新扫描'}
    </button>
  )
}
