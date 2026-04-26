/**
 * src/lib/atomEvolution.ts · cognitive-evolution change · 客户端共享演化层 helper
 *
 * TS port of `scripts/lib/evolution.mjs` (纯函数部分): computeStaleness 公式 + 字段判断 helper。
 * 用于:
 *   - 前端 (KnowledgeCard / FragmentCard 视觉信号 / SpotlightPalette 过滤)
 *   - Tauri router (src/lib/tauri-api/routes/atoms.ts staleness/prune endpoint)
 *
 * **重要**: 当 scripts/lib/evolution.mjs 的 computeStaleness 公式调整时, 必须同步本文件。
 * 两份代码故意双重维护是因为 .mjs 不能被 Vite/TS 直接 import (无 build step on Node CLI 端)。
 */
import type { AtomAny } from '../types'

const HALF_LIFE_DAYS = 180
const STALE_THRESHOLD = 0.5
const LONG_UNTOUCHED_DAYS = 90
const PROFILE_VERIFIED_GRACE_DAYS = 90

export interface StalenessSignal {
  age_days: number
  last_access_days: number
  confidence_decay: number
  is_stale: boolean
}

/**
 * 计算 atom 的 staleness 信号 (纯函数, 无 IO)。
 * 见 design §3.1 公式 + D-006 + D-008 (profile 特殊因子)。
 */
export function computeStaleness(atom: AtomAny | Record<string, unknown>, now: Date | number = Date.now()): StalenessSignal {
  const nowMs = now instanceof Date ? now.getTime() : now
  const createdAt = (atom as { createdAt?: string }).createdAt
  const createdMs = createdAt ? new Date(createdAt).getTime() : nowMs
  const age_days = Math.max(0, Math.floor((nowMs - createdMs) / 86400_000))

  const lastAccessedAt = (atom as { lastAccessedAt?: string }).lastAccessedAt
  const lastAccessMs = lastAccessedAt ? new Date(lastAccessedAt).getTime() : createdMs
  const last_access_days = Math.max(0, Math.floor((nowMs - lastAccessMs) / 86400_000))

  const base_decay = 1 - Math.exp(-Math.LN2 * age_days / HALF_LIFE_DAYS)
  const locked = (atom as { stats?: { locked?: boolean } }).stats?.locked === true
  const locked_factor = locked ? 0 : 1
  const access_factor = last_access_days > LONG_UNTOUCHED_DAYS ? 1.5 : 1.0

  let profile_factor = 1.0
  if ((atom as { kind?: string }).kind === 'profile') {
    const verifiedAt = (atom as { verifiedAt?: string }).verifiedAt
    if (verifiedAt) {
      const verified_days = Math.floor((nowMs - new Date(verifiedAt).getTime()) / 86400_000)
      if (verified_days > PROFILE_VERIFIED_GRACE_DAYS) profile_factor = 1.5
    }
  }

  let confidence_decay = base_decay * locked_factor * access_factor * profile_factor
  confidence_decay = Math.max(0, Math.min(1, confidence_decay))

  return {
    age_days,
    last_access_days,
    confidence_decay,
    is_stale: confidence_decay >= STALE_THRESHOLD,
  }
}

export function isAtomArchived(atom: unknown): boolean {
  return Boolean((atom as { archivedAt?: string } | null)?.archivedAt)
}

export function isAtomSuperseded(atom: unknown): boolean {
  return Boolean((atom as { supersededBy?: string } | null)?.supersededBy)
}

// ============================================================================
// detectCollision · keyword overlap + 反义短语库 (D-007 v1)
// ============================================================================

const ANTONYM_PHRASES = [
  '反而', '错了', '推翻', '不再', '改正', '其实不是', '我以为', '现在看来',
] as const

function tokens(text: unknown): Set<string> {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[\s,，;；。.!?！?]+/)
      .filter(t => t.length > 1),
  )
}

function jaccardOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  return intersection / (a.size + b.size - intersection)
}

export interface CollisionCandidate {
  id: string
  name: string
  score: number
  reason: string
}

export function detectCollision(
  newAtom: Record<string, unknown>,
  corpus: Record<string, unknown>[],
  opts: { maxCandidates?: number } = {},
): CollisionCandidate[] {
  const { maxCandidates = 3 } = opts
  const newTags = new Set(((newAtom.tags as string[]) || []).map(t => String(t).toLowerCase()))
  const newRole = String(newAtom.role || '').toLowerCase()
  const newSituation = String(newAtom.situation || '').toLowerCase()
  const newInsightLower = String(newAtom.insight || newAtom.summary || '').toLowerCase()
  const newInsightTokens = tokens(newAtom.insight || newAtom.summary)

  const scored: CollisionCandidate[] = []
  for (const existing of corpus) {
    if (!existing || existing.id === newAtom.id) continue
    if (existing.archivedAt || existing.supersededBy) continue

    const existTags = new Set(((existing.tags as string[]) || []).map(t => String(t).toLowerCase()))
    const existInsightTokens = tokens(existing.insight || existing.summary)

    const tagOverlap = jaccardOverlap(newTags, existTags)
    const roleMatch = Boolean(newRole && existing.role && newRole === String(existing.role).toLowerCase())
    const situationMatch = Boolean(newSituation && existing.situation && newSituation === String(existing.situation).toLowerCase())

    if (tagOverlap < 0.3 && !roleMatch && !situationMatch) continue

    const insightOverlap = jaccardOverlap(newInsightTokens, existInsightTokens)

    let antonymHit: string | null = null
    for (const phrase of ANTONYM_PHRASES) {
      if (newInsightLower.includes(phrase)) { antonymHit = phrase; break }
    }

    if (insightOverlap < 0.5 && !antonymHit) continue

    const score = Math.min(1, insightOverlap + (antonymHit ? 0.4 : 0))
    const reasons: string[] = []
    if (tagOverlap >= 0.3) reasons.push(`tags ${(tagOverlap * 100).toFixed(0)}% 重叠`)
    if (insightOverlap >= 0.5) reasons.push(`insight ${(insightOverlap * 100).toFixed(0)}% 关键词重叠`)
    if (antonymHit) reasons.push(`含反义短语 '${antonymHit}'`)

    scored.push({
      id: String(existing.id),
      name: String(existing.name || existing.title || ''),
      score,
      reason: reasons.join(' + '),
    })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxCandidates)
}

