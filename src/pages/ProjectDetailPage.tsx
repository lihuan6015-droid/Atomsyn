import { ArrowLeft, MoreHorizontal, Pin, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { NewPracticeDialog } from '@/components/playground/NewPracticeDialog'
import { PinAtomDialog } from '@/components/playground/PinAtomDialog'
import { PracticeRow } from '@/components/playground/PracticeRow'
import { StageProgress, STAGE_BG_CLASS, STAGE_LABELS } from '@/components/playground/StageProgress'
import { cn } from '@/lib/cn'
import { atomsApi, practicesApi, projectsApi } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { Atom, Practice, Project } from '@/types'

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const showToast = useAppStore((s) => s.showToast)

  const [project, setProject] = useState<Project | null>(null)
  const [practices, setPractices] = useState<Practice[]>([])
  const [atoms, setAtoms] = useState<Atom[]>([])
  const [loading, setLoading] = useState(true)
  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const [practiceDialogOpen, setPracticeDialogOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([projectsApi.get(projectId), practicesApi.list(projectId), atomsApi.list()])
      .then(([p, ps, as]) => {
        setProject(p)
        setPractices([...ps].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)))
        setAtoms(as)
      })
      .catch((e) => showToast(`加载失败: ${e.message ?? e}`))
      .finally(() => setLoading(false))
  }, [projectId, showToast])

  const atomById = useMemo(() => {
    const m = new Map<string, Atom>()
    for (const a of atoms) m.set(a.id, a)
    return m
  }, [atoms])

  const pinnedAtomDetails = useMemo(() => {
    if (!project) return []
    return project.pinnedAtoms
      .map((p) => atomById.get(p.atomId))
      .filter((a): a is Atom => Boolean(a))
  }, [project, atomById])

  const practicesByAtom = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of practices) m.set(p.atomId, (m.get(p.atomId) ?? 0) + 1)
    return m
  }, [practices])

  const handleDelete = async () => {
    if (!project) return
    if (!confirm(`确定要删除项目 "${project.name}" 吗？`)) return
    try {
      await projectsApi.remove(project.id)
      showToast('项目已删除')
      navigate('/atom/playground')
    } catch (e: any) {
      showToast(`删除失败: ${e.message ?? e}`)
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-8 space-y-6">
        <div className="h-8 w-56 bg-neutral-200/40 dark:bg-neutral-800/40 rounded-lg animate-pulse" />
        <div className="h-20 bg-neutral-200/40 dark:bg-neutral-800/40 rounded-2xl animate-pulse" />
        <div className="h-40 bg-neutral-200/40 dark:bg-neutral-800/40 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="text-center">
          <h2 className="text-lg font-semibold">项目不存在</h2>
          <Link
            to="/atom/playground"
            className="text-sm text-stage-discover hover:underline mt-2 inline-block"
          >
            返回项目列表
          </Link>
        </div>
      </div>
    )
  }

  const stageClass = STAGE_BG_CLASS[project.innovationStage] ?? STAGE_BG_CLASS.discover

  return (
    <div className="hero-gradient min-h-full">
      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-8 space-y-8">
        {/* Header */}
        <div>
          <Link
            to="/atom/playground"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-stage-discover transition-colors mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回项目列表
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
                <span
                  className={cn(
                    'text-[0.625rem] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider',
                    stageClass
                  )}
                >
                  {STAGE_LABELS[project.innovationStage] ?? project.innovationStage}
                </span>
                {project.status && (
                  <span className="text-[0.625rem] font-mono px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800/80">
                    {project.status}
                  </span>
                )}
              </div>
              {project.description && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed max-w-2xl">
                  {project.description}
                </p>
              )}
              <div className="text-[0.6875rem] text-neutral-400 font-mono mt-2">{project.id}</div>
            </div>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="w-9 h-9 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-1 w-40 z-20 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800/80 shadow-2xl py-1 animate-slide-up">
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        handleDelete()
                      }}
                      className="w-full px-3 py-2 text-sm text-left text-rose-500 hover:bg-rose-500/10 inline-flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 删除项目
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stage progress */}
        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/40 dark:bg-neutral-900/40 glass p-5">
          <div className="text-[0.625rem] font-mono uppercase tracking-wider text-neutral-400 mb-3">
            创新阶段
          </div>
          <StageProgress current={project.innovationStage} history={project.stageHistory} />
        </div>

        {/* Pinned atoms */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold inline-flex items-center gap-2">
              <Pin className="w-4 h-4 text-stage-discover" /> 引入的方法论
              <span className="text-xs text-neutral-400 font-mono">
                {project.pinnedAtoms.length}
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinnedAtomDetails.map((atom) => {
              const count = practicesByAtom.get(atom.id) ?? 0
              return (
                <Link
                  key={atom.id}
                  to={`/atom/atoms/${atom.id}`}
                  className="group p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/40 hover:border-stage-discover/40 cell-glow"
                >
                  <div className="text-sm font-medium truncate group-hover:text-stage-discover transition-colors">
                    {atom.name}
                  </div>
                  <div className="text-[0.6875rem] text-neutral-400 font-mono truncate mt-0.5">
                    {atom.frameworkId}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1 text-[0.625rem] font-medium px-2 py-0.5 rounded-full bg-stage-discover/10 text-stage-discover">
                    {count} 实践
                  </div>
                </Link>
              )
            })}
            <button
              onClick={() => setPinDialogOpen(true)}
              className="group min-h-[112px] flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-stage-discover/60 hover:bg-stage-discover/5 transition-all"
            >
              <Plus className="w-5 h-5 text-neutral-400 group-hover:text-stage-discover" />
              <span className="text-xs text-neutral-500 group-hover:text-stage-discover">
                引入方法论
              </span>
            </button>
          </div>
        </section>

        {/* Practices */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-stage-ideate" /> 实战记录
              <span className="text-xs text-neutral-400 font-mono">{practices.length}</span>
            </h2>
            <button
              onClick={() => setPracticeDialogOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-stage-discover text-white hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              新建实战记录
            </button>
          </div>
          {practices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 py-12 text-center text-sm text-neutral-500">
              还没有实战记录。把方法论用起来后，记录关键的洞察吧。
            </div>
          ) : (
            <div className="space-y-2">
              {practices.map((p) => (
                <PracticeRow key={p.id} practice={p} atom={atomById.get(p.atomId)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {project && (
        <PinAtomDialog
          open={pinDialogOpen}
          project={project}
          onClose={() => setPinDialogOpen(false)}
          onUpdated={(p) => setProject(p)}
        />
      )}
      {project && (
        <NewPracticeDialog
          open={practiceDialogOpen}
          project={project}
          pinnedAtomDetails={pinnedAtomDetails}
          onClose={() => setPracticeDialogOpen(false)}
          onPinAtomRequest={() => setPinDialogOpen(true)}
          onCreated={(p) => setPractices((curr) => [p, ...curr])}
        />
      )}
    </div>
  )
}
