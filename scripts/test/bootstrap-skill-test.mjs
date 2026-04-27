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
// G1 · privacy.mjs scanner — 14 patterns, strong vs weak split
// ============================================================================

await describe('G1 · privacy scanner — strong / weak sensitive matches', async () => {
  const privacy = await import(resolve(__dirname, '..', 'lib', 'bootstrap', 'privacy.mjs'))

  // Strong sensitive (file should be skipped entirely)
  const strongSamples = [
    { tag: 'OpenAI key',     text: 'API_KEY = sk-1234567890abcdefghij1234567890' },
    { tag: 'Anthropic key',  text: 'export ANTHROPIC_KEY="sk-ant-abcdef-1234567890123456789012"' },
    { tag: 'GitHub PAT',     text: 'token: ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' },
    { tag: 'AWS access key', text: 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF' },
    { tag: 'Private key',    text: '-----BEGIN RSA PRIVATE KEY-----\nMIIEow…' },
    { tag: 'password=',      text: 'config: { password = "supersecret123" }' },
  ]
  for (const s of strongSamples) {
    const scan = privacy.scanText(s.text)
    assert(privacy.isStrongSensitive(scan), `${s.tag} → isStrongSensitive=true`)
    assert(scan.strong.length >= 1, `${s.tag} → at least 1 strong hit recorded`)
  }

  // Negative: ordinary text should NOT trigger strong
  const cleanText = '这是一段普通的笔记，讲讲方法论怎么用。没有任何敏感字符串。'
  const cleanScan = privacy.scanText(cleanText)
  assert(!privacy.isStrongSensitive(cleanScan), 'clean text → isStrongSensitive=false')

  // Weak sensitive (file kept, fields redacted)
  const weakText = 'contact me at john.doe@example.com or 13912345678'
  const { text: redacted, replaced } = privacy.redactWeakInText(weakText)
  assert(redacted.includes('[REDACTED'), 'weak redact replaces email/phone with marker')
  assert(!redacted.includes('john.doe@example.com'), 'original email is not in redacted output')
  assert(!redacted.includes('13912345678'), 'original phone is not in redacted output')
  const totalReplaced = Object.values(replaced).reduce((a, b) => a + b, 0)
  assert(totalReplaced >= 2, `weak redact reports ≥ 2 replacements (got ${totalReplaced})`)
  assert(replaced.email === 1, 'email match count = 1')
  assert(replaced['cn-phone'] === 1, 'cn-phone match count = 1')
})

// ============================================================================
// G1 · ignore.mjs parser — gitignore semantics + builtin fallback
// ============================================================================

await describe('G1 · .atomsynignore parser — globs / negation / dirs / fallback', async () => {
  const ignoreMod = await import(resolve(__dirname, '..', 'lib', 'bootstrap', 'ignore.mjs'))

  // 1) parseIgnoreFile + buildMatcher: explicit patterns
  const text = `
# comment line
*.env
node_modules/
.ssh/
!important.env
/private/
*.pem
`.trim()
  const patterns = ignoreMod.parseIgnoreFile(text)
  const matcher = ignoreMod.buildMatcher(patterns)

  // *.env should match
  assert(matcher('app.env', false), '*.env matches app.env')
  assert(matcher('config/local.env', false), '*.env matches nested .env')
  // negation re-allows
  assert(!matcher('important.env', false), '!important.env un-ignores')
  // node_modules dir
  assert(matcher('node_modules', true), 'node_modules/ matches dir')
  assert(matcher('node_modules/foo/bar.js', false), 'descent into node_modules ignored')
  // .ssh dir
  assert(matcher('.ssh', true), '.ssh/ matches dir')
  // anchored /private/
  assert(matcher('private', true), '/private/ matches top-level')
  assert(matcher('private/key.pem', false), 'descent into private/ ignored')
  // *.pem matches anywhere
  assert(matcher('keys/id_rsa.pem', false), '*.pem matches nested')

  // 2) loadIgnoreForRoot fallback when no .atomsynignore present
  const tmpRoot = mkdtempSync(join(tmpdir(), 'atomsyn-ignore-test-'))
  try {
    const { matcher: fbMatcher, sourceFile, patternCount } = await ignoreMod.loadIgnoreForRoot(tmpRoot)
    assert(sourceFile === null, 'no .atomsynignore → sourceFile null (fallback active)')
    assert(patternCount > 10, `builtin fallback has > 10 patterns (got ${patternCount})`)
    assert(fbMatcher('node_modules', true), 'fallback matches node_modules/')
    assert(fbMatcher('.git', true), 'fallback matches .git/')
    assert(fbMatcher('foo.env', false), 'fallback matches *.env')
    assert(fbMatcher('id_rsa', false), 'fallback matches id_rsa*')
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

// ============================================================================
// G7 · privacy end-to-end — sensitive file written to fixture, scanFile detects
// ============================================================================

await describe('G7 · privacy end-to-end — sk-* file is flagged + nothing leaks downstream', async () => {
  const privacy = await import(resolve(__dirname, '..', 'lib', 'bootstrap', 'privacy.mjs'))
  // Use sk-<30 alphanumerics> shape (the openai-api-key regex requires 20+
  // alphanumeric chars after `sk-`, NOT containing `-`).
  const SECRET = 'sk-' + 'abcdef0123456789ABCDEF0123456789'
  const tmpRoot = mkdtempSync(join(tmpdir(), 'atomsyn-priv-e2e-'))
  try {
    const sensitiveFile = join(tmpRoot, 'leaked-config.md')
    writeFileSync(sensitiveFile, `# Notes\n\nFor reference: ${SECRET}\nDon't commit.\n`, 'utf8')
    const scan = await privacy.scanFile(sensitiveFile)
    assert(privacy.isStrongSensitive(scan), 'scanFile flags strong sensitive')
    assert(scan.strong.some((h) => h.name === 'openai-api-key'), 'strong hit name = openai-api-key')
    // Raw scan retains secret (caller decides to skip the file, that's the contract)
    assert(scan.text.includes(SECRET), 'raw scan retains secret (expected — caller skips file)')
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
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
