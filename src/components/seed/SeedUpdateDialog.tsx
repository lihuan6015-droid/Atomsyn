/**
 * V1.5 · Seed methodology update dialog.
 *
 * Three actions:
 *   - 同步更新 (primary): runs seedApi.sync(), rebuilds index on success
 *   - 稍后再说 (ghost): closes, will re-prompt next launch
 *   - 本次版本不再提醒 (muted rose): persists dismissal for THIS version
 */
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  X,
} from 'lucide-react'
import { indexApi, seedApi } from '@/lib/dataApi'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/useAppStore'
import type { SeedCheckResult } from '@/types'

interface Props {
  open: boolean
  result: SeedCheckResult | null
  onClose: () => void
  onSynced?: () => void
}

export function SeedUpdateDialog({ open, result, onClose, onSynced }: Props) {
  const showToast = useAppStore((s) => s.showToast)
  const setSeedUpdateAvailable = useAppStore((s) => s.setSeedUpdateAvailable)
  const [busy, setBusy] = useState(false)
  const [showFileList, setShowFileList] = useState(false)

  useEffect(() => {
    if (!open) {
      setBusy(false)
      setShowFileList(false)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open || !result) return null

  const diff = result.diff ?? {
    added: [],
    updated: [],
    userModifiedKept: [],
    removedFromSeed: [],
    unchanged: 0,
  }
  const latestNotes = result.changelog?.[0]?.notes ?? []

  async function handleSync() {
    if (busy) return
    setBusy(true)
    try {
      const r = await seedApi.sync()
      await indexApi.rebuild().catch(() => undefined)
      setSeedUpdateAvailable(false)
      showToast(`✓ 已同步 ${r.synced} 个文件,跳过 ${r.skipped} 个用户修改`)
      onSynced?.()
      onClose()
    } catch (e: any) {
      showToast('同步失败：' + (e?.message ?? 'unknown'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDismiss() {
    if (busy || !result) return
    setBusy(true)
    try {
      await seedApi.dismiss(result.seedVersion)
      setSeedUpdateAvailable(false)
      showToast('已跳过此版本提醒')
      onClose()
    } catch (e: any) {
      showToast('操作失败：' + (e?.message ?? 'unknown'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-sm glass motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="seed-update-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-2xl rounded-xl border border-neutral-200/60 dark:border-neutral-800/60',
          'bg-white dark:bg-neutral-950 shadow-2xl',
          'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-neutral-200/60 dark:border-neutral-800/60">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <Download className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="seed-update-title"
              className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2"
            >
              方法论库有新版本
              <span className="text-[0.6875rem] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30">
                {result.installedVersion ?? '—'} → {result.seedVersion}
              </span>
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Atomsyn 内置的方法论库已更新。已修改的本地文件不会被覆盖。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto scrollbar-subtle">
          {/* Changelog */}
          {latestNotes.length > 0 && (
            <section>
              <div className="text-[0.6875rem] uppercase tracking-wider text-neutral-500 mb-2">
                更新内容
              </div>
              <ul className="space-y-1.5 text-xs text-neutral-700 dark:text-neutral-300">
                {latestNotes.map((note, i) => (
                  <li key={i} className="flex gap-2 leading-relaxed">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Diff stats */}
          <section>
            <div className="text-[0.6875rem] uppercase tracking-wider text-neutral-500 mb-2">
              文件变更
            </div>
            <div className="grid grid-cols-4 gap-2">
              <StatCard
                color="emerald"
                label="新增"
                value={diff.added.length}
              />
              <StatCard
                color="violet"
                label="更新"
                value={diff.updated.length}
              />
              <StatCard
                color="amber"
                label="已修改保留"
                value={diff.userModifiedKept.length}
              />
              <StatCard
                color="rose"
                label="已删除"
                value={diff.removedFromSeed.length}
              />
            </div>
          </section>

          {/* File list (collapsible) */}
          <section>
            <button
              type="button"
              onClick={() => setShowFileList((v) => !v)}
              className="w-full flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            >
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 transition-transform',
                  showFileList && 'rotate-180',
                )}
              />
              <FileText className="w-3.5 h-3.5" />
              {showFileList ? '隐藏' : '查看'}文件列表
            </button>
            {showFileList && (
              <div className="mt-3 max-h-[300px] overflow-y-auto scrollbar-subtle space-y-3 rounded-lg border border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/60 dark:bg-white/[0.02] p-3">
                <FileGroup label="新增" color="emerald" files={diff.added} />
                <FileGroup label="更新" color="violet" files={diff.updated} />
                <FileGroup
                  label="已修改保留"
                  color="amber"
                  files={diff.userModifiedKept}
                  hint="本地有改动,不会被覆盖"
                />
                <FileGroup
                  label="种子已删除"
                  color="rose"
                  files={diff.removedFromSeed}
                  hint="保留本地副本,不自动删除"
                />
              </div>
            )}
          </section>

          {diff.userModifiedKept.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.6875rem] text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="leading-relaxed">
                {diff.userModifiedKept.length} 个文件已被你本地修改,同步时将保留你的版本。
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={busy}
            className="h-8 px-3 rounded-lg text-xs font-medium border border-rose-300/50 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
          >
            本次版本不再提醒
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 px-3 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            稍后再说
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={busy}
            className="h-8 px-3 rounded-lg text-xs font-medium border border-violet-500 bg-violet-500 text-white hover:bg-violet-600 hover:border-violet-600 inline-flex items-center gap-1.5 shadow-sm shadow-violet-500/20 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            同步更新
          </button>
        </div>
      </div>
    </div>
  )
}

const COLORS = {
  emerald:
    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
  violet:
    'bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/30',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30',
} as const

function StatCard({
  color,
  label,
  value,
}: {
  color: keyof typeof COLORS
  label: string
  value: number
}) {
  return (
    <div
      className={cn(
        'rounded-lg ring-1 px-3 py-2.5 text-center',
        COLORS[color],
      )}
    >
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[0.625rem] uppercase tracking-wider opacity-80 mt-0.5">
        {label}
      </div>
    </div>
  )
}

function FileGroup({
  label,
  color,
  files,
  hint,
}: {
  label: string
  color: keyof typeof COLORS
  files: string[]
  hint?: string
}) {
  if (files.length === 0) return null
  return (
    <div>
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[0.625rem] font-medium ring-1',
          COLORS[color],
        )}
      >
        {label} · {files.length}
      </div>
      {hint && (
        <span className="ml-2 text-[0.625rem] text-neutral-500">{hint}</span>
      )}
      <ul className="mt-1.5 space-y-0.5 font-mono text-[0.625rem] text-neutral-600 dark:text-neutral-400">
        {files.map((f) => (
          <li key={f} className="truncate" title={f}>
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SeedUpdateDialog
