/**
 * scripts/lib/evolution.mjs · cognitive-evolution change · 演化层核心模块
 *
 * 封装 7 个核心函数:
 *   - computeStaleness(atom, now)
 *   - updateAccessTime(atomFile, now)
 *   - detectCollision(newAtom, corpus, opts)
 *   - applySupersede(deps, args)
 *   - applyArchive(deps, args)
 *   - detectPruneCandidates(corpus, opts)
 *   - applyProfileEvolution(deps, args)  // D-008, profile 单例 + previous_versions 入栈
 *
 * IO 副作用类函数 (apply* / updateAccessTime) 通过 deps 注入: 调用方提供
 * `findAtomFileById` / `writeAtom` / `rebuildIndex` / `readProfile` / `writeProfile`,
 * 让本模块不直接耦合 CLI 内部实现, 也方便单元测试 mock。
 *
 * 纯函数 (computeStaleness / detectCollision / detectPruneCandidates) 不做 IO,
 * 调用方负责加载 corpus 后传入。
 *
 * 引用:
 *   - design.md §3 (流程) §4.2 (字段) §4.2.1 (profile 特殊语义)
 *   - decisions.md D-004 ~ D-008
 *   - tasks.md B1, B12, B13
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

// ============================================================================
// Constants (可调参, dogfood 30 天后回看)
// ============================================================================

const HALF_LIFE_DAYS = 180             // D-006: 半衰期 180 天
const STALE_THRESHOLD = 0.5            // is_stale 阈值
const ACCESS_THROTTLE_MS = 60 * 60 * 1000  // D-007: lastAccessedAt 节流 1 小时
const LONG_UNTOUCHED_DAYS = 90         // 长期未访问 access_factor 阈值
const PROFILE_VERIFIED_GRACE_DAYS = 90 // D-008: profile verifiedAt 距今超过此值 → profile_factor 1.5x

// design.md §3.2 反义短语库 (D-007 v1 hard-code, 后续可热配置)
const ANTONYM_PHRASES = [
  '反而', '错了', '推翻', '不再', '改正', '其实不是', '我以为', '现在看来',
]

// ============================================================================
// computeStaleness · 输出 staleness 信号
// ============================================================================

/**
 * 计算 atom 的 staleness 信号 (纯函数)。
 *
 * @param {object} atom · atom JSON
 * @param {Date|number} [now] · 当前时间, 默认 Date.now()
 * @returns {{ age_days, last_access_days, confidence_decay, is_stale }}
 */
