/**
 * EditFrameworkDialog · V2.1
 *
 * Two-tab dialog for editing an existing Framework:
 *   Tab 1: Basic info (name, description, source, version, nameEn)
 *   Tab 2: Structure editing (matrix / list / tree)
 *
 * Triggered by `atomsyn:edit-framework` custom event with detail { frameworkId }.
 * Mounted at App level (AppShell).
 *
 * Cascade-deletes atoms when a cell/category/node is removed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Grid3X3,
  List,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { frameworksApi, atomsApi } from '@/lib/dataApi'
import type {
  Framework,
  FrameworkCell,
  FrameworkListCategory,
  FrameworkTreeNode,
  StageColumnHeader,
  AtomAny,
} from '@/types'
import {
  isMatrixFramework,
  isListFramework,
  isTreeFramework,
  isMethodologyAtom,
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

const TAB_LABELS = ['基本信息', '结构编辑']

const LAYOUT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  matrix: Grid3X3,
  list: List,
  tree: GitBranch,
}

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

// ─── Shared UI components ───────────────────────────────────────────────────────

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

// ─── Inline delete confirmation ─────────────────────────────────────────────────

function DeleteConfirm({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 mt-1">
        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
        <span className="text-[0.6875rem] text-rose-700 dark:text-rose-300 flex-1">{message}</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-[0.6875rem] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 px-2 py-1 rounded transition-colors"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="text-[0.6875rem] text-white bg-rose-500 hover:bg-rose-600 px-2.5 py-1 rounded font-medium transition-colors"
        >
          确认删除
        </button>
      </div>
    </motion.div>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function EditFrameworkDialog() {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [framework, setFramework] = useState<Framework | null>(null)
  const [allAtoms, setAllAtoms] = useState<AtomAny[]>([])

  // Basic info state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [source, setSource] = useState('')
  const [version, setVersion] = useState('')
  const [nameEn, setNameEn] = useState('')

  // Matrix state
  const [matrixRows, setMatrixRows] = useState(1)
  const [matrixColumnHeaders, setMatrixColumnHeaders] = useState<StageColumnHeader[]>([])
  const [matrixCells, setMatrixCells] = useState<FrameworkCell[]>([])

  // List state
  const [listCategories, setListCategories] = useState<FrameworkListCategory[]>([])

  // Tree state
  const [treeRoots, setTreeRoots] = useState<FrameworkTreeNode[]>([])

  // Atoms pending deletion (collected during editing, executed on save)
  const [atomsToDelete, setAtomsToDelete] = useState<string[]>([])

  // ─ Listen for open event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { frameworkId: string }
      if (!detail?.frameworkId) return
      loadFramework(detail.frameworkId)
    }
    window.addEventListener('atomsyn:edit-framework', handler)
    return () => window.removeEventListener('atomsyn:edit-framework', handler)
  }, [])

  async function loadFramework(id: string) {
    if (!id) return
    try {
      const [fw, atoms] = await Promise.all([
        frameworksApi.get(id),
        atomsApi.list(),
      ])
      setFramework(fw)
      setAllAtoms(atoms as AtomAny[])
      setAtomsToDelete([])
      setError(null)
      setActiveTab(0)
      setSaving(false)

      // Populate basic info
      setName(fw.name)
      setDescription(fw.description || '')
      setSource(fw.source || '')
      setVersion(fw.version || '')
      setNameEn(fw.nameEn || '')

      // Populate structure
      if (isMatrixFramework(fw)) {
        setMatrixRows(fw.matrix.rows)
        setMatrixColumnHeaders([...fw.matrix.columnHeaders])
        setMatrixCells([...fw.matrix.cells])
      } else if (isListFramework(fw)) {
        setListCategories([...fw.list.categories])
      } else if (isTreeFramework(fw)) {
        setTreeRoots(JSON.parse(JSON.stringify(fw.tree.roots ?? [])))
      }

      setOpen(true)
    } catch (err) {
      console.error('Failed to load framework for editing', err)
    }
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

  // ─ Atom count helpers
  const getAtomCountForCell = useCallback(
    (cellId: number | string) => {
      if (!framework) return 0
      return allAtoms.filter(
        (a) => isMethodologyAtom(a) && a.frameworkId === framework.id && a.cellId === cellId,
      ).length
    },
    [allAtoms, framework],
  )

  const getAtomIdsForCell = useCallback(
    (cellId: number | string) => {
      if (!framework) return []
      return allAtoms
        .filter(
          (a) => isMethodologyAtom(a) && a.frameworkId === framework.id && a.cellId === cellId,
        )
        .map((a) => a.id)
    },
    [allAtoms, framework],
  )

  const getAtomCountForPath = useCallback(
    (path: string) => {
      if (!framework) return 0
      return allAtoms.filter(
        (a) =>
          isMethodologyAtom(a) &&
          a.frameworkId === framework.id &&
          // Match atoms whose category path starts with the given path
          allAtoms.some(() => {
            // Look up the cell's atomCategoryPath
            if (isMatrixFramework(framework)) {
              const cell = framework.matrix.cells.find((c) => c.stepNumber === a.cellId)
              return cell?.atomCategoryPath?.startsWith(path)
            }
            if (isListFramework(framework)) {
              const cat = framework.list.categories.find((c) => c.id === a.cellId)
              return cat?.atomCategoryPath?.startsWith(path)
            }
            return false
          }),
      ).length
    },
    [allAtoms, framework],
  )

  // ─ Build updated Framework
  const buildUpdatedFramework = useCallback((): Framework | null => {
    if (!framework) return null
    const now = new Date().toISOString()
    const base = {
      id: framework.id,
      schemaVersion: 1 as const,
      name: name.trim(),
      nameEn: nameEn.trim() || undefined,
      description: description.trim() || undefined,
      source: source.trim() || undefined,
      version: version.trim() || undefined,
      createdAt: framework.createdAt,
      updatedAt: now,
    }

    if (isMatrixFramework(framework)) {
      return {
        ...base,
        layoutType: 'matrix' as const,
        matrix: {
          rows: matrixRows,
          columns: matrixColumnHeaders.length,
          columnHeaders: matrixColumnHeaders,
          cells: matrixCells,
        },
      }
    }

    if (isListFramework(framework)) {
      return {
        ...base,
        layoutType: 'list' as const,
        list: { categories: listCategories },
      }
    }

    if (isTreeFramework(framework)) {
      return {
        ...base,
        layoutType: 'tree' as const,
        tree: { roots: treeRoots },
      }
    }

    return null
  }, [
    framework,
    name,
    nameEn,
    description,
    source,
    version,
    matrixRows,
    matrixColumnHeaders,
    matrixCells,
    listCategories,
    treeRoots,
  ])

  // ─ Submit
  async function handleSubmit() {
    if (saving || !framework) return
    setSaving(true)
    setError(null)
    try {
      // 1. Delete atoms that were removed during editing
      for (const atomId of atomsToDelete) {
        try {
          await atomsApi.remove(atomId)
        } catch {
          // Atom may already be gone, continue
        }
      }

      // 2. Save updated framework
      const updated = buildUpdatedFramework()
      if (!updated) throw new Error('Failed to build framework')
      await frameworksApi.update(framework.id, updated)

      setOpen(false)
      window.location.reload()
    } catch (err: any) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // ─ Validation
  const canSave = useMemo(() => {
    if (!name.trim()) return false
    if (!framework) return false
    if (isMatrixFramework(framework)) {
      return matrixColumnHeaders.length > 0 && matrixColumnHeaders.every((c) => c.name.trim())
    }
    if (isListFramework(framework)) {
      return listCategories.length > 0 && listCategories.every((c) => c.name.trim())
    }
    if (isTreeFramework(framework)) {
      return treeRoots.length > 0 && treeRoots.every((n) => n.name.trim())
    }
    return true
  }, [name, framework, matrixColumnHeaders, listCategories, treeRoots])

  if (!open || !framework) return null

  const LayoutIcon = LAYOUT_ICON[framework.layoutType] || Grid3X3

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
          <div className="flex items-center gap-2">
            <LayoutIcon className="w-4 h-4 text-violet-500" />
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                编辑方法库
              </h2>
              <div className="text-[0.6875rem] text-neutral-500 mt-0.5">{framework.name}</div>
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

        {/* Tab bar */}
        <div className="flex gap-0 px-5 border-b border-neutral-200/60 dark:border-neutral-800/60">
          {TAB_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveTab(i)}
              className={cn(
                'px-4 py-2.5 text-xs font-medium transition-colors relative',
                activeTab === i
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300',
              )}
            >
              {label}
              {activeTab === i && (
                <motion.div
                  layoutId="edit-fw-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 0 && (
                <BasicInfoTab
                  name={name}
                  setName={setName}
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
              {activeTab === 1 && isMatrixFramework(framework) && (
                <MatrixStructureEditor
                  rows={matrixRows}
                  setRows={setMatrixRows}
                  columnHeaders={matrixColumnHeaders}
                  setColumnHeaders={setMatrixColumnHeaders}
                  cells={matrixCells}
                  setCells={setMatrixCells}
                  frameworkId={framework.id}
                  getAtomCountForCell={getAtomCountForCell}
                  getAtomIdsForCell={getAtomIdsForCell}
                  atomsToDelete={atomsToDelete}
                  setAtomsToDelete={setAtomsToDelete}
                />
              )}
              {activeTab === 1 && isListFramework(framework) && (
                <ListStructureEditor
                  categories={listCategories}
                  setCategories={setListCategories}
                  frameworkId={framework.id}
                  getAtomCountForCell={getAtomCountForCell}
                  getAtomIdsForCell={getAtomIdsForCell}
                  atomsToDelete={atomsToDelete}
                  setAtomsToDelete={setAtomsToDelete}
                />
              )}
              {activeTab === 1 && isTreeFramework(framework) && (
                <TreeStructureEditor
                  roots={treeRoots}
                  setRoots={setTreeRoots}
                  frameworkId={framework.id}
                  getAtomCountForCell={getAtomCountForCell}
                  getAtomIdsForCell={getAtomIdsForCell}
                  atomsToDelete={atomsToDelete}
                  setAtomsToDelete={setAtomsToDelete}
                />
              )}
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
          <div className="text-[0.6875rem] text-neutral-400">
            {atomsToDelete.length > 0 && (
              <span className="text-rose-500">
                {atomsToDelete.length} 个方法论将被删除
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !canSave}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Tab 1: Basic Info
// =============================================================================

function BasicInfoTab({
  name,
  setName,
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
    <div className="space-y-4">
      <Field label="名称" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="方法库名称"
          maxLength={80}
          autoFocus
          className={inputCls}
        />
      </Field>
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
    </div>
  )
}

// =============================================================================
// Tab 2: Matrix Structure Editor
// =============================================================================

function MatrixStructureEditor({
  rows,
  setRows,
  columnHeaders,
  setColumnHeaders,
  cells,
  setCells,
  frameworkId,
  getAtomCountForCell,
  getAtomIdsForCell,
  atomsToDelete,
  setAtomsToDelete,
}: {
  rows: number
  setRows: (v: number) => void
  columnHeaders: StageColumnHeader[]
  setColumnHeaders: React.Dispatch<React.SetStateAction<StageColumnHeader[]>>
  cells: FrameworkCell[]
  setCells: React.Dispatch<React.SetStateAction<FrameworkCell[]>>
  frameworkId: string
  getAtomCountForCell: (cellId: number | string) => number
  getAtomIdsForCell: (cellId: number | string) => string[]
  atomsToDelete: string[]
  setAtomsToDelete: React.Dispatch<React.SetStateAction<string[]>>
}) {
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'column'; index: number; atomCount: number; atomIds: string[] } | null>(null)
  const [deleteRowConfirm, setDeleteRowConfirm] = useState<{ row: number; atomCount: number; atomIds: string[] } | null>(null)
  const [deleteCellConfirm, setDeleteCellConfirm] = useState<{ stepNumber: number; atomCount: number; atomIds: string[] } | null>(null)

  function updateColumnHeader(i: number, patch: Partial<StageColumnHeader>) {
    setColumnHeaders((prev) => prev.map((h, idx) => (idx === i ? { ...h, ...patch } : h)))
  }

  function updateCell(stepNumber: number, patch: Partial<FrameworkCell>) {
    setCells((prev) => prev.map((c) => (c.stepNumber === stepNumber ? { ...c, ...patch } : c)))
  }

  function handleAddColumn() {
    const newColId = `col-${Date.now()}`
    const newColor = PRESET_COLORS[columnHeaders.length % 6]
    const newHeader: StageColumnHeader = {
      id: newColId,
      name: `阶段 ${columnHeaders.length + 1}`,
      color: newColor,
    }
    setColumnHeaders((prev) => [...prev, newHeader])
    // New column: add empty-name cells for each existing row
    const maxStep = cells.reduce((max, c) => Math.max(max, c.stepNumber), 0)
    const newCells: FrameworkCell[] = []
    for (let r = 0; r < rows; r++) {
      const stepNum = maxStep + r + 1
      newCells.push({
        stepNumber: stepNum,
        column: newColId,
        row: r,
        name: '',
        nameEn: '',
        atomCategoryPath: `${frameworkId}/${padStep(stepNum)}-${slugify(newHeader.name)}/`,
      })
    }
    setCells((prev) => [...prev, ...newCells])
  }

  function requestDeleteColumn(colIndex: number) {
    const colId = columnHeaders[colIndex].id
    const colCells = cells.filter((c) => c.column === colId)
    let totalAtomCount = 0
    const allAtomIds: string[] = []
    for (const cell of colCells) {
      const ids = getAtomIdsForCell(cell.stepNumber)
      totalAtomCount += ids.length
      allAtomIds.push(...ids)
    }
    if (totalAtomCount > 0) {
      setDeleteConfirm({ type: 'column', index: colIndex, atomCount: totalAtomCount, atomIds: allAtomIds })
    } else {
      executeDeleteColumn(colIndex, [])
    }
  }

  function executeDeleteColumn(colIndex: number, atomIds: string[]) {
    const colId = columnHeaders[colIndex].id
    setColumnHeaders((prev) => prev.filter((_, i) => i !== colIndex))
    setCells((prev) => prev.filter((c) => c.column !== colId))
    if (atomIds.length > 0) {
      setAtomsToDelete((prev) => [...prev, ...atomIds])
    }
    setDeleteConfirm(null)
  }

  function handleAddRow() {
    const newRow = rows
    setRows(rows + 1)
    // New row: create empty-name cells for each column
    const maxStep = cells.reduce((max, c) => Math.max(max, c.stepNumber), 0)
    const newCells: FrameworkCell[] = columnHeaders.map((header, i) => {
      const stepNum = maxStep + i + 1
      return {
        stepNumber: stepNum,
        column: header.id,
        row: newRow,
        name: '',
        nameEn: '',
        atomCategoryPath: `${frameworkId}/${padStep(stepNum)}/`,
      }
    })
    setCells((prev) => [...prev, ...newCells])
  }

  function requestDeleteRow(rowIndex: number) {
    const rowCells = cells.filter((c) => c.row === rowIndex)
    let totalAtomCount = 0
    const allAtomIds: string[] = []
    for (const cell of rowCells) {
      const ids = getAtomIdsForCell(cell.stepNumber)
      totalAtomCount += ids.length
      allAtomIds.push(...ids)
    }
    if (totalAtomCount > 0) {
      setDeleteRowConfirm({ row: rowIndex, atomCount: totalAtomCount, atomIds: allAtomIds })
    } else {
      executeDeleteRow(rowIndex, [])
    }
  }

  function executeDeleteRow(rowIndex: number, atomIds: string[]) {
    setCells((prev) => {
      const remaining = prev.filter((c) => c.row !== rowIndex)
      // Re-number rows for cells below the deleted row
      return remaining.map((c) => (c.row > rowIndex ? { ...c, row: c.row - 1 } : c))
    })
    setRows(rows - 1)
    if (atomIds.length > 0) {
      setAtomsToDelete((prev) => [...prev, ...atomIds])
    }
    setDeleteRowConfirm(null)
  }

  // Single cell operations
  function requestDeleteCell(cell: FrameworkCell) {
    const atomCount = getAtomCountForCell(cell.stepNumber)
    if (atomCount > 0) {
      const atomIds = getAtomIdsForCell(cell.stepNumber)
      setDeleteCellConfirm({ stepNumber: cell.stepNumber, atomCount, atomIds })
    } else {
      executeDeleteCell(cell.stepNumber, [])
    }
  }

  function executeDeleteCell(stepNumber: number, atomIds: string[]) {
    setCells((prev) => prev.filter((c) => c.stepNumber !== stepNumber))
    if (atomIds.length > 0) {
      setAtomsToDelete((prev) => [...prev, ...atomIds])
    }
    setDeleteCellConfirm(null)
  }

  function addCellAt(rowIdx: number, colId: string) {
    const row1based = rowIdx + 1
    const maxStep = cells.reduce((max, c) => Math.max(max, c.stepNumber), 0)
    const stepNum = maxStep + 1
    setCells((prev) => [
      ...prev,
      {
        stepNumber: stepNum,
        column: colId,
        row: row1based,
        name: '',
        nameEn: '',
        atomCategoryPath: `${frameworkId}/${padStep(stepNum)}`,
      },
    ])
  }

  // Find cell at a given (0-based rowIdx, column) position
  function getCellAt(rowIdx: number, colId: string): FrameworkCell | undefined {
    const row1based = rowIdx + 1
    return cells.find((c) => c.row === row1based && c.column === colId)
  }

  return (
    <div className="space-y-5">
      {/* Column headers editor */}
      <Field label="列头 (阶段定义)">
        <div className="space-y-2">
          {columnHeaders.map((header, i) => (
            <div key={header.id}>
              <div className="flex items-center gap-2 group">
                <span className="text-[0.625rem] text-neutral-400 w-5 text-right font-mono">{i + 1}</span>
                <input
                  value={header.name}
                  onChange={(e) => updateColumnHeader(i, { name: e.target.value })}
                  className={cn(inputCls, 'flex-1')}
                />
                <ColorPicker
                  value={header.color}
                  onChange={(c) => updateColumnHeader(i, { color: c })}
                />
                {columnHeaders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => requestDeleteColumn(i)}
                    className="p-1 text-neutral-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="删除此列"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <AnimatePresence>
                {deleteConfirm?.type === 'column' && deleteConfirm.index === i && (
                  <DeleteConfirm
                    message={`该列下有 ${deleteConfirm.atomCount} 个方法论将被一同删除`}
                    onConfirm={() => executeDeleteColumn(deleteConfirm.index, deleteConfirm.atomIds)}
                    onCancel={() => setDeleteConfirm(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleAddColumn}
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          添加列
        </button>
      </Field>

      {/* Grid-based cell editor */}
      <Field label="单元格网格">
        <div className="space-y-2">
          {/* Column header labels row */}
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `40px repeat(${columnHeaders.length}, 1fr)` }}
          >
            <div />
            {columnHeaders.map((col) => (
              <div
                key={col.id}
                className="text-center text-[0.6875rem] font-medium truncate px-1 py-1 rounded"
                style={{ color: col.color }}
              >
                {col.name}
              </div>
            ))}
          </div>

          {/* Cell rows */}
          {Array.from({ length: rows }, (_, rowIdx) => (
            <div key={rowIdx}>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `40px repeat(${columnHeaders.length}, 1fr)` }}
              >
                {/* Row label */}
                <div className="flex items-center justify-center text-[0.625rem] text-neutral-400 font-mono">
                  {rowIdx + 1}
                </div>

                {/* Cells for this row */}
                {columnHeaders.map((col) => {
                  const cell = getCellAt(rowIdx, col.id)
                  if (cell) {
                    const atomCount = getAtomCountForCell(cell.stepNumber)
                    const showCellConfirm = deleteCellConfirm?.stepNumber === cell.stepNumber
                    return (
                      <div key={`${rowIdx}-${col.id}`}>
                        <div
                          className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-2 bg-white dark:bg-white/[0.02] space-y-1 group/cell relative"
                        >
                          {/* Header: step badge + atom count + delete */}
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={cell.stepNumber}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, '')
                                const val = raw === '' ? 0 : parseInt(raw)
                                updateCell(cell.stepNumber, { stepNumber: val })
                              }}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value) || 1
                                updateCell(cell.stepNumber, { stepNumber: Math.max(1, val) })
                              }}
                              className="w-10 h-5 text-center text-[0.5625rem] font-mono font-bold rounded px-1 py-0.5 text-white border-0 outline-none focus:ring-1 focus:ring-white/40"
                              style={{ backgroundColor: col.color }}
                              title="编辑步骤编号"
                            />
                            {atomCount > 0 && (
                              <span className="text-[0.5625rem] text-neutral-400 font-mono">{atomCount} atom</span>
                            )}
                            <button
                              type="button"
                              onClick={() => requestDeleteCell(cell)}
                              className="ml-auto p-0.5 text-neutral-300 hover:text-rose-500 transition-colors opacity-0 group-hover/cell:opacity-100"
                              title="删除此单元格"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <input
                            value={cell.name}
                            onChange={(e) => updateCell(cell.stepNumber, { name: e.target.value })}
                            placeholder="输入名称"
                            className="w-full bg-transparent text-xs outline-none text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400"
                          />
                          <input
                            value={cell.tagline || ''}
                            onChange={(e) => updateCell(cell.stepNumber, { tagline: e.target.value })}
                            placeholder="简述 (可选)"
                            className="w-full bg-transparent text-[0.625rem] outline-none text-neutral-500 placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
                          />
                        </div>
                        {/* Inline delete confirmation for this cell */}
                        <AnimatePresence>
                          {showCellConfirm && (
                            <DeleteConfirm
                              message={`该单元格下有 ${deleteCellConfirm.atomCount} 个方法论将被一同删除`}
                              onConfirm={() => executeDeleteCell(deleteCellConfirm.stepNumber, deleteCellConfirm.atomIds)}
                              onCancel={() => setDeleteCellConfirm(null)}
                            />
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  }
                  // Empty slot
                  return (
                    <div key={`${rowIdx}-${col.id}`} className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => addCellAt(rowIdx, col.id)}
                        className="w-full h-full min-h-[60px] rounded-lg border-2 border-dashed border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-300 dark:text-neutral-600 hover:border-violet-400 dark:hover:border-violet-600 hover:text-violet-400 dark:hover:text-violet-500 transition-colors"
                        title="在此位置创建单元格"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Add / delete row buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
            >
              <Plus className="w-3 h-3" />
              添加行
            </button>
            {rows > 1 && (
              <button
                type="button"
                onClick={() => requestDeleteRow(rows - 1)}
                className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-rose-500 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                删除末行
              </button>
            )}
          </div>
          <AnimatePresence>
            {deleteRowConfirm && (
              <DeleteConfirm
                message={`第 ${deleteRowConfirm.row + 1} 行下有 ${deleteRowConfirm.atomCount} 个方法论将被一同删除`}
                onConfirm={() => executeDeleteRow(deleteRowConfirm.row, deleteRowConfirm.atomIds)}
                onCancel={() => setDeleteRowConfirm(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </Field>
    </div>
  )
}

// =============================================================================
// Tab 2: List Structure Editor
// =============================================================================

function ListStructureEditor({
  categories,
  setCategories,
  frameworkId,
  getAtomCountForCell,
  getAtomIdsForCell,
  atomsToDelete,
  setAtomsToDelete,
}: {
  categories: FrameworkListCategory[]
  setCategories: React.Dispatch<React.SetStateAction<FrameworkListCategory[]>>
  frameworkId: string
  getAtomCountForCell: (cellId: number | string) => number
  getAtomIdsForCell: (cellId: number | string) => string[]
  atomsToDelete: string[]
  setAtomsToDelete: React.Dispatch<React.SetStateAction<string[]>>
}) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  function addCategory() {
    const id = `cat-${Date.now()}`
    setCategories((prev) => [
      ...prev,
      {
        id,
        name: '',
        color: PRESET_COLORS[prev.length % 6],
        tagline: '',
        atomCategoryPath: `${frameworkId}/${id}/`,
      },
    ])
  }

  function updateCategory(i: number, patch: Partial<FrameworkListCategory>) {
    setCategories((prev) =>
      prev.map((c, idx) => {
        if (idx !== i) return c
        const updated = { ...c, ...patch }
        // Sync atomCategoryPath if name changed
        if (patch.name !== undefined) {
          updated.atomCategoryPath = `${frameworkId}/${slugify(patch.name) || c.id}/`
        }
        return updated
      }),
    )
  }

  function requestDeleteCategory(i: number) {
    const cat = categories[i]
    const atomCount = getAtomCountForCell(cat.id)
    if (atomCount > 0) {
      setDeleteConfirmId(cat.id)
    } else {
      executeDeleteCategory(i, [])
    }
  }

  function executeDeleteCategory(i: number, atomIds: string[]) {
    setCategories((prev) => prev.filter((_, idx) => idx !== i))
    if (atomIds.length > 0) {
      setAtomsToDelete((prev) => [...prev, ...atomIds])
    }
    setDeleteConfirmId(null)
  }

  function moveCategory(i: number, dir: -1 | 1) {
    setCategories((prev) => {
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
        {categories.map((cat, i) => {
          const atomCount = getAtomCountForCell(cat.id)
          return (
            <div key={cat.id}>
              <div className="flex items-center gap-2 group">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveCategory(i, -1)}
                    disabled={i === 0}
                    className="p-0.5 text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-20"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCategory(i, 1)}
                    disabled={i === categories.length - 1}
                    className="p-0.5 text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-20"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <input
                  value={cat.name}
                  onChange={(e) => updateCategory(i, { name: e.target.value })}
                  placeholder="分类名称"
                  className={cn(inputCls, 'flex-1')}
                />
                <input
                  value={cat.tagline || ''}
                  onChange={(e) => updateCategory(i, { tagline: e.target.value })}
                  placeholder="描述 (可选)"
                  className={cn(inputCls, 'flex-1 hidden sm:block')}
                />
                <ColorPicker
                  value={cat.color}
                  onChange={(c) => updateCategory(i, { color: c })}
                />
                {atomCount > 0 && (
                  <span className="text-[0.625rem] text-neutral-400 font-mono shrink-0">{atomCount}</span>
                )}
                <button
                  type="button"
                  onClick={() => requestDeleteCategory(i)}
                  className="p-1 text-neutral-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <AnimatePresence>
                {deleteConfirmId === cat.id && (
                  <DeleteConfirm
                    message={`该分类下有 ${atomCount} 个方法论将被一同删除`}
                    onConfirm={() => executeDeleteCategory(i, getAtomIdsForCell(cat.id))}
                    onCancel={() => setDeleteConfirmId(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        onClick={addCategory}
        className="inline-flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        添加分类
      </button>
    </div>
  )
}

// =============================================================================
// Tab 2: Tree Structure Editor
// =============================================================================

function TreeStructureEditor({
  roots,
  setRoots,
  frameworkId,
  getAtomCountForCell,
  getAtomIdsForCell,
  atomsToDelete,
  setAtomsToDelete,
}: {
  roots: FrameworkTreeNode[]
  setRoots: React.Dispatch<React.SetStateAction<FrameworkTreeNode[]>>
  frameworkId: string
  getAtomCountForCell: (cellId: number | string) => number
  getAtomIdsForCell: (cellId: number | string) => string[]
  atomsToDelete: string[]
  setAtomsToDelete: React.Dispatch<React.SetStateAction<string[]>>
}) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  function addRoot() {
    const id = `node-${Date.now()}`
    setRoots((prev) => [
      ...prev,
      {
        id,
        name: '',
        color: PRESET_COLORS[prev.length % 6],
        atomCategoryPath: `${frameworkId}/${id}/`,
      },
    ])
  }

  function updateNode(path: number[], patch: Partial<FrameworkTreeNode>) {
    setRoots((prev) => deepUpdateTreeNode(prev, path, patch, frameworkId))
  }

  function addChild(path: number[]) {
    setRoots((prev) => deepAddTreeChild(prev, path, frameworkId))
  }

  function collectNodeAtomIds(node: FrameworkTreeNode): string[] {
    const ids = getAtomIdsForCell(node.id)
    if (node.children) {
      for (const child of node.children) {
        ids.push(...collectNodeAtomIds(child))
      }
    }
    return ids
  }

  function collectNodeAtomCount(node: FrameworkTreeNode): number {
    let count = getAtomCountForCell(node.id)
    if (node.children) {
      for (const child of node.children) {
        count += collectNodeAtomCount(child)
      }
    }
    return count
  }

  function getNodeByPath(path: number[]): FrameworkTreeNode | null {
    let nodes = roots
    for (let i = 0; i < path.length; i++) {
      const node = nodes[path[i]]
      if (!node) return null
      if (i === path.length - 1) return node
      nodes = node.children || []
    }
    return null
  }

  function requestRemoveNode(path: number[]) {
    const node = getNodeByPath(path)
    if (!node) return
    const atomCount = collectNodeAtomCount(node)
    if (atomCount > 0) {
      setDeleteConfirmId(node.id)
    } else {
      executeRemoveNode(path, [])
    }
  }

  function executeRemoveNode(path: number[], atomIds: string[]) {
    setRoots((prev) => deepRemoveTreeNode(prev, path))
    if (atomIds.length > 0) {
      setAtomsToDelete((prev) => [...prev, ...atomIds])
    }
    setDeleteConfirmId(null)
  }

  return (
    <div className="space-y-3">
      {roots.map((node, i) => (
        <TreeEditNodeRow
          key={node.id}
          node={node}
          path={[i]}
          depth={0}
          onUpdate={updateNode}
          onAddChild={addChild}
          onRequestRemove={requestRemoveNode}
          onExecuteRemove={executeRemoveNode}
          deleteConfirmId={deleteConfirmId}
          setDeleteConfirmId={setDeleteConfirmId}
          getAtomCountForCell={getAtomCountForCell}
          getAtomIdsForCell={getAtomIdsForCell}
          collectNodeAtomIds={collectNodeAtomIds}
          collectNodeAtomCount={collectNodeAtomCount}
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

function TreeEditNodeRow({
  node,
  path,
  depth,
  onUpdate,
  onAddChild,
  onRequestRemove,
  onExecuteRemove,
  deleteConfirmId,
  setDeleteConfirmId,
  getAtomCountForCell,
  getAtomIdsForCell,
  collectNodeAtomIds,
  collectNodeAtomCount,
}: {
  node: FrameworkTreeNode
  path: number[]
  depth: number
  onUpdate: (path: number[], patch: Partial<FrameworkTreeNode>) => void
  onAddChild: (path: number[]) => void
  onRequestRemove: (path: number[]) => void
  onExecuteRemove: (path: number[], atomIds: string[]) => void
  deleteConfirmId: string | null
  setDeleteConfirmId: (id: string | null) => void
  getAtomCountForCell: (cellId: number | string) => number
  getAtomIdsForCell: (cellId: number | string) => string[]
  collectNodeAtomIds: (node: FrameworkTreeNode) => string[]
  collectNodeAtomCount: (node: FrameworkTreeNode) => number
}) {
  const atomCount = collectNodeAtomCount(node)
  const showConfirm = deleteConfirmId === node.id

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center gap-2 group">
        <input
          value={node.name}
          onChange={(e) => onUpdate(path, { name: e.target.value })}
          placeholder="节点名称"
          className={cn(inputCls, 'flex-1')}
        />
        <ColorPicker
          value={node.color || PRESET_COLORS[0]}
          onChange={(c) => onUpdate(path, { color: c })}
        />
        {atomCount > 0 && (
          <span className="text-[0.625rem] text-neutral-400 font-mono shrink-0">{atomCount}</span>
        )}
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
          onClick={() => onRequestRemove(path)}
          className="p-1 text-neutral-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <AnimatePresence>
        {showConfirm && (
          <DeleteConfirm
            message={`该节点及子节点下有 ${atomCount} 个方法论将被一同删除`}
            onConfirm={() => onExecuteRemove(path, collectNodeAtomIds(node))}
            onCancel={() => setDeleteConfirmId(null)}
          />
        )}
      </AnimatePresence>
      {node.children?.map((child, i) => (
        <TreeEditNodeRow
          key={child.id}
          node={child}
          path={[...path, i]}
          depth={depth + 1}
          onUpdate={onUpdate}
          onAddChild={onAddChild}
          onRequestRemove={onRequestRemove}
          onExecuteRemove={onExecuteRemove}
          deleteConfirmId={deleteConfirmId}
          setDeleteConfirmId={setDeleteConfirmId}
          getAtomCountForCell={getAtomCountForCell}
          getAtomIdsForCell={getAtomIdsForCell}
          collectNodeAtomIds={collectNodeAtomIds}
          collectNodeAtomCount={collectNodeAtomCount}
        />
      ))}
    </div>
  )
}

// Tree immutable helpers
function deepUpdateTreeNode(
  nodes: FrameworkTreeNode[],
  path: number[],
  patch: Partial<FrameworkTreeNode>,
  frameworkId: string,
): FrameworkTreeNode[] {
  if (path.length === 1) {
    return nodes.map((n, i) => {
      if (i !== path[0]) return n
      const updated = { ...n, ...patch }
      if (patch.name !== undefined) {
        updated.atomCategoryPath = `${frameworkId}/${slugify(patch.name) || n.id}/`
      }
      return updated
    })
  }
  return nodes.map((n, i) =>
    i === path[0]
      ? { ...n, children: deepUpdateTreeNode(n.children || [], path.slice(1), patch, frameworkId) }
      : n,
  )
}

function deepAddTreeChild(
  nodes: FrameworkTreeNode[],
  path: number[],
  frameworkId: string,
): FrameworkTreeNode[] {
  if (path.length === 1) {
    return nodes.map((n, i) =>
      i === path[0]
        ? {
            ...n,
            children: [
              ...(n.children || []),
              {
                id: `node-${Date.now()}`,
                name: '',
                color: n.color,
                atomCategoryPath: `${frameworkId}/${n.id}/node-${Date.now()}/`,
              },
            ],
          }
        : n,
    )
  }
  return nodes.map((n, i) =>
    i === path[0]
      ? { ...n, children: deepAddTreeChild(n.children || [], path.slice(1), frameworkId) }
      : n,
  )
}

function deepRemoveTreeNode(nodes: FrameworkTreeNode[], path: number[]): FrameworkTreeNode[] {
  if (path.length === 1) {
    return nodes.filter((_, i) => i !== path[0])
  }
  return nodes.map((n, i) =>
    i === path[0]
      ? { ...n, children: deepRemoveTreeNode(n.children || [], path.slice(1)) }
      : n,
  )
}

export default EditFrameworkDialog
