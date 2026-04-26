#!/usr/bin/env node
/**
 * scripts/test/cognitive-evolution-test.mjs
 *
 * G1 单元测试套件 · cognitive-evolution change.
 * 5 个 describe block (对应 design.md §11 列出的 5 个测试文件):
 *   1. staleness 公式 (6 case)
 *   2. collision 检测 (反义短语 + keyword overlap)
 *   3. supersede 链 (1/2/3 级)
 *   4. archive / restore (locked atom 拒绝)
 *   5. prune 三维度
 *
 * 使用 Node native test runner (node --test) — 但因为项目用简单 assertion 风格
 * (见 cli-regression.mjs), 这里也保持手写风格便于一致, 命名 npm test 走 cli-regression
 * + 本文件。
 *
 * Run:
 *   node scripts/test/cognitive-evolution-test.mjs
 *   # or via npm script: npm run test:evolution (新增)
 */

import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  computeStaleness,
  detectCollision,
  detectPruneCandidates,
  applySupersede,
  applyArchive,
  applyProfileEvolution,
} from '../lib/evolution.mjs'

const exec = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI = resolve(__dirname, '..', 'atomsyn-cli.mjs')
const NODE = process.execPath

let passed = 0
let failed = 0
const failures = []

function assert(condition, message) {
  if (condition) {
    passed++
  } else {
    failed++
    failures.push(message)
    console.error(`  ✗ ${message}`)
  }
}

function describe(name, fn) {
  console.log(`\n${name}`)
  return fn()
}

// ============================================================================
// 1. evolution.staleness.test.mjs (6 case)
// ============================================================================

describe('1. computeStaleness — 公式 6 case', () => {
  const now = Date.now()

  // Case 1: 刚创建 (0 天)
  const fresh = computeStaleness({ createdAt: new Date(now).toISOString() }, now)
  assert(fresh.age_days === 0, 'fresh atom age_days = 0')
  assert(fresh.confidence_decay === 0, 'fresh atom decay = 0')
  assert(fresh.is_stale === false, 'fresh atom is_stale = false')

  // Case 2: 90 天 (半衰期一半)
  const d90 = computeStaleness({ createdAt: new Date(now - 90 * 86400_000).toISOString() }, now)
  assert(d90.age_days === 90, '90 day age_days = 90')
  assert(d90.confidence_decay > 0.2 && d90.confidence_decay < 0.45, `90 day decay 0.2-0.45 (got ${d90.confidence_decay.toFixed(3)})`)
  assert(d90.is_stale === false, '90 day is_stale = false (still below 0.5 threshold)')

  // Case 3: 180 天 (半衰期)
  const d180 = computeStaleness({ createdAt: new Date(now - 180 * 86400_000).toISOString() }, now)
  assert(d180.age_days === 180, '180 day age_days = 180')
  // 180 day base ≈ 0.5, × access_factor 1.5 = 0.75
  assert(d180.confidence_decay > 0.65 && d180.confidence_decay < 0.85, `180 day decay 0.65-0.85 (got ${d180.confidence_decay.toFixed(3)})`)
  assert(d180.is_stale === true, '180 day is_stale = true')

  // Case 4: 365 天 (是所有)
  const d365 = computeStaleness({ createdAt: new Date(now - 365 * 86400_000).toISOString() }, now)
  assert(d365.age_days === 365, '365 day age_days = 365')
  assert(d365.confidence_decay > 0.9, `365 day decay > 0.9 (got ${d365.confidence_decay.toFixed(3)})`)
  assert(d365.is_stale === true, '365 day is_stale = true')

  // Case 5: locked atom (任何 age 都 decay = 0)
  const locked = computeStaleness({ createdAt: new Date(now - 365 * 86400_000).toISOString(), stats: { locked: true } }, now)
  assert(locked.confidence_decay === 0, 'locked atom decay = 0 regardless of age')
  assert(locked.is_stale === false, 'locked atom is_stale = false')

  // Case 6: 长期未访问 (90 天 atom + lastAccessedAt 100 天前)
  const longUnaccessed = computeStaleness({
    createdAt: new Date(now - 100 * 86400_000).toISOString(),
    lastAccessedAt: new Date(now - 100 * 86400_000).toISOString(),
  }, now)
  // base @ 100 day ≈ 0.32, × access_factor 1.5 (since 100 > 90) = 0.48
  assert(longUnaccessed.last_access_days === 100, 'long-unaccessed last_access_days = 100')
  assert(longUnaccessed.confidence_decay > 0.4 && longUnaccessed.confidence_decay < 0.6, `long-unaccessed decay 0.4-0.6 (got ${longUnaccessed.confidence_decay.toFixed(3)})`)

  // B12 case: profile atom 90+ 天未校准 → profile_factor 1.5
  const profileStale = computeStaleness({
    kind: 'profile',
    createdAt: new Date(now - 200 * 86400_000).toISOString(),
    verifiedAt: new Date(now - 100 * 86400_000).toISOString(),
  }, now)
  // 200 day age, 100 day verifiedAt → profile_factor 1.5, access_factor 1.5
  // base ≈ 0.54, × 1.5 × 1.5 = 1.21 → clamp 1.0
  assert(profileStale.confidence_decay === 1, 'profile atom 90+ days unverified → decay clamped to 1.0')

  // B12 case: profile atom 30 天前 verified → profile_factor 1.0 (within grace)
  const profileFresh = computeStaleness({
    kind: 'profile',
    createdAt: new Date(now - 200 * 86400_000).toISOString(),
    verifiedAt: new Date(now - 30 * 86400_000).toISOString(),
  }, now)
  // 200 day age + recent verifiedAt → access_factor 1.5 only, profile_factor 1.0
  assert(profileFresh.confidence_decay > 0.6 && profileFresh.confidence_decay < 0.95, `profile recent-verified decay 0.6-0.95 (got ${profileFresh.confidence_decay.toFixed(3)})`)
  assert(profileFresh.is_stale === true, 'profile recent-verified still is_stale (200 day base + access_factor)')
})