export function computeStaleness(atom, now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : now
  const createdMs = atom.createdAt ? new Date(atom.createdAt).getTime() : nowMs
  const age_days = Math.max(0, Math.floor((nowMs - createdMs) / 86400_000))

  // B13 fallback: imported atom 默认 lastAccessedAt=null → 用 createdAt 兜底,
  // 不让"刚 import 的 atom 立即被标 stale"。
  const lastAccessMs = atom.lastAccessedAt
    ? new Date(atom.lastAccessedAt).getTime()
    : createdMs
  const last_access_days = Math.max(0, Math.floor((nowMs - lastAccessMs) / 86400_000))

  // 半衰期 180 天的指数衰减 (D-006)
  const base_decay = 1 - Math.exp(-Math.LN2 * age_days / HALF_LIFE_DAYS)

  // locked atom 抗衰减 (D-006)
  const locked_factor = atom.stats?.locked ? 0 : 1

  // 长期未访问加成 1.5x (D-006)
  const access_factor = last_access_days > LONG_UNTOUCHED_DAYS ? 1.5 : 1.0

  // profile 特殊因子 (D-008, B12): kind=profile 且 verifiedAt 距今 > 90 天 → 1.5x
  // 数据上 profile atom 由 bootstrap-skill change 引入; cognitive-evolution PR
  // merge 时此分支不会被触发 (corpus 中无 profile), 行为向后兼容。
  let profile_factor = 1.0
  if (atom.kind === 'profile') {
    if (atom.verifiedAt) {
      const verifiedMs = new Date(atom.verifiedAt).getTime()
      const verified_days = Math.floor((nowMs - verifiedMs) / 86400_000)
      if (verified_days > PROFILE_VERIFIED_GRACE_DAYS) profile_factor = 1.5
    }
    // verifiedAt 缺失: profile 尚未校准, 用户还没声明 declared 偏好,
    // 不额外加成 (D-007 v1 仅观察)。
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

// ============================================================================
// updateAccessTime · 节流写 lastAccessedAt
// ============================================================================

/**
 * 节流更新 atom 的 lastAccessedAt 字段。
 * 距上次写入 < 1 小时则跳过磁盘写入 (D-004 风险2 缓解)。
 *
 * 失败回退: 文件不存在 / 解析失败 / 写入失败 → 静默吞错, 返回 updated=false。
 * 调用方负责 stderr 一行 warning (会话内首次)。
 *
 * @param {string} atomFile · 绝对路径
 * @param {Date|number} [now]
 * @returns {Promise<{ updated: boolean, lastAccessedAt: string|null }>}
 */
export async function updateAccessTime(atomFile, now = Date.now()) {
  if (!existsSync(atomFile)) return { updated: false, lastAccessedAt: null }
  const nowMs = now instanceof Date ? now.getTime() : now
  const nowIso = new Date(nowMs).toISOString()

  let atom
  try {
    atom = JSON.parse(await readFile(atomFile, 'utf8'))
  } catch {
    return { updated: false, lastAccessedAt: null }
  }

  const previousMs = atom.lastAccessedAt ? new Date(atom.lastAccessedAt).getTime() : 0
  if (nowMs - previousMs < ACCESS_THROTTLE_MS) {
    return { updated: false, lastAccessedAt: atom.lastAccessedAt || null }
  }

  atom.lastAccessedAt = nowIso
  try {
    await writeFile(atomFile, JSON.stringify(atom, null, 2) + '\n')
    return { updated: true, lastAccessedAt: nowIso }
  } catch {
    return { updated: false, lastAccessedAt: atom.lastAccessedAt || null }
  }
}

// ============================================================================
// detectCollision · keyword overlap + 反义短语库 (D-007)
// ============================================================================

function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[\s,，;；。.!?！?]+/)
      .filter(t => t.length > 1),
  )
}

function jaccardOverlap(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  return intersection / (a.size + b.size - intersection)
}

/**
 * 检测新 atom 与现有 corpus 的 collision_candidates (纯函数)。
 *
 * 触发条件 (D-007):
 *   - keyword overlap (insight Jaccard) > 0.5, 或
 *   - 反义短语命中
 * 候选过滤: tags 重叠 ≥ 0.3 或 role/situation 字段相同 (top-N 候选)。
 *
 * 内部跳过 archived / superseded 的 atom — 不和已死的 atom 比较。
 *
 * @param {object} newAtom · 即将写入的 atom
 * @param {Array<object>} corpus · 全库 atom 列表
 * @param {{ maxCandidates?: number }} [opts]
 * @returns {Array<{ id, name, score, reason }>}
 */
export function detectCollision(newAtom, corpus, { maxCandidates = 3 } = {}) {
  const newTags = new Set((newAtom.tags || []).map(t => String(t).toLowerCase()))
  const newRole = (newAtom.role || '').toLowerCase()
  const newSituation = (newAtom.situation || '').toLowerCase()
  const newInsightLower = String(newAtom.insight || newAtom.summary || '').toLowerCase()
  const newInsightTokens = tokens(newAtom.insight || newAtom.summary)

  const scored = []
  for (const existing of corpus) {
    if (!existing || existing.id === newAtom.id) continue
    if (existing.archivedAt || existing.supersededBy) continue

    const existTags = new Set((existing.tags || []).map(t => String(t).toLowerCase()))
    const existInsightTokens = tokens(existing.insight || existing.summary)

    const tagOverlap = jaccardOverlap(newTags, existTags)
    const roleMatch = newRole && existing.role && newRole === String(existing.role).toLowerCase()
    const situationMatch = newSituation && existing.situation && newSituation === String(existing.situation).toLowerCase()

    if (tagOverlap < 0.3 && !roleMatch && !situationMatch) continue

    const insightOverlap = jaccardOverlap(newInsightTokens, existInsightTokens)

    let antonymHit = null
    for (const phrase of ANTONYM_PHRASES) {
      if (newInsightLower.includes(phrase)) { antonymHit = phrase; break }
    }

    if (insightOverlap < 0.5 && !antonymHit) continue

    const score = Math.min(1, insightOverlap + (antonymHit ? 0.4 : 0))
    const reasons = []
    if (tagOverlap >= 0.3) reasons.push(`tags ${(tagOverlap * 100).toFixed(0)}% 重叠`)
    if (insightOverlap >= 0.5) reasons.push(`insight ${(insightOverlap * 100).toFixed(0)}% 关键词重叠`)
    if (antonymHit) reasons.push(`含反义短语 '${antonymHit}'`)

    scored.push({
      id: existing.id,
      name: existing.name || existing.title,
      score,
      reason: reasons.join(' + '),
    })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxCandidates)
}

