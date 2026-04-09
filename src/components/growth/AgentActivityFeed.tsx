import { useEffect, useMemo, useState, useCallback } from 'react'
import { Pen, Eye, Bot, Clock, RefreshCw, X, ChevronRight } from 'lucide-react'
import { usageApi, atomsApi } from '@/lib/dataApi'
import type { Atom } from '@/types'
import { cn } from '@/lib/cn'

interface AgentEvent {
  ts: string
  action: 'write' | 'read'
  agentName: string
  atomId?: string
  kind?: string
  query?: string
  returned?: number
  dataSource?: string
  sourceContext?: string
  tags?: string[]
  [k: string]: unknown
}

type ActionFilter = 'all' | 'write' | 'read'
type TimeFilter = 'today' | '7d' | 'all'

const CHIP_COLORS = [
  'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
]

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return CHIP_COLORS[Math.abs(h) % CHIP_COLORS.length]
}

function relTime(ts: string): string {
  const now = Date.now()
  const t = new Date(ts).getTime()
  const diff = Math.max(0, now - t)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function withinWindow(ts: string, win: TimeFilter): boolean {
  if (win === 'all') return true
  const t = new Date(ts).getTime()
  const now = Date.now()
  if (win === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return t >= d.getTime()
  }
  // 7d
  return now - t <= 7 * 24 * 60 * 60 * 1000
}

interface Props {
  open: boolean
  onClose: () => void
}

export function AgentActivityFeed({ open, onClose }: Props) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [atomMap, setAtomMap] = useState<Map<string, Atom>>(new Map())
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const raw = (await usageApi.list()) as unknown as AgentEvent[]
      const filtered = raw.filter(
        (e) => e && (e.action === 'write' || e.action === 'read'),
      )
      // newest first
      filtered.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      setEvents(filtered.slice(0, 50))
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    fetchData()
    atomsApi
      .list()
      .then((list) => {
        const m = new Map<string, Atom>()
        for (const a of list) m.set(a.id, a)
        setAtomMap(m)
      })
      .catch(() => undefined)
  }, [open, fetchData])

  const agents = useMemo(() => {
    const s = new Set<string>()
    for (const e of events) s.add(e.agentName || 'unknown')
    return Array.from(s)
  }, [events])

  const visible = useMemo(() => {
    return events.filter((e) => {
      if (actionFilter !== 'all' && e.action !== actionFilter) return false
      if (agentFilter !== 'all' && (e.agentName || 'unknown') !== agentFilter) return false
      if (!withinWindow(e.ts, timeFilter)) return false
      return true
    })
  }, [events, actionFilter, agentFilter, timeFilter])

  const toggleExpand = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/20 dark:bg-black/40 z-40 transition-opacity',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        style={{ transitionDuration: '300ms', transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className={cn(
          'fixed right-0 top-0 bottom-0 w-[420px] max-w-[92vw] z-50 glass border-l border-neutral-200/70 dark:border-neutral-800/70 flex flex-col',
          'bg-white/70 dark:bg-[#0a0a0b]/70',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{
          transition: 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header - mirror TopNav 56px */}
        <div className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-neutral-200/70 dark:border-neutral-800/70">
          <Bot className="w-4 h-4 text-violet-500" />
          <div className="text-sm font-semibold flex-1">Agent 活动</div>
          <button
            onClick={fetchData}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500"
            title="刷新"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-neutral-200/70 dark:border-neutral-800/70 space-y-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterPill active={actionFilter === 'all'} onClick={() => setActionFilter('all')}>
              全部
            </FilterPill>
            <FilterPill active={actionFilter === 'write'} onClick={() => setActionFilter('write')}>
              <Pen className="w-3 h-3" /> write
            </FilterPill>
            <FilterPill active={actionFilter === 'read'} onClick={() => setActionFilter('read')}>
              <Eye className="w-3 h-3" /> read
            </FilterPill>
            <span className="w-px h-4 bg-neutral-200 dark:bg-neutral-800 mx-1" />
            <FilterPill active={timeFilter === 'today'} onClick={() => setTimeFilter('today')}>
              今日
            </FilterPill>
            <FilterPill active={timeFilter === '7d'} onClick={() => setTimeFilter('7d')}>
              7 天
            </FilterPill>
            <FilterPill active={timeFilter === 'all'} onClick={() => setTimeFilter('all')}>
              全部时间
            </FilterPill>
          </div>
          {agents.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[0.625rem] uppercase tracking-wider text-neutral-400 mr-1">agent</span>
              <FilterPill active={agentFilter === 'all'} onClick={() => setAgentFilter('all')}>
                全部
              </FilterPill>
              {agents.map((a) => (
                <FilterPill
                  key={a}
                  active={agentFilter === a}
                  onClick={() => setAgentFilter(a)}
                >
                  {a}
                </FilterPill>
              ))}
            </div>
          )}
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {visible.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
              <Bot className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mb-3" />
              <div className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                尚无 agent 活动
                <br />
                <span className="text-neutral-400 dark:text-neutral-500">
                  在 Claude Code 中调用 atlas-write / atlas-read 后会出现
                </span>
              </div>
            </div>
          ) : (
            visible.map((e, i) => {
              const isOpen = expanded.has(i)
              const atom = e.atomId ? atomMap.get(e.atomId) : undefined
              const label =
                atom?.name ??
                e.query ??
                (e.atomId ? e.atomId : e.action === 'read' ? '(无查询)' : '(未命名)')
              const agent = e.agentName || 'unknown'
              const chipClass = hashColor(agent)
              return (
                <div
                  key={i}
                  className="rounded-xl border border-neutral-200/70 dark:border-neutral-800/70 bg-white/50 dark:bg-neutral-900/40 hover:border-violet-400/40 dark:hover:border-violet-500/30 transition-colors"
                >
                  <button
                    onClick={() => toggleExpand(i)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                  >
                    <ChevronRight
                      className={cn(
                        'w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform',
                        isOpen && 'rotate-90',
                      )}
                    />
                    <span className="flex items-center gap-1 text-[0.625rem] text-neutral-400 font-mono shrink-0">
                      <Clock className="w-3 h-3" />
                      {relTime(e.ts)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded-md border text-[0.625rem] font-medium shrink-0',
                        chipClass,
                      )}
                    >
                      {agent}
                    </span>
                    {e.action === 'write' ? (
                      <Pen className="w-3 h-3 text-emerald-500 shrink-0" />
                    ) : (
                      <Eye className="w-3 h-3 text-sky-500 shrink-0" />
                    )}
                    <span className="text-xs text-neutral-700 dark:text-neutral-300 truncate flex-1">
                      {label}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pl-9 space-y-1.5 text-[0.6875rem] text-neutral-500 dark:text-neutral-400 border-t border-neutral-200/50 dark:border-neutral-800/50 pt-2">
                      {e.query && (
                        <div>
                          <span className="text-neutral-400">query:</span>{' '}
                          <span className="text-neutral-600 dark:text-neutral-300">{e.query}</span>
                        </div>
                      )}
                      {e.kind && (
                        <div>
                          <span className="text-neutral-400">kind:</span> {e.kind}
                        </div>
                      )}
                      {e.atomId && (
                        <div>
                          <span className="text-neutral-400">atomId:</span>{' '}
                          {atom ? (
                            <a
                              href={`#/atom/atoms/${e.atomId}`}
                              className="text-violet-600 dark:text-violet-400 hover:underline font-mono"
                            >
                              {e.atomId}
                            </a>
                          ) : (
                            <span className="font-mono">{e.atomId}</span>
                          )}
                        </div>
                      )}
                      {typeof e.returned === 'number' && (
                        <div>
                          <span className="text-neutral-400">returned:</span> {e.returned}
                        </div>
                      )}
                      {e.sourceContext && (
                        <div className="line-clamp-3">
                          <span className="text-neutral-400">context:</span> {e.sourceContext}
                        </div>
                      )}
                      <div className="text-[0.625rem] text-neutral-400 font-mono pt-1">
                        {new Date(e.ts).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </aside>
    </>
  )
}

function FilterPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[0.625rem] font-medium border transition-colors',
        active
          ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20'
          : 'text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900',
      )}
    >
      {children}
    </button>
  )
}
