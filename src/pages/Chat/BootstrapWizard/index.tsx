/**
 * src/pages/Chat/BootstrapWizard/index.tsx · V2.x bootstrap-skill (D-009 + D-011)
 *
 * 5-screen wizard mounted as a modal overlay from ChatPage. Drives the user
 * through path selection → CLI hand-off → session inspect → dry-run review
 * → commit. The actual TRIAGE/SAMPLING/DEEP DIVE phases run in the CLI
 * (atomsyn-cli bootstrap --dry-run) because they spawn subprocesses + call
 * the LLM, which the GUI/Tauri side does not own (CLI-first iron rule).
 *
 * Screens:
 *   1. paths    — pick scan roots; copy-to-clipboard the CLI command
 *   2. triage   — wait for the user's CLI run to land a session in
 *                 ~/.atomsyn/bootstrap-sessions/, then show phase 1 overview
 *   3. sampling — show phase 2 hypothesis (identity / preferences / domains)
 *   4. dryrun   — load session.md, let user edit inline, "Confirm write"
 *   5. commit   — POST /bootstrap/sessions/:id/commit, show progress + done
 *
 * The wizard is dismissable from any screen. Sessions persist to disk
 * (CLI owns the file) so users can resume by reopening + picking from list.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check,
  CheckCircle2,
  ClipboardCopy,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useBootstrapStore } from '@/stores/useBootstrapStore'
import { bootstrapApi } from '@/lib/dataApi'
import type { BootstrapSessionSummary } from '@/lib/dataApi'
import { isTauri } from '@/lib/dataPath'

interface WizardProps {
  open: boolean
  onClose: () => void
}

export function BootstrapWizard({ open, onClose }: WizardProps) {
  const { screen, setScreen, reset } = useBootstrapStore()

  // Reset state on close so re-open starts fresh (unless user resumed mid-flight)
  function handleClose() {
    reset()
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <Header screen={screen} onClose={handleClose} />
            <div className="flex-1 overflow-y-auto p-6">
              {screen === 'paths' && <PathsScreen />}
              {screen === 'triage' && <TriageScreen />}
              {screen === 'sampling' && <SamplingScreen />}
              {screen === 'dryrun' && <DryrunScreen />}
              {screen === 'commit' && <CommitScreen />}
              {screen === 'done' && <DoneScreen onClose={handleClose} />}
            </div>
            {screen !== 'done' && screen !== 'commit' && (
              <Footer screen={screen} onScreen={setScreen} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------

const SCREEN_ORDER: Array<{ id: any; label: string }> = [
  { id: 'paths',    label: '选目录' },
  { id: 'triage',   label: '扫描概览' },
  { id: 'sampling', label: '画像确认' },
  { id: 'dryrun',   label: '校对候选' },
  { id: 'commit',   label: '写入' },
]

function Header({ screen, onClose }: { screen: string; onClose: () => void }) {
  const idx = SCREEN_ORDER.findIndex((s) => s.id === screen)
  return (
    <div className="px-6 pt-5 pb-4 border-b border-neutral-100 dark:border-white/5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-500" />
          <h2 className="text-base font-semibold">初始化向导 (Bootstrap)</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        {SCREEN_ORDER.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <span
              className={
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-[0.625rem] font-medium ' +
                (i < idx
                  ? 'bg-emerald-500 text-white'
                  : i === idx
                  ? 'bg-violet-500 text-white'
                  : 'bg-neutral-200 dark:bg-white/10 text-neutral-500')
              }
            >
              {i < idx ? <Check className="w-3 h-3" /> : i + 1}
            </span>
            <span
              className={
                'text-xs ' +
                (i === idx ? 'text-neutral-900 dark:text-white font-medium' : 'text-neutral-400')
              }
            >
              {s.label}
            </span>
            {i < SCREEN_ORDER.length - 1 && (
              <ChevronRight className="w-3 h-3 text-neutral-300 dark:text-white/15" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Footer({ screen, onScreen }: { screen: string; onScreen: (s: any) => void }) {
  const { paths, sessionId, markdownDraft, runCommit, loading } = useBootstrapStore()
  const idx = SCREEN_ORDER.findIndex((s) => s.id === screen)
  const prev = idx > 0 ? SCREEN_ORDER[idx - 1].id : null
  const next = idx < SCREEN_ORDER.length - 1 ? SCREEN_ORDER[idx + 1].id : null

  const canNext =
    (screen === 'paths' && paths.length > 0) ||
    (screen === 'triage' && !!sessionId) ||
    (screen === 'sampling' && !!sessionId) ||
    (screen === 'dryrun' && !!markdownDraft)

  return (
    <div className="px-6 py-4 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between">
      <button
        onClick={() => prev && onScreen(prev)}
        disabled={!prev}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> 上一步
      </button>
      {screen === 'dryrun' ? (
        <button
          onClick={runCommit}
          disabled={loading || !markdownDraft}
          className="inline-flex items-center gap-1 px-4 py-1.5 text-sm rounded-lg bg-gradient-to-r from-violet-600 to-sky-600 text-white font-medium shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          确认写入
        </button>
      ) : (
        <button
          onClick={() => next && onScreen(next)}
          disabled={!canNext || !next}
          className="inline-flex items-center gap-1 px-4 py-1.5 text-sm rounded-lg bg-violet-500 text-white font-medium shadow-sm hover:bg-violet-600 disabled:opacity-40 transition-colors"
        >
          下一步 <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 1 · Paths
// ---------------------------------------------------------------------------

function PathsScreen() {
  const { paths, addPath, removePath } = useBootstrapStore()
  const [textPath, setTextPath] = useState('')
  const tauri = isTauri()

  async function pickWithDialog() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({ directory: true, multiple: false })
      if (typeof picked === 'string') addPath(picked)
    } catch (err) {
      console.error('dialog open failed', err)
    }
  }

  const command = useMemo(() => {
    if (paths.length === 0) return ''
    return (
      'atomsyn-cli bootstrap ' +
      paths.map((p) => `--path "${p}"`).join(' ') +
      ' --dry-run'
    )
  }, [paths])

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        选 1+ 个目录扫描你已有的 markdown / 笔记 / 历史聊天导出。bootstrap 会按 5 层架构提炼成 1 条 profile + N 条 experience/fragment atom。
      </p>

      <div className="space-y-2">
        {paths.map((p) => (
          <div
            key={p}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-50 dark:bg-white/5 border border-neutral-200/70 dark:border-white/10"
          >
            <FolderOpen className="w-4 h-4 text-violet-500 shrink-0" />
            <span className="font-mono text-xs flex-1 truncate">{p}</span>
            <button
              onClick={() => removePath(p)}
              className="text-neutral-400 hover:text-rose-500 transition-colors"
              aria-label="移除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {tauri && (
          <button
            onClick={pickWithDialog}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-violet-500 text-white font-medium shadow-sm hover:bg-violet-600 transition-colors"
          >
            <FolderOpen className="w-4 h-4" /> 选择文件夹
          </button>
        )}
        <input
          value={textPath}
          onChange={(e) => setTextPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && textPath.trim()) {
              addPath(textPath.trim())
              setTextPath('')
            }
          }}
          placeholder="或粘贴绝对路径 + 回车 (例: ~/Documents)"
          className="flex-1 rounded-lg bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
      </div>

      {paths.length > 0 && (
        <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] p-3">
          <div className="text-xs text-neutral-500 mb-2 flex items-center justify-between">
            <span>下一步: 在终端跑这条命令 (CLI 走完三阶段后回来)</span>
            <CopyButton value={command} />
          </div>
          <pre className="text-xs font-mono break-all whitespace-pre-wrap text-violet-700 dark:text-violet-300">
            {command}
          </pre>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 2 · Triage (session attach + phase 1 overview)
// ---------------------------------------------------------------------------

function TriageScreen() {
  const { sessionId, session, attachSession } = useBootstrapStore()
  const [sessions, setSessions] = useState<BootstrapSessionSummary[]>([])
  const [reloading, setReloading] = useState(false)

  async function load() {
    setReloading(true)
    try {
      const { sessions } = await bootstrapApi.listSessions()
      setSessions(sessions)
    } finally {
      setReloading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (!sessionId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            选一个已完成的 dry-run session (CLI 跑完会出现在这):
          </p>
          <button
            onClick={load}
            disabled={reloading}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-white/5"
          >
            <RefreshCw className={'w-3 h-3 ' + (reloading ? 'animate-spin' : '')} /> 刷新
          </button>
        </div>
        <ul className="space-y-2">
          {sessions.length === 0 && (
            <li className="text-xs text-neutral-500 italic py-4 text-center border border-dashed rounded-lg border-neutral-200 dark:border-white/10">
              还没看到 session。在终端跑上一步给的命令, 完成后回来点刷新。
            </li>
          )}
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => attachSession(s.id)}
                className="w-full text-left px-3 py-2 rounded-lg bg-white dark:bg-white/[0.02] border border-neutral-200/70 dark:border-white/10 hover:border-violet-400/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-violet-700 dark:text-violet-300">{s.id}</span>
                  <span className="text-[0.625rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/5 text-neutral-500">
                    {s.status}
                  </span>
                </div>
                <div className="text-xs text-neutral-500 mt-0.5 truncate">
                  {s.paths.join(' · ')}
                </div>
                <div className="text-[0.6875rem] text-neutral-400 mt-0.5">
                  {new Date(s.startedAt).toLocaleString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // Session attached → show phase 1 overview
  const overview = session?.phase1_overview
  return (
    <div className="space-y-4">
      <div className="text-xs text-neutral-500">
        Session: <span className="font-mono text-violet-600">{sessionId}</span>
      </div>
      {!overview ? (
        <div className="text-xs text-neutral-500 italic">没有 phase 1 概览数据。</div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-white/10 p-4 bg-white/60 dark:bg-white/[0.02]">
          <div className="text-sm font-medium mb-2">扫描概览</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>总文件: <strong>{overview.totalFiles ?? overview.fileList?.length ?? 0}</strong></div>
            <div>总大小: <strong>{fmtBytes(overview.totalBytes ?? 0)}</strong></div>
            <div>敏感跳过: <strong>{overview.sensitive_skipped?.length ?? overview.sensitiveSkipped?.length ?? 0}</strong></div>
          </div>
          {overview.byExt && (
            <div className="mt-3 text-xs">
              <div className="text-neutral-500 mb-1">按扩展名:</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(overview.byExt).slice(0, 10).map(([ext, data]: [string, any]) => (
                  <span key={ext} className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-700 dark:text-violet-300 font-mono text-[0.6875rem]">
                    {ext} · {data.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 3 · Sampling (phase 2 hypothesis)
// ---------------------------------------------------------------------------

function SamplingScreen() {
  const { session } = useBootstrapStore()
  const h = session?.phase2_hypothesis

  if (!h) {
    return (
      <div className="text-sm text-neutral-500 italic">
        没有 phase 2 hypothesis 数据。 (CLI 可能跳过了 sampling 阶段。)
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        LLM 根据采样推断出的初始画像 — 写入时再校准, 这里只看一眼方向是否对:
      </p>
      <div className="rounded-xl border border-neutral-200 dark:border-white/10 p-4 bg-white/60 dark:bg-white/[0.02] space-y-3">
        {h.identity?.role && (
          <div className="text-sm">
            <span className="text-neutral-500 text-xs">角色: </span>{h.identity.role}
          </div>
        )}
        {h.identity?.working_style && (
          <div className="text-sm">
            <span className="text-neutral-500 text-xs">工作风格: </span>{h.identity.working_style}
          </div>
        )}
        {h.knowledge_domains?.length > 0 && (
          <div className="text-sm">
            <span className="text-neutral-500 text-xs">知识领域: </span>
            <div className="inline-flex flex-wrap gap-1 mt-1">
              {h.knowledge_domains.map((d: string) => (
                <span key={d} className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs">{d}</span>
              ))}
            </div>
          </div>
        )}
        {h.recurring_patterns?.length > 0 && (
          <div className="text-sm">
            <span className="text-neutral-500 text-xs">规律性观察:</span>
            <ul className="mt-1 space-y-0.5">
              {h.recurring_patterns.slice(0, 5).map((p: string, i: number) => (
                <li key={i} className="text-xs text-neutral-700 dark:text-neutral-200">• {p}</li>
              ))}
            </ul>
          </div>
        )}
        {h.uncertainty_notes && (
          <div className="text-xs italic text-amber-700 dark:text-amber-300 mt-2 pt-2 border-t border-neutral-200 dark:border-white/10">
            ⚠ {h.uncertainty_notes}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 4 · Dryrun (markdown editor)
// ---------------------------------------------------------------------------

function DryrunScreen() {
  const { markdownOriginal, markdownDraft, setMarkdownDraft, resetMarkdownDraft } =
    useBootstrapStore()

  if (!markdownOriginal) {
    return (
      <div className="text-sm text-neutral-500 italic">
        没有 dry-run markdown 报告 (CLI 可能没生成或路径不对). 回上一步重新选 session。
      </div>
    )
  }

  const dirty = markdownDraft !== markdownOriginal

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          这是 LLM 推荐的候选列表. 删行 / 改 name / 增 tag 都可以, "确认写入" 才落盘 (D-011).
        </p>
        {dirty && (
          <button
            onClick={resetMarkdownDraft}
            className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-white"
          >
            还原
          </button>
        )}
      </div>
      <textarea
        value={markdownDraft ?? ''}
        onChange={(e) => setMarkdownDraft(e.target.value)}
        spellCheck={false}
        className="w-full h-[55vh] rounded-xl bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 p-3 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
      />
      <div className="text-[0.6875rem] text-neutral-500">
        提示: 删除 #### candidate 块 → 该 atom 不入库. 顶部 "Profile snapshot" 决定 profile 字段.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 5 · Commit (progress + done)
// ---------------------------------------------------------------------------

function CommitScreen() {
  const { error, loading } = useBootstrapStore()
  return (
    <div className="py-12 flex flex-col items-center text-center space-y-4">
      {loading && <Loader2 className="w-10 h-10 animate-spin text-violet-500" />}
      {!loading && error && (
        <>
          <X className="w-10 h-10 text-rose-500" />
          <div className="text-sm text-rose-600 dark:text-rose-300 max-w-md">{error}</div>
        </>
      )}
      {!loading && !error && (
        <>
          <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            正在调用 LLM 把候选转为 atom JSON, 再走 atomsyn-cli ingest 落盘…
          </div>
        </>
      )}
    </div>
  )
}

function DoneScreen({ onClose }: { onClose: () => void }) {
  const { commitResult } = useBootstrapStore()
  if (!commitResult) {
    return <div className="text-sm text-neutral-500">没有 commit 结果。</div>
  }
  const { atoms_created, skipped, duplicates } = commitResult
  return (
    <div className="py-6 space-y-4">
      <div className="flex flex-col items-center text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-2" />
        <h3 className="text-lg font-semibold">写入完成 🎉</h3>
        <p className="text-xs text-neutral-500 mt-1">
          你的认知已经有了第一批"血肉" — 现在去 Atlas 看看吧。
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="profile" value={atoms_created.profile} />
        <Stat label="experience" value={atoms_created.experience} />
        <Stat label="fragment" value={atoms_created.fragment} />
      </div>
      {(skipped.length > 0 || duplicates.length > 0) && (
        <div className="rounded-lg border border-neutral-200 dark:border-white/10 p-3 text-xs space-y-1">
          {duplicates.length > 0 && <div>去重跳过: {duplicates.length}</div>}
          {skipped.length > 0 && <div>失败跳过: {skipped.length}</div>}
        </div>
      )}
      <div className="flex gap-2 justify-center pt-2">
        <a
          href="#/atom"
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-violet-600 to-sky-600 text-white font-medium shadow-sm hover:shadow-md"
        >
          打开 Atlas
        </a>
        <a
          href="#/growth"
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5"
        >
          校准 Profile
        </a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-white/10 p-3 text-center">
      <div className="text-xl font-semibold text-violet-600 dark:text-violet-300">{value}</div>
      <div className="text-[0.6875rem] uppercase tracking-wider text-neutral-500 mt-0.5">{label}</div>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-300 hover:text-violet-800"
    >
      {copied ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default BootstrapWizard
