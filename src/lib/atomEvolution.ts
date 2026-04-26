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
import type { AtomAny } from '@/types'

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