// ============================================================================
// applySupersede · 取代旧 atom 并 (默认) 软删除
// ============================================================================

/**
 * 执行 supersede 操作。
 * 步骤 (design §5.1.3):
 *   1. 校验旧 atom 存在且未 locked / 未 archived
 *   2. 通过 writeAtom 创建新 atom (调用方负责 schema 校验, 跳过 collision check)
 *   3. 设新 atom.supersedes = [oldId, ...旧链合并]
 *   4. 设旧 atom.supersededBy = newId + (默认) archivedAt = now
 *   5. rebuildIndex
 *
 * @param {{ dataDir, findAtomFileById, writeAtom, rebuildIndex }} deps
 * @param {{ oldId: string, newAtom: object, archiveOld?: boolean }} args
 * @returns {Promise<{ oldFile, newFile, oldId, newId }>}
 * @throws Error code 'OLD_NOT_FOUND' | 'OLD_LOCKED' | 'OLD_ALREADY_ARCHIVED'
 */
export async function applySupersede(deps, args) {
  const { dataDir, findAtomFileById, writeAtom, rebuildIndex } = deps
  const { oldId, newAtom, archiveOld = true } = args
  const now = new Date().toISOString()

  const hit = await findAtomFileById(dataDir, oldId)
  if (!hit) { const e = new Error(`Old atom not found: ${oldId}`); e.code = 'OLD_NOT_FOUND'; throw e }
  if (hit.atom.stats?.locked) { const e = new Error(`Old atom is locked: ${oldId}`); e.code = 'OLD_LOCKED'; throw e }
  if (hit.atom.archivedAt) { const e = new Error(`Old atom already archived: ${oldId}`); e.code = 'OLD_ALREADY_ARCHIVED'; throw e }

  // 合并被取代的链 (单向链表): 新 atom.supersedes = [oldId] ∪ 旧 atom.supersedes
  newAtom.supersedes = Array.from(new Set([
    oldId,
    ...(hit.atom.supersedes || []),
    ...(newAtom.supersedes || []),
  ]))

  // 写新 atom (调用方注入的 writeAtom 负责 schema 校验、id 生成、写文件、append usage-log)
  const newWrite = await writeAtom(newAtom, { skipCollisionCheck: true })

  // 更新旧 atom: supersededBy + (默认) archivedAt
  hit.atom.supersededBy = newWrite.atom.id
  hit.atom.updatedAt = now
  if (archiveOld) hit.atom.archivedAt = now

  await writeFile(hit.file, JSON.stringify(hit.atom, null, 2) + '\n')
  await rebuildIndex(dataDir)

  return {
    oldFile: hit.file,
    newFile: newWrite.path,
    oldId,
    newId: newWrite.atom.id,
  }
}

// ============================================================================
// applyArchive · 软删除 / 反归档
// ============================================================================

/**
 * archive 或 restore 一个 atom (D-002)。
 *
 * @param {{ dataDir, findAtomFileById, rebuildIndex }} deps
 * @param {{ id: string, reason?: string, restore?: boolean }} args
 * @returns {Promise<{ atomId, archivedAt: string|null, restored?: boolean }>}
 * @throws Error code 'NOT_FOUND' | 'LOCKED' | 'NOT_ARCHIVED'
 */
