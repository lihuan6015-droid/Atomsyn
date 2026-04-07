import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  Lightbulb,
  Target,
  GitFork,
  ListOrdered,
  BookOpen,
  Bookmark,
  BarChart3,
  MoreHorizontal,
  Plus,
  Link as LinkIcon,
  FileText,
  Trash2,
  Pencil,
  ArrowRight,
} from 'lucide-react'
import { atomsApi, frameworksApi, projectsApi, trackUsage } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { Atom, Framework, Project } from '@/types'
import { CollapseSection } from '@/components/shared/CollapseSection'
import { SkillPromptBox } from '@/components/atom/SkillPromptBox'
import { SpotlightPalette } from '@/components/atlas/SpotlightPalette'
import { NewAtomDialog } from './NewAtomDialog'

export default function AtomDetailPage() {
  const { atomId } = useParams<{ atomId: string }>()
  const [atom, setAtom] = useState<Atom | null>(null)
  const [framework, setFramework] = useState<Framework | null>(null)
  const [siblings, setSiblings] = useState<Atom[]>([])
  const [parent, setParent] = useState<Atom | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [addingBookmark, setAddingBookmark] = useState(false)
  const [bmTitle, setBmTitle] = useState('')
  const [bmContent, setBmContent] = useState('')
  const [bmType, setBmType] = useState<'link' | 'text'>('link')
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    if (!atomId) return
    let cancelled = false
    atomsApi.get(atomId).then(async (a) => {
      if (cancelled) return
      setAtom(a)
      trackUsage({ type: 'atom-open', atomId: a.id })
      try {
        const fw = await frameworksApi.get(a.frameworkId)
        if (!cancelled) setFramework(fw)
      } catch {}
      try {
        const all = await atomsApi.list()
        if (cancelled) return
        setSiblings(
          all.filter(
            (x) => x.frameworkId === a.frameworkId && x.cellId === a.cellId && x.id !== a.id
          )
        )
        if (a.parentAtomId) {
          const p = all.find((x) => x.id === a.parentAtomId)
          setParent(p ?? null)
        } else {
          setParent(null)
        }
      } catch {}
    })
    projectsApi.list().then(setProjects).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [atomId])

  if (!atom) {
    return <div className="p-10 text-sm text-neutral-500">加载原子中...</div>
  }

  const cell = framework?.matrix.cells.find((c) => c.stepNumber === atom.cellId)

  const handleDelete = async () => {
    if (!confirm(`确认删除「${atom.name}」？此操作不可恢复。`)) return
    try {
      await atomsApi.remove(atom.id)
      showToast('✓ 已删除')
      window.history.back()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除失败')
    }
  }

  const handleAddBookmark = async () => {
    if (!bmTitle.trim()) {
      showToast('请输入标题')
      return
    }
    const newBm = {
      id: 'bm_' + Date.now().toString(36),
      type: bmType,
      title: bmTitle.trim(),
      [bmType === 'link' ? 'url' : 'content']: bmContent.trim(),
      addedAt: new Date().toISOString(),
    }
    const updated: Atom = {
      ...atom,
      bookmarks: [...atom.bookmarks, newBm as Atom['bookmarks'][number]],
      updatedAt: new Date().toISOString(),
    }
    try {
      await atomsApi.update(atom.id, updated)
      setAtom(updated)
      showToast('✓ 已添加收藏')
      setAddingBookmark(false)
      setBmTitle('')
      setBmContent('')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败')
    }
  }

  const usedProjects = projects.filter((p) => atom.stats.usedInProjects.includes(p.id))

  return (
    <div className="hero-gradient min-h-[calc(100vh-56px)]">
      {/* Top breadcrumb bar */}
      <div className="sticky top-0 z-30 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white/70 dark:bg-[#0a0a0b]/70 glass">
        <div className="flex items-center justify-between px-5 h-14">
          <div className="flex items-center gap-3">
            <Link
              to="/atlas"
              className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回知识图书馆</span>
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">·</span>
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <span>{framework?.name ?? '...'}</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-violet-500 dark:text-violet-400 font-medium">
                {String(atom.cellId).padStart(2, '0')} · {cell?.name ?? ''}
              </span>
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center justify-center transition-colors"
              title="更多"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 mt-1 w-36 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl py-1 text-sm"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    showToast('编辑功能即将上线')
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left"
                >
                  <Pencil className="w-3.5 h-3.5" /> 编辑
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    handleDelete()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 lg:px-10 py-10">
        {/* Card Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-mono font-semibold tracking-wider border border-violet-500/20">
              STEP {String(atom.cellId).padStart(2, '0')}
            </div>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {cell?.name} · {cell?.nameEn}
            </span>
            {atom.parentAtomId && (
              <>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                  <GitFork className="w-3 h-3" />
                  子原子
                </span>
              </>
            )}
          </div>
          <h1 className="text-4xl font-bold tracking-tight leading-tight">{atom.name}</h1>
          {atom.nameEn && (
            <p className="text-lg text-neutral-500 dark:text-neutral-400 mt-1 font-mono">
              {atom.nameEn}
            </p>
          )}

          <div className="flex items-center flex-wrap gap-1.5 mt-4">
            {atom.tags.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-900 text-[10px] text-neutral-600 dark:text-neutral-400"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Three-piece default visible */}
        <section className="mb-7 animate-fade-in">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Lightbulb className="w-3.5 h-3.5 text-violet-500" />
            </div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              核心理念
            </h2>
          </div>
          <p className="text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200 pl-8">
            {atom.coreIdea}
          </p>
        </section>

        <section className="mb-7 animate-fade-in">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-6 h-6 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <Target className="w-3.5 h-3.5 text-sky-500" />
            </div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              什么时候用
            </h2>
          </div>
          <div className="pl-8 flex flex-wrap gap-1.5">
            {atom.whenToUse.split(/[·,，]/).map((s, i) => {
              const t = s.trim()
              if (!t) return null
              return (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-700 dark:text-neutral-300"
                >
                  {t}
                </span>
              )
            })}
          </div>
        </section>

        <SkillPromptBox atomId={atom.id} prompt={atom.aiSkillPrompt} />

        {/* Collapsible sections */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 px-1 mb-2">
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              更多细节
            </span>
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
          </div>

          {atom.keySteps && atom.keySteps.length > 0 && (
            <CollapseSection
              title="关键步骤"
              icon={<ListOrdered className="w-4 h-4" />}
              badge={`${atom.keySteps.length} 步`}
            >
              <div className="space-y-2.5">
                {atom.keySteps.map((s, i) => (
                  <div
                    key={i}
                    className="flex gap-3 text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    <span className="shrink-0 w-5 h-5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[11px] font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </CollapseSection>
          )}

          {atom.example && (
            <CollapseSection
              title="经典案例"
              icon={<BookOpen className="w-4 h-4" />}
              badge={atom.example.title}
            >
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">
                  {atom.example.title}
                </div>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                  {atom.example.content}
                </p>
              </div>
            </CollapseSection>
          )}

          <CollapseSection title="相关原子" icon={<GitFork className="w-4 h-4" />}>
            {parent && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-semibold mb-2">
                  父级
                </div>
                <Link
                  to={`/atoms/${parent.id}`}
                  className="block rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 hover:border-violet-400 transition-colors mb-3"
                >
                  <div className="text-sm font-medium">{parent.name}</div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                    {parent.nameEn || parent.coreIdea.slice(0, 40)}
                  </div>
                </Link>
              </>
            )}
            {siblings.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-semibold mb-2">
                  兄弟
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {siblings.map((s) => (
                    <Link
                      to={`/atoms/${s.id}`}
                      key={s.id}
                      className="block rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 hover:border-violet-400 transition-colors"
                    >
                      <div className="text-sm font-medium truncate">{s.name}</div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {s.nameEn || s.tags.join(' · ')}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
            {!parent && siblings.length === 0 && (
              <div className="text-[11px] text-neutral-400">暂无相关原子</div>
            )}
          </CollapseSection>

          <CollapseSection
            title="个人收藏夹"
            icon={<Bookmark className="w-4 h-4" />}
            badge={
              <span className="px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-mono font-semibold">
                {atom.bookmarks.length}
              </span>
            }
          >
            <div className="space-y-2">
              {atom.bookmarks.map((b) => (
                <a
                  key={b.id}
                  href={b.url || '#'}
                  target={b.url ? '_blank' : undefined}
                  rel="noreferrer"
                  className="block rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2.5 hover:border-violet-400 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {b.type === 'link' ? (
                      <LinkIcon className="w-3 h-3 text-sky-500" />
                    ) : (
                      <FileText className="w-3 h-3 text-emerald-500" />
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
                      {b.type === 'link' ? '链接' : '笔记'}
                    </span>
                  </div>
                  <div className="text-sm font-medium">{b.title}</div>
                  {(b.url || b.content || b.note) && (
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                      {b.url || b.content || b.note}
                    </div>
                  )}
                </a>
              ))}

              {addingBookmark ? (
                <div className="rounded-lg border border-violet-300 dark:border-violet-700 bg-white dark:bg-neutral-900 p-3 space-y-2">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setBmType('link')}
                      className={
                        'px-2 py-0.5 rounded text-[10px] font-medium ' +
                        (bmType === 'link'
                          ? 'bg-violet-500 text-white'
                          : 'bg-neutral-100 dark:bg-neutral-800')
                      }
                    >
                      链接
                    </button>
                    <button
                      onClick={() => setBmType('text')}
                      className={
                        'px-2 py-0.5 rounded text-[10px] font-medium ' +
                        (bmType === 'text'
                          ? 'bg-violet-500 text-white'
                          : 'bg-neutral-100 dark:bg-neutral-800')
                      }
                    >
                      笔记
                    </button>
                  </div>
                  <input
                    placeholder="标题"
                    value={bmTitle}
                    onChange={(e) => setBmTitle(e.target.value)}
                    className="w-full rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-sm"
                  />
                  <textarea
                    rows={2}
                    placeholder={bmType === 'link' ? 'URL' : '内容'}
                    value={bmContent}
                    onChange={(e) => setBmContent(e.target.value)}
                    className="w-full rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-sm resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setAddingBookmark(false)}
                      className="px-2 h-7 rounded text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleAddBookmark}
                      className="px-2 h-7 rounded bg-violet-500 hover:bg-violet-600 text-white text-xs"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingBookmark(true)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-violet-400 hover:text-violet-500 transition-colors text-xs"
                >
                  <Plus className="w-3 h-3" />
                  添加链接或笔记
                </button>
              )}
            </div>
          </CollapseSection>

          <CollapseSection
            title="使用统计"
            icon={<BarChart3 className="w-4 h-4" />}
            badge={`用于 ${atom.stats.usedInProjects.length} 个项目`}
          >
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="累计调用" value={`${atom.stats.useCount}`} suffix="次" />
              <Stat
                label="最近使用"
                value={atom.stats.lastUsedAt ? formatDate(atom.stats.lastUsedAt) : '—'}
              />
              <Stat
                label="用于项目"
                value={`${atom.stats.usedInProjects.length}`}
                suffix="个"
              />
            </div>
            {usedProjects.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-semibold mb-2">
                  反向跳转到项目
                </div>
                <div className="space-y-1.5">
                  {usedProjects.map((p) => (
                    <Link
                      key={p.id}
                      to={`/playground/${p.id}`}
                      className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 hover:border-violet-400 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-sm font-medium">{p.name}</span>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          · {p.innovationStage} 阶段
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                    </Link>
                  ))}
                </div>
              </>
            )}
          </CollapseSection>
        </div>
      </main>

      <SpotlightPalette />
      <NewAtomDialog />
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 dark:bg-neutral-950/50 border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-1">
        {value}
        {suffix && <span className="text-xs font-normal text-neutral-400 ml-1">{suffix}</span>}
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days < 1) return '今天'
  if (days < 30) return `${days} 天前`
  return d.toISOString().slice(0, 10)
}
