/**
 * src/components/growth/ProfileCalibration.tsx · V2.x bootstrap-skill (D-013)
 *
 * Profile (认知画像) calibration module. Mounted as the third tab inside
 * GrowthPage, below the existing 概览 / 认知洞察 segmented control.
 *
 * Surfaces the singleton ProfileAtom and lets the user:
 *   - View / edit identity + preferences (5 维) + knowledge_domains +
 *     recurring_patterns
 *   - Flip verified=true via calibrate-profile API (trigger=user_calibration)
 *   - Browse previous_versions[] timeline + restore (D-010, trigger=restore_previous)
 *   - See "90+ days since last calibration" banner when stale
 *
 * Empty-state: no profile on disk yet (bootstrap not run) → friendly card
 * pointing the user back to the chat-page wizard.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Circle,
  Clock,
  Edit3,
  History,
  Plus,
  RotateCcw,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { useProfileStore } from '@/stores/useProfileStore'
import type { ProfilePreferences, ProfileVersionSnapshot } from '@/types'

const PREF_LABELS: Record<keyof ProfilePreferences, [string, string, string]> = {
  scope_appetite:     ['scope_appetite',     '小步', '完整'],
  risk_tolerance:     ['risk_tolerance',     '谨慎', '激进'],
  detail_preference:  ['detail_preference',  '简洁', '详尽'],
  autonomy:           ['autonomy',           '咨询', '委托'],
  architecture_care:  ['architecture_care',  '速度', '设计'],
}

const TRIGGER_LABEL: Record<string, string> = {
  bootstrap_initial:  '首次 bootstrap',
  bootstrap_rerun:    '再次 bootstrap',
  user_calibration:   '用户校准',
  agent_evolution:    'Agent 主动演化',
  restore_previous:   '历史版本恢复',
}

const VERIFIED_GRACE_DAYS = 90

export function ProfileCalibration() {
  const {
    profile,
    versions,
    draft,
    dirtyFields,
    loading,
    saving,
    error,
    load,
    setDraftField,
    resetDraft,
    save,
    restore,
  } = useProfileStore()

  const [showEvidence, setShowEvidence] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null)

  useEffect(() => { load() }, [load])

  // Effective values = draft overlay > profile > defaults
  const effective = useMemo(() => {
    const id = { ...(profile?.identity ?? {}), ...(draft.identity ?? {}) }
    const pref = { ...(profile?.preferences ?? {}), ...(draft.preferences ?? {}) }
    const domains = draft.knowledge_domains ?? profile?.knowledge_domains ?? []
    const patterns = draft.recurring_patterns ?? profile?.recurring_patterns ?? []
    return { identity: id, preferences: pref, domains, patterns }
  }, [profile, draft])

  const isStale = useMemo(() => {
    if (!profile?.verifiedAt) return false
    const days = Math.floor((Date.now() - new Date(profile.verifiedAt).getTime()) / 86400_000)
    return days >= VERIFIED_GRACE_DAYS
  }, [profile?.verifiedAt])

  if (loading) {
    return <div className="p-10 text-sm text-neutral-500">加载画像…</div>
  }

  if (!profile) {
    return <EmptyState />
  }

  const dirty = dirtyFields.size > 0

  return (
    <div className="space-y-6">
      {/* Stale banner */}
      <AnimatePresence>
        {isStale && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2"
          >
            <Clock className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              你的画像已 <strong>{Math.floor((Date.now() - new Date(profile.verifiedAt!).getTime()) / 86400_000)}</strong> 天未校准。要不要回看一遍并重新确认?
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-300/60 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}

      {/* Header */}
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-violet-500" />
              <h2 className="text-lg font-semibold">{profile.name || '我的认知画像'}</h2>
              {profile.verified ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[0.6875rem] rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium">
                  <CheckCircle2 className="w-3 h-3" /> verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[0.6875rem] rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium">
                  <Circle className="w-3 h-3" /> 未校准
                </span>
              )}
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              {profile.verifiedAt
                ? `最近校准: ${new Date(profile.verifiedAt).toLocaleDateString()}`
                : '从未校准 — 点击下方"校准并标记 verified"完成首次确认'}
              {profile.source_summary && ` · ${profile.source_summary}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <button
                onClick={resetDraft}
                disabled={saving}
                className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                取消修改
              </button>
            )}
            <button
              onClick={save}
              disabled={saving || (!dirty && profile.verified === true)}
              className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-violet-600 to-sky-600 text-white font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-50"
            >
              {saving ? '保存中…' : profile.verified ? (dirty ? '保存修改' : '已 verified') : '校准并标记 verified'}
            </button>
          </div>
        </div>
      </Card>

      {/* Identity */}
      <Card title="Identity (身份)">
        <div className="grid gap-3">
          <Field
            label="角色 (role)"
            value={String(effective.identity.role ?? '')}
            onChange={(v) => setDraftField('identity', { ...effective.identity, role: v })}
            placeholder="例: 前端工程师 + 独立产品开发者"
          />
          <Field
            label="工作风格 (working_style)"
            value={String(effective.identity.working_style ?? '')}
            onChange={(v) => setDraftField('identity', { ...effective.identity, working_style: v })}
            placeholder="例: 小步迭代 + 重视架构"
          />
          <TagsField
            label="主要语言"
            tags={(effective.identity.primary_languages as string[]) ?? []}
            onChange={(next) => setDraftField('identity', { ...effective.identity, primary_languages: next })}
          />
          <TagsField
            label="主要工具"
            tags={(effective.identity.primary_tools as string[]) ?? []}
            onChange={(next) => setDraftField('identity', { ...effective.identity, primary_tools: next })}
          />
        </div>
      </Card>

      {/* Preferences (5 维滑块) */}
      <Card title="Preferences (5 维, 与 plan-tune 同名同义)">
        <div className="space-y-4">
          {(Object.keys(PREF_LABELS) as (keyof ProfilePreferences)[]).map((key) => {
            const [name, low, high] = PREF_LABELS[key]
            const val = effective.preferences[key] ?? 0.5
            return (
              <PreferenceSlider
                key={key}
                name={name}
                low={low}
                high={high}
                value={val}
                onChange={(v) => setDraftField('preferences', { ...effective.preferences, [key]: v })}
              />
            )
          })}
        </div>
      </Card>

      {/* Knowledge domains */}
      <Card title="Knowledge Domains">
        <TagsField
          label=""
          tags={effective.domains}
          onChange={(next) => setDraftField('knowledge_domains', next)}
          placeholder="添加领域 + 回车"
        />
      </Card>

      {/* Recurring patterns */}
      <Card title="Recurring Patterns (规律性观察)">
        <PatternsEditor
          patterns={effective.patterns}
          onChange={(next) => setDraftField('recurring_patterns', next)}
        />
      </Card>

      {/* Evidence */}
      <Card>
        <button
          onClick={() => setShowEvidence((v) => !v)}
          className="w-full flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200"
        >
          <Sparkles className="w-4 h-4 text-violet-500" />
          Evidence ({profile.evidence_atom_ids?.length ?? 0} 条 atom)
          <span className="ml-auto text-xs text-neutral-400">
            {showEvidence ? '收起' : '展开'}
          </span>
        </button>
        {showEvidence && (
          <div className="mt-3 text-xs text-neutral-600 dark:text-neutral-400 space-y-1 max-h-48 overflow-y-auto">
            {profile.evidence_atom_ids?.length ? (
              profile.evidence_atom_ids.map((id) => (
                <div key={id} className="font-mono break-all">
                  • {id}
                </div>
              ))
            ) : (
              <div className="italic">尚无证据原子。bootstrap 完成后会自动填充。</div>
            )}
          </div>
        )}
      </Card>

      {/* Version history */}
      <Card title={
        <span className="flex items-center gap-1.5">
          <History className="w-4 h-4 text-sky-500" />
          Version History (前 10 条)
        </span>
      }>
        <VersionTimeline
          versions={versions.slice(0, 10)}
          onAskRestore={(v) => setConfirmRestore(v)}
        />
      </Card>

      {/* Restore confirmation */}
      <AnimatePresence>
        {confirmRestore !== null && (
          <RestoreConfirmModal
            version={confirmRestore}
            onCancel={() => setConfirmRestore(null)}
            onConfirm={async () => {
              const v = confirmRestore
              setConfirmRestore(null)
              await restore(v)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200/70 dark:border-white/10 p-10 text-center">
      <User className="w-10 h-10 mx-auto text-neutral-400 mb-3" />
      <h3 className="text-base font-medium mb-2">还没有认知画像</h3>
      <p className="text-sm text-neutral-500 max-w-md mx-auto">
        画像会在你第一次跑 bootstrap 后生成。前往 <strong>聊天</strong> 页面点"初始化向导"开始扫描你硬盘上的过程文档。
      </p>
    </div>
  )
}

function Card({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-5">
      {title && <div className="text-sm font-medium mb-3">{title}</div>}
      {children}
    </div>
  )
}

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
      />
    </label>
  )
}

function TagsField({
  label, tags, onChange, placeholder,
}: { label?: string; tags: string[]; onChange: (next: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim()
    if (!v || tags.includes(v)) return
    onChange([...tags, v])
    setDraft('')
  }
  return (
    <div>
      {label && <div className="text-xs text-neutral-500 mb-1">{label}</div>}
      <div className="flex flex-wrap gap-1.5 items-center">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20"
          >
            {t}
            <button
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="hover:text-rose-500 transition-colors"
              aria-label={`移除 ${t}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="inline-flex items-center gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder={placeholder ?? '+ 添加'}
            className="w-32 px-2 py-1 text-xs rounded-md bg-transparent border border-dashed border-neutral-300 dark:border-white/15 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
          />
          {draft.trim() && (
            <button onClick={add} className="text-violet-500 hover:text-violet-700">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PatternsEditor({
  patterns, onChange,
}: { patterns: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim()
    if (!v) return
    onChange([...patterns, v])
    setDraft('')
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {patterns.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-sm group">
            <span className="text-violet-500 mt-1">•</span>
            <span className="flex-1 break-words">{p}</span>
            <button
              onClick={() => onChange(patterns.filter((_, j) => j !== i))}
              className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-rose-500 transition-opacity"
              aria-label="移除"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="+ 添加规律性观察"
          className="flex-1 rounded-lg bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="px-3 py-2 text-xs rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function PreferenceSlider({
  name, low, high, value, onChange,
}: {
  name: string; low: string; high: string; value: number; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-mono text-neutral-700 dark:text-neutral-300">{name}</span>
        <span className="font-mono text-violet-600 dark:text-violet-300 font-medium">{value.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[0.6875rem] text-neutral-500 w-8 text-right">{low}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-violet-500"
        />
        <span className="text-[0.6875rem] text-neutral-500 w-8">{high}</span>
      </div>
    </div>
  )
}

function VersionTimeline({
  versions, onAskRestore,
}: { versions: ProfileVersionSnapshot[]; onAskRestore: (v: number) => void }) {
  if (versions.length === 0) {
    return (
      <div className="text-xs italic text-neutral-500 py-4 text-center">
        尚无历史版本。每次 bootstrap / 校准 / restore 后会在这里看到一条记录。
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {versions.map((v) => (
        <li key={v.version} className="flex items-center gap-3 text-sm">
          <span className="font-mono text-xs text-neutral-500 w-8">v{v.version}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs">
              <span className="text-neutral-500 mr-2">{new Date(v.supersededAt).toLocaleString()}</span>
              <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 text-[0.6875rem]">
                {TRIGGER_LABEL[v.trigger] ?? v.trigger}
              </span>
            </div>
          </div>
          <button
            onClick={() => onAskRestore(v.version)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-neutral-200 dark:border-white/10 hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
            aria-label={`恢复版本 ${v.version}`}
          >
            <RotateCcw className="w-3 h-3" /> restore
          </button>
        </li>
      ))}
    </ul>
  )
}

function RestoreConfirmModal({
  version, onCancel, onConfirm,
}: { version: number; onCancel: () => void; onConfirm: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <Edit3 className="w-5 h-5 text-amber-500" />
          <h3 className="text-base font-semibold">恢复 v{version}?</h3>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-5">
          当前画像会被自动归档到 previous_versions 顶部, 然后用 v{version} 的快照作为新的顶层数据。这次恢复也会标记为已校准 (verified=true)。无数据丢失。
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium shadow-sm hover:shadow-md"
          >
            确认恢复
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default ProfileCalibration
