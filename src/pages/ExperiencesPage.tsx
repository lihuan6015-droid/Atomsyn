/**
 * 我的经验 (Experiences) page · V1.5 Fix-2 Part A.
 *
 * Renders all ExperienceAtom files (`kind: 'experience'`) crystallized by
 * agents via atlas-write. Vertical card list with filter bar + 3-level
 * progressive disclosure (header / preview / full insight).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookMarked,
  Copy,
  FileText,
  Lock,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { atomsApi, indexApi } from '@/lib/dataApi'
import { openContainingFolder } from '@/lib/openPath'
import { isExperienceAtom, type AtomAny, type ExperienceAtom } from '@/types'
import { useAppStore } from '@/stores/useAppStore'
import { cn } from '@/lib/cn'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ExperienceFormDialog } from '@/components/experience/ExperienceFormDialog'

type DateRange = 'all' | 'today' | 'week' | 'month'

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' 小时前'
  const d = Math.floor(h / 24)
  if (d < 30) return d + ' 天前'
  const mo = Math.floor(d / 30)
  if (mo < 12) return mo + ' 个月前'
  return Math.floor(mo / 12) + ' 年前'
}

function agentColor(agent: string): string {
  // simple hash → tailwind tone
  const palette = [
    'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30',
    'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',
    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
    'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
    'bg-pink-500/15 text-pink-600 dark:text-pink-300 border-pink-500/30',
    'bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30',
  ]
  let h = 0
  for (let i = 0; i < agent.length; i++) h = (h * 31 + agent.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

function inDateRange(iso: string, range: DateRange): boolean {
  if (range === 'all') return true
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  const now = Date.now()
  const ms = { today: 86400000, week: 7 * 86400000, month: 30 * 86400000 }[range]
  return now - t <= ms
}

export function ExperiencesPage() {
  const showToast = useAppStore((s) => s.showToast)
  const [items, setItems] = useState<ExperienceAtom[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // filters
  const [q, setQ] = useState('')
  const [agent, setAgent] = useState<string>('all')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [range, setRange] = useState<DateRange>('all')

  // CRUD state
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formInitial, setFormInitial] = useState<ExperienceAtom | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<ExperienceAtom | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpenId) return
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpenId(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpenId])

  async function refresh() {
    setLoading(true)
    try {
      const list = (await atomsApi.list()) as unknown as AtomAny[]
      setItems(list.filter(isExperienceAtom))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const allAgents = useMemo(() => {
    const s = new Set<string>()
    items.forEach((i) => s.add(i.sourceAgent || 'user'))
    return Array.from(s).sort()
  }, [items])

  const allTags = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach((i) => i.tags?.forEach((t) => (counts[t] = (counts[t] || 0) + 1)))
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t)
  }, [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items
      .filter((i) => agent === 'all' || (i.sourceAgent || 'user') === agent)
      .filter((i) => inDateRange(i.createdAt, range))
      .filter((i) => {
        if (activeTags.size === 0) return true
        return Array.from(activeTags).every((t) => i.tags?.includes(t))
      })
      .filter((i) => {
        if (!needle) return true
        const hay = (
          i.name +
          ' ' +
          (i.sourceContext || '') +
          ' ' +
          (i.insight || '') +
          ' ' +
          (i.tags || []).join(' ')
        ).toLowerCase()
        return hay.includes(needle)
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [items, q, agent, range, activeTags])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTag(t: string) {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  async function copyAsPrompt(it: ExperienceAtom) {
    const md = [
      '## 经验：' + it.name,
      '',
      '**来源**：' + (it.sourceAgent || 'user') + ' · ' + it.createdAt,
      '',
      '**情境**：' + it.sourceContext,
      '',
      '**洞察**：',
      it.insight,
      it.keySteps && it.keySteps.length > 0 ? '\n**关键步骤**：\n' + it.keySteps.map((s) => '- ' + s).join('\n') : '',
      it.tags?.length ? '\n**标签**：' + it.tags.join(', ') : '',
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(md)
      showToast('已复制为 prompt 片段')
    } catch {
      showToast('复制失败')
    }
  }

  async function toggleFlag(it: ExperienceAtom, flag: 'locked' | 'userDemoted') {
    const next: ExperienceAtom = {
      ...it,
      stats: { ...it.stats, [flag]: !it.stats?.[flag] },
      updatedAt: new Date().toISOString(),
    }
    try {
      // dataApi is typed for MethodologyAtom; cast — server stores as-is.
      await atomsApi.update(it.id, next as unknown as never)
      setItems((arr) => arr.map((x) => (x.id === it.id ? next : x)))
      showToast(flag === 'locked' ? '已切换锁定' : '已切换降权')
      // refresh index so Copilot picks up changes
      indexApi.rebuild().catch(() => {})
    } catch (e: any) {
      showToast('保存失败：' + (e?.message || 'unknown'))
    }
  }

  function openCreate() {
    setFormMode('create')
    setFormInitial(undefined)
    setFormOpen(true)
  }

  function openEdit(it: ExperienceAtom) {
    if (it.stats?.locked) return
    setFormMode('edit')
    setFormInitial(it)
    setFormOpen(true)
    setMenuOpenId(null)
  }

  function requestDelete(it: ExperienceAtom) {
    if (it.stats?.locked) return
    setDeleteTarget(it)
    setMenuOpenId(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await atomsApi.remove(deleteTarget.id)
      showToast('✓ 已删除')
      setDeleteTarget(null)
      await refresh()
      indexApi.rebuild().catch(() => {})
    } catch (e: any) {
      showToast('删除失败：' + (e?.message || 'unknown'))
    }
  }

  async function handleFormSave(atom: ExperienceAtom) {
    setFormOpen(false)
    showToast(formMode === 'edit' ? '✓ 已更新' : '✓ 已创建')
    // Optimistically inject then refresh from server for canonical state.
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === atom.id)
      if (idx >= 0) {
        const next = prev.slice()
        next[idx] = atom
        return next
      }
      return [atom, ...prev]
    })
    try {
      await refresh()
    } catch {}
    indexApi.rebuild().catch(() => {})
  }

  return (
    <div className="hero-gradient min-h-full">
      {/* Sticky sub-header */}
      <div className="sticky top-0 z-20 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white/70 dark:bg-[#0a0a0b]/70 glass">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-violet-500" />
              我的经验
            </h1>
            <div className="text-[11px] text-neutral-500 mt-0.5">
              {items.length} 张经验原子 · 由 agent 沉淀
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreate}
              className="h-8 px-3 rounded-lg text-xs font-medium border border-violet-500 bg-violet-500 text-white shadow-sm shadow-violet-500/30 hover:bg-violet-600 hover:border-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              新建经验
            </button>
            <button
              onClick={refresh}
              className="h-8 px-3 rounded-lg text-xs font-medium border border-neutral-200/70 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              刷新
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="max-w-5xl mx-auto px-6 pb-3 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-neutral-500 mr-1">来源</span>
            <FilterChip active={agent === 'all'} onClick={() => setAgent('all')}>
              全部
            </FilterChip>
            {allAgents.map((a) => (
              <FilterChip
                key={a}
                active={agent === a}
                onClick={() => setAgent(a)}
                className={agent === a ? agentColor(a) : ''}
              >
                {a}
              </FilterChip>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-neutral-500 mr-1">时间</span>
            {(['all', 'today', 'week', 'month'] as DateRange[]).map((r) => (
              <FilterChip key={r} active={range === r} onClick={() => setRange(r)}>
                {{ all: '全部', today: '今天', week: '本周', month: '本月' }[r]}
              </FilterChip>
            ))}
          </div>

          {allTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-neutral-500 mr-1">标签</span>
              {allTags.slice(0, 12).map((t) => (
                <FilterChip key={t} active={activeTags.has(t)} onClick={() => toggleTag(t)}>
                  #{t}
                </FilterChip>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索 名称 / 情境 / 洞察 / 标签 ..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ExperienceFormDialog
        open={formOpen}
        mode={formMode}
        initial={formInitial}
        onClose={() => setFormOpen(false)}
        onSave={handleFormSave}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="删除经验原子"
        description={
          deleteTarget
            ? `将永久删除经验原子「${deleteTarget.name}」，此操作不可撤销。`
            : undefined
        }
        confirmLabel="删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {/* List */}
      <div className="max-w-5xl mx-auto px-6 py-7 space-y-2.5">
        {loading ? (
          <div className="text-sm text-neutral-500 py-10 text-center">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Sparkles className="w-8 h-8 mx-auto text-neutral-400 mb-3" />
            <div className="text-sm text-neutral-500">
              {items.length === 0
                ? '尚无经验原子 · 在 Claude Code 对话里说"帮我记下来"就能沉淀一张'
                : '没有匹配的经验，试试调整筛选条件'}
            </div>
          </div>
        ) : (
          filtered.map((it) => {
            const open = expanded.has(it.id)
            const locked = !!it.stats?.locked
            const demoted = !!it.stats?.userDemoted
            return (
              <div
                key={it.id}
                className="relative rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/60 dark:bg-white/[0.02] overflow-visible transition-all"
              >
                {/* Row menu (⋯) */}
                <div
                  className="absolute top-3 right-3 z-10"
                  ref={menuOpenId === it.id ? menuRef : undefined}
                >
                  <button
                    type="button"
                    aria-label="更多操作"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpenId((prev) => (prev === it.id ? null : it.id))
                    }}
                    className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuOpenId === it.id && (
                    <div className="absolute right-0 mt-1 w-36 rounded-lg border border-neutral-200/60 dark:border-neutral-800/60 bg-white dark:bg-neutral-950 shadow-xl py-1 glass">
                      <button
                        type="button"
                        disabled={!!it.stats?.locked}
                        title={it.stats?.locked ? '已锁定原子不可编辑' : undefined}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(it)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none"
                      >
                        <Pencil className="w-3 h-3" /> 编辑
                      </button>
                      <button
                        type="button"
                        disabled={!!it.stats?.locked}
                        title={it.stats?.locked ? '已锁定原子不可删除' : undefined}
                        onClick={(e) => {
                          e.stopPropagation()
                          requestDelete(it)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none"
                      >
                        <Trash2 className="w-3 h-3" /> 删除
                      </button>
                    </div>
                  )}
                </div>
                {/* L0 + L1 header */}
                <button
                  onClick={() => toggleExpand(it.id)}
                  className="w-full text-left px-5 py-4 hover:bg-neutral-50/70 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold leading-snug">
                          {it.name}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-md border font-mono',
                            agentColor(it.sourceAgent || 'user')
                          )}
                        >
                          {it.sourceAgent || 'user'}
                        </span>
                        {locked && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> 已锁定
                          </span>
                        )}
                        {demoted && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-neutral-500/15 text-neutral-500 border border-neutral-500/30 flex items-center gap-1">
                            <Moon className="w-2.5 h-2.5" /> 降权
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-neutral-400 shrink-0 font-mono">
                      {relTime(it.createdAt)}
                    </span>
                  </div>

                  {/* L1 preview */}
                  {it.sourceContext && (
                    <div className="text-xs italic text-neutral-500 dark:text-neutral-400 line-clamp-2 mb-2">
                      {it.sourceContext}
                    </div>
                  )}

                  {it.tags && it.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {it.tags.slice(0, 5).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-500 font-mono"
                        >
                          #{t}
                        </span>
                      ))}
                      {it.tags.length > 5 && (
                        <span className="text-[10px] text-neutral-400">
                          +{it.tags.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </button>

                {/* L2 expanded */}
                {open && (
                  <div className="border-t border-neutral-200/60 dark:border-neutral-800/60 px-5 py-4 space-y-3 bg-neutral-50/40 dark:bg-white/[0.01]">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">
                        洞察
                      </div>
                      <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">
                        {it.insight}
                      </div>
                    </div>

                    {it.keySteps && it.keySteps.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">
                          关键步骤
                        </div>
                        <ol className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-200 list-decimal pl-5 space-y-1">
                          {it.keySteps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {it.codeArtifacts && it.codeArtifacts.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">
                          代码片段
                        </div>
                        <div className="space-y-2">
                          {it.codeArtifacts.map((c, i) => (
                            <div
                              key={i}
                              className="rounded-lg border border-neutral-200/60 dark:border-white/10 overflow-hidden"
                            >
                              <div className="text-[10px] font-mono px-2 py-1 bg-neutral-100 dark:bg-white/5 text-neutral-500 flex justify-between">
                                <span>{c.language}</span>
                                {c.filename && <span>{c.filename}</span>}
                              </div>
                              <pre className="text-[11px] font-mono p-2.5 overflow-x-auto whitespace-pre text-neutral-700 dark:text-neutral-300">
                                {c.code}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {((it.relatedFrameworks && it.relatedFrameworks.length > 0) ||
                      (it.relatedAtoms && it.relatedAtoms.length > 0)) && (
                      <div className="text-[11px] text-neutral-500 space-y-0.5">
                        {it.relatedFrameworks && it.relatedFrameworks.length > 0 && (
                          <div>
                            关联骨架：
                            {it.relatedFrameworks.map((f) => (
                              <span key={f} className="font-mono ml-1">
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                        {it.relatedAtoms && it.relatedAtoms.length > 0 && (
                          <div>
                            关联原子：
                            {it.relatedAtoms.map((a) => (
                              <span key={a} className="font-mono ml-1">
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-200/40 dark:border-white/5 flex-wrap">
                      <ActionBtn onClick={() => copyAsPrompt(it)} icon={<Copy className="w-3 h-3" />}>
                        复制为 prompt
                      </ActionBtn>
                      <ActionBtn
                        onClick={async () => {
                          const abs =
                            (it as unknown as { _absPath?: string; _file?: string })._absPath ||
                            (it as unknown as { _file?: string })._file ||
                            ''
                          if (!abs) {
                            showToast('无法定位文件路径')
                            return
                          }
                          const r = await openContainingFolder(abs)
                          showToast(r.message)
                        }}
                        icon={<FileText className="w-3 h-3" />}
                      >
                        打开文件夹
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => toggleFlag(it, 'locked')}
                        icon={<Lock className="w-3 h-3" />}
                        active={locked}
                      >
                        {locked ? '取消锁定' : '锁定'}
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => toggleFlag(it, 'userDemoted')}
                        icon={<Moon className="w-3 h-3" />}
                        active={demoted}
                      >
                        {demoted ? '取消降权' : '降权'}
                      </ActionBtn>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function FilterChip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-colors',
        active
          ? 'bg-violet-500 text-white border-violet-500 shadow-sm shadow-violet-500/30'
          : 'bg-white/40 dark:bg-white/[0.03] border-neutral-200/60 dark:border-white/10 text-neutral-600 dark:text-neutral-400 hover:border-violet-400/50',
        className
      )}
    >
      {children}
    </button>
  )
}

function ActionBtn({
  onClick,
  icon,
  children,
  active,
}: {
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-7 px-2.5 rounded-lg text-[11px] font-medium border flex items-center gap-1 transition-colors',
        active
          ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300'
          : 'bg-white/40 dark:bg-white/[0.03] border-neutral-200/60 dark:border-white/10 text-neutral-600 dark:text-neutral-400 hover:border-violet-400/50'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export default ExperiencesPage
