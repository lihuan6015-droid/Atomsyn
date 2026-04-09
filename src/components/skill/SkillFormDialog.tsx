/**
 * SkillFormDialog · V1.5 · GUI CRUD for Skill inventory items.
 *
 * Reusable for both `create` and `edit` modes. In create mode shows a warning
 * that rescans may prune entries whose localPath no longer exists.
 */
import { useEffect, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { atomsApi } from '@/lib/dataApi'
import type {
  Atom,
  SkillInventoryItem,
  SkillToolName,
  SkillUserMarkedState,
} from '@/types'
import { cn } from '@/lib/cn'

export interface SkillFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: SkillInventoryItem
  onSave: (item: SkillInventoryItem) => void
  onClose: () => void
}

const TOOL_NAMES: SkillToolName[] = [
  'claude',
  'cursor',
  'codex',
  'trae',
  'openclaw',
  'opencode',
  'custom',
]

const MARK_OPTIONS: { id: SkillUserMarkedState | 'none'; label: string }[] = [
  { id: 'none', label: '未标记' },
  { id: 'favorite', label: '⭐ 常用' },
  { id: 'forgotten', label: '🌙 已遗忘' },
  { id: 'unused', label: '💤 未使用' },
  { id: 'archived', label: '📦 归档' },
]

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'skill'
  )
}

interface FormState {
  name: string
  toolName: SkillToolName
  rawDescription: string
  localPath: string
  tags: string[]
  tagDraft: string
  userMarked: SkillUserMarkedState | 'none'
}

function buildInitial(initial?: SkillInventoryItem): FormState {
  return {
    name: initial?.name || '',
    toolName: initial?.toolName || 'claude',
    rawDescription: initial?.rawDescription || '',
    localPath: initial?.localPath || '',
    tags: initial?.tags ? [...initial.tags] : [],
    tagDraft: '',
    userMarked: initial?.userMarked || 'none',
  }
}