export async function applyArchive(deps, args) {
  const { dataDir, findAtomFileById, rebuildIndex } = deps
  const { id, reason, restore = false } = args
  const now = new Date().toISOString()

  const hit = await findAtomFileById(dataDir, id)
  if (!hit) { const e = new Error(`Atom not found: ${id}`); e.code = 'NOT_FOUND'; throw e }
  if (hit.atom.stats?.locked) { const e = new Error(`Atom is locked: ${id}`); e.code = 'LOCKED'; throw e }

  if (restore) {
    if (!hit.atom.archivedAt) { const e = new Error(`Atom is not archived: ${id}`); e.code = 'NOT_ARCHIVED'; throw e }
    delete hit.atom.archivedAt
    delete hit.atom.archivedReason
  } else {
    hit.atom.archivedAt = now
    if (reason) hit.atom.archivedReason = String(reason).slice(0, 500)
  }

  hit.atom.updatedAt = now
  await writeFile(hit.file, JSON.stringify(hit.atom, null, 2) + '\n')
  await rebuildIndex(dataDir)

  return {
    atomId: id,
    archivedAt: hit.atom.archivedAt || null,
    restored: restore || undefined,
  }
}

// ============================================================================
// detectPruneCandidates · 三维度并集 dry-run (D-005)
// ============================================================================

/**
 * 扫描 corpus 找出 prune 候选 (纯函数, 仅 dry-run, 调用方负责裁决)。
 *
 * 三维度 (并集, design §3.3):
 *   (a) 同 tags 组内 insight 矛盾 (反义短语命中) — 标记较旧那条
 *   (b) lastAccessedAt > 180 天 且 confidence_decay > 0.7
 *   (c) codeArtifacts/screenshots 引用文件已不存在 — v1 不实现 (需要 dataDir IO)
 *
 * @param {Array<object>} corpus · 全库 atom (内部过滤 archived/superseded)
 * @param {{ limit?: number, now?: Date|number }} [opts]
 * @returns {{ candidates: Array<object>, summary: object }}
 */
export function detectPruneCandidates(corpus, { limit = 10, now = Date.now() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : now

  const enriched = corpus
    .filter(a => a && !a.archivedAt && !a.supersededBy)
    .map(a => ({ atom: a, staleness: computeStaleness(a, nowMs) }))

  // 维度 (a) · 同 tag 组内含反义短语的 atom (旧的标为候选)
  const byTag = new Map()
  for (const { atom } of enriched) {
    for (const tag of atom.tags || []) {
      if (!byTag.has(tag)) byTag.set(tag, [])
      byTag.get(tag).push(atom)
    }
  }
  const contradictionIds = new Set()
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
        const aiTs = new Date(ai.createdAt || 0).getTime()
        const ajTs = new Date(aj.createdAt || 0).getTime()
        contradictionIds.add(aiTs > ajTs ? aj.id : ai.id)
      }
    }
  }

  // 维度 (b) · 长期未访问 + 高 confidence_decay
  const longUntouchedIds = new Set()
  for (const { atom, staleness } of enriched) {
    if (staleness.last_access_days > 180 && staleness.confidence_decay > 0.7) {
      longUntouchedIds.add(atom.id)
    }
  }

  // 维度 (c) · broken-ref · v1 留 stub, 待 v2 接入 dataDir 文件存在性检查
  const brokenRefIds = new Set()

  const candidates = []
  for (const { atom, staleness } of enriched) {
    const reasons = []
    let suggested_action = 'archive'
    if (contradictionIds.has(atom.id)) { reasons.push('contradiction'); suggested_action = 'supersede' }
    if (longUntouchedIds.has(atom.id)) reasons.push('long-untouched')
    if (brokenRefIds.has(atom.id)) reasons.push('broken-ref')
    if (reasons.length === 0) continue
    candidates.push({
      id: atom.id,
      name: atom.name || atom.title,
      reasons,
      age_days: staleness.age_days,
      last_access_days: staleness.last_access_days,
      confidence_decay: Number(staleness.confidence_decay.toFixed(2)),
      suggested_action,
    })
  }

  // 排序: contradiction 优先, 其次 confidence_decay 降序
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