// ============================================================================
// 2. evolution.collision.test.mjs (反义短语 + keyword overlap)
// ============================================================================

describe('2. detectCollision — 反义短语 + keyword overlap', () => {
  const corpus = [
    {
      id: 'atom_old',
      name: 'Tauri 公证用 notarytool',
      tags: ['tauri', 'macos', 'notarytool'],
      role: '工程',
      situation: '踩坑当下',
      insight: 'Tauri macOS 公证流程必须使用 notarytool 而非 altool, 这是 Apple 强制的迁移路径。',
    },
    {
      id: 'atom_unrelated',
      name: '无关 atom',
      tags: ['react', 'state'],
      insight: 'React useState 适合本地状态。',
    },
  ]

  // 反义短语命中
  const newAntonym = {
    id: 'atom_new',
    tags: ['tauri', 'macos', 'notarytool'],
    role: '工程',
    insight: '我以为 Tauri 公证必须用 notarytool, 现在看来 altool 才是新方案, 反而 notarytool 已被废弃。',
  }
  const c1 = detectCollision(newAntonym, corpus)
  assert(c1.length >= 1, 'antonym phrase triggers collision')
  assert(c1[0].id === 'atom_old', 'antonym candidate is atom_old')
  assert(c1[0].reason.includes('反义短语') || c1[0].reason.includes('我以为'), `reason mentions antonym (got: ${c1[0].reason})`)

  // 高 keyword overlap (无反义)
  const newOverlap = {
    id: 'atom_new2',
    tags: ['tauri', 'macos', 'notarytool'],
    role: '工程',
    insight: 'Tauri macOS 公证流程必须使用 notarytool 而非 altool, 这是 Apple 强制的迁移路径。完全相同的话。',
  }
  const c2 = detectCollision(newOverlap, corpus)
  assert(c2.length >= 1, 'high keyword overlap triggers collision')

  // 完全无关
  const newClean = {
    id: 'atom_new3',
    tags: ['python', 'logging'],
    insight: 'Python logging 配置时记得调 propagate=False。',
  }
  const c3 = detectCollision(newClean, corpus)
  assert(c3.length === 0, 'unrelated atom has no collision')

  // archived atom 不参与比较
  const corpusWithArchived = [
    ...corpus,
    { id: 'atom_archived', tags: ['tauri', 'macos'], archivedAt: '2025-01-01', insight: '我以为 X' },
  ]
  const c4 = detectCollision(newClean, corpusWithArchived)
  assert(c4.find(c => c.id === 'atom_archived') === undefined, 'archived atom skipped')
})