// ============================================================================
// detectPruneCandidates · 三维度并集 dry-run (D-005)
// ============================================================================

export interface PruneCandidate {
  id: string
  name: string
  reasons: string[]
  age_days: number
  last_access_days: number
  confidence_decay: number
  suggested_action: 'archive' | 'supersede'
}

export interface PruneSummary {
  total_atoms: number
  candidates_count: number
  by_reason: {
    contradiction: number
    'long-untouched': number
    'broken-ref': number
  }
}

export function detectPruneCandidates(
  corpus: Record<string, unknown>[],
  opts: { limit?: number; now?: Date | number } = {},
): { candidates: PruneCandidate[]; summary: PruneSummary } {
  const { limit = 10, now = Date.now() } = opts
  const nowMs = now instanceof Date ? now.getTime() : now

  const enriched = corpus
    .filter(a => a && !a.archivedAt && !a.supersededBy)
    .map(a => ({ atom: a, staleness: computeStaleness(a, nowMs) }))

  // 维度 (a) · 同 tag 组内含反义短语的 atom (旧的标为候选)
  const byTag = new Map<string, Record<string, unknown>[]>()
  for (const { atom } of enriched) {
    for (const tag of (atom.tags as string[]) || []) {
      const list = byTag.get(tag) || []
      list.push(atom)
      byTag.set(tag, list)
    }
  }
  const contradictionIds = new Set<string>()
  for (const [, atoms] of byTag) {
    if (atoms.length < 2) continue
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const ai = atoms[i]
        const aj = atoms[j]
        const aiText = String(ai.insight || ai.summary || '').toLowerCase()
        const ajText = String(aj.insight || aj.summary || '').toLowerCase()
        const hasAntonym =
          ANTONYM_PHRASES.some(p => aiText.includes(p)) ||
          ANTONYM_PHRASES.some(p => ajText.includes(p))
        if (!hasAntonym) continue
        const aiTs = new Date((ai.createdAt as string) || 0).getTime()
        const ajTs = new Date((aj.createdAt as string) || 0).getTime()
        contradictionIds.add(String(aiTs > ajTs ? aj.id : ai.id))
      }
    }
  }

  // 维度 (b) · 长期未访问 + 高 confidence_decay
  const longUntouchedIds = new Set<string>()
  for (const { atom, staleness } of enriched) {
    if (staleness.last_access_days > 180 && staleness.confidence_decay > 0.7) {
      longUntouchedIds.add(String(atom.id))
    }
  }

  // 维度 (c) · broken-ref · v1 留 stub
  const brokenRefIds = new Set<string>()

  const candidates: PruneCandidate[] = []
  for (const { atom, staleness } of enriched) {
    const reasons: string[] = []
    let suggested_action: 'archive' | 'supersede' = 'archive'
    if (contradictionIds.has(String(atom.id))) { reasons.push('contradiction'); suggested_action = 'supersede' }
    if (longUntouchedIds.has(String(atom.id))) reasons.push('long-untouched')
    if (brokenRefIds.has(String(atom.id))) reasons.push('broken-ref')
    if (reasons.length === 0) continue
    candidates.push({
      id: String(atom.id),
      name: String(atom.name || atom.title || ''),
      reasons,
      age_days: staleness.age_days,
      last_access_days: staleness.last_access_days,
      confidence_decay: Number(staleness.confidence_decay.toFixed(2)),
      suggested_action,
    })
  }

  candidates.sort((a, b) => {
    const ac = a.reasons.includes('contradiction') ? 1 : 0
    const bc = b.reasons.includes('contradiction') ? 1 : 0
    if (ac !== bc) return bc - ac
    return b.confidence_decay - a.confidence_decay
  })

  return {
    candidates: candidates.slice(0, limit),
    summary: {
      total_atoms: enriched.length,
      candidates_count: candidates.length,
      by_reason: {
        contradiction: contradictionIds.size,
        'long-untouched': longUntouchedIds.size,
        'broken-ref': brokenRefIds.size,
      },
    },
  }
}

/**
 * 默认列表过滤: 隐藏 archived atom; superseded atom 仍可见 (它们可能仍在
 * supersede 链上需要被引用)。GUI 调用方可以通过 showArchived toggle 切换。
 */
export function filterAtomsForDefaultView<T extends AtomAny | Record<string, unknown>>(
  atoms: T[],
  opts: { showArchived?: boolean } = {},
): T[] {
  if (opts.showArchived) return atoms
  return atoms.filter(a => !(a as { archivedAt?: string }).archivedAt)
}
