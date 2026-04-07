import { Plus, Search, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ProjectCard } from '@/components/playground/ProjectCard'
import { NewProjectDialog } from '@/components/playground/NewProjectDialog'
import { projectsApi } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { Project } from '@/types'

export default function PlaygroundPage() {
  const showToast = useAppStore((s) => s.showToast)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    projectsApi
      .list()
      .then((p) =>
        setProjects(
          [...p].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        )
      )
      .catch((e) => {
        showToast(`加载失败: ${e.message ?? e}`)
        setProjects([])
      })
  }, [showToast])

  const filtered = (projects ?? []).filter((p) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q)
    )
  })

  const isLoading = projects === null
  const isEmpty = !isLoading && filtered.length === 0 && !query

  return (
    <div className="hero-gradient min-h-full">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2 font-mono">
            <span>CCL</span>
            <span>/</span>
            <span className="text-neutral-700 dark:text-neutral-300">Playground</span>
          </div>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight inline-flex items-center gap-3">
                <span className="text-2xl">🛠</span> 项目演练场
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                把方法论真正"用起来"——每个项目都是一个练兵场
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索场景或项目…"
                  className="pl-9 pr-3 py-2 text-sm w-64 rounded-lg bg-white/60 dark:bg-neutral-900/60 glass border border-neutral-200/80 dark:border-neutral-800/80 focus:border-stage-discover/50 focus:outline-none"
                />
              </div>
              <button
                onClick={() => setDialogOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-stage-discover text-white hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                新建项目
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-44 rounded-2xl bg-neutral-100/40 dark:bg-neutral-900/40 border border-neutral-200/80 dark:border-neutral-800/80 animate-pulse"
              />
            ))}
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-stage-discover/30 to-stage-define/20 flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7 text-stage-discover" />
            </div>
            <h3 className="text-base font-semibold">还没有项目</h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              先创建一个项目，把学到的方法论"用起来"
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-stage-discover text-white hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              创建第一个项目
            </button>
          </div>
        )}

        {!isLoading && !isEmpty && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
            <button
              onClick={() => setDialogOpen(true)}
              className="group min-h-[176px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-stage-discover/60 hover:bg-stage-discover/5 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 group-hover:bg-stage-discover/20 flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 text-neutral-400 group-hover:text-stage-discover" />
              </div>
              <span className="text-sm font-medium text-neutral-500 group-hover:text-stage-discover">
                新建项目
              </span>
            </button>
          </div>
        )}
      </div>

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(p) => setProjects((curr) => [p, ...(curr ?? [])])}
      />
    </div>
  )
}