// ============================================================================
// 3. evolution.supersede.test.mjs (1/2/3 级链)
// ============================================================================

describe('3. applySupersede — 1/2/3 级 supersede 链', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evo-test-'))
  const writeAtomMock = (atom, _opts) => Promise.resolve({ atom, path: join(tmp, `${atom.id}.json`) })
  const rebuildIndexMock = () => Promise.resolve()

  // Setup: 第 1 级 atom (无前置)
  const v1 = { id: 'atom_v1', name: 'V1', stats: { useCount: 0 }, createdAt: '2025-01-01', updatedAt: '2025-01-01' }
  writeFileSync(join(tmp, 'atom_v1.json'), JSON.stringify(v1, null, 2))
  const findById1 = (_dir, id) => Promise.resolve(id === 'atom_v1' ? { file: join(tmp, 'atom_v1.json'), atom: { ...v1 } } : null)

  // Supersede V1 → V2
  const r1 = await applySupersede(
    { dataDir: tmp, findAtomFileById: findById1, writeAtom: writeAtomMock, rebuildIndex: rebuildIndexMock },
    { oldId: 'atom_v1', newAtom: { id: 'atom_v2', name: 'V2', stats: { useCount: 0 } } }
  )
  assert(r1.newId === 'atom_v2', 'V1→V2 newId correct')
  const v1after = JSON.parse(readFileSync(join(tmp, 'atom_v1.json'), 'utf8'))
  assert(v1after.supersededBy === 'atom_v2', 'V1 supersededBy = atom_v2')
  assert(v1after.archivedAt, 'V1 archived by default')

  // 第 2 级: V2 → V3 (V2 已经 supersedes [V1], V3 应该 supersedes [V1, V2])
  const v2WithChain = { id: 'atom_v2', name: 'V2', supersedes: ['atom_v1'], stats: { useCount: 0 }, createdAt: '2025-02-01', updatedAt: '2025-02-01' }
  writeFileSync(join(tmp, 'atom_v2.json'), JSON.stringify(v2WithChain, null, 2))
  const findById2 = (_dir, id) => Promise.resolve(id === 'atom_v2' ? { file: join(tmp, 'atom_v2.json'), atom: { ...v2WithChain } } : null)

  const newAtomV3 = { id: 'atom_v3', name: 'V3', stats: { useCount: 0 } }
  const r2 = await applySupersede(
    { dataDir: tmp, findAtomFileById: findById2, writeAtom: writeAtomMock, rebuildIndex: rebuildIndexMock },
    { oldId: 'atom_v2', newAtom: newAtomV3 }
  )
  assert(r2.newId === 'atom_v3', 'V2→V3 newId correct')
  assert(newAtomV3.supersedes.includes('atom_v1') && newAtomV3.supersedes.includes('atom_v2'), 'V3 supersedes [V1, V2] (chain merged)')

  // OLD_LOCKED 错误
  const lockedAtom = { id: 'atom_locked', name: 'L', stats: { locked: true }, createdAt: '2025-01-01' }
  writeFileSync(join(tmp, 'atom_locked.json'), JSON.stringify(lockedAtom, null, 2))
  const findLocked = (_dir, id) => Promise.resolve(id === 'atom_locked' ? { file: join(tmp, 'atom_locked.json'), atom: lockedAtom } : null)

  let lockedThrew = false
  try {
    await applySupersede(
      { dataDir: tmp, findAtomFileById: findLocked, writeAtom: writeAtomMock, rebuildIndex: rebuildIndexMock },
      { oldId: 'atom_locked', newAtom: { id: 'atom_new', stats: {} } }
    )
  } catch (err) {
    lockedThrew = err.code === 'OLD_LOCKED'
  }
  assert(lockedThrew, 'supersede locked atom throws OLD_LOCKED')

  rmSync(tmp, { recursive: true, force: true })
})

