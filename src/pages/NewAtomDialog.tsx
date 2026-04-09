import { useEffect, useState } from 'react'
import { X, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { atomsApi, frameworksApi, trackUsage } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { Framework } from '@/types'
import { getFrameworkNodeIds } from '@/types'

export function NewAtomDialog() {
  const [open, setOpen] = useState(false)
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [advanced, setAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const showToast = useAppStore((s) => s.showToast)
  const activeFrameworkId = useAppStore((s) => s.activeFrameworkId)

  // form
  const [frameworkId, setFrameworkId] = useState<string>('')
  const [cellId, setCellId] = useState<number | string>(1)
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [coreIdea, setCoreIdea] = useState('')
  const [whenToUse, setWhenToUse] = useState('')
  const [aiSkillPrompt, setAiSkillPrompt] = useState('')
  const [tags, setTags] = useState('')
  const [keySteps, setKeySteps] = useState('')
  const [exampleTitle, setExampleTitle] = useState('')
  const [exampleContent, setExampleContent] = useState('')

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.frameworkId) setFrameworkId(detail.frameworkId)
      if (detail?.cellId !== undefined) setCellId(detail.cellId)
      setOpen(true)
    }
    window.addEventListener('ccl:open-new-atom', handler)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) setOpen(false)
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('ccl:open-new-atom', handler)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    frameworksApi
      .list()
      .then((list) => {
        setFrameworks(list)
        const fid = activeFrameworkId || list[0]?.id || ''
        setFrameworkId(fid)
      })
      .catch(() => undefined)
  }, [open, activeFrameworkId])

  const currentFw = frameworks.find((f) => f.id === frameworkId)
  const nodes = currentFw ? getFrameworkNodeIds(currentFw) : []
  const hasNodes = nodes.length > 0

  // Reset cellId when framework changes
  useEffect(() => {
    if (currentFw) {
      const fwNodes = getFrameworkNodeIds(currentFw)
      if (fwNodes.length > 0) setCellId(fwNodes[0].id)
    }
  }, [frameworkId]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setName('')
    setNameEn('')
    setCoreIdea('')
    setWhenToUse('')
    setAiSkillPrompt('')
    setTags('')
    setKeySteps('')
    setExampleTitle('')
    setExampleContent('')
    setAdvanced(false)
  }

  const onSave = async () => {
    if (!name.trim() || !aiSkillPrompt.trim() || !frameworkId) {
      showToast('请填写名称、Skill Prompt 和骨架')
      return
    }
    setSaving(true)
    try {
      // Generate atom id: atom_<slug> where slug is derived from English name or pinyin-ish transliteration
      const slugBase = (nameEn.trim() || name.trim())
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40)
      const atomId = `atom_${slugBase || 'untitled'}`
      await atomsApi.create({
        id: atomId,
        kind: 'methodology' as const,
        name: name.trim(),
        nameEn: nameEn.trim() || undefined,
        frameworkId,
        cellId,
        tags: tags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        coreIdea: coreIdea.trim(),
        whenToUse: whenToUse.trim(),
        aiSkillPrompt: aiSkillPrompt.trim(),
        keySteps: keySteps
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        example:
          exampleTitle.trim() || exampleContent.trim()
            ? { title: exampleTitle.trim(), content: exampleContent.trim() }
            : undefined,
        bookmarks: [],
        stats: { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 },
      })
      showToast('✓ 已创建新原子')
      trackUsage({ type: 'atom-create' })
      window.dispatchEvent(new CustomEvent('atomsyn:atoms-changed'))
      reset()
      setOpen(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建失败'
      showToast(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden animate-fade-in max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Plus className="w-4 h-4 text-violet-500" />
            </div>
            <h3 className="font-semibold text-sm">新建原子</h3>
          </div>
          <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 scrollbar-subtle">
          {/* Framework + cell */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>骨架</Label>
              <select
                value={frameworkId}
                onChange={(e) => setFrameworkId(e.target.value)}
                className={selectCls}
              >
                {frameworks.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label required>{currentFw?.layoutType === 'matrix' ? '所属步骤' : '所属分类'}</Label>
              {hasNodes ? (
                <select
                  value={String(cellId)}
                  onChange={(e) => {
                    const val = e.target.value
                    setCellId(currentFw?.layoutType === 'matrix' ? Number(val) : val)
                  }}
                  className={selectCls}
                >
                  {nodes.map((n) => (
                    <option key={String(n.id)} value={String(n.id)}>
                      {typeof n.id === 'number' ? String(n.id).padStart(2, '0') + ' · ' : ''}{n.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  该方法库尚未定义分类结构，请先编辑方法库添加分类
                </p>
              )}
            </div>
          </div>

          <div>
            <Label required>名称</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label>英文名</Label>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <Label>核心理念</Label>
            <textarea
              rows={3}
              value={coreIdea}
              onChange={(e) => setCoreIdea(e.target.value)}
              className={textareaCls}
            />
          </div>
          <div>
            <Label>什么时候用</Label>
            <input
              value={whenToUse}
              onChange={(e) => setWhenToUse(e.target.value)}
              className={inputCls}
              placeholder="用 · 分隔"
            />
          </div>
          <div>
            <Label required>AI Skill Prompt</Label>
            <textarea
              rows={5}
              value={aiSkillPrompt}
              onChange={(e) => setAiSkillPrompt(e.target.value)}
              className={textareaCls + ' font-mono text-[0.75rem]'}
              placeholder="可使用 {请在此处填入} 作为占位符"
            />
          </div>

          <button
            onClick={() => setAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-600 font-medium"
          >
            {advanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            进阶字段
          </button>

          {advanced && (
            <div className="space-y-4 pt-1">
              <div>
                <Label>标签 (逗号分隔)</Label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <Label>关键步骤 (一行一条)</Label>
                <textarea
                  rows={4}
                  value={keySteps}
                  onChange={(e) => setKeySteps(e.target.value)}
                  className={textareaCls}
                />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label>经典案例</Label>
                <input
                  placeholder="标题"
                  value={exampleTitle}
                  onChange={(e) => setExampleTitle(e.target.value)}
                  className={inputCls}
                />
                <textarea
                  rows={3}
                  placeholder="内容"
                  value={exampleContent}
                  onChange={(e) => setExampleContent(e.target.value)}
                  className={textareaCls}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50">
          <button
            onClick={() => setOpen(false)}
            className="px-3 h-8 rounded-lg text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving || !hasNodes}
            className="px-3 h-8 rounded-lg bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-medium shadow-lg shadow-violet-500/25 transition-colors"
          >
            {saving ? '保存中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40'
const textareaCls =
  'mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40'
const selectCls = inputCls

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[0.625rem] uppercase tracking-wider text-neutral-500 font-semibold">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}
