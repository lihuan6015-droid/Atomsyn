/**
 * V2.0 M0 · "搬个新家 / Moving Day" migration dialog.
 *
 * Shown ONCE on first launch after the `ccl-atlas` → `atomsyn` rename,
 * when the Rust-side `legacy_data_dir_check` detects the old data folder
 * at `~/Library/Application Support/ccl-atlas/` (macOS) or equivalents.
 *
 * Copy source of truth: `docs/plans/v2.0-m0-migration-copy.md`.
 * This component intentionally never renders in Vite dev / web mode
 * (isTauri() returns false), and the Rust command short-circuits when
 * `ATOMSYN_DEV_DATA_DIR` is set.
 *
 * State machine:
 *   checking → idle → (confirm) migrating → done
 *                  ↘ (defer) dismissed
 */

import { useEffect, useState } from 'react'
import { ArrowRight, PackageOpen } from 'lucide-react'
import { isTauri } from '@/lib/dataPath'
import type { LegacyCheckResult, MigrationResult } from '@/types'

type Phase = 'checking' | 'idle' | 'migrating' | 'done' | 'dismissed' | 'error'

interface Props {
  /** Called when the dialog is fully resolved and the rest of the app can proceed. */
  onResolved: () => void
}

const SESSION_DISMISS_KEY = 'atomsyn:legacy-migration-dismissed'

