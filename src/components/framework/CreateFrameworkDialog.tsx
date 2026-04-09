/**
 * CreateFrameworkDialog · V2.0
 *
 * 3-step wizard for creating a new Framework (method library skeleton).
 * Triggered by `atomsyn:create-framework` custom event.
 * Mounted at App level (AppShell), like SpotlightPalette.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FolderTree,
  GitBranch,
  Grid3X3,
  List,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { frameworksApi } from '@/lib/dataApi'
import type {
  Framework,
  FrameworkCell,
  FrameworkLayoutType,
  FrameworkListCategory,
  FrameworkTreeNode,
  StageColumnHeader,
} from '@/types'

// ─── Constants ──────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#A78BFA', // violet
  '#60A5FA', // sky
  '#34D399', // emerald
  '#FBBF24', // amber
  '#FB923C', // orange
  '#F472B6', // pink
]

const STEP_LABELS = ['基本信息', '结构定义', '预览确认']

// ─── Helpers ────────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'fw'
  )
}

function padStep(n: number): string {
  return String(n).padStart(2, '0')
}

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ColumnDef {
  name: string
  color: string
}

interface CellDef {
  name: string
  tagline: string
}

interface ListItemDef {
  id: string
  name: string
  color: string
  tagline: string
}

interface TreeNodeDef {
  id: string
  name: string
  color: string
  children: TreeNodeDef[]
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function CreateFrameworkDialog() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — basic info
  const [name, setName] = useState('')
  const [layoutType, setLayoutType] = useState<FrameworkLayoutType>('matrix')
  const [showMore, setShowMore] = useState(false)
  const [description, setDescription] = useState('')
  const [source, setSource] = useState('')
  const [version, setVersion] = useState('')
  const [nameEn, setNameEn] = useState('')

  // Step 2 — matrix
  const [rows, setRows] = useState(1)
  const [cols, setCols] = useState(3)
  const [columnDefs, setColumnDefs] = useState<ColumnDef[]>(() =>
    Array.from({ length: 3 }, (_, i) => ({ name: `阶段 ${i + 1}`, color: PRESET_COLORS[i % 6] })),
  )
  const [cellDefs, setCellDefs] = useState<CellDef[][]>([])

  // Step 2 — list
  const [listItems, setListItems] = useState<ListItemDef[]>([])

  // Step 2 — tree
  const [treeRoots, setTreeRoots] = useState<TreeNodeDef[]>([])

  // ─ Listen for open event
  useEffect(() => {
    const handler = () => {
      resetAll()
      setOpen(true)
    }
    window.addEventListener('atomsyn:create-framework', handler)
    return () => window.removeEventListener('atomsyn:create-framework', handler)
  }, [])

  function resetAll() {
    setStep(0)
    setSaving(false)
    setError(null)
    setName('')
    setLayoutType('matrix')
    setShowMore(false)
    setDescription('')
    setSource('')
    setVersion('')
    setNameEn('')
    setRows(1)
    setCols(3)
    setColumnDefs(Array.from({ length: 3 }, (_, i) => ({ name: `阶段 ${i + 1}`, color: PRESET_COLORS[i % 6] })))
    setCellDefs([])
    setListItems([])
    setTreeRoots([])
  }

  // ─ Esc to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving])

  // ─ Sync matrix cells when rows/cols/columnDefs change
  useEffect(() => {
    if (layoutType !== 'matrix') return
    setCellDefs((prev) => {
      const next: CellDef[][] = []
      for (let r = 0; r < rows; r++) {
        const row: CellDef[] = []
        for (let c = 0; c < cols; c++) {
          row.push(prev[r]?.[c] ?? { name: columnDefs[c]?.name || '', tagline: '' })
        }
        next.push(row)
      }
      return next
    })
  }, [rows, cols, layoutType]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─ Sync columnDefs length with cols
  useEffect(() => {
    if (layoutType !== 'matrix') return
    setColumnDefs((prev) => {
      if (prev.length === cols) return prev
      if (prev.length > cols) return prev.slice(0, cols)
      return [
        ...prev,
        ...Array.from({ length: cols - prev.length }, (_, i) => ({
          name: `阶段 ${prev.length + i + 1}`,
          color: PRESET_COLORS[(prev.length + i) % 6],
        })),
      ]
    })
  }, [cols, layoutType])

  // ─ Validation per step
  const canNext = useMemo(() => {
    if (step === 0) return name.trim().length > 0
    if (step === 1) {
      if (layoutType === 'matrix') return cols > 0 && rows > 0 && columnDefs.every((c) => c.name.trim())
      if (layoutType === 'list') return listItems.length > 0 && listItems.every((it) => it.name.trim())
      if (layoutType === 'tree') return treeRoots.length > 0 && treeRoots.every((n) => n.name.trim())
    }
    return true
  }, [step, name, layoutType, cols, rows, columnDefs, listItems, treeRoots])

  // ─ Build final Framework object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildFramework = useCallback((): any => {
    const id = slugify(name.trim())
    const now = new Date().toISOString()
    const base = {
      id,
      schemaVersion: 1 as const,
      name: name.trim(),
      nameEn: nameEn.trim() || undefined,
      description: description.trim() || undefined,
      source: source.trim() || undefined,
      version: version.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    }

    if (layoutType === 'matrix') {
      const headers: StageColumnHeader[] = columnDefs.map((c, i) => ({
        id: slugify(c.name) || `col-${i}`,
        name: c.name.trim(),
        color: c.color,
      }))
      const cells: FrameworkCell[] = []
      let stepNum = 1
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = cellDefs[r]?.[c]
          const cellName = cell?.name?.trim() || headers[c].name
          cells.push({
            stepNumber: stepNum,
            column: headers[c].id,
            row: r,
            name: cellName,
            nameEn: '',
            tagline: cell?.tagline?.trim() || undefined,
            atomCategoryPath: `${id}/${padStep(stepNum)}-${slugify(cellName)}/`,
          })
          stepNum++
        }
      }
      return { ...base, layoutType: 'matrix', matrix: { rows, columns: cols, columnHeaders: headers, cells } }
    }

    if (layoutType === 'list') {
      const categories: FrameworkListCategory[] = listItems.map((it) => ({
        id: it.id || slugify(it.name),
        name: it.name.trim(),
        color: it.color,
        tagline: it.tagline.trim() || undefined,
        atomCategoryPath: `${id}/${slugify(it.name) || it.id}/`,
      }))
      return { ...base, layoutType: 'list', list: { categories } }
    }

    // tree
    function buildTreeNodes(nodes: TreeNodeDef[], parentPath: string): FrameworkTreeNode[] {
      return nodes.map((n) => {
        const nodeId = n.id || slugify(n.name)
        const path = `${parentPath}${nodeId}/`
        return {
          id: nodeId,
          name: n.name.trim(),
          color: n.color || undefined,
          tagline: undefined,
          atomCategoryPath: path,
          children: n.children.length > 0 ? buildTreeNodes(n.children, path) : undefined,
        }
      })
    }
    return { ...base, layoutType: 'tree', tree: { roots: buildTreeNodes(treeRoots, `${id}/`) } }
  }, [name, nameEn, description, source, version, layoutType, columnDefs, cellDefs, rows, cols, listItems, treeRoots])

  // ─ Submit
  async function handleSubmit() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const fw = buildFramework()
      await frameworksApi.create(fw)
      setOpen(false)
      // refresh page to pick up the new framework
      window.location.reload()
    } catch (err: any) {
      setError(err?.message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto bg-black/50 dark:bg-black/70 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      onClick={() => !saving && setOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl my-8 rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white dark:bg-neutral-950 shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200"
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200/60 dark:border-neutral-800/60">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              新建方法库
            </h2>
            <div className="text-[0.6875rem] text-neutral-500 mt-0.5">
              {STEP_LABELS[step]} ({step + 1}/{STEP_LABELS.length})
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex gap-1.5">
            {STEP_LABELS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1 rounded-full flex-1 transition-colors duration-300',
                  i <= step ? 'bg-violet-500' : 'bg-neutral-200 dark:bg-neutral-800',
                )}
              />
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {step === 0 && (
                <Step1BasicInfo
                  name={name}
                  setName={setName}
                  layoutType={layoutType}
                  setLayoutType={setLayoutType}
                  showMore={showMore}
                  setShowMore={setShowMore}
                  description={description}
                  setDescription={setDescription}
                  source={source}
                  setSource={setSource}
                  version={version}
                  setVersion={setVersion}
                  nameEn={nameEn}
                  setNameEn={setNameEn}
                />
              )}
              {step === 1 && layoutType === 'matrix' && (
                <MatrixEditor
                  rows={rows}
                  setRows={setRows}
                  cols={cols}
                  setCols={setCols}
                  columnDefs={columnDefs}
                  setColumnDefs={setColumnDefs}
                  cellDefs={cellDefs}
                  setCellDefs={setCellDefs}
                />
              )}
              {step === 1 && layoutType === 'list' && (
                <ListEditor items={listItems} setItems={setListItems} />
              )}
              {step === 1 && layoutType === 'tree' && (
                <TreeEditor roots={treeRoots} setRoots={setTreeRoots} />
              )}
              {step === 2 && <Step3Preview framework={buildFramework()} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 pb-2">
            <div className="text-[0.6875rem] text-rose-500 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">
              {error}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0 || saving}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            上一步
          </button>

          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              下一步
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              创建方法库
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Step 1 — Basic Info
// =============================================================================

const LAYOUT_OPTIONS: { type: FrameworkLayoutType; icon: typeof Grid3X3; label: string; desc: string }[] = [
  { type: 'matrix', icon: Grid3X3, label: '矩阵布局', desc: '适合有阶段划分的方法论' },
  { type: 'list', icon: List, label: '列表布局', desc: '适合简单分类的知识体系' },
  { type: 'tree', icon: GitBranch, label: '树形布局', desc: '适合层级结构的知识体系' },
]

function Step1BasicInfo({
  name,
  setName,
  layoutType,
  setLayoutType,
  showMore,
  setShowMore,
  description,
  setDescription,
  source,
  setSource,
  version,
  setVersion,
  nameEn,
  setNameEn,
}: {
  name: string
  setName: (v: string) => void
  layoutType: FrameworkLayoutType
  setLayoutType: (v: FrameworkLayoutType) => void
  showMore: boolean
  setShowMore: (v: boolean) => void
  description: string
  setDescription: (v: string) => void
  source: string
  setSource: (v: string) => void
  version: string
  setVersion: (v: string) => void
  nameEn: string
  setNameEn: (v: string) => void
}) {
  return (
    <div className="space-y-5">
      {/* Name */}
      <Field label="名称" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如: 产品创新24步法"
          maxLength={80}
          autoFocus
          className={inputCls}
        />
      </Field>

      {/* Layout type */}
      <Field label="布局类型" required>
        <div className="grid grid-cols-3 gap-2">
          {LAYOUT_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const selected = layoutType === opt.type
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => setLayoutType(opt.type)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center',
                  selected
                    ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-500/10 ring-1 ring-violet-500/30'
                    : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-white/[0.02]',
                )}
              >
                <Icon
                  className={cn(
                    'w-5 h-5 transition-colors',
                    selected ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-400',
                  )}
                />
                <div>
                  <div
                    className={cn(
                      'text-xs font-medium',
                      selected ? 'text-violet-700 dark:text-violet-300' : 'text-neutral-700 dark:text-neutral-300',
                    )}
                  >
                    {opt.label}
                  </div>
                  <div className="text-[0.625rem] text-neutral-400 mt-0.5">{opt.desc}</div>
                </div>
              </button>
            )
          })}
        </div>
      </Field>

      {/* More info toggle */}
      <button
        type="button"
        onClick={() => setShowMore(!showMore)}
        className="inline-flex items-center gap-1 text-[0.6875rem] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
      >
        {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        更多信息
      </button>

      <AnimatePresence>
        {showMore && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden space-y-3"
          >
            <Field label="描述">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="方法论的简要介绍"
                rows={2}
                className={cn(inputCls, 'resize-none h-auto py-2 leading-relaxed')}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="来源/作者">
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="例如: Clayton Christensen"
                  className={inputCls}
                />
              </Field>
              <Field label="版本">
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="例如: v1.0"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="英文名">
              <input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="例如: 24-Step Product Innovation"
                className={inputCls}
              />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// =============================================================================
// Step 2 — Matrix Editor
// =============================================================================

function MatrixEditor({
  rows,
  setRows,
  cols,
  setCols,
  columnDefs,
  setColumnDefs,
  cellDefs,
  setCellDefs,
}: {
  rows: number
  setRows: (v: number) => void
  cols: number
  setCols: (v: number) => void
  columnDefs: ColumnDef[]
  setColumnDefs: React.Dispatch<React.SetStateAction<ColumnDef[]>>
  cellDefs: CellDef[][]
  setCellDefs: React.Dispatch<React.SetStateAction<CellDef[][]>>
}) {
  function updateColumn(i: number, patch: Partial<ColumnDef>) {
    setColumnDefs((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  function updateCell(r: number, c: number, patch: Partial<CellDef>) {
    setCellDefs((prev) =>
      prev.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? { ...cell, ...patch } : cell)) : row)),
    )
  }

  return (
    <div className="space-y-5">
      {/* Rows & cols */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="行数">
          <input
            type="number"
            min={1}
            max={6}
            value={rows}
            onChange={(e) => setRows(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
            className={inputCls}
          />
        </Field>
        <Field label="列数 (阶段数)">
          <input
            type="number"
            min={1}
            max={8}
            value={cols}
            onChange={(e) => setCols(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Column headers */}
      <Field label="列头 (阶段定义)">
        <div className="space-y-2">
          {columnDefs.map((col, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[0.625rem] text-neutral-400 w-5 text-right font-mono">{i + 1}</span>
              <input
                value={col.name}
                onChange={(e) => updateColumn(i, { name: e.target.value })}
                placeholder={`阶段 ${i + 1}`}
                className={cn(inputCls, 'flex-1')}
              />
              <ColorPicker value={col.color} onChange={(c) => updateColumn(i, { color: c })} />
            </div>
          ))}
        </div>
      </Field>

      {/* Cells grid */}
      <Field label="单元格 (每个步骤)">
        <div className="space-y-3">
          {cellDefs.map((row, r) => (
            <div key={r}>
              {rows > 1 && (
                <div className="text-[0.625rem] text-neutral-400 mb-1 font-mono">第 {r + 1} 行</div>
              )}
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {row.map((cell, c) => {
                  const stepNum = r * cols + c + 1
                  return (
                    <div
                      key={c}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-2 bg-white dark:bg-white/[0.02] space-y-1"
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className="text-[0.5625rem] font-mono rounded px-1 py-0.5 text-white"
                          style={{ backgroundColor: columnDefs[c]?.color || PRESET_COLORS[0] }}
                        >
                          {padStep(stepNum)}
                        </span>
                      </div>
                      <input
                        value={cell.name}
                        onChange={(e) => updateCell(r, c, { name: e.target.value })}
                        placeholder="名称"
                        className="w-full bg-transparent text-xs outline-none text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400"
                      />
                      <input
                        value={cell.tagline}
                        onChange={(e) => updateCell(r, c, { tagline: e.target.value })}
                        placeholder="简述 (可选)"
                        className="w-full bg-transparent text-[0.625rem] outline-none text-neutral-500 placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Field>
    </div>
  )
}

// =============================================================================
// Step 2 — List Editor
// =============================================================================

function ListEditor({
  items,
  setItems,
}: {
  items: ListItemDef[]
  setItems: React.Dispatch<React.SetStateAction<ListItemDef[]>>
}) {
  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: `cat-${Date.now()}`, name: '', color: PRESET_COLORS[prev.length % 6], tagline: '' },
    ])
  }

  function updateItem(i: number, patch: Partial<ListItemDef>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i))
  }

  function moveItem(i: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-2 group">
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => moveItem(i, -1)}
                disabled={i === 0}
                className="p-0.5 text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-20"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => moveItem(i, 1)}
                disabled={i === items.length - 1}
                className="p-0.5 text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-20"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <input
              value={it.name}
              onChange={(e) => updateItem(i, { name: e.target.value })}
              placeholder="分类名称"
              className={cn(inputCls, 'flex-1')}
            />
            <input
              value={it.tagline}
              onChange={(e) => updateItem(i, { tagline: e.target.value })}
              placeholder="描述 (可选)"
              className={cn(inputCls, 'flex-1 hidden sm:block')}
            />
            <ColorPicker value={it.color} onChange={(c) => updateItem(i, { color: c })} />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="p-1 text-neutral-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="inline-flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        添加分类
      </button>
    </div>
  )
}

// =============================================================================
// Step 2 — Tree Editor
// =============================================================================

function TreeEditor({
  roots,
  setRoots,
}: {
  roots: TreeNodeDef[]
  setRoots: React.Dispatch<React.SetStateAction<TreeNodeDef[]>>
}) {
  function addRoot() {
    setRoots((prev) => [
      ...prev,
      { id: `node-${Date.now()}`, name: '', color: PRESET_COLORS[prev.length % 6], children: [] },
    ])
  }

  function updateNode(path: number[], patch: Partial<TreeNodeDef>) {
    setRoots((prev) => deepUpdateNode(prev, path, patch))
  }

  function addChild(path: number[]) {
    setRoots((prev) => deepAddChild(prev, path))
  }

  function removeNode(path: number[]) {
    setRoots((prev) => deepRemoveNode(prev, path))
  }

  return (
    <div className="space-y-3">
      {roots.map((node, i) => (
        <TreeNodeRow
          key={node.id}
          node={node}
          path={[i]}
          depth={0}
          onUpdate={updateNode}
          onAddChild={addChild}
          onRemove={removeNode}
        />
      ))}
      <button
        type="button"
        onClick={addRoot}
        className="inline-flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        添加根节点
      </button>
    </div>
  )
}

function TreeNodeRow({
  node,
  path,
  depth,
  onUpdate,
  onAddChild,
  onRemove,
}: {
  node: TreeNodeDef
  path: number[]
  depth: number
  onUpdate: (path: number[], patch: Partial<TreeNodeDef>) => void
  onAddChild: (path: number[]) => void
  onRemove: (path: number[]) => void
}) {
  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center gap-2 group">
        <input
          value={node.name}
          onChange={(e) => onUpdate(path, { name: e.target.value })}
          placeholder="节点名称"
          className={cn(inputCls, 'flex-1')}
        />
        <ColorPicker value={node.color} onChange={(c) => onUpdate(path, { color: c })} />
        {depth < 2 && (
          <button
            type="button"
            onClick={() => onAddChild(path)}
            title="添加子节点"
            className="p-1 text-neutral-300 hover:text-violet-500 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(path)}
          className="p-1 text-neutral-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {node.children.map((child, i) => (
        <TreeNodeRow
          key={child.id}
          node={child}
          path={[...path, i]}
          depth={depth + 1}
          onUpdate={onUpdate}
          onAddChild={onAddChild}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

// Tree immutable helpers
function deepUpdateNode(nodes: TreeNodeDef[], path: number[], patch: Partial<TreeNodeDef>): TreeNodeDef[] {
  if (path.length === 1) {
    return nodes.map((n, i) => (i === path[0] ? { ...n, ...patch } : n))
  }
  return nodes.map((n, i) =>
    i === path[0] ? { ...n, children: deepUpdateNode(n.children, path.slice(1), patch) } : n,
  )
}

function deepAddChild(nodes: TreeNodeDef[], path: number[]): TreeNodeDef[] {
  if (path.length === 1) {
    return nodes.map((n, i) =>
      i === path[0]
        ? {
            ...n,
            children: [
              ...n.children,
              { id: `node-${Date.now()}`, name: '', color: n.color, children: [] },
            ],
          }
        : n,
    )
  }
  return nodes.map((n, i) =>
    i === path[0] ? { ...n, children: deepAddChild(n.children, path.slice(1)) } : n,
  )
}

function deepRemoveNode(nodes: TreeNodeDef[], path: number[]): TreeNodeDef[] {
  if (path.length === 1) {
    return nodes.filter((_, i) => i !== path[0])
  }
  return nodes.map((n, i) =>
    i === path[0] ? { ...n, children: deepRemoveNode(n.children, path.slice(1)) } : n,
  )
}

// =============================================================================
// Step 3 — Preview
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Step3Preview({ framework }: { framework: any }) {
  const fw = framework as Framework

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{fw.name}</span>
          <span className="text-[0.625rem] font-mono text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            {fw.layoutType}
          </span>
        </div>
        {fw.description && (
          <p className="text-xs text-neutral-500 leading-relaxed">{fw.description}</p>
        )}
        <div className="flex gap-4 text-[0.6875rem] text-neutral-400">
          {fw.source && <span>来源: {fw.source}</span>}
          {fw.version && <span>版本: {fw.version}</span>}
          {fw.nameEn && <span>EN: {fw.nameEn}</span>}
        </div>
      </div>

      {/* Directory structure preview */}
      <Field label="将创建的目录结构">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.02] p-3 font-mono text-[0.6875rem] text-neutral-600 dark:text-neutral-400 space-y-0.5 max-h-48 overflow-y-auto">
          <div className="text-neutral-800 dark:text-neutral-200">data/atoms/{fw.id}/</div>
          {fw.layoutType === 'matrix' &&
            fw.matrix.cells.map((c) => (
              <div key={c.stepNumber} className="pl-4">
                {c.atomCategoryPath.replace(`${fw.id}/`, '')}
              </div>
            ))}
          {fw.layoutType === 'list' &&
            fw.list.categories.map((c) => (
              <div key={c.id} className="pl-4">
                {c.atomCategoryPath.replace(`${fw.id}/`, '')}
              </div>
            ))}
          {fw.layoutType === 'tree' && <TreePathPreview nodes={fw.tree.roots} prefix={fw.id} depth={1} />}
        </div>
      </Field>

      {/* Cell/category count */}
      <div className="text-[0.6875rem] text-neutral-500">
        {fw.layoutType === 'matrix' && `${fw.matrix.cells.length} 个步骤，${fw.matrix.columns} 列 x ${fw.matrix.rows} 行`}
        {fw.layoutType === 'list' && `${fw.list.categories.length} 个分类`}
        {fw.layoutType === 'tree' && `${countTreeNodes(fw.tree.roots)} 个节点`}
      </div>
    </div>
  )
}

function TreePathPreview({
  nodes,
  prefix,
  depth,
}: {
  nodes: FrameworkTreeNode[]
  prefix: string
  depth: number
}) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.id}>
          <div style={{ paddingLeft: depth * 16 }}>
            {n.atomCategoryPath.replace(`${prefix}/`, '')}
          </div>
          {n.children && <TreePathPreview nodes={n.children} prefix={prefix} depth={depth + 1} />}
        </div>
      ))}
    </>
  )
}

function countTreeNodes(nodes: TreeNodeDef[] | FrameworkTreeNode[]): number {
  let count = 0
  for (const n of nodes) {
    count++
    if ('children' in n && n.children) count += countTreeNodes(n.children as any)
  }
  return count
}

// =============================================================================
// Shared UI
// =============================================================================

const inputCls =
  'w-full h-9 px-3 rounded-lg bg-white dark:bg-white/[0.02] border border-neutral-200 dark:border-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-colors'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[0.6875rem] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'w-5 h-5 rounded-full border-2 transition-all',
            value === c ? 'border-neutral-800 dark:border-white scale-110' : 'border-transparent hover:scale-110',
          )}
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}
    </div>
  )
}

export default CreateFrameworkDialog