export function SkillFormDialog({
  open,
  mode,
  initial,
  onSave,
  onClose,
}: SkillFormDialogProps) {
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

  if (!open) return null

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = '名称不能为空'
    else if (form.name.trim().length > 120) e.name = '名称最多 120 字'
    if (!form.localPath.trim()) e.localPath = '本地路径不能为空'
    if (!form.rawDescription.trim()) e.rawDescription = '描述不能为空'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function addTagFromDraft() {
    const raw = form.tagDraft.trim().replace(/^#/, '')
    if (!raw) return
    const parts = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    setForm((prev) => {
      const next = [...prev.tags]
      for (const p of parts) if (!next.includes(p)) next.push(p)
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

  async function handleSubmit() {
    if (saving) return
    if (!validate()) return
    setSaving(true)
    setSubmitError(null)

    const now = new Date().toISOString()
    const mark = form.userMarked === 'none' ? undefined : form.userMarked

    try {
      let atom: SkillInventoryItem
      if (mode === 'edit' && initial) {
        atom = {
          ...initial,
          name: form.name.trim(),
          toolName: form.toolName,
          rawDescription: form.rawDescription.trim(),
          localPath: form.localPath.trim(),
          tags: form.tags,
          userMarked: mark,
          updatedAt: now,
        }
        await atomsApi.update(atom.id, atom as unknown as Atom)
      } else {
        const id = `atom_skill_${slugify(form.name.trim())}_${Date.now()}`
        atom = {
          id,
          schemaVersion: 1,
          kind: 'skill-inventory',
          name: form.name.trim(),
          tags: form.tags,
          localPath: form.localPath.trim(),
          toolName: form.toolName,
          frontmatter: {},
          rawDescription: form.rawDescription.trim(),
          userMarked: mark,
          fileMtime: now,
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

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto bg-black/50 dark:bg-black/70 backdrop-blur-sm glass motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-form-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl my-8 rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white dark:bg-neutral-950 shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200"
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800/60">
          <div>
            <h2
              id="skill-form-title"
              className="text-sm font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {mode === 'edit' ? '编辑 skill' : '手动添加 skill'}
            </h2>
            <div className="text-[0.6875rem] text-neutral-500 mt-0.5">
              {mode === 'edit'
                ? '可编辑名称 / 描述 / 标签 / 标记 · frontmatter 为只读'
                : '常规路径是扫描目录 · 手动添加仅供特殊情况使用'}
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
          {mode === 'create' && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[0.6875rem] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                手动添加的条目若 <code className="font-mono">localPath</code>{' '}
                不存在，下一次重新扫描可能将其删除。正常做法仍是 "重新扫描"。
              </div>
            </div>
          )}

          <Field label="名称" required error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              onBlur={validate}
              maxLength={120}
              className={inputCls}
            />
          </Field>

          <Field label="所属工具" required>
            <select
              value={form.toolName}
              onChange={(e) => update('toolName', e.target.value as SkillToolName)}
              className={inputCls}
            >
              {TOOL_NAMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="描述" required error={errors.rawDescription}>
            <textarea
              value={form.rawDescription}
              onChange={(e) => update('rawDescription', e.target.value)}
              onBlur={validate}
              rows={3}
              className={cn(inputCls, 'leading-relaxed')}
            />
          </Field>

          <Field label="本地路径" required error={errors.localPath}>
            <input
              value={form.localPath}
              onChange={(e) => update('localPath', e.target.value)}
              onBlur={validate}
              placeholder="/absolute/path/to/skill"
              className={cn(inputCls, 'font-mono')}
              readOnly={mode === 'edit'}
            />
            {mode === 'edit' && (
              <div className="text-[0.625rem] text-neutral-400 mt-0.5">
                localPath 由扫描器维护 · 只读
              </div>
            )}
          </Field>

          <Field label="标签">
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.02] px-2 py-1.5 focus-within:ring-2 focus-within:ring-violet-500/40">
              {form.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[0.6875rem] font-mono px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300 border border-violet-500/30"
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
                onChange={(e) => update('tagDraft', e.target.value)}
                onKeyDown={onTagKey}
                onBlur={addTagFromDraft}
                placeholder={form.tags.length === 0 ? 'Enter / , 添加' : ''}
                className="flex-1 min-w-[120px] bg-transparent text-xs outline-none text-neutral-800 dark:text-neutral-200"
              />
            </div>
          </Field>

          <Field label="用户标记">
            <div className="flex flex-wrap items-center gap-2">
              {MARK_OPTIONS.map((m) => (
                <label
                  key={m.id}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[0.6875rem] font-medium cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-violet-500/40',
                    form.userMarked === m.id
                      ? 'bg-violet-500/10 border-violet-500/40 text-violet-600 dark:text-violet-300'
                      : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-violet-400/50',
                  )}
                >
                  <input
                    type="radio"
                    name="userMarked"
                    value={m.id}
                    checked={form.userMarked === m.id}
                    onChange={() =>
                      update('userMarked', m.id as SkillUserMarkedState | 'none')
                    }
                    className="sr-only"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </Field>

          {mode === 'edit' && initial && (
            <Field label="只读元数据">
              <div className="space-y-2">
                <div>
                  <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 mb-1">
                    File Mtime
                  </div>
                  <code className="block text-[0.6875rem] font-mono text-neutral-500 dark:text-neutral-400">
                    {initial.fileMtime}
                  </code>
                </div>
                {initial.fileHash && (
                  <div>
                    <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 mb-1">
                      File Hash
                    </div>
                    <code className="block text-[0.6875rem] font-mono text-neutral-500 dark:text-neutral-400 truncate">
                      {initial.fileHash}
                    </code>
                  </div>
                )}
                <div>
                  <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 mb-1">
                    Frontmatter
                  </div>
                  <pre className="text-[0.6875rem] font-mono bg-neutral-50 dark:bg-neutral-950 border border-neutral-200/60 dark:border-neutral-800/60 rounded-lg p-2.5 overflow-x-auto text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap break-words max-h-40">
{JSON.stringify(initial.frontmatter, null, 2)}
                  </pre>
                </div>
              </div>
            </Field>
          )}
        </div>

        {submitError && (
          <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[0.6875rem] text-rose-600 dark:text-rose-400">
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
      <label className="block text-[0.6875rem] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
      {error && <div className="mt-1 text-[0.6875rem] text-rose-500">{error}</div>}
    </div>
  )
}

export default SkillFormDialog