// ============================================================================
// 4. cli.archive-restore.test.mjs (archive after read 不返 / restore / locked 拒绝)
// ============================================================================

describe('4. CLI archive + restore — 端到端', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'archive-test-'))
  process.env.ATOMSYN_DEV_DATA_DIR = tmp
  mkdirSync(join(tmp, 'atoms', 'experience', 'a'), { recursive: true })
  mkdirSync(join(tmp, 'growth'), { recursive: true })
  mkdirSync(join(tmp, 'index'), { recursive: true })

  const seedAtom = {
    id: 'atom_exp_arc_test',
    schemaVersion: 1,
    kind: 'experience',
    subKind: 'crystallized',
    name: 'archive test',
    sourceAgent: 'user',
    sourceContext: 'x',
    insight: 'This is the seed atom long enough to satisfy schema validation requirement (50 chars min). Used by archive-restore round-trip test.',
    tags: ['arc'],
    role: '工程', situation: '踩坑当下', activity: '验证', insight_type: '方法验证',
    stats: { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 },
    createdAt: '2025-08-01T00:00:00Z',
    updatedAt: '2025-08-01T00:00:00Z',
  }
  writeFileSync(join(tmp, 'atoms/experience/a/atom_exp_arc_test.json'), JSON.stringify(seedAtom, null, 2))

  // archive
  const archive = await exec(NODE, [CLI, 'archive', '--id', 'atom_exp_arc_test', '--reason', 'test'], { env: { ...process.env, ATOMSYN_DEV_DATA_DIR: tmp } })
  const archResult = JSON.parse(archive.stdout)
  assert(archResult.ok === true, 'archive returns ok=true')
  assert(archResult.archivedAt, 'archive sets archivedAt')

  // read 不返 archived atom
  const read = await exec(NODE, [CLI, 'read', '--query', 'archive', '--json'], { env: { ...process.env, ATOMSYN_DEV_DATA_DIR: tmp } })
  const readResult = JSON.parse(read.stdout)
  assert(readResult.experiences.find(e => e.id === 'atom_exp_arc_test') === undefined, 'archived atom hidden from read')

  // restore
  const restore = await exec(NODE, [CLI, 'archive', '--id', 'atom_exp_arc_test', '--restore'], { env: { ...process.env, ATOMSYN_DEV_DATA_DIR: tmp } })
  const restoreResult = JSON.parse(restore.stdout)
  assert(restoreResult.ok === true && restoreResult.restored === true, 'restore returns ok + restored')

  // read 重新看到
  const read2 = await exec(NODE, [CLI, 'read', '--query', 'archive', '--json'], { env: { ...process.env, ATOMSYN_DEV_DATA_DIR: tmp } })
  const read2Result = JSON.parse(read2.stdout)
  assert(read2Result.experiences.find(e => e.id === 'atom_exp_arc_test') !== undefined, 'restored atom visible again')

  // locked atom 拒绝 archive
  const lockedAtom = { ...seedAtom, id: 'atom_exp_locked_test', stats: { ...seedAtom.stats, locked: true } }
  writeFileSync(join(tmp, 'atoms/experience/a/atom_exp_locked_test.json'), JSON.stringify(lockedAtom, null, 2))
  let lockedExitCode = 0
  try {
    await exec(NODE, [CLI, 'archive', '--id', 'atom_exp_locked_test'], { env: { ...process.env, ATOMSYN_DEV_DATA_DIR: tmp } })
  } catch (err) {
    lockedExitCode = err.code
  }
  assert(lockedExitCode === 3, `archive locked atom → exit 3 (got ${lockedExitCode})`)

  rmSync(tmp, { recursive: true, force: true })
})

