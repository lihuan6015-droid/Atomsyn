import { Pin, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import type { Project } from '@/types'
import { STAGE_BG_CLASS, STAGE_LABELS } from './StageProgress'

interface Props {
  project: Project
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

export function ProjectCard({ project }: Props) {
  const stageClass = STAGE_BG_CLASS[project.innovationStage] ?? STAGE_BG_CLASS.discover
  return (
    <Link
      to={`/playground/${project.id}`}
      className={cn(
        'group cell-glow relative flex flex-col gap-4 p-5 rounded-2xl',
        'border border-neutral-200/80 dark:border-neutral-800/80',
        'bg-white/60 dark:bg-neutral-900/40 glass'
      )}
      style={{
        ['--glow-color' as any]: `rgb(var(--stage-${project.innovationStage === 'ideation' || project.innovationStage === 'archived' ? 'discover' : project.innovationStage}) / 0.35)`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-base truncate group-hover:text-stage-discover transition-colors">
            {project.name}
          </h3>
          <p className="text-[0.6875rem] text-neutral-400 font-mono mt-0.5 truncate">{project.slug}</p>
        </div>
        <span
          className={cn(
            'shrink-0 text-[0.625rem] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider',
            stageClass
          )}
        >
          {STAGE_LABELS[project.innovationStage] ?? project.innovationStage}
        </span>
      </div>

      {project.description && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
          {project.description}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-500 mt-auto pt-3 border-t border-neutral-200/60 dark:border-neutral-800/60">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Pin className="w-3 h-3" />
            {project.pinnedAtoms.length} 原子
          </span>
          {project.status && (
            <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/80 text-[0.625rem] uppercase tracking-wider">
              {project.status}
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {timeAgo(project.updatedAt)}
        </span>
      </div>
    </Link>
  )
}
