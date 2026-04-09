import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { convertFileSrc } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from 'framer-motion'
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
  History,
  Lock,
  GitMerge,
  TrendingDown,
  Eye,
  PencilLine,
  Tag,
  Check,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download
} from 'lucide-react'
import { atomsApi, frameworksApi, projectsApi, trackUsage, usageApi } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import { useNotesStore } from '@/stores/useNotesStore'
import type { Atom, AtomAny, Framework, Project } from '@/types'
import { isMatrixFramework } from '@/types'

interface AgentUsageEvent {
  ts: string
  action?: 'write' | 'read'
  agentName?: string
  atomId?: string
  kind?: string
  query?: string
}
import { CollapseSection } from '@/components/shared/CollapseSection'
import { SkillPromptBox } from '@/components/atom/SkillPromptBox'
import { SpotlightPalette } from '@/components/atlas/SpotlightPalette'
import { NewAtomDialog } from './NewAtomDialog'
import { RelatedFragmentsPanel } from '@/components/atom/RelatedFragmentsPanel'
import { LinkedMethodologiesSection } from '@/components/atom/LinkedMethodologiesSection'

function getMediaUrl(url: string, absPath?: string) {
  if (!url || !absPath) return url
  // Handle absolute or external URLs natively
  if (url.startsWith('http')) return url

  let filename = url
  // Fallback for legacy atoms:// protocol
  if (url.startsWith('atoms://')) {
    filename = url.replace(/atoms:\/\/.*?\//, '') 
  }
  if (filename.startsWith('./')) {
    filename = filename.substring(2)
  }

  try {
    const splitIdx = absPath.lastIndexOf('/atoms/')
    if (splitIdx !== -1) {
      const dataDir = absPath.substring(0, splitIdx)
      const relFile = absPath.substring(splitIdx + 1)
      const relDir = relFile.substring(0, relFile.lastIndexOf('/'))
      const localAbsPath = `${dataDir}/${relDir}/${filename}`
      
      // In development (npm run tauri:dev), Tauri asset protocol permissions might be restricted.
      // We rely on the Vite dev server's /api/fs/ proxy.
      // In production built apps, we must use convertFileSrc.
      if ('__TAURI_INTERNALS__' in window && import.meta.env.PROD) {
        return convertFileSrc(localAbsPath)
      }
      return `/api/fs/${relDir}/${filename}`
    }
  } catch {}
  return url
}

export default function AtomDetailPage() {
  const { atomId } = useParams<{ atomId: string }>()
  const navigate = useNavigate()
  const [atom, setAtom] = useState<(Atom & Record<string, any>) | null>(null)

  // Safe accessors for fields that may not exist on non-methodology atoms
  const bookmarks = atom?.bookmarks ?? []
  const tags = atom?.tags ?? []
  const keySteps = atom?.keySteps ?? []
  const stats = atom?.stats ?? { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 } as any
  const [framework, setFramework] = useState<Framework | null>(null)
  const [siblings, setSiblings] = useState<Atom[]>([])
  const [parent, setParent] = useState<Atom | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [addingBookmark, setAddingBookmark] = useState(false)
  const [bmTitle, setBmTitle] = useState('')
  const [bmContent, setBmContent] = useState('')
  const [bmType, setBmType] = useState<'link' | 'text'>('link')
  const [agentEvents, setAgentEvents] = useState<AgentUsageEvent[]>([])
  const [mergePickerOpen, setMergePickerOpen] = useState(false)
  const [mergeCandidates, setMergeCandidates] = useState<Atom[]>([])

  // Image Preview State
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [previewRotation, setPreviewRotation] = useState(0)

  // ─── Inline editing state ──────────────────────────────────────────
  const [editingField, setEditingField] = useState<'title' | 'insight' | 'sourceContext' | 'classification' | null>(null)
  const [editDraft, setEditDraft] = useState<Record<string, string>>({})
  const editingClassification = editingField === 'classification'
  const classificationDraft = {
    role: editDraft.role ?? '',
    situation: editDraft.situation ?? '',
    activity: editDraft.activity ?? '',
    insight_type: editDraft.insight_type ?? '',
  }
  const setClassificationDraft = (fn: (d: typeof classificationDraft) => typeof classificationDraft) => {
    setEditDraft((prev) => {
      const next = fn({
        role: prev.role ?? '',
        situation: prev.situation ?? '',
        activity: prev.activity ?? '',
        insight_type: prev.insight_type ?? '',
      })
      return { ...prev, ...next }
    })
  }
  const showToast = useAppStore((s) => s.showToast)

  /** Save a single field or multiple fields to the atom */
  async function saveField(updates: Record<string, string>) {
    if (!atom) return
    // Also sync name/title for experience atoms
    if ('title' in updates && (atom as any).kind === 'experience') {
      updates.name = updates.title
    }
    const updated = { ...atom, ...updates, updatedAt: new Date().toISOString() }
    try {
      await atomsApi.update(atom.id, updated as any)
      setAtom(updated as any)
      setEditingField(null)
      setEditDraft({})
      showToast('✓ 已更新')
    } catch (e: any) {
      showToast(e?.message ?? '保存失败')
    }
  }

  useEffect(() => {
    if (!atomId) return
    let cancelled = false
    atomsApi.get(atomId).then(async (a) => {
      if (cancelled) return
      setAtom(a)
      trackUsage({ type: 'atom-open', atomId: a.id })
      atomsApi.trackView(a.id).catch(() => undefined) // V2.0 M2: bump humanViewCount
      if (a.frameworkId) {
        try {
          const fw = await frameworksApi.get(a.frameworkId)
          if (!cancelled) setFramework(fw)
        } catch {}
      }
      try {
        const all = await atomsApi.list()
        if (cancelled) return
        // Compute siblings based on atom kind
        if ((a as any).kind === 'methodology' && a.frameworkId) {
          // Methodology atoms: same framework + same cell
          setSiblings(
            all.filter(
              (x) => x.frameworkId === a.frameworkId && x.cellId === a.cellId && x.id !== a.id
            )
          )
        } else if ((a as any).kind === 'experience' && (a as any).role) {
          // Experience atoms: same role, exclude uncategorized (no role) and skill-inventory
          const myRole = (a as any).role
          setSiblings(
            all.filter(
              (x) =>
                x.id !== a.id &&
                (x as any).kind === 'experience' &&
                (x as any).role &&
                (x as any).role === myRole
            )
          )
        } else {
          // Uncategorized or skill-inventory: no siblings
          setSiblings([])
        }
        if (a.parentAtomId) {
          const p = all.find((x) => x.id === a.parentAtomId)
          setParent(p ?? null)
        } else {
          setParent(null)
        }
      } catch {}
    })
    projectsApi.list().then(setProjects).catch(() => undefined)
    usageApi
      .list()
      .then((events) => {
        if (cancelled) return
        const filtered = (events as unknown as AgentUsageEvent[]).filter(
          (e) => e && e.atomId === atomId && (e.action === 'write' || e.action === 'read')
        )
        setAgentEvents(filtered)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [atomId])

  // Keyboard navigation for preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewImage) {
        setPreviewImage(null)
        setPreviewScale(1)
        setPreviewRotation(0)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewImage])

  if (!atom) {
    return <div className="p-10 text-sm text-neutral-500">加载原子中...</div>
  }

  const cell = (framework && isMatrixFramework(framework)) ? framework.matrix.cells.find((c) => c.stepNumber === atom.cellId) : undefined

  const handleDelete = async () => {
    if (!confirm(`确认删除「${atom.name}」？此操作不可恢复。`)) return
    try {
      await atomsApi.remove(atom.id)
      showToast('✓ 已删除')
      window.dispatchEvent(new CustomEvent('atomsyn:atoms-changed'))
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
      bookmarks: [...(atom.bookmarks ?? []), newBm as Atom['bookmarks'][number]],
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

  const usedProjects = projects.filter((p) => (atom.stats?.usedInProjects ?? []).includes(p.id))

  const handleToggleDemote = async () => {
    const nextDemoted = !atom.stats?.userDemoted
    const updated: Atom = {
      ...atom,
      stats: { ...stats, userDemoted: nextDemoted },
      updatedAt: new Date().toISOString(),
    }
    try {
      await atomsApi.update(atom.id, updated)
      setAtom(updated)
      showToast(nextDemoted ? '✓ 已降权 · atlas-read 将降低权重' : '✓ 已恢复正常权重')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleToggleLock = async () => {
    const nextLocked = !atom.stats?.locked
    const updated: Atom = {
      ...atom,
      stats: { ...stats, locked: nextLocked },
      updatedAt: new Date().toISOString(),
    }
    try {
      await atomsApi.update(atom.id, updated)
      setAtom(updated)
      showToast(nextLocked ? '🔒 已锁定 · agent 写入已拦截' : '✓ 已解锁')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleMerge = async (otherId: string) => {
    setMergePickerOpen(false)
    try {
      await usageApi.log({
        type: 'atom-edit',
        atomId: atom.id,
        meta: { intent: 'merge', with: otherId },
      })
    } catch {}
    showToast('合并功能即将上线 (V1.6) · 意图已记录')
  }

  const agentGroups = (() => {
    const map = new Map<string, { count: number; lastTs: string }>()
    for (const e of agentEvents) {
      const key = e.agentName || 'unknown'
      const cur = map.get(key)
      if (!cur) map.set(key, { count: 1, lastTs: e.ts })
      else {
        cur.count += 1
        if (e.ts > cur.lastTs) cur.lastTs = e.ts
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count)
  })()

  const sortedAgentEvents = [...agentEvents].sort((a, b) => (a.ts < b.ts ? 1 : -1))
  // mergeCandidates is already provided by siblings state

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
              <span>返回</span>
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">·</span>
            {atom.kind === 'methodology' && atom.frameworkId ? (
              <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <span>{framework?.name ?? '...'}</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-violet-500 dark:text-violet-400 font-medium">
                  {String(atom.cellId).padStart(2, '0')} · {cell?.name ?? ''}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <span>{(atom as any).role || ((atom as any).kind === 'skill-inventory' ? 'Skill' : '经验')}</span>
                {((atom as any).activity || (atom as any).insight_type) && (
                  <>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-violet-500 dark:text-violet-400 font-medium">
                      {(atom as any).activity || (atom as any).insight_type}
                    </span>
                  </>
                )}
              </div>
            )}
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
          {atom.kind === 'methodology' && atom.cellId && (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[0.625rem] font-mono font-semibold tracking-wider border border-violet-500/20">
              STEP {String(atom.cellId).padStart(2, '0')}
            </div>
            <span className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400">
              {cell?.name} · {cell?.nameEn}
            </span>
            {atom.parentAtomId && (
              <>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <span className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                  <GitFork className="w-3 h-3" />
                  子原子
                </span>
              </>
            )}
          </div>
          )}
          {editingField === 'title' ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={editDraft.title ?? ''}
                onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveField({ title: editDraft.title ?? '' })
                  if (e.key === 'Escape') { setEditingField(null); setEditDraft({}) }
                }}
                className="text-3xl font-bold tracking-tight flex-1 bg-transparent border-b-2 border-violet-400 dark:border-violet-500 focus:outline-none dark:text-white"
              />
              <button onClick={() => saveField({ title: editDraft.title ?? '' })} className="p-1.5 rounded-lg bg-violet-500 text-white hover:bg-violet-600"><Check className="w-4 h-4" /></button>
              <button onClick={() => { setEditingField(null); setEditDraft({}) }} className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"><X className="w-4 h-4" /></button>
            </div>
          ) : (
          <h1 className="text-4xl font-bold tracking-tight leading-tight flex items-center gap-3 flex-wrap group/title">
            <span>{atom.name || (atom as any).title || atom.id}</span>
            {atom.stats?.locked && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[0.6875rem] font-medium border border-amber-500/30"
                title="已锁定 · agent 写入操作被拦截"
              >
                <Lock className="w-3 h-3" />
                已锁定
              </span>
            )}
            {(atom as any).kind === 'experience' && (
              <button
                onClick={() => {
                  setEditDraft({ title: atom.name || (atom as any).title || '' })
                  setEditingField('title')
                }}
                className="opacity-0 group-hover/title:opacity-100 transition-opacity p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="编辑标题"
              >
                <Pencil className="w-3.5 h-3.5 text-neutral-400" />
              </button>
            )}
          </h1>
          )}
          {atom.nameEn && (
            <p className="text-lg text-neutral-500 dark:text-neutral-400 mt-1 font-mono">
              {atom.nameEn}
            </p>
          )}

          <div className="flex items-center flex-wrap gap-1.5 mt-4">
            {tags.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-900 text-[0.625rem] text-neutral-600 dark:text-neutral-400"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Methodology-specific sections */}
        {atom.kind === 'methodology' && atom.coreIdea && (
        <section className="mb-7 animate-fade-in">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Lightbulb className="w-3.5 h-3.5 text-violet-500" />
            </div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              核心理念
            </h2>
          </div>
          <p className="text-[0.9375rem] leading-relaxed text-neutral-800 dark:text-neutral-200 pl-8">
            {atom.coreIdea}
          </p>
        </section>
        )}

        {atom.kind === 'methodology' && atom.whenToUse && (
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
        )}

        {atom.kind === 'methodology' && atom.aiSkillPrompt && (
        <SkillPromptBox atomId={atom.id} prompt={atom.aiSkillPrompt} />
        )}

        {/* Experience-specific: show insight/summary + sourceContext */}
        {(atom as any).kind === 'experience' && ((atom as any).insight || (atom as any).summary) && (
        <section className="mb-7 animate-fade-in">
          <div className="flex items-center gap-2 mb-2.5 group/insight-header">
            <div className="w-6 h-6 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <Lightbulb className="w-3.5 h-3.5 text-sky-500" />
            </div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex-1">
              经验洞察
            </h2>
            {editingField !== 'insight' && (
              <button
                onClick={() => {
                  setEditDraft({ insight: (atom as any).insight || (atom as any).summary || '' })
                  setEditingField('insight')
                }}
                className="opacity-0 group-hover/insight-header:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.625rem] text-neutral-500 hover:text-violet-500 hover:bg-violet-500/10"
                title="编辑经验洞察"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
          {editingField === 'insight' ? (
            <div className="pl-8 space-y-2">
              <textarea
                autoFocus
                value={editDraft.insight ?? ''}
                onChange={(e) => setEditDraft((d) => ({ ...d, insight: e.target.value }))}
                rows={Math.max(6, (editDraft.insight ?? '').split('\n').length + 2)}
                className="w-full text-[0.875rem] leading-relaxed bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-violet-400/40 resize-y font-mono dark:text-neutral-200"
                placeholder="Markdown 格式..."
              />
              <div className="flex gap-2">
                <button onClick={() => saveField({ insight: editDraft.insight ?? '' })} className="flex items-center gap-1 px-3 h-7 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium transition-colors"><Check className="w-3 h-3" />保存</button>
                <button onClick={() => { setEditingField(null); setEditDraft({}) }} className="flex items-center gap-1 px-3 h-7 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs text-neutral-500"><X className="w-3 h-3" />取消</button>
              </div>
            </div>
          ) : (
          <div className="text-[0.9375rem] leading-relaxed text-neutral-800 dark:text-neutral-200 pl-8 prose prose-sm dark:prose-invert max-w-none prose-img:m-0 prose-p:my-2">
            <ReactMarkdown
              components={{
                img: (props) => {
                  const { node, onDrag, onDragStart, onDragEnd, onAnimationStart, draggable, ...rest } = props as any;
                  const resolvedUrl = getMediaUrl(rest.src || '', (atom as any)._absPath)
                  return (
                    <motion.img
                      layoutId={resolvedUrl}
                      src={resolvedUrl}
                      alt={rest.alt}
                      title={rest.title}
                      className="image-safe-fit rounded-lg border border-neutral-200 dark:border-neutral-800 my-4 shadow-sm cursor-zoom-in hover:opacity-95 transition-opacity"
                      style={{ maxHeight: '480px' }}
                      onClick={() => {
                        setPreviewScale(1)
                        setPreviewRotation(0)
                        setPreviewImage(resolvedUrl)
                      }}
                    />
                  )
                }
              }}
            >
              {(atom as any).insight || (atom as any).summary}
            </ReactMarkdown>
          </div>
          )}
          {/* Source context — hover to edit */}
          {((atom as any).sourceContext || editingField === 'sourceContext') && (
            editingField === 'sourceContext' ? (
              <div className="pl-8 mt-2 flex items-center gap-2">
                <span className="text-xs text-neutral-500 shrink-0">来源:</span>
                <input
                  autoFocus
                  value={editDraft.sourceContext ?? ''}
                  onChange={(e) => setEditDraft((d) => ({ ...d, sourceContext: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveField({ sourceContext: editDraft.sourceContext ?? '' })
                    if (e.key === 'Escape') { setEditingField(null); setEditDraft({}) }
                  }}
                  className="flex-1 text-xs bg-transparent border-b border-violet-400 dark:border-violet-500 focus:outline-none dark:text-neutral-300"
                />
                <button onClick={() => saveField({ sourceContext: editDraft.sourceContext ?? '' })} className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"><Check className="w-3 h-3 text-violet-500" /></button>
                <button onClick={() => { setEditingField(null); setEditDraft({}) }} className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"><X className="w-3 h-3 text-neutral-400" /></button>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 pl-8 mt-2 group/ctx inline-flex items-center gap-1.5">
                来源: {(atom as any).sourceContext}
                <button
                  onClick={() => {
                    setEditDraft({ sourceContext: (atom as any).sourceContext || '' })
                    setEditingField('sourceContext')
                  }}
                  className="opacity-0 group-hover/ctx:opacity-100 transition-opacity p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  title="编辑来源"
                >
                  <Pencil className="w-2.5 h-2.5 text-neutral-400" />
                </button>
              </p>
            )
          )}
          {(atom as any).context?.source === 'note' && (atom as any).context?.noteId && (
            <button
              onClick={() => {
                useNotesStore.getState().setActiveNote((atom as any).context.noteId)
                navigate('/notes')
              }}
              className="text-xs text-amber-600 dark:text-amber-400 hover:underline pl-8 mt-1 inline-flex items-center gap-1"
            >
              📝 查看原始笔记
            </button>
          )}
          {Array.isArray((atom as any).screenshots) && (atom as any).screenshots.length > 0 && (
            <div className="pl-8 mt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Filter out images already rendered in the markdown insight as ![]() syntax */}
                {(atom as any).screenshots
                  .filter((sUrl: string) => {
                    if (!(atom as any).insight) return true;
                    // Escape special regex chars in filename
                    const escapedFile = sUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const mdImageRegex = new RegExp(`!\\[.*?\\]\\(.*?${escapedFile}\\)`, 'i');
                    return !(atom as any).insight.match(mdImageRegex);
                  })
                  .map((sUrl: string, idx: number) => {
                  const resolvedUrl = getMediaUrl(sUrl, (atom as any)._absPath)
                  return (
                    <motion.div 
                      key={idx} 
                      layoutId={resolvedUrl}
                      className="group relative aspect-video sm:aspect-auto rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-50 dark:bg-neutral-900/50 flex items-center justify-center p-2 hover:border-violet-400/50 transition-colors"
                    >
                      <img 
                        src={resolvedUrl} 
                        alt={`截图 ${idx + 1}`} 
                        className="image-safe-fit cursor-zoom-in group-hover:scale-[1.02] transition-transform duration-300 rounded-md" 
                        style={{ maxHeight: '320px' }} 
                        onClick={() => {
                          setPreviewScale(1)
                          setPreviewRotation(0)
                          setPreviewImage(resolvedUrl)
                        }}
                      />
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
        )}

        {/* Experience-specific: classification editor */}
        {(atom as any).kind === 'experience' && (
        <section className="mb-7 animate-fade-in">
          <div className="flex items-center gap-2 mb-2.5 group/classify">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Tag className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex-1">
              分类维度
            </h2>
            {!editingClassification && (
              <button
                onClick={() => {
                  setEditDraft({
                    role: (atom as any).role || '',
                    situation: (atom as any).situation || '',
                    activity: (atom as any).activity || '',
                    insight_type: (atom as any).insight_type || '',
                  })
                  setEditingField('classification')
                }}
                className="opacity-0 group-hover/classify:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.625rem] text-neutral-500 hover:text-violet-500 hover:bg-violet-500/10"
                title="编辑分类维度"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
          {editingClassification ? (
            <div className="pl-8 space-y-2.5">
              <ClassificationInput
                label="角色"
                value={classificationDraft.role}
                onChange={(v) => setClassificationDraft((d) => ({ ...d, role: v }))}
                suggestions={['产品', '工程', '设计', '学习', '研究', '咨询', '决策', '创作', '协作', '教学', '辅导', '自我管理', '运营', '销售', '项目管理']}
                colorClass="bg-violet-500/10 text-violet-600 border-violet-500/20"
              />
              <ClassificationInput
                label="情境"
                value={classificationDraft.situation}
                onChange={(v) => setClassificationDraft((d) => ({ ...d, situation: v }))}
                suggestions={['会议', '访谈', '独立思考', '阅读', '对话AI', '复盘', '踩坑当下', '灵感闪现', '冲突', '决策关口', '紧急修复', '新功能开发', '架构重构', '代码审查', '方案评审']}
                colorClass="bg-sky-500/10 text-sky-600 border-sky-500/20"
              />
              <ClassificationInput
                label="活动"
                value={classificationDraft.activity}
                onChange={(v) => setClassificationDraft((d) => ({ ...d, activity: v }))}
                suggestions={['分析', '判断', '说服', '倾听', '试错', '验证', '综合', '表达', '拒绝', '妥协', '观察', '提问', '记录', '教授', '调试']}
                colorClass="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              />
              <ClassificationInput
                label="洞察"
                value={classificationDraft.insight_type}
                onChange={(v) => setClassificationDraft((d) => ({ ...d, insight_type: v }))}
                suggestions={['反直觉', '方法验证', '方法证伪', '情绪复盘', '关系观察', '时机判断', '原则提炼', '纯好奇']}
                colorClass="bg-amber-500/10 text-amber-600 border-amber-500/20"
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => saveField(classificationDraft)}
                  className="flex items-center gap-1 px-3 h-7 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium transition-colors"
                >
                  <Check className="w-3 h-3" />
                  保存
                </button>
                <button
                  onClick={() => { setEditingField(null); setEditDraft({}) }}
                  className="flex items-center gap-1 px-3 h-7 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs text-neutral-500"
                >
                  <X className="w-3 h-3" />
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="pl-8 flex flex-wrap gap-2">
              <ClassificationBadge label="角色" value={(atom as any).role} colorClass="bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" />
              <ClassificationBadge label="情境" value={(atom as any).situation} colorClass="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" />
              <ClassificationBadge label="活动" value={(atom as any).activity} colorClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" />
              <ClassificationBadge label="洞察" value={(atom as any).insight_type} colorClass="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" />
            </div>
          )}
        </section>
        )}

        <div className="space-y-1">
          <div className="flex items-center gap-2 px-1 mb-2">
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
            <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              更多细节
            </span>
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
          </div>

          {keySteps.length > 0 && (
            <CollapseSection
              title="关键步骤"
              icon={<ListOrdered className="w-4 h-4" />}
              badge={`${keySteps.length} 步`}
            >
              <div className="space-y-2.5">
                {keySteps.map((s, i) => (
                  <div
                    key={i}
                    className="flex gap-3 text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    <span className="shrink-0 w-5 h-5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[0.6875rem] font-semibold flex items-center justify-center">
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
                <div className="text-[0.625rem] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">
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
                <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-semibold mb-2">
                  父级
                </div>
                <Link
                  to={`/atoms/${parent.id}`}
                  className="block rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 hover:border-violet-400 transition-colors mb-3"
                >
                  <div className="text-sm font-medium">{parent.name}</div>
                  <div className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 truncate">
                    {parent.nameEn || (parent.coreIdea ? parent.coreIdea.slice(0, 40) : parent.tags?.join(' · ') || '')}
                  </div>
                </Link>
              </>
            )}
            {siblings.length > 0 && (
              <>
                <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-semibold mb-2">
                  兄弟
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {siblings.map((s) => (
                    <Link
                      to={`/atoms/${s.id}`}
                      key={s.id}
                      className="block rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 hover:border-violet-400 transition-colors"
                    >
                      <div className="text-sm font-medium truncate">{s.name || (s as any).title || s.id}</div>
                      <div className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 truncate">
                        {s.nameEn || (s.tags ?? []).join(' · ')}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
            {!parent && siblings.length === 0 && (
              <div className="text-[0.6875rem] text-neutral-400">暂无相关原子</div>
            )}
          </CollapseSection>

          {/* V2.0 M4: 关联碎片 (方法论页) / 关联方法论 (碎片页) */}
          {atom.kind === 'methodology' && (
            <RelatedFragmentsPanel methodologyAtomId={atom.id} />
          )}
          {(atom as any).kind === 'experience' && Array.isArray((atom as any).linked_methodologies) && (atom as any).linked_methodologies.length > 0 && (
            <LinkedMethodologiesSection atomIds={(atom as any).linked_methodologies} />
          )}

          <CollapseSection
            title="个人收藏夹"
            icon={<Bookmark className="w-4 h-4" />}
            badge={
              <span className="px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[0.625rem] font-mono font-semibold">
                {bookmarks.length}
              </span>
            }
          >
            <div className="space-y-2">
              {bookmarks.map((b) => (
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
                    <span className="text-[0.625rem] uppercase tracking-wider text-neutral-400 font-semibold">
                      {b.type === 'link' ? '链接' : '笔记'}
                    </span>
                  </div>
                  <div className="text-sm font-medium">{b.title}</div>
                  {(b.url || b.content || b.note) && (
                    <div className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
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
                        'px-2 py-0.5 rounded text-[0.625rem] font-medium ' +
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
                        'px-2 py-0.5 rounded text-[0.625rem] font-medium ' +
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
            badge={`共 ${(stats.aiInvokeCount ?? 0) + (stats.humanViewCount ?? 0)} 次访问`}
          >
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="AI 调用" value={`${stats.aiInvokeCount ?? 0}`} suffix="次" />
              <Stat label="人类查看" value={`${stats.humanViewCount ?? 0}`} suffix="次" />
              <Stat
                label="最近使用"
                value={stats.lastUsedAt ? formatDate(stats.lastUsedAt) : '—'}
              />
            </div>
            {usedProjects.length > 0 && (
              <>
                <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-semibold mb-2">
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
                        <span className="text-[0.625rem] text-neutral-400 font-mono">
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

          <CollapseSection
            title="🔗 调用历史"
            icon={<History className="w-4 h-4" />}
            badge={
              <span className="px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[0.625rem] font-mono font-semibold">
                {agentEvents.length}
              </span>
            }
          >
            {agentEvents.length === 0 ? (
              <div className="text-[0.6875rem] text-neutral-400 dark:text-neutral-500 py-3">
                尚无 agent 调用记录 · 通过 atlas-write / atlas-read 触发后会出现
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {agentGroups.map(([name, info]) => (
                    <div
                      key={name}
                      className={
                        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[0.6875rem] ' +
                        agentChipClass(name)
                      }
                    >
                      <span className="font-medium">{name}</span>
                      <span className="font-mono text-[0.625rem] opacity-70">× {info.count}</span>
                      <span className="text-[0.625rem] opacity-60">· {formatDate(info.lastTs)}</span>
                    </div>
                  ))}
                </div>
                <div
                  className="scrollbar-subtle rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/40 dark:bg-neutral-950/40 overflow-y-auto"
                  style={{ maxHeight: 240 }}
                >
                  {sortedAgentEvents.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 px-3 py-2 text-[0.6875rem] border-b border-neutral-100 dark:border-neutral-900 last:border-b-0"
                    >
                      {e.action === 'write' ? (
                        <PencilLine className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <Eye className="w-3 h-3 text-sky-500 shrink-0 mt-0.5" />
                      )}
                      <span className="text-neutral-400 font-mono shrink-0">
                        {formatTimeShort(e.ts)}
                      </span>
                      <span className="text-neutral-500 dark:text-neutral-400 shrink-0">
                        {e.agentName || 'unknown'}
                      </span>
                      {e.action === 'read' && e.query && (
                        <span className="text-neutral-600 dark:text-neutral-300 truncate">
                          · {e.query}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="mt-4 pt-3 border-t border-neutral-200/70 dark:border-neutral-800/70">
              <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-semibold mb-2">
                校准
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <button
                    onClick={() => setMergePickerOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-violet-400 hover:text-violet-500 text-xs transition-colors"
                  >
                    <GitMerge className="w-3 h-3" />
                    合并
                  </button>
                  {mergePickerOpen && (
                    <div
                      className="absolute left-0 top-8 z-20 w-64 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl py-1 max-h-56 overflow-y-auto scrollbar-subtle"
                      onMouseLeave={() => setMergePickerOpen(false)}
                    >
                      {mergeCandidates.length === 0 ? (
                        <div className="px-3 py-2 text-[0.6875rem] text-neutral-400">
                          同骨架 / 同单元格内暂无其他原子
                        </div>
                      ) : (
                        mergeCandidates.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleMerge(s.id)}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          >
                            <div className="font-medium truncate">{s.name}</div>
                            {s.nameEn && (
                              <div className="text-[0.625rem] text-neutral-400 truncate font-mono">
                                {s.nameEn}
                              </div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleToggleDemote}
                  className={
                    'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg border text-xs transition-colors ' +
                    (atom.stats?.userDemoted
                      ? 'border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-rose-400/60 hover:text-rose-500')
                  }
                >
                  <TrendingDown className="w-3 h-3" />
                  {atom.stats?.locked ? '✓ 已锁定 · 点击解锁' : '锁定'}
                </button>
              </div>
              <div className="text-[0.625rem] text-neutral-400 dark:text-neutral-500 mt-2 leading-relaxed">
                降权会降低该原子在 atlas-read 结果中的权重 · 锁定会拦截 agent 的写入操作
              </div>
            </div>
          </CollapseSection>
        </div>
      </main>

      <SpotlightPalette />
      <NewAtomDialog />

      <AnimatePresence>
        {previewImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 lg:p-12">
            {/* Backdrop: clicking anywhere else closes the modal */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-zoom-out" 
              onClick={() => {
                setPreviewImage(null)
                setPreviewScale(1)
                setPreviewRotation(0)
              }} 
            />

            {/* The actual Preview Window */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-[85vw] h-[80vh] max-w-5xl max-h-[800px] flex flex-col bg-neutral-900 border border-white/10 rounded-2xl shadow-[0_32px_128px_-32px_rgba(0,0,0,0.8)] overflow-hidden z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Window Header */}
              <div className="flex items-center justify-between px-4 h-12 bg-neutral-800/50 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-1.5 mr-2">
                    <button 
                      onClick={() => setPreviewImage(null)}
                      className="w-3 h-3 rounded-full bg-rose-500 hover:bg-rose-600 transition-colors" 
                    />
                    <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                  </div>
                  <Eye className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-[0.6875rem] font-medium text-white/70 tracking-tight">资源预览</span>
                </div>

                <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/5">
                  <button
                    onClick={() => setPreviewScale((s) => Math.min(s + 0.25, 4))}
                    className="p-1.5 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPreviewScale((s) => Math.max(s - 0.25, 0.25))}
                    className="p-1.5 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPreviewRotation((r) => r + 90)}
                    className="p-1.5 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-3 bg-white/10 mx-0.5" />
                  <button
                    onClick={() => {
                      setPreviewScale(1)
                      setPreviewRotation(0)
                    }}
                    className="px-2 h-6 rounded-md hover:bg-white/10 text-[0.625rem] font-medium text-white/50 hover:text-white"
                  >
                    重置
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={previewImage}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-md hover:bg-white/10 text-white/50 hover:text-white"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => setPreviewImage(null)}
                    className="p-1.5 rounded-md hover:bg-rose-500/20 text-rose-300 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Window Content: Scalable/Draggable Area */}
              <div className="flex-1 relative overflow-hidden bg-[radial-gradient(circle_at_center,_#1a1a1b_0%,_#0a0a0b_100%)] cursor-grab active:cursor-grabbing">
                <motion.div
                  layoutId={previewImage}
                  drag
                  dragConstraints={{ left: -1500, right: 1500, top: -1500, bottom: 1500 }}
                  dragElastic={0.1}
                  className="absolute inset-0 flex items-center justify-center p-12"
                  style={{ 
                    scale: previewScale,
                    rotate: `${previewRotation}deg`
                  }}
                >
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)] rounded-sm pointer-events-none"
                    style={{ 
                      minWidth: '200px',
                      imageRendering: (previewScale > 2) ? 'pixelated' : 'auto'
                    }}
                    onWheel={(e) => {
                      if (e.deltaY < 0) setPreviewScale((s) => Math.min(s + 0.1, 4))
                      else setPreviewScale((s) => Math.max(s - 0.1, 0.25))
                    }}
                  />
                </motion.div>

            </div>
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 px-5 py-2 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md pointer-events-none z-20">
              <span className="text-[0.625rem] text-white/50 font-mono tracking-widest uppercase">
                Drag to Pan · Scroll to Zoom
              </span>
            </div>
            </motion.div>
            </div>
          )}
        </AnimatePresence>
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 dark:bg-neutral-950/50 border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
      <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 font-semibold">
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

function formatTimeShort(iso: string) {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function agentChipClass(name: string) {
  const palette = [
    'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

function ClassificationBadge({ label, value, colorClass }: { label: string; value?: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[0.6875rem] font-medium ${colorClass}`}>
      <span className="text-[0.625rem] opacity-60 uppercase">{label}</span>
      <span>{value || '未设置'}</span>
    </span>
  )
}

function ClassificationInput({
  label,
  value,
  onChange,
  suggestions,
  colorClass,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  colorClass: string
}) {
  return (
    <div>
      <div className="text-[0.625rem] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`px-2 py-0.5 rounded-md border text-[0.6875rem] font-medium transition-all ${
              value === s
                ? 'bg-violet-500 text-white border-violet-500'
                : `${colorClass} hover:scale-[1.03]`
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`输入${label}...`}
        className="w-full max-w-xs text-sm px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 focus:outline-none focus:border-violet-400"
      />
    </div>
  )
}
