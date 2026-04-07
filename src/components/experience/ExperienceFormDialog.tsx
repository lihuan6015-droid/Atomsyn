/**
 * ExperienceFormDialog · V1.5 · GUI CRUD for Experience atoms.
 *
 * Reusable for both `create` and `edit` modes. Calls atomsApi under the hood.
 */
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { atomsApi } from '@/lib/dataApi'
import type { Atom, ExperienceAtom } from '@/types'
import { cn } from '@/lib/cn'

export interface ExperienceFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: ExperienceAtom
  onSave: (atom: ExperienceAtom) => void
  onClose: () => void
}

const AGENT_PRESETS = ['claude-code', 'cursor', 'codex', 'trae', 'user', 'custom']

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'exp'
  )
}

interface FormState {
  name: string
  agentPreset: string
  agentCustom: string
  sourceContext: string
  insight: string
  tags: string[]
  tagDraft: string
  keySteps: string[]
  relatedFrameworks: string
}

function buildInitial(initial?: ExperienceAtom): FormState {
  const agent = initial?.sourceAgent || 'claude-code'
  const preset = AGENT_PRESETS.includes(agent) ? agent : 'custom'
  return {
    name: initial?.name || '',
    agentPreset: preset,
    agentCustom: preset === 'custom' ? agent : '',
    sourceContext: initial?.sourceContext || '',
    insight: initial?.insight || '',
    tags: initial?.tags ? [...initial.tags] : [],
    tagDraft: '',
    keySteps: initial?.keySteps ? [...initial.keySteps] : [],
    relatedFrameworks: (initial?.relatedFrameworks || []).join(', '),
  }
}

