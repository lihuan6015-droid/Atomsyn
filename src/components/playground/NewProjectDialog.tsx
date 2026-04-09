import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { projectsApi, trackUsage } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { InnovationStage, Project } from '@/types'
import { STAGE_LABELS } from './StageProgress'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (p: Project) => void
}

const STAGES: InnovationStage[] = [
  'ideation',
  'discover',
  'define',
  'ideate',
  'develop',
  'validate',
  'evolve',
]

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40) || 'project'
}

export function NewProjectDialog({ open, onClose, onCreated }: Props) {
  const navigate = useNavigate()
  const showToast = useAppStore((s) => s.showToast)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugDirty, setSlugDirty] = useState(false)
  const [description, setDescription] = useState('')
  const [stage, setStage] = useState<InnovationStage>('discover')
  const [status, setStatus] = useState('POC')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) {
      setName('')
      setSlug('')
      setSlugDirty(false)
      setDescription('')
      setStage('discover')
      setStatus('POC')
      setErrors({})
    }
  }, [open])

  useEffect(() => {
    if (!slugDirty) setSlug(slugify(name))
  }, [name, slugDirty])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = '请输入项目名称'
    if (!slug.trim()) errs.slug = 'slug 不能为空'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSubmitting(true)
    try {
      const now = new Date().toISOString()
      const id = `project-${Date.now()}-${slug}`
      const created = await projectsApi.create({
        id,
        schemaVersion: 1,
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
        status,
        innovationStage: stage,
        stageHistory: [],
        pinnedAtoms: [],
        createdAt: now,
        updatedAt: now,
      })
      trackUsage({ type: 'project-create', projectId: created.id })
      showToast('项目已创建')
      onCreated?.(created)
      onClose()
      navigate(`/atom/playground/${created.id}`)
    } catch (err: any) {
      showToast(`创建失败: ${err.message ?? err}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800/80 shadow-2xl animate-slide-up"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/80 dark:border-neutral-800/80">
          <h2 className="text-base font-semibold">新建项目</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="项目名称" required error={errors.name}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如:AI 个人知识助手"
              className={inputClass}
            />
          </Field>

          <Field label="Slug" required error={errors.slug}>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value))
                setSlugDirty(true)
              }}
              className={cn(inputClass, 'font-mono text-xs')}
            />
          </Field>

          <Field label="描述">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="一句话说明项目是什么、解决谁的什么问题"
              className={cn(inputClass, 'resize-none')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="当前阶段">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as InnovationStage)}
                className={inputClass}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="状态">
              <input
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="POC / MVP / Live"
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-neutral-200/80 dark:border-neutral-800/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-stage-discover text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? '创建中…' : '创建项目'}
          </button>
        </div>
      </form>
    </div>
  )
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-lg bg-neutral-100/60 dark:bg-neutral-800/60 border border-transparent focus:border-stage-discover/50 focus:bg-white dark:focus:bg-neutral-900 focus:outline-none transition-colors'

function Field({
  label,
  children,
  required,
  error,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
  error?: string
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </div>
      {children}
      {error && <div className="text-[0.6875rem] text-rose-500 mt-1">{error}</div>}
    </label>
  )
}
