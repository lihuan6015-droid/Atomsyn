#!/usr/bin/env node
/**
 * scripts/test/bootstrap-skill-test.mjs
 *
 * 单元测试套件 · bootstrap-skill change. 渐进式扩展:
 *
 *   - A6 (current commit): profile fixture round-trip through `atomsyn-cli reindex`,
 *                          asserts knowledge-index.json contains the profiles bucket.
 *   - G1+ (later): privacy regex, .atomsynignore parser, 5 层归类器 with mock LLM.
 *
 * Run:
 *   node scripts/test/bootstrap-skill-test.mjs
 *   # or: npm run test:bootstrap-skill (added in same commit as test wiring)
 */

import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

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

function setupDataDir() {
  const root = mkdtempSync(join(tmpdir(), 'atomsyn-bootstrap-test-'))
  mkdirSync(join(root, 'atoms', 'profile', 'main'), { recursive: true })
  mkdirSync(join(root, 'atoms', 'experience'), { recursive: true })
  mkdirSync(join(root, 'atoms', 'methodology'), { recursive: true })
  mkdirSync(join(root, 'atoms', 'skill-inventory'), { recursive: true })
  mkdirSync(join(root, 'frameworks'), { recursive: true })
  mkdirSync(join(root, 'index'), { recursive: true })
  return root
}

const PROFILE_FIXTURE = {
  id: 'atom_profile_main',
  schemaVersion: 1,
  kind: 'profile',
  name: '用户元认知画像 - test fixture',
  createdAt: '2026-04-26T10:00:00.000Z',
  updatedAt: '2026-04-26T10:00:00.000Z',
  inferred_at: '2026-04-26T10:00:00.000Z',
  source_summary: 'Test fixture · 0 files scanned',
  verified: false,
  verifiedAt: null,
  identity: {
    role: '前端工程师',
    primary_languages: ['TypeScript'],
  },
  preferences: {
    scope_appetite: 0.7,
    risk_tolerance: 0.4,
    detail_preference: 0.8,
    autonomy: 0.5,
    architecture_care: 0.85,
  },
  knowledge_domains: ['前端工程', 'AI Agent 工作流'],
  recurring_patterns: ['先写测试再动结构'],
  evidence_atom_ids: ['atom_exp_aaa', 'atom_frag_bbb'],
  previous_versions: [],
  stats: {
    usedInProjects: [],
    useCount: 0,
    aiInvokeCount: 0,
    humanViewCount: 0,
    imported: true,
    bootstrap_session_id: 'boot_test_abc',
  },
}

// ============================================================================
// A6 · profile fixture → reindex → assert profiles bucket present
// ============================================================================

await describe('A6 · profile fixture round-trip through atomsyn-cli reindex', async () => {
  const dataDir = setupDataDir()
  try {
    const profileFile = join(
      dataDir,
      'atoms',
      'profile',
      'main',
      'atom_profile_main.json',
    )
    writeFileSync(profileFile, JSON.stringify(PROFILE_FIXTURE, null, 2) + '\n')
    assert(existsSync(profileFile), 'fixture profile written')

    // Run reindex with the tmp data dir override (resolveDataDir respects ATOMSYN_DEV_DATA_DIR)
    const { stdout, stderr } = await exec(NODE, [CLI, 'reindex'], {
      env: { ...process.env, ATOMSYN_DEV_DATA_DIR: dataDir },
      cwd: dataDir,
    })

    const indexFile = join(dataDir, 'index', 'knowledge-index.json')
    assert(existsSync(indexFile), 'knowledge-index.json was written')
    const index = JSON.parse(readFileSync(indexFile, 'utf8'))

    assert(Array.isArray(index.profiles), 'index.profiles is an array')
    assert(index.profiles.length === 1, `index.profiles has 1 entry (got ${index.profiles?.length})`)

    const entry = index.profiles?.[0]
    assert(entry?.id === 'atom_profile_main', 'profile id matches singleton convention')
    assert(entry?.verified === false, 'profile verified=false propagated')
    assert(entry?.verifiedAt === null, 'profile verifiedAt=null propagated')
    assert(entry?.previousVersionsCount === 0, 'previous_versions[] empty → count 0')
    assert(entry?.evidenceCount === 2, `evidence_atom_ids length 2 → evidenceCount 2 (got ${entry?.evidenceCount})`)
    assert(typeof entry?.path === 'string' && entry.path.includes('profile'), 'profile path field present + includes "profile"')

    // Index also keeps the original 4 buckets intact (additive contract)
    assert(Array.isArray(index.atoms), 'index.atoms still present')
    assert(Array.isArray(index.experiences), 'index.experiences still present')
    assert(Array.isArray(index.skillInventory), 'index.skillInventory still present')
    assert(Array.isArray(index.projects), 'index.projects still present')

    // Stderr summary should mention profiles count
    const summaryLine = (stderr || stdout || '').split('\n').find((l) => l.includes('Index rebuilt'))
    assert(summaryLine?.includes('profile'), `reindex summary mentions profiles (got: ${summaryLine?.trim()})`)
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
})

// ============================================================================
// Result
// ============================================================================

console.log(`\n${'─'.repeat(60)}`)
if (failed === 0) {
  console.log(`✅ ${passed} assertions passed`)
  process.exit(0)
} else {
  console.log(`❌ ${failed} assertion(s) failed (${passed} passed)`)
  for (const m of failures) console.log(`   · ${m}`)
  process.exit(1)
}