export function ExperienceFormDialog({
  open,
  mode,
  initial,
  onSave,
  onClose,
}: ExperienceFormDialogProps) {
  const [form, setForm] = useState<FormState>(() => buildInitial(initial))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(buildInitial(initial))
      setErrors({})
      setSubmitError(null)
      setSaving(false)
    }
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  const resolvedAgent = useMemo(
    () => (form.agentPreset === 'custom' ? form.agentCustom.trim() : form.agentPreset),
    [form.agentPreset, form.agentCustom],
  )

  if (!open) return null

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    const name = form.name.trim()
    if (!name) e.name = '名称不能为空'
    else if (name.length > 120) e.name = '名称最多 120 字'

    if (!resolvedAgent) e.agent = '请填写来源 agent'

    const ctx = form.sourceContext.trim()
    if (!ctx) e.sourceContext = '来源情境不能为空'
    else if (ctx.length > 300) e.sourceContext = '情境最多 300 字'

    const insight = form.insight.trim()
    if (insight.length < 50) e.insight = '洞察至少 50 字'
    else if (insight.length > 4000) e.insight = '洞察最多 4000 字'

    if (form.tags.length < 1) e.tags = '至少需要 1 个标签'
    else if (form.tags.length > 8) e.tags = '最多 8 个标签'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  function addTagFromDraft() {
    const raw = form.tagDraft.trim().replace(/^#/, '')
    if (!raw) return
    const parts = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    setForm((prev) => {
      const next = [...prev.tags]
      for (const p of parts) if (!next.includes(p) && next.length < 8) next.push(p)
      return { ...prev, tags: next, tagDraft: '' }
    })
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault()
      addTagFromDraft()
    } else if (e.key === 'Backspace' && !form.tagDraft && form.tags.length > 0) {
      setForm((prev) => ({ ...prev, tags: prev.tags.slice(0, -1) }))
    }
  }

  function removeTag(t: string) {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((x) => x !== t) }))
  }

  function addStep() {
    setForm((prev) => ({ ...prev, keySteps: [...prev.keySteps, ''] }))
  }
  function updateStep(i: number, v: string) {
    setForm((prev) => ({
      ...prev,
      keySteps: prev.keySteps.map((s, idx) => (idx === i ? v : s)),
    }))
  }
  function removeStep(i: number) {
    setForm((prev) => ({ ...prev, keySteps: prev.keySteps.filter((_, idx) => idx !== i) }))
  }

  async function handleSubmit() {
    if (saving) return
    if (!validate()) return
    setSaving(true)
    setSubmitError(null)

    const now = new Date().toISOString()
    const steps = form.keySteps.map((s) => s.trim()).filter(Boolean)
    const frameworks = form.relatedFrameworks
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)

    try {
      let atom: ExperienceAtom
      if (mode === 'edit' && initial) {
        atom = {
          ...initial,
          name: form.name.trim(),
          sourceAgent: resolvedAgent,
          sourceContext: form.sourceContext.trim(),
          insight: form.insight.trim(),
          tags: form.tags,
          keySteps: steps.length > 0 ? steps : undefined,
          relatedFrameworks: frameworks.length > 0 ? frameworks : undefined,
          updatedAt: now,
        }
        await atomsApi.update(atom.id, atom as unknown as Atom)
      } else {
        const id = `atom_exp_${slugify(form.name.trim())}_${Date.now()}`
        atom = {
          id,
          schemaVersion: 1,
          kind: 'experience',
          name: form.name.trim(),
          tags: form.tags,
          sourceAgent: resolvedAgent,
          sourceContext: form.sourceContext.trim(),
          insight: form.insight.trim(),
          keySteps: steps.length > 0 ? steps : undefined,
          relatedFrameworks: frameworks.length > 0 ? frameworks : undefined,
          stats: { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 },
          createdAt: now,
          updatedAt: now,
        }
        await atomsApi.create(atom as unknown as Atom)
      }
      onSave(atom)
    } catch (err: any) {
      setSubmitError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const insightLen = form.insight.trim().length

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto bg-black/50 dark:bg-black/70 backdrop-blur-sm glass motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="experience-form-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl my-8 rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white dark:bg-neutral-950 shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200"
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800/60">
          <div>
            <h2
              id="experience-form-title"
              className="text-sm font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {mode === 'edit' ? '编辑经验原子' : '新建经验原子'}
            </h2>
            <div className="text-[11px] text-neutral-500 mt-0.5">
              {mode === 'edit'
                ? '修改后会同步更新 updatedAt'
                : '手动沉淀一张经验卡片 · 稍后可编辑'}
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <Field label="名称" required error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              onBlur={validate}
              placeholder="简短描述这条经验"
              maxLength={120}
              className={inputCls}
            />
          </Field>

          {/* Source agent */}
          <Field label="来源 agent" required error={errors.agent}>
            <div className="flex items-center gap-2">
              <select
                value={form.agentPreset}
                onChange={(e) => updateField('agentPreset', e.target.value)}
                className={cn(inputCls, 'flex-1 min-w-0')}
              >
                {AGENT_PRESETS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              {form.agentPreset === 'custom' && (
                <input
                  value={form.agentCustom}
                  onChange={(e) => updateField('agentCustom', e.target.value)}
                  placeholder="自定义 agent 名称"
                  className={cn(inputCls, 'flex-1 min-w-0 font-mono')}
                />
              )}
            </div>
          </Field>

          {/* Source context */}
          <Field label="来源情境" required error={errors.sourceContext}>
            <textarea
              value={form.sourceContext}
              onChange={(e) => updateField('sourceContext', e.target.value)}
              onBlur={validate}
              placeholder="在什么场景下发现这条经验 (1-300 字)"
              rows={2}
              maxLength={300}
              className={cn(inputCls, 'resize-none leading-relaxed')}
            />
            <div className="text-[10px] text-neutral-400 text-right font-mono mt-0.5">
              {form.sourceContext.length} / 300
            </div>
          </Field>

          {/* Insight */}
          <Field label="洞察" required error={errors.insight}>
            <textarea
              value={form.insight}
              onChange={(e) => updateField('insight', e.target.value)}
              onBlur={validate}
              placeholder="完整记录你学到的东西 (50-4000 字)"
              rows={6}
              maxLength={4000}
              className={cn(inputCls, 'leading-relaxed')}
            />
            <div
              className={cn(
                'text-[10px] text-right font-mono mt-0.5',
                insightLen < 50 || insightLen > 4000
                  ? 'text-rose-500'
                  : 'text-neutral-400',
              )}
            >
              {insightLen} / 4000 · 至少 50
            </div>
          </Field>

          {/* Tags */}
          <Field label="标签" required error={errors.tags}>
            <div
              className={cn(
                'flex flex-wrap items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.02] px-2 py-1.5 focus-within:ring-2 focus-within:ring-violet-500/40',
              )}
            >
              {form.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300 border border-violet-500/30"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="hover:text-violet-900 dark:hover:text-white focus-visible:outline-none"
                    aria-label={`移除 ${t}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                value={form.tagDraft}
                onChange={(e) => updateField('tagDraft', e.target.value)}
                onKeyDown={onTagKey}
                onBlur={addTagFromDraft}
                placeholder={form.tags.length === 0 ? '输入标签后按 Enter 或 , 添加' : ''}
                className="flex-1 min-w-[120px] bg-transparent text-xs outline-none text-neutral-800 dark:text-neutral-200"
              />
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">
              {form.tags.length} / 8
            </div>
          </Field>

          {/* Key steps */}
          <Field label="关键步骤 (可选)">
            <div className="space-y-1.5">
              {form.keySteps.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-neutral-400 font-mono w-4 text-right">
                    {i + 1}.
                  </span>
                  <input
                    value={s}
                    onChange={(e) => updateStep(i, e.target.value)}
                    placeholder="一个可执行的步骤"
                    className={cn(inputCls, 'flex-1')}
                  />
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="p-1.5 rounded-md text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
                    aria-label="移除步骤"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addStep}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 rounded"
              >
                <Plus className="w-3 h-3" />
                添加步骤
              </button>
            </div>
          </Field>

          {/* Related frameworks */}
          <Field label="关联骨架 (可选)">
            <input
              value={form.relatedFrameworks}
              onChange={(e) => updateField('relatedFrameworks', e.target.value)}
              placeholder="framework-id,另一个-id"
              className={cn(inputCls, 'font-mono')}
            />
            <div className="text-[10px] text-neutral-400 mt-0.5">
              逗号分隔，例如 <code className="font-mono">product-innovation-24</code>
            </div>
          </Field>
        </div>

        {submitError && (
          <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-600 dark:text-rose-400">
            {submitError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-3 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="h-8 px-4 rounded-lg text-xs font-medium border bg-violet-500 text-white border-violet-500 hover:bg-violet-600 hover:border-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 shadow-sm shadow-violet-500/20 inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === 'edit' ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full h-9 px-3 rounded-lg bg-white dark:bg-white/[0.02] border border-neutral-200 dark:border-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-colors'

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
      {error && <div className="mt-1 text-[11px] text-rose-500">{error}</div>}
    </div>
  )
}

export default ExperienceFormDialog