// ============================================================================
// applyProfileEvolution · 单例覆写 + previous_versions 入栈 (D-008, D-010)
// ============================================================================

const VALID_PROFILE_TRIGGERS = new Set([
  'bootstrap_initial',
  'bootstrap_rerun',
  'user_calibration',
  'agent_evolution',
  'restore_previous',
])

/**
 * 演化 profile atom (单例 id=atom_profile_main, 用 previous_versions[] 替代 supersede 链)。
 *
 * 步骤 (design §4.2.1):
 *   1. 加载现有 profile (不存在则视为首次创建)
 *   2. 把现有顶层 5 项快照推入 previous_versions[] 顶部 (新→旧)
 *   3. 用 newSnapshot 覆写顶层
 *   4. 更新 lastAccessedAt; user_calibration / restore_previous 时同时更新 verifiedAt
 *   5. 持久化 + reindex
 *
 * @param {{ dataDir, readProfile, writeProfile, rebuildIndex }} deps
 * @param {{ newSnapshot: object, trigger: string, evidenceDelta?: any }} args
 * @returns {Promise<object>} 演化后的最新 profile
 * @throws Error code 'INVALID_TRIGGER'
 */
export async function applyProfileEvolution(deps, args) {
  const { dataDir, readProfile, writeProfile, rebuildIndex } = deps
  const { newSnapshot, trigger, evidenceDelta = null } = args
  const now = new Date().toISOString()

  if (!VALID_PROFILE_TRIGGERS.has(trigger)) {
    const e = new Error(`Invalid trigger: ${trigger}`); e.code = 'INVALID_TRIGGER'; throw e
  }

  let profile = await readProfile(dataDir)

  if (!profile) {
    // 首次创建 (典型: bootstrap_initial)
    profile = {
      id: 'atom_profile_main',
      schemaVersion: 1,
      kind: 'profile',
      createdAt: now,
      updatedAt: now,
      previous_versions: [],
    }
  } else {
    // 把现有顶层 5 项快照入栈 (D-008 步骤 2-3)
    const previousSnapshot = {
      preferences: profile.preferences,
      identity: profile.identity,
      knowledge_domains: profile.knowledge_domains,
      recurring_patterns: profile.recurring_patterns,
      evidence_atom_ids: profile.evidence_atom_ids,
    }
    const hasPrior =
      previousSnapshot.preferences ||
      previousSnapshot.identity ||
      (Array.isArray(previousSnapshot.knowledge_domains) && previousSnapshot.knowledge_domains.length > 0)

    if (hasPrior) {
      profile.previous_versions = profile.previous_versions || []
      const version = profile.previous_versions.length + 1
      profile.previous_versions.unshift({
        version,
        supersededAt: now,
        snapshot: previousSnapshot,
        trigger,
        evidence_delta: evidenceDelta,
      })
    }
  }

  // 覆写顶层 5 项 (undefined 不清空, 调用方提供 null/[] 才清空)
  if (newSnapshot.preferences !== undefined) profile.preferences = newSnapshot.preferences
  if (newSnapshot.identity !== undefined) profile.identity = newSnapshot.identity
  if (newSnapshot.knowledge_domains !== undefined) profile.knowledge_domains = newSnapshot.knowledge_domains
  if (newSnapshot.recurring_patterns !== undefined) profile.recurring_patterns = newSnapshot.recurring_patterns
  if (newSnapshot.evidence_atom_ids !== undefined) profile.evidence_atom_ids = newSnapshot.evidence_atom_ids

  profile.updatedAt = now
  profile.lastAccessedAt = now

  // verified / verifiedAt 仅在用户校准 / restore 时更新 (D-007: v1 仅观察)
  if (trigger === 'user_calibration' || trigger === 'restore_previous') {
    profile.verified = true
    profile.verifiedAt = now
  }

  await writeProfile(dataDir, profile)
  await rebuildIndex(dataDir)

  return profile
}
