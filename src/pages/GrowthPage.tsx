/**
 * Growth (成长档案) page — US-19 + US-20.
 * Stats · Heatmap · Top atoms · Recent activity · Psych history.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, BarChart3, Flame, Sprout, TrendingUp } from 'lucide-react'
import { atomsApi, projectsApi, psychApi, usageApi } from '@/lib/dataApi'
import type {
  Atom,
  Project,
  PsychologicalEntry,
  UsageEvent,
} from '@/types'
import PsychologicalCheckDialog from '@/components/growth/PsychologicalCheckDialog'

function ymKey(d: Date): string {
  return (
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  )
}

function dayKey(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

function isLast3DaysOfMonth(d: Date): boolean {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return d.getDate() >= last - 2
}

export function GrowthPage() {
  const navigate = useNavigate()
  const [atoms, setAtoms] = useState<Atom[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [usage, setUsage] = useState<UsageEvent[]>([])
  const [psych, setPsych] = useState<PsychologicalEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [month, setMonth] = useState<string>(ymKey(new Date()))
  const [psychOpen, setPsychOpen] = useState(false)

  useEffect(() => {
    Promise.all([
      atomsApi.list().catch(() => []),
      projectsApi.list().catch(() => []),
      usageApi.list().catch(() => []),
      psychApi.list().catch(() => []),
    ]).then(([a, p, u, ps]) => {
      setAtoms(a)
      setProjects(p)
      setUsage(u)
      setPsych(ps)
      setLoading(false)

      // Maybe show monthly check
      const now = new Date()
      const currentMonth = ymKey(now)
      const dismissedKey = 'ccl-psych-dismissed-' + currentMonth
      const alreadyHas = ps.some((e) => e.month === currentMonth)
      const dismissed = sessionStorage.getItem(dismissedKey) === '1'
      if (isLast3DaysOfMonth(now) && !alreadyHas && !dismissed) {
        setPsychOpen(true)
      }
    })
  }, [])

  // ---------- Stats ----------
  const stats = useMemo(() => {
    const days = new Set<string>()
    const weekAgo = Date.now() - 7 * 86400000
    usage.forEach((u) => {
      const t = new Date(u.ts).getTime()
      if (t >= weekAgo) days.add(dayKey(new Date(u.ts)))
    })
    return {
      atomCount: atoms.length,
      projectCount: projects.length,
      usageCount: usage.length,
      weekDays: days.size,
    }
  }, [atoms, projects, usage])

  // ---------- 30-day heatmap ----------
  const heatmap = useMemo(() => {
    const cells: { date: Date; key: string; count: number }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      cells.push({ date: d, key: dayKey(d), count: 0 })
    }
    const map = new Map(cells.map((c) => [c.key, c]))
    usage.forEach((u) => {
      const k = dayKey(new Date(u.ts))
      const c = map.get(k)
      if (c) c.count += 1
    })
    return cells
  }, [usage])

  const heatmapMax = useMemo(
    () => Math.max(1, ...heatmap.map((c) => c.count)),
    [heatmap]
  )

  // ---------- Top atoms ----------
  const topAtoms = useMemo(() => {
    return [...atoms]
      .sort((a, b) => (b.stats?.useCount ?? 0) - (a.stats?.useCount ?? 0))
      .slice(0, 5)
  }, [atoms])

  const topMax = topAtoms[0]?.stats?.useCount ?? 1

  // ---------- Recent activity ----------
  const recent = useMemo(() => {
    return [...usage]
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .slice(0, 10)
  }, [usage])

  function atomName(id?: string): string {
    if (!id) return ''
    return atoms.find((a) => a.id === id)?.name ?? id
  }
  function projectName(id?: string): string {
    if (!id) return ''
    return projects.find((p) => p.id === id)?.name ?? id
  }

  // ---------- Psych sparkline ----------
  const psychSorted = useMemo(
    () => [...psych].sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-12),
    [psych]
  )

  if (loading) {
    return (
      <div className="p-10 text-sm text-neutral-500">加载中…</div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sprout className="w-6 h-6 text-emerald-500" />
            成长档案
          </h1>
          <div className="text-xs text-neutral-500 mt-1">
            首页 / <span className="text-neutral-700 dark:text-neutral-200">成长</span>
          </div>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
      </header>

      {/* Stats grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="知识原子总数" value={stats.atomCount} icon={<Sprout className="w-4 h-4" />} tone="violet" />
        <StatCard label="项目总数" value={stats.projectCount} icon={<BarChart3 className="w-4 h-4" />} tone="sky" />
        <StatCard label="累计调用次数" value={stats.usageCount} icon={<Activity className="w-4 h-4" />} tone="emerald" />
        <StatCard label="周使用天数" value={stats.weekDays + ' / 7'} icon={<Flame className="w-4 h-4" />} tone="amber" />
      </section>

      {/* Heatmap + Top */}
      <section className="grid md:grid-cols-2 gap-4">
        <Card title="近 30 天活跃热力" icon={<Flame className="w-4 h-4 text-emerald-500" />}>
          <div className="grid grid-cols-[repeat(6,minmax(0,1fr))] gap-1.5">
            {heatmap.map((c) => {
              const intensity = c.count === 0 ? 0 : 0.15 + 0.65 * (c.count / heatmapMax)
              return (
                <div
                  key={c.key}
                  title={c.key + ' · ' + c.count + ' 次'}
                  className="aspect-square rounded-md border border-neutral-200/40 dark:border-white/5"
                  style={{
                    backgroundColor:
                      c.count === 0
                        ? 'rgba(127,127,127,0.08)'
                        : `rgba(16,185,129,${intensity})`,
                  }}
                />
              )
            })}
          </div>
          <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-2">
            少 <span className="inline-block w-3 h-3 rounded bg-emerald-500/15" />
            <span className="inline-block w-3 h-3 rounded bg-emerald-500/40" />
            <span className="inline-block w-3 h-3 rounded bg-emerald-500/70" />
            多
          </div>
        </Card>

        <Card title="Top 5 常用方法论" icon={<BarChart3 className="w-4 h-4 text-violet-500" />}>
          {topAtoms.length === 0 ? (
            <EmptyState text="还没有使用记录，先去打开几张卡片吧。" />
          ) : (
            <ul className="space-y-2">
              {topAtoms.map((a) => {
                const v = a.stats?.useCount ?? 0
                const pct = Math.max(4, (v / topMax) * 100)
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => navigate(`/atoms/${a.id}`)}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium group-hover:text-violet-600 dark:group-hover:text-violet-300 transition-colors line-clamp-1">
                          {a.name}
                        </span>
                        <span className="text-neutral-500">{v}</span>
                      </div>
                      <div className="h-2 rounded-full bg-neutral-100 dark:bg-white/5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-sky-500"
                          style={{ width: pct + '%' }}
                        />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </section>

      {/* Recent + psych */}
      <section className="grid md:grid-cols-2 gap-4">
        <Card title="最近活动" icon={<Activity className="w-4 h-4 text-sky-500" />}>
          {recent.length === 0 ? (
            <EmptyState text="暂无记录" />
          ) : (
            <ul className="space-y-2 text-xs">
              {recent.map((e, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.type}</div>
                    <div className="text-neutral-500 truncate">
                      {atomName(e.atomId) || projectName(e.projectId) || '—'}
                    </div>
                  </div>
                  <div className="text-neutral-400 shrink-0 ml-2">
                    {new Date(e.ts).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="心理自查趋势"
          icon={<TrendingUp className="w-4 h-4 text-pink-500" />}
        >
          {psychSorted.length === 0 ? (
            <EmptyState text="还没有自查记录，下个月末会自动弹出 3 题。" />
          ) : (
            <PsychSparkline entries={psychSorted} />
          )}
          <button
            onClick={() => setPsychOpen(true)}
            className="mt-3 text-[11px] text-pink-600 dark:text-pink-300 hover:underline"
          >
            手动开始本月自查 →
          </button>
        </Card>
      </section>

      <PsychologicalCheckDialog
        open={psychOpen}
        month={ymKey(new Date())}
        onClose={() => {
          sessionStorage.setItem('ccl-psych-dismissed-' + ymKey(new Date()), '1')
          setPsychOpen(false)
        }}
        onSaved={(e) => setPsych((prev) => [...prev, e])}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  tone: 'violet' | 'sky' | 'emerald' | 'amber'
}) {
  const toneMap: Record<string, string> = {
    violet: 'from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-300',
    sky: 'from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-300',
    emerald: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-300',
    amber: 'from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-300',
  }
  return (
    <div
      className={
        'rounded-2xl border border-neutral-200/70 dark:border-white/10 p-4 bg-gradient-to-br ' +
        toneMap[tone]
      }
    >
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider opacity-80">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-white">
        {value}
      </div>
    </div>
  )
}

function Card({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-4">
      <div className="flex items-center gap-1.5 mb-3 text-sm font-medium">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-xs text-neutral-500 italic py-6 text-center border border-dashed border-neutral-200/60 dark:border-white/10 rounded-xl">
      {text}
    </div>
  )
}

function PsychSparkline({ entries }: { entries: PsychologicalEntry[] }) {
  // map answers to numeric: down = -1, same = 0, up = +1; tool: morePanic=-1, same=0, moreCertain=+1
  function n(v: 'down' | 'same' | 'up'): number {
    return v === 'down' ? -1 : v === 'up' ? 1 : 0
  }
  function nT(v: 'morePanic' | 'same' | 'moreCertain'): number {
    return v === 'morePanic' ? -1 : v === 'moreCertain' ? 1 : 0
  }

  const W = 280
  const H = 80
  const step = entries.length > 1 ? W / (entries.length - 1) : 0

  function pathFor(values: number[]): string {
    return values
      .map((v, i) => {
        const x = i * step
        const y = H / 2 - (v * H) / 2.4
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1)
      })
      .join(' ')
  }

  const freq = entries.map((e) => -n(e.forgettingFrequency)) // lower is better → invert
  const conf = entries.map((e) => n(e.jobConfidence))
  const tool = entries.map((e) => nT(e.withoutToolFeeling))

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(127,127,127,0.2)" strokeDasharray="2 4" />
        <path d={pathFor(freq)} fill="none" stroke="#a78bfa" strokeWidth={2} />
        <path d={pathFor(conf)} fill="none" stroke="#34d399" strokeWidth={2} />
        <path d={pathFor(tool)} fill="none" stroke="#f472b6" strokeWidth={2} />
      </svg>
      <div className="flex items-center gap-3 text-[10px] text-neutral-500 mt-1">
        <Legend color="#a78bfa" label="频率↓越好" />
        <Legend color="#34d399" label="信心↑" />
        <Legend color="#f472b6" label="笃定↑" />
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

export default GrowthPage
