import { ChevronRight, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { practicesApi, trackUsage } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { Atom, Practice, PracticeStatus, Project } from '@/types'

interface Props {
  open: boolean
  project: Project
  pinnedAtomDetails: Atom[]
  onClose: () => void
  onCreated: (p: Practice) => void
  onPinAtomRequest?: () => void
}

const STATUS_OPTIONS: { value: PracticeStatus; label: string }[] = [
  { value: 'in-progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'abandoned', label: '放弃' },
]

export function NewPracticeDialog({
  open,
  project,
  pinnedAtomDetails,
  onClose,
  onCreated,
  onPinAtomRequest,
}: Props) {
  const showToast = useAppStore((s) => s.showToast)
  const [atomId, setAtomId] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<PracticeStatus>('in-progress')
  const [context, setContext] = useState('')
  const [executionSummary, setExecutionSummary] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [keyInsights, setKeyInsights] = useState('')
  const [whatWorked, setWhatWorked] = useState('')
  const [whatFailed, setWhatFailed] = useState('')
  const [artifacts, setArtifacts] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) {
      setAtomId('')
      setTitle('')
      setStatus('in-progress')
      setContext('')
      setExecutionSummary('')
      setAdvancedOpen(false)
      setKeyInsights('')
      setWhatWorked('')
      setWhatFailed('')
      setArtifacts('')
      setErrors({})
    } else if (pinnedAtomDetails[0]) {
      setAtomId(pinnedAtomDetails[0].id)
    }
  }, [open, pinnedAtomDetails])

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
    if (!atomId) errs.atomId = '请选择一个原子'
    if (!title.trim()) errs.title = '请输入实战记录标题'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSubmitting(true)
    try {
      const now = new Date().toISOString()
      const insightsArr = keyInsights
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      const artifactsArr = artifacts
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((line) => {
          const isUrl = /^https?:\/\//i.test(line)
          return isUrl
            ? { type: 'link' as const, url: line, title: line }
            : { type: 'text' as const, content: line }
        })
      const created = await practicesApi.create(project.id, {
        schemaVersion: 1,
        projectId: project.id,
        atomId,
        title: title.trim(),
        status,
        context: context.trim() || undefined,
        executionSummary: executionSummary.trim() || undefined,
        keyInsights: insightsArr.length ? insightsArr : undefined,
        whatWorked: whatWorked.trim() || undefined,
        whatFailed: whatFailed.trim() || undefined,
        artifacts: artifactsArr.length ? artifactsArr : undefined,
        createdAt: now,
        updatedAt: now,
      })
      trackUsage({
        type: 'practice-create',
        atomId,
        projectId: project.id,
        practiceId: created.id,
      })
      showToast('实战记录已创建')
      onCreated(created)
      onClose()
    } catch (err: any) {
      showToast(`创建失败: ${err.message ?? err}`)
    } finally {
      setSubmitting(false)
    }
  }

  const noAtoms = pinnedAtomDetails.length === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800/80 shadow-2xl animate-slide-up"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/80 dark:border-neutral-800/80">
          <h2 className="text-base font-semibold">新建实战记录</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-subtle px-6 py-5 space-y-4">
          <Field label="选择原子" required error={errors.atomId}>
            {noAtoms ? (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onPinAtomRequest?.()
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-dashed border-stage-discover/40 text-stage-discover hover:bg-stage-discover/10 transition-colors"
              >
                + 先引入一个原子
              </button>
            ) : (
              <select
                value={atomId}
                onChange={(e) => setAtomId(e.target.value)}
                className={inputClass}
              >
                <option value="">请选择…</option>
                {pinnedAtomDetails.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="标题" required error={errors.title}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如:对早期种子用户做了一轮 JTBD 访谈"
              className={inputClass}
            />
          </Field>

          <Field label="状态">
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-lg border text-sm text-center cursor-pointer transition-colors',
                    status === opt.value
                      ? 'border-stage-discover/60 bg-stage-discover/10 text-stage-discover'
                      : 'border-neutral-200/80 dark:border-neutral-800/80 hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                  )}
                >
                  <input
                    type="radio"
                    name="practice-status"
                    value={opt.value}
                    checked={status === opt.value}
                    onChange={() => setStatus(opt.value)}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </Field>

          <Field label="情境 Context">
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              placeholder="当时面对的问题、约束、目标"
              className={cn(inputClass, 'resize-none')}
            />
          </Field>

          <Field label="执行摘要 Execution">
            <textarea
              value={executionSummary}
              onChange={(e) => setExecutionSummary(e.target.value)}
              rows={3}
              placeholder="实际操作的关键步骤、做了什么"
              className={cn(inputClass, 'resize-none')}
            />
          </Field>

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <ChevronRight className={cn('chevron w-3.5 h-3.5', advancedOpen && 'open')} />
            进阶字段
          </button>

          {advancedOpen && (
            <div className="space-y-4 animate-fade-in">
              <Field label="关键洞察 (一行一条)">
                <textarea
                  value={keyInsights}
                  onChange={(e) => setKeyInsights(e.target.value)}
                  rows={3}
                  className={cn(inputClass, 'resize-none font-mono text-xs')}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="有效之处">
                  <textarea
                    value={whatWorked}
                    onChange={(e) => setWhatWorked(e.target.value)}
                    rows={3}
                    className={cn(inputClass, 'resize-none')}
                  />
                </Field>
                <Field label="失效之处">
                  <textarea
                    value={whatFailed}
                    onChange={(e) => setWhatFailed(e.target.value)}
                    rows={3}
                    className={cn(inputClass, 'resize-none')}
                  />
                </Field>
              </div>
              <Field label="产出物 / 链接 (一行一条)">
                <textarea
                  value={artifacts}
                  onChange={(e) => setArtifacts(e.target.value)}
                  rows={2}
                  placeholder="https://… 或自由文本"
                  className={cn(inputClass, 'resize-none font-mono text-xs')}
                />
              </Field>
            </div>
          )}
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
            disabled={submitting || noAtoms}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-stage-discover text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? '保存中…' : '保存记录'}
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
      {error && <div className="text-[11px] text-rose-500 mt-1">{error}</div>}
    </label>
  )
}