// ============================================================================
// 5. cli.prune.test.mjs (三维度 + dry-run)
// ============================================================================

describe('5. detectPruneCandidates — 三维度并集', () => {
  const now = Date.now()
  const corpus = [
    // 1. fresh atom — 不应触发
    { id: 'atom_a', name: 'fresh', tags: ['x'], createdAt: new Date(now).toISOString(), insight: 'fresh' },
    // 2. long-untouched + low confidence — 应触发 long-untouched
    { id: 'atom_b', name: 'old', tags: ['y'], createdAt: new Date(now - 365 * 86400_000).toISOString(), insight: 'long old' },
    // 3. archived — 不应触发 (filter 掉)
    { id: 'atom_c', name: 'arc', tags: ['z'], createdAt: new Date(now - 365 * 86400_000).toISOString(), archivedAt: new Date(now).toISOString(), insight: 'archived' },
    // 4 + 5: 同 tag 反义短语 — 4 是 contradiction
    { id: 'atom_d', name: 'old-d', tags: ['debate'], createdAt: new Date(now - 30 * 86400_000).toISOString(), insight: '原本认为 X 是对的' },
    { id: 'atom_e', name: 'new-e', tags: ['debate'], createdAt: new Date(now - 5 * 86400_000).toISOString(), insight: '我以为 X 是对的, 现在看来反而是 Y' },
  ]

  const result = detectPruneCandidates(corpus, { now })

  assert(result.summary.total_atoms === 4, `total_atoms = 4 (fresh + old + d + e, archived 被过滤; got ${result.summary.total_atoms})`)
  assert(result.candidates.find(c => c.id === 'atom_a') === undefined, 'fresh atom not in candidates')
  assert(result.candidates.find(c => c.id === 'atom_b'), 'long-untouched atom in candidates')
  assert(result.candidates.find(c => c.id === 'atom_b').reasons.includes('long-untouched'), 'atom_b reason includes long-untouched')
  assert(result.candidates.find(c => c.id === 'atom_c') === undefined, 'archived atom filtered')
  assert(result.candidates.find(c => c.id === 'atom_d'), 'older contradiction atom in candidates')
  assert(result.candidates.find(c => c.id === 'atom_d').reasons.includes('contradiction'), 'atom_d contradiction')
  assert(result.candidates.find(c => c.id === 'atom_e') === undefined, 'newer atom in pair NOT flagged (only the older)')

  // contradiction 优先排序
  if (result.candidates.length >= 2) {
    assert(result.candidates[0].reasons.includes('contradiction'), 'contradiction sorted first')
  }
})

// ============================================================================
// applyArchive · 直接测 (locked atom 拒绝)
// ============================================================================

describe('6. applyArchive — locked / restore / not-archived', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'archive2-test-'))
  const a = { id: 'atom_test', name: 'test', stats: {}, createdAt: '2025-01-01' }
  writeFileSync(join(tmp, 'atom_test.json'), JSON.stringify(a, null, 2))
  const findById = (_dir, id) => Promise.resolve(id === 'atom_test' ? { file: join(tmp, 'atom_test.json'), atom: { ...JSON.parse(readFileSync(join(tmp, 'atom_test.json'), 'utf8')) } } : null)
  const rebuildMock = () => Promise.resolve()

  // 正常 archive
  const r1 = await applyArchive({ dataDir: tmp, findAtomFileById: findById, rebuildIndex: rebuildMock }, { id: 'atom_test', reason: 'test' })
  assert(r1.archivedAt !== null, 'archive sets archivedAt')

  // restore
  const r2 = await applyArchive({ dataDir: tmp, findAtomFileById: findById, rebuildIndex: rebuildMock }, { id: 'atom_test', restore: true })
  assert(r2.restored === true, 'restore returns restored=true')
  assert(r2.archivedAt === null, 'restore clears archivedAt')

  // 重复 restore 抛 NOT_ARCHIVED
  let notArchivedThrew = false
  try {
    await applyArchive({ dataDir: tmp, findAtomFileById: findById, rebuildIndex: rebuildMock }, { id: 'atom_test', restore: true })
  } catch (err) {
    notArchivedThrew = err.code === 'NOT_ARCHIVED'
  }
  assert(notArchivedThrew, 'restore non-archived → NOT_ARCHIVED')

  rmSync(tmp, { recursive: true, force: true })
})