export function LegacyMigrationDialog({ onResolved }: Props) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [info, setInfo] = useState<LegacyCheckResult | null>(null)
  const [result, setResult] = useState<MigrationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // One-shot detection on mount.
  useEffect(() => {
    let cancelled = false

    async function check() {
      // Non-Tauri dev / web mode never shows the dialog.
      if (!isTauri()) {
        if (!cancelled) {
          setPhase('dismissed')
          onResolved()
        }
        return
      }

      // Session-scoped "maybe later" — don't re-prompt within the same session.
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === 'true') {
        if (!cancelled) {
          setPhase('dismissed')
          onResolved()
        }
        return
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const r = await invoke<LegacyCheckResult>('legacy_data_dir_check')
        if (cancelled) return
        setInfo(r)
        // Show dialog only if we found a meaningful legacy footprint.
        if (r.found || r.configFound) {
          setPhase('idle')
        } else {
          setPhase('dismissed')
          onResolved()
        }
      } catch (err) {
        if (cancelled) return
        // Detection failure must NOT block the app — log and proceed.
        // eslint-disable-next-line no-console
        console.warn('[legacy-check] failed (non-fatal):', err)
        setPhase('dismissed')
        onResolved()
      }
    }

    check()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleMigrate() {
    setPhase('migrating')
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const r = await invoke<MigrationResult>('legacy_data_dir_migrate')
      setResult(r)
      setPhase('done')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[legacy-migrate] failed:', err)
      setError(String(err))
      setPhase('error')
    }
  }

  function handleDefer() {
    sessionStorage.setItem(SESSION_DISMISS_KEY, 'true')
    setPhase('dismissed')
    onResolved()
  }

  function handleDoneContinue() {
    // Keep the session flag so we don't re-trigger this session.
    sessionStorage.setItem(SESSION_DISMISS_KEY, 'true')
    setPhase('dismissed')
    onResolved()
  }

  // Hidden states — either still checking or already resolved.
  if (phase === 'checking' || phase === 'dismissed') {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legacy-migration-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-neutral-950/50 backdrop-blur-sm"
    >
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl border border-white/10 bg-white dark:bg-neutral-950/95 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
        style={{
          transition: 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="p-7">
          {/* Icon + title */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-sky-500 to-emerald-500 shadow-lg shadow-violet-500/25 ring-1 ring-white/10">
              <PackageOpen className="h-5 w-5 text-white" strokeWidth={1.75} />
            </div>
            <div>
              <h2
                id="legacy-migration-title"
                className="text-[1.0625rem] font-semibold tracking-tight text-neutral-900 dark:text-neutral-50"
              >
                {phase === 'done' ? '你的认知资产已经在新家了。' : '搬个新家'}
              </h2>
              <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500 mt-0.5">
                Moving Day · Atomsyn
              </p>
            </div>
          </div>

          {/* Body */}
          {phase === 'idle' && (
            <div className="space-y-3 text-[0.8125rem] leading-relaxed text-neutral-600 dark:text-neutral-300">
              <p>
                <strong className="text-neutral-900 dark:text-neutral-100">Atomsyn</strong> 是{' '}
                <code className="text-[0.6875rem] px-1 py-0.5 rounded bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300">
                  ccl-atlas
                </code>{' '}
                的新名字。我们会把你过去沉淀的原子、实践和技能库搬到新的目录下,原来的文件夹会被重命名为{' '}
                <code className="text-[0.6875rem] px-1 py-0.5 rounded bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300">
                  .ccl-atlas.deprecated.&lt;时间戳&gt;
                </code>{' '}
                作为备份保留在原处——不会删除,随时可以回去看。
              </p>
              {info && (
                <div className="mt-4 text-[0.6875rem] font-mono text-neutral-500 dark:text-neutral-500 p-3 rounded-lg bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/70 dark:border-white/5 space-y-1">
                  {info.found && (
                    <div>
                      <span className="text-neutral-400">from:</span> {info.path}
                    </div>
                  )}
                  {info.found && (
                    <div>
                      <span className="text-neutral-400">atoms:</span> {info.entryCount}
                    </div>
                  )}
                  {info.configFound && info.configPath && (
                    <div>
                      <span className="text-neutral-400">config:</span> {info.configPath}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {phase === 'migrating' && (
            <div className="flex flex-col items-center py-6 space-y-3">
              <div className="h-1.5 w-48 rounded-full bg-neutral-100 dark:bg-white/5 overflow-hidden">
                <div className="h-full w-1/3 bg-gradient-to-r from-violet-500 to-sky-500 animate-pulse" />
              </div>
              <p className="text-[0.8125rem] text-neutral-500 dark:text-neutral-400">正在搬家……</p>
            </div>
          )}

          {phase === 'done' && result && (
            <div className="space-y-3 text-[0.8125rem] leading-relaxed text-neutral-600 dark:text-neutral-300">
              <p>
                已搬运 <strong className="text-emerald-600 dark:text-emerald-400">{result.migratedFiles}</strong> 份资产
                {result.skippedFiles > 0 && (
                  <>
                    (跳过 {result.skippedFiles} 份,因为新家已有同名文件,保留新家的版本)
                  </>
                )}
                。
              </p>
              <div className="mt-3 text-[0.6875rem] font-mono text-neutral-500 dark:text-neutral-500 p-3 rounded-lg bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/70 dark:border-white/5 space-y-1 break-all">
                <div>
                  <span className="text-neutral-400">backup:</span> {result.backupPath}
                </div>
                {result.configBackupPath && (
                  <div>
                    <span className="text-neutral-400">config backup:</span> {result.configBackupPath}
                  </div>
                )}
              </div>
              <p className="text-[0.75rem] text-neutral-400 dark:text-neutral-500 mt-3">
                旧文件夹作为备份保留,你随时可以打开看。
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-3 text-[0.8125rem] leading-relaxed text-rose-600 dark:text-rose-400">
              <p>搬家过程出了一点问题:</p>
              <pre className="text-[0.6875rem] font-mono p-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 whitespace-pre-wrap break-all">
                {error}
              </pre>
              <p className="text-[0.75rem] text-neutral-500 dark:text-neutral-400">
                旧数据不会被改动。你可以关闭这个对话框,稍后重试,或检查 Tauri 日志。
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-3">
            {phase === 'idle' && (
              <>
                <button
                  type="button"
                  onClick={handleDefer}
                  className="px-4 py-2 text-[0.8125rem] font-medium rounded-full text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                >
                  下次再说
                </button>
                <button
                  type="button"
                  onClick={handleMigrate}
                  className="group flex items-center gap-2 px-5 py-2 text-[0.8125rem] font-medium rounded-full bg-gradient-to-r from-violet-500 to-sky-500 text-white shadow-lg shadow-violet-500/25 ring-1 ring-white/10 hover:scale-[1.02] transition-transform duration-300"
                >
                  开始搬家
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </>
            )}

            {phase === 'done' && (
              <button
                type="button"
                onClick={handleDoneContinue}
                className="group flex items-center gap-2 px-5 py-2 text-[0.8125rem] font-medium rounded-full bg-gradient-to-r from-violet-500 to-sky-500 text-white shadow-lg shadow-violet-500/25 ring-1 ring-white/10 hover:scale-[1.02] transition-transform duration-300"
              >
                进入 Atomsyn
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}

            {phase === 'error' && (
              <button
                type="button"
                onClick={handleDefer}
                className="px-4 py-2 text-[0.8125rem] font-medium rounded-full bg-neutral-900 dark:bg-white/10 text-white hover:bg-neutral-800 dark:hover:bg-white/15 transition-colors"
              >
                稍后再说
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