// ============================================================================
// 7. applyProfileEvolution · D-008 单例 + previous_versions 入栈
// ============================================================================

describe('7. applyProfileEvolution — 单例 + previous_versions 入栈', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'profile-test-'))
  let savedProfile = null
  const readProfile = async () => savedProfile ? { ...savedProfile } : null
  const writeProfile = async (_dir, p) => { savedProfile = p }
  const rebuildMock = () => Promise.resolve()
  const deps = { dataDir: tmp, readProfile, writeProfile, rebuildIndex: rebuildMock }

  // 第 1 次 (bootstrap_initial): previous_versions 应为空
  const v1 = await applyProfileEvolution(deps, {
    newSnapshot: {
      preferences: { scope_appetite: 'moderate' },
      identity: { role: 'engineer' },
      knowledge_domains: ['tauri', 'react'],
      recurring_patterns: ['过度工程化'],
      evidence_atom_ids: ['atom_a', 'atom_b'],
    },
    trigger: 'bootstrap_initial',
  })
  assert(v1.id === 'atom_profile_main', 'profile id is singleton atom_profile_main')
  assert(v1.previous_versions.length === 0, 'first time: previous_versions empty')
  assert(v1.preferences.scope_appetite === 'moderate', 'first time: top-level preferences set')
  assert(v1.verifiedAt === undefined, 'bootstrap_initial does NOT set verifiedAt (D-007 v1 仅观察)')

  // 第 2 次 (user_calibration): 第 1 次的快照应入栈, verifiedAt 应被设
  const v2 = await applyProfileEvolution(deps, {
    newSnapshot: {
      preferences: { scope_appetite: 'aggressive' },
      identity: { role: 'engineer-architect' },
    },
    trigger: 'user_calibration',
  })
  assert(v2.previous_versions.length === 1, 'second time: previous_versions has 1 entry')
  assert(v2.previous_versions[0].snapshot.preferences.scope_appetite === 'moderate', 'snapshot preserves OLD preferences')
  assert(v2.preferences.scope_appetite === 'aggressive', 'top-level overwritten with new preferences')
  assert(v2.verifiedAt !== undefined, 'user_calibration sets verifiedAt')
  assert(v2.previous_versions[0].trigger === 'user_calibration', 'previous_versions records trigger')

  // 第 3 次 (agent_evolution): 第 2 次的快照应入栈 (顶部, 新→旧)
  const v3 = await applyProfileEvolution(deps, {
    newSnapshot: { preferences: { scope_appetite: 'cautious' } },
    trigger: 'agent_evolution',
  })
  assert(v3.previous_versions.length === 2, 'third time: previous_versions has 2 entries')
  assert(v3.previous_versions[0].snapshot.preferences.scope_appetite === 'aggressive', 'newest snapshot at top (v2)')
  assert(v3.previous_versions[1].snapshot.preferences.scope_appetite === 'moderate', 'oldest at bottom (v1)')

  // 第 4 次 INVALID_TRIGGER
  let invalidThrew = false
  try {
    await applyProfileEvolution(deps, { newSnapshot: {}, trigger: 'foo' })
  } catch (err) {
    invalidThrew = err.code === 'INVALID_TRIGGER'
  }
  assert(invalidThrew, 'invalid trigger → INVALID_TRIGGER')

  rmSync(tmp, { recursive: true, force: true })
})

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.error('Failures:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
