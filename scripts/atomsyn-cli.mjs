#!/usr/bin/env node
/**
 * atomsyn-cli — Atomsyn V1.5 helper CLI
 *
 * The load-bearing command-line companion for the `atomsyn-write` and
 * `atomsyn-read` skills (see skills/atomsyn-write/SKILL.md). Claude Code (or any
 * other Agent with shell access) invokes this CLI to persist a structured
 * experience atom, retrieve context for a new session, or rebuild the index.
 *
 * Subcommands:
 *   atomsyn-cli write --stdin            Read JSON from stdin, write atom, log, reindex
 *   atomsyn-cli write --input <file>     Same, from a file
 *   atomsyn-cli read  --query "..."      Retrieve top-N atoms matching a query (stub in V1.5)
 *   atomsyn-cli reindex                  Rebuild index (inline or delegate to rebuild-index.mjs)
 *   atomsyn-cli where                    Print resolved data directory + source
 *
 * Data directory resolution (mirrors src-tauri/src/lib.rs):
 *   1. $ATOMSYN_DEV_DATA_DIR env var  (dev override)
 *   2. ~/.atomsyn-config.json `dataDir`  (user-customized path)
 *   3. Platform default:
 *      - macOS   ~/Library/Application Support/atomsyn
 *      - Linux   ~/.local/share/atomsyn
 *      - Windows %APPDATA%/atomsyn
 *
 * Zero npm dependencies — only node stdlib.
 */

import { readFile, writeFile, mkdir, appendFile, unlink, rmdir, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { homedir, platform } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

import {
  computeStaleness,
  updateAccessTime,
  detectCollision,
  applySupersede,
  applyArchive,
  detectPruneCandidates,
} from './lib/evolution.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

const color = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function die(msg, code = 1) {
  console.error(`${color.red}atomsyn-cli: ${msg}${color.reset}`)
  process.exit(code)
}

function getFlag(args, name, fallback = null) {
  const i = args.indexOf(name)
  if (i === -1) return fallback
  return args[i + 1] ?? fallback
}

function hasFlag(args, name) {
  return args.includes(name)
}

async function readStdin() {
  return new Promise((res, rej) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (buf += chunk))
    process.stdin.on('end', () => res(buf))
    process.stdin.on('error', rej)
  })
}

/**
 * Robust JSON parser — handles common shell-induced corruption:
 * 1. BOM stripping
 * 2. Literal unescaped newlines/tabs within string values → escape them
 * 3. Trailing commas in arrays/objects
 *
 * Fast path: try JSON.parse first. Only if it fails, apply fixups and retry.
 */
function parseJsonRobust(raw) {
  const trimmed = raw.replace(/^\uFEFF/, '').trim()
  try {
    return JSON.parse(trimmed)
  } catch (firstErr) {
    // Fixup: escape control characters inside JSON string values
    let fixed = ''
    let inString = false
    let escaped = false
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i]
      const code = trimmed.charCodeAt(i)
      if (escaped) { fixed += ch; escaped = false; continue }
      if (ch === '\\' && inString) { fixed += ch; escaped = true; continue }
      if (ch === '"') { inString = !inString; fixed += ch; continue }
      if (inString && code < 0x20) {
        if (ch === '\n') fixed += '\\n'
        else if (ch === '\r') fixed += '\\r'
        else if (ch === '\t') fixed += '\\t'
        else fixed += '\\u' + code.toString(16).padStart(4, '0')
        continue
      }
      fixed += ch
    }
    // Fix trailing commas: ,] or ,}
    fixed = fixed.replace(/,\s*([}\]])/g, '$1')
    try { return JSON.parse(fixed) }
    catch { throw firstErr }
  }
}

/**
 * Tokenize a query string for Chinese-aware keyword matching.
 * Splits by whitespace, then further splits CJK phrases (>2 chars)
 * into 2-char bigrams — the most common Chinese word length.
 *
 * "AI原生应用 市场竞品调研分析" → ["ai原生应用", "原生", "应用", "市场竞品调研分析", "市场", "竞品", "调研", "分析"]
 */
function tokenizeQuery(query) {
  const raw = query.toLowerCase().split(/\s+/).filter(Boolean)
  const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/
  const tokens = new Set()
  for (const term of raw) {
    tokens.add(term)
    // For CJK-containing terms longer than 2 chars, extract 2-char bigrams
    if (term.length > 2 && CJK.test(term)) {
      // Extract non-overlapping 2-char CJK segments
      const cjkOnly = term.replace(/[^\u4e00-\u9fff\u3400-\u4dbf]/g, '')
      for (let i = 0; i + 1 < cjkOnly.length; i += 2) {
        tokens.add(cjkOnly.slice(i, i + 2))
      }
      // Also extract overlapping bigrams for better coverage
      for (let i = 0; i + 1 < cjkOnly.length; i++) {
        tokens.add(cjkOnly.slice(i, i + 2))
      }
    }
  }
  return [...tokens]
}

function deriveSlug(str) {
  return String(str || 'atom')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'atom'
}

// ---------------------------------------------------------------------------
// Data directory resolution
// ---------------------------------------------------------------------------

function platformAppDataDir() {
  const home = homedir()
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support')
    case 'win32':
      return process.env.APPDATA || join(home, 'AppData', 'Roaming')
    default:
      return join(home, '.local', 'share')
  }
}

function resolveDataDir() {
  // 1. env override
  if (process.env.ATOMSYN_DEV_DATA_DIR) {
    return { path: process.env.ATOMSYN_DEV_DATA_DIR, source: 'env' }
  }
  // 2. user config
  const cfgPath = join(homedir(), '.atomsyn-config.json')
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
      if (cfg.dataDir) return { path: cfg.dataDir, source: 'config' }
    } catch {
      /* ignore invalid config, fall through */
    }
  }
  // 3. platform default
  return { path: join(platformAppDataDir(), 'atomsyn'), source: 'default' }
}

async function ensureDataLayout(dataDir) {
  await mkdir(join(dataDir, 'atoms', 'experience'), { recursive: true })
  await mkdir(join(dataDir, 'atoms', 'methodology'), { recursive: true })
  await mkdir(join(dataDir, 'atoms', 'skill-inventory'), { recursive: true })
  await mkdir(join(dataDir, 'growth'), { recursive: true })
  await mkdir(join(dataDir, 'index'), { recursive: true })
}

// ---------------------------------------------------------------------------
// Schema validation (structural, no ajv)
// ---------------------------------------------------------------------------

// Fields the caller MUST provide — these are the content-bearing fields that
// cannot be defaulted without hallucination. All bookkeeping fields (id,
// schemaVersion, kind, createdAt, updatedAt, stats) are auto-generated so
// that the calling agent only needs to supply human-meaningful content.
const EXPERIENCE_REQUIRED_CONTENT = [
  'name',
  'tags',
  'sourceContext',
  'insight',
]

function normalizeExperienceAtom(atom) {
  // Accept loose input: only content-bearing fields are required.
  // CLI owns id/schemaVersion/kind/timestamps/stats generation.
  const missing = EXPERIENCE_REQUIRED_CONTENT.filter(
    (k) => !(k in atom) || atom[k] == null || atom[k] === ''
  )
  if (missing.length) {
    die(
      `Input is missing required content fields: ${missing.join(
        ', '
      )}. Provide at least { name, sourceContext, insight, tags } — id/kind/schemaVersion/timestamps are auto-generated.`
    )
  }

  // V2.0: Validate four-dimension classification fields (required for crystallized experience)
  const CLASSIFICATION_FIELDS = {
    role: '角色维度 (产品 | 工程 | 设计 | 学习 | 研究 | 咨询 | 决策 | 创作 | 协作 | 教学 | 辅导 | 自我管理 | 运营 | 销售 | 项目管理)',
    situation: '情境维度 (会议 | 访谈 | 独立思考 | 阅读 | 对话AI | 复盘 | 踩坑当下 | 灵感闪现 | 冲突 | 决策关口 | 紧急修复 | 新功能开发 | 架构重构 | 代码审查 | 方案评审)',
    activity: '活动维度 (分析 | 判断 | 说服 | 倾听 | 试错 | 验证 | 综合 | 表达 | 拒绝 | 妥协 | 观察 | 提问 | 记录 | 教授 | 调试)',
    insight_type: '洞察类型 (反直觉 | 方法验证 | 方法证伪 | 情绪复盘 | 关系观察 | 时机判断 | 原则提炼 | 纯好奇)',
  }
  const missingClassification = Object.entries(CLASSIFICATION_FIELDS)
    .filter(([k]) => !(k in atom) || atom[k] == null || atom[k] === '')
  if (missingClassification.length) {
    const details = missingClassification
      .map(([k, hint]) => `  - ${k}: ${hint}`)
      .join('\n')
    die(
      `Input is missing required classification fields:\n${details}\n\n` +
      `These four-dimension fields are required for experience atoms. ` +
      `Please add them to your JSON and retry. ` +
      `TIP: Run \`atomsyn-cli find --query "<keywords>" --with-taxonomy\` first to see existing dimension values and reuse them.`
    )
  }

  // Auto-assign bookkeeping fields
  atom.kind = 'experience'
  atom.schemaVersion = 1
  atom.subKind = atom.subKind || 'crystallized'
  atom.sourceAgent =
    atom.sourceAgent || process.env.ATOMSYN_AGENT || 'claude-code'

  const now = new Date().toISOString()
  if (!atom.createdAt) atom.createdAt = now
  if (!atom.updatedAt) atom.updatedAt = atom.createdAt

  if (!atom.stats || typeof atom.stats !== 'object') {
    atom.stats = { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 }
  }

  // Auto-generate id if not provided
  if (!atom.id) {
    const unixTs = Math.floor(new Date(atom.createdAt).getTime() / 1000)
    const idSlug = deriveSlug(atom.name)
    atom.id = `atom_exp_${idSlug}_${unixTs}`
  }

  if (typeof atom.id !== 'string' || !/^atom_exp_[a-z0-9_-]+$/.test(atom.id)) {
    die(`id must match ^atom_exp_[a-z0-9_-]+$, got '${atom.id}'`)
  }
  if (typeof atom.name !== 'string' || atom.name.length < 1 || atom.name.length > 120) {
    die(`name must be a 1-120 character string`)
  }
  if (!Array.isArray(atom.tags) || atom.tags.length < 1 || atom.tags.length > 8) {
    die(`tags must be an array of 1-8 strings`)
  }
  if (typeof atom.insight !== 'string' || atom.insight.length < 50 || atom.insight.length > 4000) {
    die(`insight must be 50-4000 characters`)
  }
  if (
    typeof atom.sourceContext !== 'string' ||
    atom.sourceContext.length < 1 ||
    atom.sourceContext.length > 300
  ) {
    die(`sourceContext must be a 1-300 character string`)
  }
  if (typeof atom.stats !== 'object' || atom.stats === null) {
    die(`stats must be an object`)
  }
  if (!Array.isArray(atom.stats.usedInProjects)) {
    atom.stats.usedInProjects = []
  }
  if (typeof atom.stats.useCount !== 'number') {
    atom.stats.useCount = 0
  }
}

// ---------------------------------------------------------------------------
// Usage log append
// ---------------------------------------------------------------------------

async function appendUsageLog(dataDir, event) {
  const path = join(dataDir, 'growth', 'usage-log.jsonl')
  await appendFile(path, JSON.stringify(event) + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// Subcommand: where
// ---------------------------------------------------------------------------

async function cmdWhere() {
  const { path, source } = resolveDataDir()
  const exists = existsSync(path)
  console.log(
    JSON.stringify(
      {
        path,
        source,
        exists,
        resolutionOrder: [
          { rule: 'env', var: 'ATOMSYN_DEV_DATA_DIR', matched: source === 'env' },
          { rule: 'config', file: join(homedir(), '.atomsyn-config.json'), matched: source === 'config' },
          { rule: 'default', platformPath: join(platformAppDataDir(), 'atomsyn'), matched: source === 'default' },
        ],
      },
      null,
      2
    )
  )
}

// ---------------------------------------------------------------------------
// Subcommand: write
// ---------------------------------------------------------------------------

async function cmdWrite(args) {
  const kind = getFlag(args, '--kind', 'experience')
  if (kind !== 'experience') {
    die(`--kind '${kind}' not supported yet. V1.5 only supports 'experience'.`)
  }

  let input
  if (hasFlag(args, '--stdin')) {
    input = await readStdin()
  } else {
    const inputFile = getFlag(args, '--input')
    if (!inputFile) die(`write requires --stdin or --input <file>`)
    input = await readFile(inputFile, 'utf8')
  }

  if (!input.trim()) die(`Empty input`)

  let atom
  try {
    atom = parseJsonRobust(input)
  } catch (err) {
    die(`Input is not valid JSON: ${err.message}\nTip: 如仍失败,请先写入临时文件,再用 --input /tmp/atomsyn_write.json`)
  }

  normalizeExperienceAtom(atom)

  const { path: dataDir, source } = resolveDataDir()
  await ensureDataLayout(dataDir)

  // V2.x cognitive-evolution · collision check (D-007, B3)
  // Default on; disable via --no-check-collision or ATOMSYN_DISABLE_COLLISION_CHECK=1.
  // Skipped in supersede flow (caller passes ATOMSYN_SKIP_COLLISION=1 internally).
  const collisionCheckEnabled =
    !hasFlag(args, '--no-check-collision') &&
    process.env.ATOMSYN_DISABLE_COLLISION_CHECK !== '1' &&
    process.env.ATOMSYN_SKIP_COLLISION !== '1'
  let collisionCandidates = []
  if (collisionCheckEnabled) {
    try {
      const expDir = join(dataDir, 'atoms', 'experience')
      const corpusFiles = await walkJson(expDir)
      const corpus = []
      for (const f of corpusFiles) {
        try {
          const a = JSON.parse(await readFile(f, 'utf8'))
          corpus.push(a)
        } catch { /* skip */ }
      }
      collisionCandidates = detectCollision(atom, corpus)
    } catch (err) {
      // Collision check failure is non-fatal (design §3.2 fallback)
      process.stderr.write(`atomsyn-cli: warning · collision check skipped (${err.message})\n`)
    }
  }

  const slug = deriveSlug(atom.name || atom.id.replace(/^atom_exp_/, '').split('_')[0])
  const outDir = join(dataDir, 'atoms', 'experience', slug)
  await mkdir(outDir, { recursive: true })
  const outFile = join(outDir, `${atom.id}.json`)

  // Check for locked conflict
  if (existsSync(outFile)) {
    try {
      const existing = JSON.parse(await readFile(outFile, 'utf8'))
      if (existing?.stats?.locked === true) {
        die(`Atom ${atom.id} is locked by user. Refusing to overwrite. Use a new id or unlock in Atomsyn GUI.`)
      }
      // Preserve certain fields from the existing atom unless explicitly overridden
      if (!atom.createdAt || atom.createdAt === atom.updatedAt) {
        atom.createdAt = existing.createdAt || atom.createdAt
      }
      // Merge stats (new useCount wins if provided, else preserve)
      atom.stats = {
        ...existing.stats,
        ...atom.stats,
        usedInProjects: atom.stats.usedInProjects ?? existing.stats?.usedInProjects ?? [],
      }
    } catch {
      /* existing file corrupted, overwrite */
    }
  }

  // Update timestamp
  atom.updatedAt = new Date().toISOString()

  await writeFile(outFile, JSON.stringify(atom, null, 2) + '\n', 'utf8')

  // Append usage log
  try {
    await appendUsageLog(dataDir, {
      ts: new Date().toISOString(),
      action: 'write',
      atomId: atom.id,
      agentName: atom.sourceAgent || 'unknown',
      kind: 'experience',
      dataSource: source,
    })
    if (collisionCandidates.length > 0) {
      await appendUsageLog(dataDir, {
        ts: new Date().toISOString(),
        action: 'write.collision_detected',
        atomId: atom.id,
        candidates: collisionCandidates.map(c => c.id),
      })
    }
  } catch (err) {
    console.error(`${color.yellow}Warning: usage log append failed: ${err.message}${color.reset}`)
  }

  // V2.x cognitive-evolution · stderr warning when collision detected (B3)
  if (collisionCandidates.length > 0) {
    const names = collisionCandidates.map(c => `${c.name || '(unnamed)'} <${c.id}>`).join(', ')
    process.stderr.write(`${color.yellow}atomsyn-cli: ⚠️  ${collisionCandidates.length} collision candidate(s) detected: ${names}. See stdout collision_candidates field; consider 'atomsyn-cli supersede --id <old> --input <file>' if intent is to replace.${color.reset}\n`)
  }

  // Return success payload to the calling skill
  const payload = {
    ok: true,
    atomId: atom.id,
    name: atom.name,
    path: outFile,
    dataDir,
    dataSource: source,
    hint: `Next time you search for tags [${atom.tags.join(', ')}] or topic "${atom.name}", atomsyn-read will surface this atom.`,
  }
  if (collisionCandidates.length > 0) {
    payload.collision_candidates = collisionCandidates
    payload.hint = `本次写入已完成。如需取代旧 atom, 用 atomsyn-cli supersede --id <old> --input <这个文件>`
  }
  console.log(JSON.stringify(payload, null, 2))
}

// ---------------------------------------------------------------------------
// Subcommand: read (V2.0 M4 — cognitive map mode)
// ---------------------------------------------------------------------------

async function cmdRead(args) {
  const query = getFlag(args, '--query')
  const top = parseInt(getFlag(args, '--top', '5'), 10)
  const showHistory = hasFlag(args, '--show-history')
  const includeProfile = hasFlag(args, '--include-profile')
  const jsonMode = hasFlag(args, '--json')
  if (!query) die(`read requires --query "search terms"`, 2)

  const { path: dataDir } = resolveDataDir()
  const atomsDir = join(dataDir, 'atoms')
  const experienceDir = join(atomsDir, 'experience')

  const qTerms = tokenizeQuery(query)
  const nowMs = Date.now()
  let accessUpdateWarned = false

  // --- Phase 1: Score methodology atoms across all framework dirs ---
  const methodologyResults = []
  const frameworkDirs = []
  let totalMethodologyCount = 0
  const frameworkNames = []
  if (existsSync(atomsDir)) {
    const { readdir: rd } = await import('node:fs/promises')
    const topEntries = await rd(atomsDir, { withFileTypes: true })
    for (const e of topEntries) {
      if (!e.isDirectory()) continue
      if (['experience', 'methodology', 'skill-inventory'].includes(e.name)) continue
      frameworkDirs.push(join(atomsDir, e.name))
      frameworkNames.push(e.name)
    }
  }

  for (const fdir of frameworkDirs) {
    const files = await walkJson(fdir)
    totalMethodologyCount += files.length
    for (const f of files) {
      try {
        const atom = JSON.parse(await readFile(f, 'utf8'))
        if (atom.kind === 'skill-inventory') { totalMethodologyCount--; continue }
        if (atom.archivedAt) { totalMethodologyCount--; continue }
        if (atom.supersededBy && !showHistory) { totalMethodologyCount--; continue }
        if (atom.kind === 'profile' && !includeProfile) { totalMethodologyCount--; continue }
        const haystack = (
          (atom.name || '') + ' ' + (atom.nameEn || '') + ' ' +
          (atom.coreIdea || '') + ' ' + (atom.whenToUse || '') + ' ' +
          (atom.tags || []).join(' ')
        ).toLowerCase()
        let score = 0
        for (const term of qTerms) score += haystack.split(term).length - 1
        if (score > 0) methodologyResults.push({ atom, score, path: f })
      } catch { /* skip */ }
    }
  }
  methodologyResults.sort((a, b) => b.score - a.score)
  const topMethodologies = methodologyResults.slice(0, top)

  // V2.x cognitive-evolution · staleness signal + lastAccessedAt update for top-N hits
  for (const hit of topMethodologies) {
    hit.staleness = computeStaleness(hit.atom, nowMs)
    try {
      await updateAccessTime(hit.path, nowMs)
    } catch (e) {
      if (!accessUpdateWarned) {
        accessUpdateWarned = true
        process.stderr.write(`atomsyn-cli: warning · failed to update lastAccessedAt (${e.message})\n`)
      }
    }
  }

  // --- Phase 2: Score experience atoms ---
  const experienceFiles = await walkJson(experienceDir)
  const experienceResults = []
  let totalExperienceCount = 0
  let privateCount = 0
  const roleCounts = {}
  const roleSituationMap = {} // role → { situation → count }
  let latestActivity = ''

  for (const f of experienceFiles) {
    try {
      const atom = JSON.parse(await readFile(f, 'utf8'))
      totalExperienceCount++
      if (atom.archivedAt) continue
      if (atom.supersededBy && !showHistory) continue
      if (atom.kind === 'profile' && !includeProfile) continue
      if (atom.private) { privateCount++; continue }
      if (atom.stats?.userDemoted) continue
      // Track role → situation distribution
      const role = atom.role || '未分类'
      const situation = atom.situation || '未分类'
      roleCounts[role] = (roleCounts[role] || 0) + 1
      if (!roleSituationMap[role]) roleSituationMap[role] = {}
      roleSituationMap[role][situation] = (roleSituationMap[role][situation] || 0) + 1
      // Track latest activity
      const ts = atom.updatedAt || atom.createdAt || ''
      if (ts > latestActivity) latestActivity = ts

      const haystack = (
        (atom.name || atom.title || '') + ' ' +
        (atom.insight || atom.summary || '') + ' ' +
        (atom.sourceContext || '') + ' ' +
        (atom.role || '') + ' ' + (atom.situation || '') + ' ' +
        (atom.activity || '') + ' ' + (atom.tags || []).join(' ')
      ).toLowerCase()
      let score = 0
      for (const term of qTerms) score += haystack.split(term).length - 1
      if (score > 0) experienceResults.push({ atom, score, path: f })
    } catch { /* skip */ }
  }
  experienceResults.sort((a, b) => b.score - a.score)
  const topExperiences = experienceResults.slice(0, top)

  // V2.x cognitive-evolution · staleness + lastAccessedAt update for top experience hits
  for (const hit of topExperiences) {
    hit.staleness = computeStaleness(hit.atom, nowMs)
    try {
      await updateAccessTime(hit.path, nowMs)
    } catch (e) {
      if (!accessUpdateWarned) {
        accessUpdateWarned = true
        process.stderr.write(`atomsyn-cli: warning · failed to update lastAccessedAt (${e.message})\n`)
      }
    }
  }

  // --- Phase 3: Count related fragments for each methodology hit ---
  const { findRelatedFragmentsBatch } = await import('./lib/findRelatedFragments.mjs')
  const methodologyIds = topMethodologies.map(r => r.atom.id)
  const relatedMap = methodologyIds.length > 0
    ? await findRelatedFragmentsBatch(dataDir, methodologyIds, { threshold: 0.5, top: 10 })
    : new Map()

  // --- Phase 4: Usage logging (no stats bump — moved to get) ---
  const agentName = process.env.ATOMSYN_AGENT || 'unknown'
  const now = new Date().toISOString()

  try {
    await appendUsageLog(dataDir, {
      ts: now, action: 'read', query,
      methodologyHits: topMethodologies.length,
      experienceHits: topExperiences.length,
      agentName,
    })
    // V2.x cognitive-evolution · per-hit access events + staleness emission
    for (const hit of [...topMethodologies, ...topExperiences]) {
      await appendUsageLog(dataDir, { ts: now, action: 'read.access', atomId: hit.atom.id })
      if (hit.staleness?.is_stale) {
        await appendUsageLog(dataDir, {
          ts: now,
          action: 'read.staleness_emitted',
          atomId: hit.atom.id,
          decay: Number(hit.staleness.confidence_decay.toFixed(2)),
          is_stale: true,
        })
      }
    }
  } catch { /* non-fatal */ }

  // --- Phase 5a: JSON mode output (V2.x cognitive-evolution) ---
  if (jsonMode) {
    const toJsonHit = ({ atom, score, staleness }) => ({
      id: atom.id,
      name: atom.name || atom.title,
      kind: atom.kind,
      score,
      age_days: staleness.age_days,
      last_access_days: staleness.last_access_days,
      confidence_decay: Number(staleness.confidence_decay.toFixed(2)),
      is_stale: staleness.is_stale,
      supersededBy: atom.supersededBy || null,
      history: showHistory ? (atom.supersedes || []).map(id => ({ id })) : [],
    })
    console.log(JSON.stringify({
      ok: true,
      query,
      methodologies: topMethodologies.map(toJsonHit),
      experiences: topExperiences.map(toJsonHit),
    }, null, 2))
    return
  }

  // --- Phase 5: Render compact cognitive map ---
  if (topMethodologies.length === 0 && topExperiences.length === 0) {
    // Even with no hits, show cognitive overview
    const lines = [`# Atomsyn Read · "${query}" · 无直接命中`, '']
    lines.push(...await renderCognitiveOverview(dataDir, frameworkNames, totalMethodologyCount, totalExperienceCount, privateCount, roleSituationMap, latestActivity))
    console.log(lines.join('\n'))
    return
  }

  const lines = [`# Atomsyn Read · "${query}"`, '']

  // Section 1: Methodology hits (compact table)
  if (topMethodologies.length > 0) {
    lines.push(`## 📚 方法论命中 (${topMethodologies.length}/${totalMethodologyCount})`)
    lines.push('')
    lines.push('| # | 名称 | 框架 | Step | 标签 | 📎 | ID |')
    lines.push('|---|---|---|---|---|---|---|')
    for (let i = 0; i < topMethodologies.length; i++) {
      const { atom, staleness } = topMethodologies[i]
      const fw = atom.frameworkId || '-'
      const step = atom.cellId ? String(atom.cellId).padStart(2, '0') : '-'
      const tags = (atom.tags || []).slice(0, 3).join(', ')
      const relatedCount = (relatedMap.get(atom.id) || []).length
      const stalePrefix = staleness?.is_stale ? '🌡 ' : ''
      lines.push(`| ${i + 1} | ${stalePrefix}${atom.name} | ${fw} | ${step} | ${tags} | ${relatedCount} | \`${atom.id}\` |`)
    }
    lines.push('')
  }

  // Section 2: Experience hits (compact table)
  if (topExperiences.length > 0) {
    const visibleCount = totalExperienceCount - privateCount
    lines.push(`## 💡 经验碎片命中 (${topExperiences.length}/${visibleCount})`)
    lines.push('')
    lines.push('| # | 标题 | 类型 | 角色·场景 | 摘要 | ID |')
    lines.push('|---|---|---|---|---|---|')
    for (let i = 0; i < topExperiences.length; i++) {
      const { atom, staleness } = topExperiences[i]
      const title = (atom.title || atom.name || '').slice(0, 30)
      const itype = atom.insight_type || '-'
      const dims = `${atom.role || '-'}·${atom.situation || '-'}`
      const summary = (atom.summary || atom.insight || '').slice(0, 80).replace(/\n/g, ' ')
      const stalePrefix = staleness?.is_stale ? '🌡 ' : ''
      lines.push(`| ${i + 1} | ${stalePrefix}${title} | ${itype} | ${dims} | ${summary} | \`${atom.id}\` |`)
    }
    lines.push('')
  }

  // Section 3: Cognitive overview
  lines.push(...await renderCognitiveOverview(dataDir, frameworkNames, totalMethodologyCount, totalExperienceCount, privateCount, roleSituationMap, latestActivity))

  console.log(lines.join('\n'))
}

async function renderCognitiveOverview(dataDir, frameworkNames, methodologyCount, experienceCount, privateCount, roleSituationMap, latestActivity) {
  const lines = []
  lines.push('## 📊 认知全貌')
  lines.push('')
  // Merge framework names from atom dirs + data/frameworks/*.json
  const allFwNames = new Set(frameworkNames)
  const fwDir = join(dataDir, 'frameworks')
  if (existsSync(fwDir)) {
    try {
      const fwFiles = await readdir(fwDir)
      for (const f of fwFiles) {
        if (!f.endsWith('.json')) continue
        try {
          const fw = JSON.parse(await readFile(join(fwDir, f), 'utf8'))
          if (fw.id) allFwNames.add(fw.id)
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  const fwList = allFwNames.size > 0 ? [...allFwNames].join(', ') : '(无)'
  lines.push(`**方法论**: ${fwList} (${methodologyCount} atoms)`)
  lines.push('')
  const totalVisible = experienceCount - privateCount
  lines.push(`**经验碎片**: ${totalVisible} 条${privateCount > 0 ? ` (+${privateCount} 私密)` : ''}`)
  // Two-level distribution: role → situation
  const sortedRoles = Object.entries(roleSituationMap).sort((a, b) => {
    const aTotal = Object.values(a[1]).reduce((s, c) => s + c, 0)
    const bTotal = Object.values(b[1]).reduce((s, c) => s + c, 0)
    return bTotal - aTotal
  })
  for (const [role, situations] of sortedRoles) {
    const roleTotal = Object.values(situations).reduce((s, c) => s + c, 0)
    const sitStr = Object.entries(situations)
      .sort((a, b) => b[1] - a[1])
      .map(([s, c]) => `${s}×${c}`)
      .join(', ')
    lines.push(`- ${role} (${roleTotal}): ${sitStr}`)
  }
  lines.push('')
  if (latestActivity) lines.push(`最近活跃: ${latestActivity.slice(0, 10)}`)
  lines.push('')
  lines.push('> `atomsyn-cli get --id <ID>` 查看原子详情 · `atomsyn-cli find --query <关键词>` 按关键词搜索')
  lines.push('')
  return lines
}

async function walkJson(dir) {
  const out = []
  if (!existsSync(dir)) return out
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walkJson(full)))
    else if (e.isFile() && e.name.endsWith('.json')) out.push(full)
  }
  return out
}

// ---------------------------------------------------------------------------
// Subcommand: find — locate an experience atom by id or keyword. Lightweight
// existence check for the atomsyn-write skill's "new vs update" decision.
// ---------------------------------------------------------------------------

async function findAtomFileById(dataDir, atomId) {
  // Search ALL atom directories (experience + framework dirs + methodology + skill-inventory)
  const atomsRoot = join(dataDir, 'atoms')
  if (!existsSync(atomsRoot)) return null
  const files = await walkJson(atomsRoot)
  for (const f of files) {
    try {
      const atom = JSON.parse(await readFile(f, 'utf8'))
      if (atom.id === atomId) return { file: f, atom }
    } catch {
      /* skip corrupted */
    }
  }
  return null
}

async function cmdGet(args) {
  const id = getFlag(args, '--id')
  if (!id) die('get requires --id <atomId>')
  const jsonMode = args.includes('--json')
  const { path: dataDir } = resolveDataDir()
  const hit = await findAtomFileById(dataDir, id)
  if (!hit) {
    if (jsonMode) console.log(JSON.stringify({ ok: false, found: false, id }))
    else console.log(`# Not found: \`${id}\``)
    process.exit(2)
  }

  const atom = hit.atom
  const agentName = process.env.ATOMSYN_AGENT || 'unknown'
  const now = new Date().toISOString()

  // Bump aiInvokeCount (moved from read in M4)
  try {
    const raw = JSON.parse(await readFile(hit.file, 'utf8'))
    raw.stats = raw.stats || {}
    raw.stats.aiInvokeCount = (raw.stats.aiInvokeCount || 0) + 1
    raw.stats.lastUsedAt = now
    raw.stats.invokedByAgent = raw.stats.invokedByAgent || {}
    raw.stats.invokedByAgent[agentName] = (raw.stats.invokedByAgent[agentName] || 0) + 1
    await writeFile(hit.file, JSON.stringify(raw, null, 2) + '\n')
  } catch { /* non-fatal */ }

  // JSON mode: return raw atom (for programmatic use)
  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, found: true, id: atom.id, name: atom.name, path: hit.file, atom }, null, 2))
    return
  }

  // Markdown mode (default): human/agent-friendly output with token protection
  const MAX_CHARS = 8000
  const lines = []

  if (atom.kind === 'methodology') {
    lines.push(`# ${atom.name}${atom.nameEn ? ` (${atom.nameEn})` : ''}`)
    lines.push(`*ID*: \`${atom.id}\` · *Kind*: methodology`)
    if (atom.frameworkId) lines.push(`*Framework*: ${atom.frameworkId} · *Step*: ${String(atom.cellId || '').padStart(2, '0')}`)
    lines.push('')
    if (atom.tags?.length) lines.push(`**Tags**: ${atom.tags.join(', ')}`)
    lines.push('')
    if (atom.coreIdea) { lines.push('## 核心理念'); lines.push(atom.coreIdea); lines.push('') }
    if (atom.whenToUse) { lines.push('## 何时使用'); lines.push(atom.whenToUse); lines.push('') }
    if (atom.keySteps?.length) {
      lines.push('## 关键步骤')
      for (const s of atom.keySteps) lines.push(`- ${s}`)
      lines.push('')
    }
    if (atom.example?.title) {
      lines.push(`## 案例: ${atom.example.title}`)
      lines.push(atom.example.content || '')
      lines.push('')
    }
    // Skip aiSkillPrompt (too long, not needed for read context)

    // 📎 Related fragments (reverse-lookup)
    try {
      const { findRelatedFragments } = await import('./lib/findRelatedFragments.mjs')
      const frags = await findRelatedFragments(dataDir, atom.id, { threshold: 0.5, top: 5 })
      if (frags.length > 0) {
        lines.push('## 📎 你的相关碎片')
        lines.push('')
        for (const { atom: frag, confidence, locked } of frags) {
          const lockTag = locked ? ' 🔒' : ''
          const title = frag.title || frag.name || '(无标题)'
          const summary = (frag.summary || frag.insight || '').slice(0, 150)
          const dims = [frag.role, frag.situation].filter(Boolean).join('·')
          const date = (frag.createdAt || '').slice(0, 10)
          lines.push(`### ${title}${lockTag}`)
          lines.push(`*${frag.insight_type || '-'}* · ${dims} · ${date} · confidence: ${confidence.toFixed(2)}`)
          if (summary) lines.push(`> ${summary}`)
          lines.push(`*ID*: \`${frag.id}\``)
          lines.push('')
        }
      }
    } catch { /* non-fatal: findRelatedFragments might not have data */ }
  } else if (atom.kind === 'experience') {
    const title = atom.title || atom.name || '(无标题)'
    lines.push(`# ${title}`)
    lines.push(`*ID*: \`${atom.id}\` · *Kind*: experience${atom.subKind ? ` (${atom.subKind})` : ''}`)
    lines.push('')
    if (atom.tags?.length) lines.push(`**Tags**: ${atom.tags.join(', ')}`)
    const dims = []
    if (atom.role) dims.push(`角色:${atom.role}`)
    if (atom.situation) dims.push(`场景:${atom.situation}`)
    if (atom.activity) dims.push(`活动:${atom.activity}`)
    if (atom.insight_type) dims.push(`类型:${atom.insight_type}`)
    if (dims.length) lines.push(`**维度**: ${dims.join(' · ')}`)
    lines.push('')
    if (atom.summary) { lines.push('## 摘要'); lines.push(atom.summary); lines.push('') }
    if (atom.insight) { lines.push('## 洞察'); lines.push(atom.insight); lines.push('') }
    if (atom.sourceContext) { lines.push('## 背景'); lines.push(atom.sourceContext); lines.push('') }
    if (atom.rawContent) { lines.push('## 原始内容'); lines.push(atom.rawContent); lines.push('') }
    if (atom.keySteps?.length) {
      lines.push('## 要点')
      for (const s of atom.keySteps) lines.push(`- ${s}`)
      lines.push('')
    }
    if (atom.linked_methodologies?.length) {
      lines.push(`## 关联方法论`)
      for (const mid of atom.linked_methodologies) lines.push(`- \`${mid}\``)
      lines.push('')
    }
  } else {
    // skill-inventory or unknown kind: minimal output
    lines.push(`# ${atom.name || atom.id}`)
    lines.push(`*ID*: \`${atom.id}\` · *Kind*: ${atom.kind || 'unknown'}`)
    lines.push('')
    if (atom.tags?.length) lines.push(`**Tags**: ${atom.tags.join(', ')}`)
    lines.push('')
    if (atom.coreIdea || atom.insight || atom.summary) {
      lines.push(atom.coreIdea || atom.insight || atom.summary)
      lines.push('')
    }
  }

  // Token protection: truncate if too long
  let output = lines.join('\n')
  if (output.length > MAX_CHARS) {
    output = output.slice(0, MAX_CHARS) + '\n\n... (内容已截断, 完整内容请用 `--json` 查看)'
  }
  console.log(output)
}

async function cmdFind(args) {
  const query = getFlag(args, '--query') || ''
  const top = parseInt(getFlag(args, '--top', '10'), 10)
  const withTaxonomy = args.includes('--with-taxonomy')
  const showHistory = hasFlag(args, '--show-history')
  const includeProfile = hasFlag(args, '--include-profile')
  const { path: dataDir } = resolveDataDir()
  const root = join(dataDir, 'atoms', 'experience')
  const files = await walkJson(root)
  const qTerms = query.trim() ? tokenizeQuery(query) : []
  const nowMs = Date.now()
  let accessUpdateWarned = false

  // V2.0 M2: collect dimension values for taxonomy
  const dimSets = { roles: new Set(), situations: new Set(), activities: new Set(), insight_types: new Set() }

  const matches = []
  for (const f of files) {
    try {
      const atom = JSON.parse(await readFile(f, 'utf8'))
      // V2.x cognitive-evolution · skip archived / superseded / profile by default
      if (atom.archivedAt) continue
      if (atom.supersededBy && !showHistory) continue
      if (atom.kind === 'profile' && !includeProfile) continue
      // Collect dimensions from all atoms (for taxonomy)
      if (atom.role) dimSets.roles.add(atom.role)
      if (atom.situation) dimSets.situations.add(atom.situation)
      if (atom.activity) dimSets.activities.add(atom.activity)
      if (atom.insight_type) dimSets.insight_types.add(atom.insight_type)

      // V2.0: enhanced result with four-dimension fields
      const result = {
        id: atom.id,
        name: atom.name || atom.title,
        tags: atom.tags,
        path: f,
        score: 0,
        atom, // keep ref for staleness enrichment after slice
        // Include four-dimension fields if present (fragments have them)
        ...(atom.role ? { role: atom.role } : {}),
        ...(atom.situation ? { situation: atom.situation } : {}),
        ...(atom.activity ? { activity: atom.activity } : {}),
        ...(atom.insight_type ? { insight_type: atom.insight_type } : {}),
      }

      if (!qTerms.length) {
        matches.push(result)
        continue
      }
      const haystack = (
        (atom.name || atom.title || '') +
        ' ' +
        (atom.insight || atom.summary || '') +
        ' ' +
        (atom.sourceContext || '') +
        ' ' +
        (atom.role || '') + ' ' + (atom.situation || '') + ' ' + (atom.activity || '') +
        ' ' +
        (atom.tags || []).join(' ')
      ).toLowerCase()
      let score = 0
      for (const t of qTerms) score += haystack.split(t).length - 1
      if (score > 0) {
        result.score = score
        matches.push(result)
      }
    } catch {
      /* skip */
    }
  }
  matches.sort((a, b) => b.score - a.score)
  const sliced = matches.slice(0, top)

  // V2.x cognitive-evolution · enrich top-N with staleness + throttled lastAccessedAt update
  for (const r of sliced) {
    const stale = computeStaleness(r.atom, nowMs)
    r.age_days = stale.age_days
    r.last_access_days = stale.last_access_days
    r.confidence_decay = Number(stale.confidence_decay.toFixed(2))
    r.is_stale = stale.is_stale
    r.supersededBy = r.atom.supersededBy || null
    r.history = showHistory ? (r.atom.supersedes || []).map(id => ({ id })) : []
    try {
      await updateAccessTime(r.path, nowMs)
    } catch (e) {
      if (!accessUpdateWarned) {
        accessUpdateWarned = true
        process.stderr.write(`atomsyn-cli: warning · failed to update lastAccessedAt (${e.message})\n`)
      }
    }
    delete r.atom // strip from JSON output
  }

  // Build taxonomy: merge seed.json + actual dimension values from existing atoms
  let taxonomy = undefined
  if (withTaxonomy || sliced.length === 0) {
    // Load seed vocabulary
    let seed = { roles: [], situations: [], activities: [], insight_types: [] }
    try {
      const seedPath = join(dataDir, 'taxonomy', 'seed.json')
      if (existsSync(seedPath)) {
        seed = JSON.parse(await readFile(seedPath, 'utf8'))
      }
    } catch { /* fallback to empty */ }
    taxonomy = {
      roles: [...new Set([...(seed.roles || []), ...dimSets.roles])],
      situations: [...new Set([...(seed.situations || []), ...dimSets.situations])],
      activities: [...new Set([...(seed.activities || []), ...dimSets.activities])],
      insight_types: [...new Set([...(seed.insight_types || []), ...dimSets.insight_types])],
    }
  }

  const output = { ok: true, query, total: matches.length, results: sliced }
  if (taxonomy) output.taxonomy = taxonomy
  console.log(JSON.stringify(output, null, 2))
}

// ---------------------------------------------------------------------------
// Subcommand: update — merge caller's fields into an existing atom by id.
// Handles slug rename (name change → new folder) atomically: writes the new
// file, deletes the old file, removes the old folder if it's now empty.
// This is the "safe for cold-start sessions" contract — agents only need to
// know the id, nothing else.
// ---------------------------------------------------------------------------

function mergeAtomFields(existing, incoming) {
  // id, createdAt, kind, schemaVersion are immutable on update
  const merged = { ...existing }
  // Merge top-level content fields — only overwrite if caller provided them
  const contentFields = [
    'name',
    'nameEn',
    'sourceContext',
    'insight',
    'tags',
    'keySteps',
    'codeArtifacts',
    'screenshots',
    'relatedFrameworks',
    'relatedAtoms',
    'sessionId',
    'sourceAgent',
    'role',
    'situation',
    'activity',
    'insight_type',
    'subKind',
  ]
  for (const f of contentFields) {
    if (incoming[f] !== undefined) merged[f] = incoming[f]
  }
  // stats: merge preserving user flags (locked/userDemoted) and incrementing
  // useCount if caller explicitly bumps it.
  merged.stats = {
    ...existing.stats,
    ...(incoming.stats || {}),
    usedInProjects:
      incoming.stats?.usedInProjects ??
      existing.stats?.usedInProjects ??
      [],
    useCount: incoming.stats?.useCount ?? existing.stats?.useCount ?? 0,
    // V2.0: preserve human view count (agent never overwrites), AI count additive
    aiInvokeCount: existing.stats?.aiInvokeCount ?? incoming.stats?.aiInvokeCount ?? 0,
    humanViewCount: existing.stats?.humanViewCount ?? 0, // never overwritten by agent
    locked: existing.stats?.locked ?? incoming.stats?.locked ?? false,
    userDemoted: existing.stats?.userDemoted ?? incoming.stats?.userDemoted ?? false,
  }
  merged.updatedAt = new Date().toISOString()
  return merged
}

async function cmdUpdate(args) {
  const id = getFlag(args, '--id')
  if (!id) die('update requires --id <atomId> (use `atomsyn-cli find --query "..."` to locate it)')

  let input
  if (hasFlag(args, '--stdin')) {
    input = await readStdin()
  } else {
    const inputFile = getFlag(args, '--input')
    if (!inputFile) die('update requires --stdin or --input <file> with the fields to merge')
    input = await readFile(inputFile, 'utf8')
  }
  if (!input.trim()) die('Empty input')

  let incoming
  try {
    incoming = parseJsonRobust(input)
  } catch (err) {
    die(`Input is not valid JSON: ${err.message}\nTip: 如仍失败,请先写入临时文件,再用 --input /tmp/atomsyn_write.json`)
  }

  const { path: dataDir, source } = resolveDataDir()
  const hit = await findAtomFileById(dataDir, id)
  if (!hit) die(`No atom found with id=${id}. Use \`atomsyn-cli find --query "..."\` to search.`)

  if (hit.atom?.stats?.locked === true) {
    die(
      `Atom ${id} is locked by user (stats.locked=true). Refusing to update. Unlock in Atomsyn GUI first, or create a new atom instead.`,
    )
  }

  // V2.x cognitive-evolution · supersede protocol guard (B3)
  // Once an atom is superseded or archived it is read-only; reject update.
  if (hit.atom?.archivedAt) {
    die(`Atom ${id} is archived (archivedAt=${hit.atom.archivedAt}). Use 'atomsyn-cli archive --id ${id} --restore' first if you want to edit it again.`, 3)
  }
  if (hit.atom?.supersededBy) {
    die(`Atom ${id} has been superseded by ${hit.atom.supersededBy}. Update the successor atom instead, or use 'atomsyn-cli archive --id ${id} --restore' to revive (rare).`, 3)
  }

  const merged = mergeAtomFields(hit.atom, incoming)

  // V2.x cognitive-evolution · collision check (B3)
  const collisionCheckEnabled =
    !hasFlag(args, '--no-check-collision') &&
    process.env.ATOMSYN_DISABLE_COLLISION_CHECK !== '1' &&
    process.env.ATOMSYN_SKIP_COLLISION !== '1'
  let collisionCandidates = []
  if (collisionCheckEnabled) {
    try {
      const expDir = join(dataDir, 'atoms', 'experience')
      const corpusFiles = await walkJson(expDir)
      const corpus = []
      for (const f of corpusFiles) {
        try {
          const a = JSON.parse(await readFile(f, 'utf8'))
          corpus.push(a)
        } catch { /* skip */ }
      }
      collisionCandidates = detectCollision(merged, corpus)
    } catch (err) {
      process.stderr.write(`atomsyn-cli: warning · collision check skipped (${err.message})\n`)
    }
  }

  // Decide target path: if the merged name produces a different slug than
  // where the file currently lives, we MOVE the file to the new slug folder
  // (atomic: write new, unlink old, rmdir old folder if empty).
  const newSlug = deriveSlug(merged.name || merged.id.replace(/^atom_exp_/, '').split('_')[0])
  const newDir = join(dataDir, 'atoms', 'experience', newSlug)
  const newFile = join(newDir, `${merged.id}.json`)
  const oldFile = hit.file
  const oldDir = dirname(oldFile)

  await mkdir(newDir, { recursive: true })
  await writeFile(newFile, JSON.stringify(merged, null, 2) + '\n', 'utf8')

  let moved = false
  if (resolve(newFile) !== resolve(oldFile)) {
    // Rename: delete old file, then try to remove old dir if empty
    try {
      await unlink(oldFile)
      moved = true
    } catch {
      /* non-fatal */
    }
    try {
      const remaining = await readdir(oldDir)
      if (remaining.length === 0) {
        await rmdir(oldDir)
      }
    } catch {
      /* non-fatal */
    }
  }

  // Append usage log entry
  try {
    await appendUsageLog(dataDir, {
      ts: new Date().toISOString(),
      action: 'update',
      atomId: merged.id,
      agentName: merged.sourceAgent || 'unknown',
      kind: 'experience',
      moved,
      dataSource: source,
    })
    if (collisionCandidates.length > 0) {
      await appendUsageLog(dataDir, {
        ts: new Date().toISOString(),
        action: 'write.collision_detected',
        atomId: merged.id,
        candidates: collisionCandidates.map(c => c.id),
      })
    }
  } catch (err) {
    console.error(`${color.yellow}Warning: usage log append failed: ${err.message}${color.reset}`)
  }

  if (collisionCandidates.length > 0) {
    const names = collisionCandidates.map(c => `${c.name || '(unnamed)'} <${c.id}>`).join(', ')
    process.stderr.write(`${color.yellow}atomsyn-cli: ⚠️  ${collisionCandidates.length} collision candidate(s) detected: ${names}. See stdout collision_candidates field.${color.reset}\n`)
  }

  const payload = {
    ok: true,
    action: moved ? 'updated-and-moved' : 'updated-in-place',
    atomId: merged.id,
    name: merged.name,
    path: newFile,
    previousPath: moved ? oldFile : undefined,
    dataDir,
    dataSource: source,
    hint: moved
      ? `Atom renamed — moved from ${oldFile} to ${newFile}`
      : `Atom updated in place at ${newFile}`,
  }
  if (collisionCandidates.length > 0) payload.collision_candidates = collisionCandidates
  console.log(JSON.stringify(payload, null, 2))
}

// ---------------------------------------------------------------------------
// V2.x cognitive-evolution · supersede / archive / prune subcommands (B4-B6)
// ---------------------------------------------------------------------------

async function cmdSupersede(args) {
  const oldId = getFlag(args, '--id')
  const inputFile = getFlag(args, '--input')
  const archiveOld = !hasFlag(args, '--no-archive-old')

  if (!oldId) die(`supersede requires --id <old-id>`, 2)
  if (!inputFile) die(`supersede requires --input <new-atom-file>`, 2)

  let input
  try {
    input = await readFile(inputFile, 'utf8')
  } catch (err) {
    die(`Cannot read input file: ${inputFile} (${err.message})`, 4)
  }

  let newAtom
  try {
    newAtom = parseJsonRobust(input)
  } catch (err) {
    die(`Input is not valid JSON: ${err.message}`, 4)
  }

  try {
    normalizeExperienceAtom(newAtom)
  } catch (err) {
    die(`Schema validation failed: ${err.message}`, 4)
  }

  const { path: dataDir } = resolveDataDir()
  await ensureDataLayout(dataDir)

  const writeAtom = async (atom) => {
    const slug = deriveSlug(atom.name || atom.id.replace(/^atom_exp_/, '').split('_')[0])
    const outDir = join(dataDir, 'atoms', 'experience', slug)
    await mkdir(outDir, { recursive: true })
    const outFile = join(outDir, `${atom.id}.json`)
    atom.updatedAt = new Date().toISOString()
    await writeFile(outFile, JSON.stringify(atom, null, 2) + '\n', 'utf8')
    return { atom, path: outFile }
  }

  let result
  try {
    result = await applySupersede(
      { dataDir, findAtomFileById, writeAtom, rebuildIndex: inlineRebuildIndex },
      { oldId, newAtom, archiveOld },
    )
  } catch (err) {
    if (err.code === 'OLD_NOT_FOUND') die(err.message, 2)
    if (err.code === 'OLD_LOCKED' || err.code === 'OLD_ALREADY_ARCHIVED') die(err.message, 3)
    die(err.message, 1)
  }

  try {
    await appendUsageLog(dataDir, {
      ts: new Date().toISOString(),
      action: 'supersede.applied',
      oldId: result.oldId,
      newId: result.newId,
      archivedOld: archiveOld,
    })
  } catch { /* non-fatal */ }

  console.log(JSON.stringify({
    ok: true,
    oldId: result.oldId,
    newId: result.newId,
    oldPath: result.oldFile,
    newPath: result.newFile,
    archivedOld: archiveOld,
    hint: archiveOld
      ? `已用 ${result.newId} 取代 ${result.oldId} 并自动归档旧 atom。read 默认不再返回旧 atom。`
      : `已用 ${result.newId} 取代 ${result.oldId} (使用了 --no-archive-old, 旧 atom 仍可被 read 命中)。`,
  }, null, 2))
}

async function cmdArchive(args) {
  const id = getFlag(args, '--id')
  const reason = getFlag(args, '--reason')
  const restore = hasFlag(args, '--restore')

  if (!id) die(`archive requires --id <atomId>`, 2)
  if (reason && reason.length > 500) die(`--reason exceeds 500 chars (got ${reason.length})`, 4)

  const { path: dataDir } = resolveDataDir()

  let result
  try {
    result = await applyArchive(
      { dataDir, findAtomFileById, rebuildIndex: inlineRebuildIndex },
      { id, reason, restore },
    )
  } catch (err) {
    if (err.code === 'NOT_FOUND') die(err.message, 2)
    if (err.code === 'LOCKED' || err.code === 'NOT_ARCHIVED') die(err.message, 3)
    die(err.message, 1)
  }

  try {
    await appendUsageLog(dataDir, {
      ts: new Date().toISOString(),
      action: restore ? 'archive.restored' : 'archive.applied',
      atomId: id,
      ...(reason ? { reason } : {}),
    })
  } catch { /* non-fatal */ }

  if (restore) {
    console.log(JSON.stringify({
      ok: true,
      atomId: id,
      restored: true,
      hint: `已反归档 ${id}, atom 重新出现在 read/find 默认结果中。`,
    }, null, 2))
  } else {
    console.log(JSON.stringify({
      ok: true,
      atomId: id,
      archivedAt: result.archivedAt,
      ...(reason ? { reason } : {}),
      hint: `已软删除 ${id}, read 默认不再返。如需反归档请用 'atomsyn-cli archive --id ${id} --restore'。注: archived atom 仍在磁盘和索引上 (仅默认隐藏), 物理删除请在 GUI 中解锁后用 OS 工具。`,
    }, null, 2))
  }
}

async function cmdPrune(args) {
  // design §5.1.5: 永远 dry-run, 不接受非 dry-run 模式 (D-005)
  const limit = parseInt(getFlag(args, '--limit', '10'), 10)
  if (!Number.isFinite(limit) || limit < 1) die(`--limit must be a positive integer (got ${limit})`, 4)

  const { path: dataDir } = resolveDataDir()
  const atomsRoot = join(dataDir, 'atoms')
  const allFiles = await walkJson(atomsRoot)
  const corpus = []
  for (const f of allFiles) {
    try {
      const a = JSON.parse(await readFile(f, 'utf8'))
      if (a.kind === 'profile') continue          // D-008: profile 不参与 prune
      if (a.kind === 'skill-inventory') continue  // skill-inventory 演化语义不同
      corpus.push(a)
    } catch { /* skip */ }
  }

  const result = detectPruneCandidates(corpus, { limit })

  try {
    await appendUsageLog(dataDir, {
      ts: new Date().toISOString(),
      action: 'prune.scanned',
      candidates_count: result.summary.candidates_count,
      summary: result.summary,
    })
  } catch { /* non-fatal */ }

  console.log(JSON.stringify({
    ok: true,
    candidates: result.candidates,
    summary: result.summary,
    hint: 'Use atomsyn-cli supersede / archive on each candidate after user review. This command never auto-mutates (D-005).',
  }, null, 2))
}

// ---------------------------------------------------------------------------
// Subcommand: install-skill
// Installs atomsyn-write/atomsyn-read skills into target agent directories and
// sets up a stable `atomsyn-cli` shim on PATH so the skill contract is portable.
// ---------------------------------------------------------------------------

const TARGET_SKILL_DIRS = {
  claude: () => join(homedir(), '.claude', 'skills'),
  cursor: () => join(homedir(), '.cursor', 'skills'),
  // codex / trae deliberately left out of V1.5 scope
}

async function copyDirRecursive(src, dst) {
  const { readdir, copyFile, stat } = await import('node:fs/promises')
  await mkdir(dst, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const s = join(src, e.name)
    const d = join(dst, e.name)
    if (e.isDirectory()) {
      await copyDirRecursive(s, d)
    } else if (e.isFile()) {
      await copyFile(s, d)
    }
  }
}

async function installCliShim() {
  // Cross-platform shim: ~/.atomsyn/bin/atomsyn-cli (sh) + atomsyn-cli.cmd (win)
  const binDir = join(homedir(), '.atomsyn', 'bin')
  await mkdir(binDir, { recursive: true })

  const cliAbsPath = join(PROJECT_ROOT, 'scripts', 'atomsyn-cli.mjs')
  const isWin = platform() === 'win32'

  // POSIX shim (always install — useful on WSL / Git Bash too on Windows)
  const shPath = join(binDir, 'atomsyn-cli')
  const shContent = `#!/bin/sh\n# Atomsyn CLI shim — generated by atomsyn-cli install-skill\nexec node "${cliAbsPath}" "$@"\n`
  await writeFile(shPath, shContent, { mode: 0o755 })
  // Ensure executable bit on POSIX
  if (!isWin) {
    try {
      const { chmod } = await import('node:fs/promises')
      await chmod(shPath, 0o755)
    } catch {
      /* non-fatal */
    }
  }

  // Windows .cmd shim
  if (isWin) {
    const cmdPath = join(binDir, 'atomsyn-cli.cmd')
    const cmdContent = `@echo off\r\nREM Atomsyn CLI shim — generated by atomsyn-cli install-skill\r\nnode "${cliAbsPath}" %*\r\n`
    await writeFile(cmdPath, cmdContent, 'utf8')
  }

  return { binDir, shPath, cliAbsPath }
}

function pathRcInstructions(binDir) {
  const isWin = platform() === 'win32'
  if (isWin) {
    return [
      `1. Open PowerShell and run:`,
      `     [Environment]::SetEnvironmentVariable('Path', "$env:Path;${binDir}", 'User')`,
      `2. Restart your terminal so the new PATH takes effect`,
    ].join('\n')
  }
  return [
    `1. Append this line to ~/.zshrc or ~/.bashrc:`,
    `     export PATH="${binDir}:$PATH"`,
    `2. Run: source ~/.zshrc  (or open a new terminal)`,
  ].join('\n')
}

/**
 * Try to append the PATH export line to the user's shell rc file
 * (~/.zshrc or ~/.bashrc, based on $SHELL). Idempotent — if the line is
 * already present anywhere in the file, we skip. Returns info about what
 * happened so the caller can report it to the user. POSIX-only; Windows
 * falls back to printing instructions.
 */
async function tryWriteShellRc(binDir) {
  if (platform() === 'win32') {
    return { written: false, file: null, reason: 'windows-manual' }
  }

  const shell = process.env.SHELL || ''
  const rcFile = shell.endsWith('zsh')
    ? join(homedir(), '.zshrc')
    : shell.endsWith('bash')
      ? join(homedir(), '.bashrc')
      : join(homedir(), '.zshrc') // default to zsh on modern macOS

  const exportLine = `export PATH="${binDir}:$PATH"`
  const marker = '# Atomsyn CLI (atomsyn-cli install-skill)'

  let existing = ''
  try {
    existing = await readFile(rcFile, 'utf8')
  } catch {
    // rc file doesn't exist — we'll create it
  }

  // Idempotency: if we already appended before, or the user already has
  // the bin dir in their PATH export, don't re-append.
  if (existing.includes(binDir) || existing.includes(marker)) {
    return { written: false, file: rcFile, reason: 'already-present' }
  }

  const block = `\n${marker}\n${exportLine}\n`
  try {
    await appendFile(rcFile, block, 'utf8')
    return { written: true, file: rcFile, reason: 'appended' }
  } catch (err) {
    return { written: false, file: rcFile, reason: `error: ${err.message}` }
  }
}

async function cmdInstallSkill(args) {
  const target = getFlag(args, '--target', 'all')
  const dryRun = hasFlag(args, '--dry-run')
  const noPath = hasFlag(args, '--no-path')

  const targets =
    target === 'all'
      ? Object.keys(TARGET_SKILL_DIRS)
      : target.split(',').map((s) => s.trim()).filter(Boolean)

  for (const t of targets) {
    if (!(t in TARGET_SKILL_DIRS)) {
      die(
        `Unknown target '${t}'. Supported: ${Object.keys(TARGET_SKILL_DIRS).join(
          ', '
        )}, or 'all'.`
      )
    }
  }

  const skillsSrc = join(PROJECT_ROOT, 'skills')
  const atomsynWriteSrc = join(skillsSrc, 'atomsyn-write')
  const atomsynReadSrc = join(skillsSrc, 'atomsyn-read')
  const atomsynMentorSrc = join(skillsSrc, 'atomsyn-mentor')

  if (!existsSync(atomsynWriteSrc) || !existsSync(atomsynReadSrc)) {
    die(
      `Source skills not found. Expected ${atomsynWriteSrc} and ${atomsynReadSrc}.`
    )
  }

  const results = []

  // Install CLI shim first so the skills can reference `atomsyn-cli` directly
  let shimInfo = null
  if (!dryRun) {
    shimInfo = await installCliShim()
    results.push({
      step: 'cli-shim',
      binDir: shimInfo.binDir,
      shim: shimInfo.shPath,
      ok: true,
    })
  } else {
    results.push({
      step: 'cli-shim',
      dryRun: true,
      binDir: join(homedir(), '.atomsyn', 'bin'),
    })
  }

  // Copy skills to each target
  for (const t of targets) {
    const dir = TARGET_SKILL_DIRS[t]()
    const writeDst = join(dir, 'atomsyn-write')
    const readDst = join(dir, 'atomsyn-read')
    const mentorDst = join(dir, 'atomsyn-mentor')

    if (dryRun) {
      results.push({ step: 'skill-copy', target: t, writeDst, readDst, mentorDst, dryRun: true })
      continue
    }

    await mkdir(dir, { recursive: true })
    await copyDirRecursive(atomsynWriteSrc, writeDst)
    await copyDirRecursive(atomsynReadSrc, readDst)
    if (existsSync(atomsynMentorSrc)) {
      await copyDirRecursive(atomsynMentorSrc, mentorDst)
    }
    results.push({ step: 'skill-copy', target: t, writeDst, readDst, mentorDst, ok: true })
  }

  // Auto-append PATH export to shell rc unless --no-path was passed
  let pathWrite = null
  if (!dryRun && !noPath && shimInfo) {
    pathWrite = await tryWriteShellRc(shimInfo.binDir)
    results.push({
      step: 'shell-rc',
      file: pathWrite.file,
      written: pathWrite.written,
      reason: pathWrite.reason,
    })
  }

  const pathHint = shimInfo ? pathRcInstructions(shimInfo.binDir) : ''
  const nextSteps = [
    'Restart your AI coding tool (Claude Code / Cursor) so it picks up the new skills.',
    'Try saying "帮我记下来" or "save to my atomsyn" in a conversation to test.',
    `CLI shim at ${shimInfo ? shimInfo.binDir : '(dry-run, not created)'}`,
  ]

  if (pathWrite?.written) {
    nextSteps.unshift(
      `✓ Appended PATH to ${pathWrite.file} — open a new terminal (or run \`source ${pathWrite.file}\`) to activate atomsyn-cli`,
    )
  } else if (pathWrite?.reason === 'already-present') {
    nextSteps.unshift(`✓ ${pathWrite.file} already has atomsyn-cli in PATH — nothing to do`)
  } else if (!noPath && !dryRun && platform() === 'win32') {
    nextSteps.unshift('→ Windows detected: follow pathInstructions to add the shim to your user PATH')
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        targets,
        dryRun,
        results,
        pathSetupRequired: !noPath && !pathWrite?.written,
        pathWrite,
        pathInstructions: pathHint,
        nextSteps,
      },
      null,
      2
    )
  )
}

// ---------------------------------------------------------------------------
// Subcommand: reindex (inline implementation — works when CLI is installed
// at ~/.atomsyn/bin/ without access to PROJECT_ROOT)
// ---------------------------------------------------------------------------

async function cmdReindex() {
  // Try delegate to project's rebuild-index.mjs if available (dev mode)
  const script = join(PROJECT_ROOT, 'scripts', 'rebuild-index.mjs')
  if (existsSync(script)) {
    await new Promise((res, rej) => {
      const proc = spawn('node', [script], { stdio: 'inherit' })
      proc.on('exit', (code) => (code === 0 ? res() : rej(new Error(`reindex exited with code ${code}`))))
      proc.on('error', rej)
    })
    return
  }

  // Inline reindex: resolve data dir and rebuild index from JSON files
  const { path: dataDir } = resolveDataDir()
  if (!existsSync(dataDir)) die(`Data directory not found: ${dataDir}`)
  await inlineRebuildIndex(dataDir)
}

/** Standalone index rebuild using only resolveDataDir() — no PROJECT_ROOT dependency. */
async function inlineRebuildIndex(dataDir) {
  const { readFile, readdir, writeFile } = await import('node:fs/promises')

  async function walkJson(dir) {
    const out = []
    if (!existsSync(dir)) return out
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) out.push(...(await walkJson(full)))
      else if (e.isFile() && e.name.endsWith('.json')) out.push(full)
    }
    return out
  }

  async function readJson(file, fallback) {
    try { return JSON.parse(await readFile(file, 'utf8')) }
    catch { return fallback }
  }

  // Load frameworks
  const fwDir = join(dataDir, 'frameworks')
  let frameworks = []
  if (existsSync(fwDir)) {
    const fwFiles = (await readdir(fwDir)).filter(f => f.endsWith('.json'))
    frameworks = (await Promise.all(fwFiles.map(f => readJson(join(fwDir, f), null)))).filter(Boolean)
  }

  // Load all atoms
  const atomFiles = await walkJson(join(dataDir, 'atoms'))
  const allAtoms = []
  for (const f of atomFiles) {
    const j = await readJson(f, null)
    if (j) allAtoms.push({ ...j, _file: f.slice(dataDir.length + 1) })
  }

  const atoms = allAtoms.filter(a => (a.kind ?? 'methodology') === 'methodology')
  const experienceAtoms = allAtoms.filter(a => a.kind === 'experience')
  const skillInventoryAtoms = allAtoms.filter(a => a.kind === 'skill-inventory')
  // V2.x bootstrap-skill · profile singleton bucket (≤ 1 entry)
  const profileAtoms = allAtoms.filter(a => a.kind === 'profile')

  // Load projects
  const projDir = join(dataDir, 'projects')
  const projects = []
  if (existsSync(projDir)) {
    const pEntries = await readdir(projDir, { withFileTypes: true })
    for (const e of pEntries) {
      if (!e.isDirectory()) continue
      const meta = await readJson(join(projDir, e.name, 'meta.json'), null)
      if (meta) projects.push(meta)
    }
  }

  // Build counts
  const fwAtomCount = {}
  for (const a of atoms) fwAtomCount[a.frameworkId] = (fwAtomCount[a.frameworkId] || 0) + 1

  const cellNameByFwAndCell = {}
  for (const f of frameworks) {
    cellNameByFwAndCell[f.id] = {}
    for (const c of f.matrix?.cells ?? []) cellNameByFwAndCell[f.id][c.stepNumber] = c.name
  }

  const projectsUsingAtom = {}
  for (const p of projects) {
    const practDir = join(dataDir, 'projects', p.id, 'practices')
    const practices = existsSync(practDir)
      ? (await Promise.all((await walkJson(practDir)).map(f => readJson(f, null)))).filter(Boolean)
      : []
    const atomIds = new Set()
    for (const pr of practices) atomIds.add(pr.atomId)
    for (const pin of p.pinnedAtoms ?? []) atomIds.add(pin.atomId)
    for (const aid of atomIds) (projectsUsingAtom[aid] ??= []).push(p.id)
  }

  const index = {
    generatedAt: new Date().toISOString(),
    version: 1,
    frameworks: frameworks.map(f => ({ id: f.id, name: f.name, atomCount: fwAtomCount[f.id] || 0 })),
    atoms: atoms.map(a => ({
      id: a.id, name: a.name, nameEn: a.nameEn, frameworkId: a.frameworkId,
      cellId: a.cellId, cellName: cellNameByFwAndCell[a.frameworkId]?.[a.cellId] ?? '',
      tags: a.tags ?? [], tagline: (a.coreIdea ?? '').slice(0, 80),
      whenToUse: a.whenToUse ?? '', path: a._file,
    })),
    projects: projects.map(p => ({
      id: p.id, name: p.name, innovationStage: p.innovationStage,
      atomsUsed: Array.from(new Set([...(p.pinnedAtoms?.map(x => x.atomId) ?? [])])),
    })),
    experiences: experienceAtoms.map(e => ({
      id: e.id, name: e.name, tags: e.tags ?? [], sourceAgent: e.sourceAgent ?? 'user',
      sourceContext: e.sourceContext ?? '', insightExcerpt: (e.insight ?? '').slice(0, 200),
      createdAt: e.createdAt, updatedAt: e.updatedAt, path: e._file,
    })),
    skillInventory: skillInventoryAtoms.map(s => ({
      id: s.id, name: s.name, toolName: s.toolName ?? 'custom',
      rawDescription: s.rawDescription ?? '', aiGeneratedSummary: s.aiGeneratedSummary,
      tags: s.tags ?? [], localPath: s.localPath ?? '', updatedAt: s.updatedAt,
    })),
    profiles: profileAtoms.map(p => ({
      id: p.id, name: p.name,
      verified: p.verified === true,
      verifiedAt: p.verifiedAt ?? null,
      previousVersionsCount: Array.isArray(p.previous_versions) ? p.previous_versions.length : 0,
      evidenceCount: Array.isArray(p.evidence_atom_ids) ? p.evidence_atom_ids.length : 0,
      updatedAt: p.updatedAt, path: p._file,
    })),
  }

  const outDir = join(dataDir, 'index')
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'knowledge-index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')

  // Sync atom.stats.usedInProjects
  for (const a of atoms) {
    const used = projectsUsingAtom[a.id] ?? []
    if (JSON.stringify(a.stats?.usedInProjects ?? []) !== JSON.stringify(used)) {
      const file = join(dataDir, a._file)
      const fresh = await readJson(file, null)
      if (!fresh) continue
      fresh.stats = fresh.stats || { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 }
      fresh.stats.usedInProjects = used
      fresh.updatedAt = new Date().toISOString()
      await writeFile(file, JSON.stringify(fresh, null, 2) + '\n', 'utf8')
    }
  }

  // V2.x: write status to stderr instead of stdout to avoid polluting
  // JSON output of supersede / archive / restore / write / update commands
  // that call rebuildIndex internally. cmdReindex (the standalone command)
  // still surfaces this line because terminals show stderr by default.
  process.stderr.write(
    `✅ Index rebuilt: ${index.frameworks.length} frameworks · ${index.atoms.length} atoms · ${index.experiences.length} experiences · ${index.skillInventory.length} skills · ${index.projects.length} projects · ${index.profiles.length} profiles\n`
  )
}

// ---------------------------------------------------------------------------
// Subcommand: ingest — V2.0 M2 fragment ingestion (NO LLM call inside CLI)
// Agent passes pre-classified JSON; CLI validates + writes.
// ---------------------------------------------------------------------------

async function cmdIngest(args) {
  const dryRun = args.includes('--dry-run')
  const textArg = getFlag(args, '--text')
  const useStdin = args.includes('--stdin')

  let input
  if (useStdin) {
    input = await readStdin()
  } else if (textArg) {
    // Simple text mode: wrap as minimal fragment JSON (agent should prefer --stdin with full JSON)
    input = JSON.stringify({
      title: textArg.slice(0, 80),
      summary: textArg.slice(0, 500),
      role: '学习',
      situation: '对话AI',
      activity: '记录',
      insight_type: '纯好奇',
      tags: ['quick-ingest'],
      rawContent: textArg,
      confidence: 0.5,
    })
  } else {
    die('ingest requires --stdin (full JSON) or --text "..." (simple text)')
  }

  let fragment
  try {
    fragment = parseJsonRobust(input)
  } catch (err) {
    die(`Invalid JSON input: ${err.message}\nTip: 如仍失败,请先写入临时文件,再用 --input /tmp/atomsyn_write.json`)
  }

  // Required fields validation
  const required = ['title', 'summary', 'role', 'situation', 'activity', 'insight_type', 'tags']
  const missing = required.filter((f) => !fragment[f])
  if (missing.length) {
    die(`Missing required fields: ${missing.join(', ')}. See classify.md for the expected structure.`)
  }
  if (!Array.isArray(fragment.tags) || fragment.tags.length === 0) {
    die('tags must be a non-empty array of strings.')
  }

  const { path: dataDir } = resolveDataDir()
  const now = new Date().toISOString()
  const ts = Date.now()
  const slug = deriveSlug(fragment.title)
  const id = `atom_frag_${slug}_${ts}`

  const atom = {
    id,
    schemaVersion: 1,
    kind: 'experience',
    subKind: 'fragment',
    title: fragment.title,
    summary: fragment.summary,
    role: fragment.role,
    situation: fragment.situation,
    activity: fragment.activity,
    insight_type: fragment.insight_type,
    tags: fragment.tags,
    rawContent: fragment.rawContent || '',
    linked_methodologies: fragment.linked_methodologies || [],
    confidence: typeof fragment.confidence === 'number' ? fragment.confidence : 0.5,
    context: {
      domain_hint: fragment.context?.domain_hint || '',
      source: fragment.context?.source || 'cli',
      ingestModel: fragment.context?.ingestModel || '',
    },
    private: fragment.insight_type === '情绪复盘' || fragment.private === true,
    stats: { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 },
    createdAt: now,
    updatedAt: now,
  }

  // M4: Semantic alignment — auto-link to methodology atoms (no LLM, keyword scoring)
  if (atom.linked_methodologies.length === 0) {
    try {
      const atomsRoot = join(dataDir, 'atoms')
      const qTerms = tokenizeQuery(atom.title + ' ' + atom.tags.join(' ') + ' ' + (atom.role || '') + ' ' + (atom.summary || ''))

      // Scan methodology atoms across all framework dirs
      if (existsSync(atomsRoot)) {
        const { readdir: rd } = await import('node:fs/promises')
        const topEntries = await rd(atomsRoot, { withFileTypes: true })
        const scored = []
        for (const e of topEntries) {
          if (!e.isDirectory()) continue
          if (['experience', 'methodology', 'skill-inventory'].includes(e.name)) continue
          const fwFiles = await walkJson(join(atomsRoot, e.name))
          for (const f of fwFiles) {
            try {
              const mAtom = JSON.parse(await readFile(f, 'utf8'))
              if (mAtom.kind === 'skill-inventory') continue
              const haystack = (
                (mAtom.name || '') + ' ' + (mAtom.nameEn || '') + ' ' +
                (mAtom.coreIdea || '') + ' ' + (mAtom.whenToUse || '') + ' ' +
                (mAtom.tags || []).join(' ')
              ).toLowerCase()
              let score = 0
              for (const t of qTerms) score += haystack.split(t).length - 1
              if (score >= 2) scored.push({ id: mAtom.id, score })
            } catch { /* skip */ }
          }
        }
        scored.sort((a, b) => b.score - a.score)
        atom.linked_methodologies = scored.slice(0, 5).map(s => s.id)
      }
    } catch { /* non-fatal */ }
  }

  if (dryRun) {
    console.log(JSON.stringify(atom, null, 2))
    return
  }

  // Write to disk
  const outDir = join(dataDir, 'atoms', 'experience', 'fragment', slug)
  await mkdir(outDir, { recursive: true })
  const outFile = join(outDir, `${id}.json`)
  await writeFile(outFile, JSON.stringify(atom, null, 2) + '\n')

  // Usage log
  const agentName = process.env.ATOMSYN_AGENT || 'unknown'
  try {
    await appendUsageLog(dataDir, {
      ts: now,
      action: 'write',
      atomId: id,
      agentName,
      kind: 'experience-fragment',
      dataSource: 'cli-ingest',
    })
  } catch { /* non-fatal */ }

  // Reindex (try project script first, fall back to inline)
  try {
    const script = join(PROJECT_ROOT, 'scripts', 'rebuild-index.mjs')
    if (existsSync(script)) {
      await new Promise((res, rej) => {
        const proc = spawn('node', [script], { stdio: 'pipe' })
        proc.on('exit', (code) => (code === 0 ? res() : rej(new Error(`reindex code ${code}`))))
        proc.on('error', rej)
      })
    } else {
      await inlineRebuildIndex(resolveDataDir().path)
    }
  } catch { /* non-fatal */ }

  console.log(JSON.stringify({
    ok: true,
    id,
    path: outFile,
    private: atom.private,
    linked: atom.linked_methodologies.length,
  }, null, 2))
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// mentor — P1 cognitive review command
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Subcommand: bootstrap (V2.x bootstrap-skill change)
//
// 3-phase funnel (D-003): TRIAGE → SAMPLING → DEEP DIVE. Each phase is a gate;
// the user (via the atomsyn-bootstrap skill) confirms before the next phase.
// dry-run + commit two-stage protocol (D-011): dry-run emits markdown only,
// commit reads user-edited markdown and ingests atoms.
//
// Implementation lands incrementally (see scripts/lib/bootstrap/* + B 组 commits).
// This stub validates the dispatcher wiring and prints a brief notice.
// ---------------------------------------------------------------------------
/**
 * Parse `atomsyn-cli bootstrap` flags into a normalized options object.
 * Repeats: --path. CSV: --include-pattern, --exclude-pattern. Mutex:
 *   - --resume conflicts with --path / --commit (resume reuses the session's paths)
 *   - --commit conflicts with --resume / --path (commit operates on a finished dry-run)
 *   - --phase only valid alongside --path or --resume (not --commit)
 *
 * Exit code 4 (validation failure) on any rule violation.
 */
function parseBootstrapArgs(args) {
  const opts = {
    paths: [],
    phase: 'all', // triage | sampling | deep-dive | all
    parallel: false,
    includePattern: '',
    excludePattern: '',
    dryRun: false,
    commit: null,
    resume: null,
    userCorrection: '',
    showHelp: false,
    markdownCorrectedFile: null, // GUI / scripted commit can pass an inline file
  }

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    const next = () => args[++i]
    switch (a) {
      case '--help':
      case '-h':
        opts.showHelp = true
        break
      case '--path':
        if (!args[i + 1]) return { error: '--path requires a value', code: 4 }
        opts.paths.push(next())
        break
      case '--phase':
        if (!args[i + 1]) return { error: '--phase requires a value', code: 4 }
        opts.phase = next()
        break
      case '--parallel':
        opts.parallel = true
        break
      case '--include-pattern':
        if (!args[i + 1]) return { error: '--include-pattern requires a value', code: 4 }
        opts.includePattern = next()
        break
      case '--exclude-pattern':
        if (!args[i + 1]) return { error: '--exclude-pattern requires a value', code: 4 }
        opts.excludePattern = next()
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--commit':
        if (!args[i + 1]) return { error: '--commit requires a session id', code: 4 }
        opts.commit = next()
        break
      case '--resume':
        if (!args[i + 1]) return { error: '--resume requires a session id', code: 4 }
        opts.resume = next()
        break
      case '--user-correction':
        if (!args[i + 1]) return { error: '--user-correction requires text', code: 4 }
        opts.userCorrection = next()
        break
      case '--markdown-corrected-file':
        if (!args[i + 1]) return { error: '--markdown-corrected-file requires a path', code: 4 }
        opts.markdownCorrectedFile = next()
        break
      default:
        return { error: `Unknown bootstrap flag: ${a}`, code: 4 }
    }
  }

  if (opts.showHelp) return { opts }

  // Mutex / required-flag checks
  if (opts.commit && (opts.resume || opts.paths.length > 0)) {
    return { error: '--commit cannot be combined with --resume or --path', code: 4 }
  }
  if (opts.resume && opts.paths.length > 0) {
    return { error: '--resume cannot be combined with --path', code: 4 }
  }
  if (!opts.commit && !opts.resume && opts.paths.length === 0) {
    return { error: 'one of --path / --resume / --commit is required', code: 4 }
  }

  const validPhases = new Set(['triage', 'sampling', 'deep-dive', 'all'])
  if (!validPhases.has(opts.phase)) {
    return { error: `--phase must be one of triage|sampling|deep-dive|all (got ${opts.phase})`, code: 4 }
  }
  if (opts.commit && opts.phase !== 'all') {
    return { error: '--phase is not compatible with --commit (commit always finalizes)', code: 4 }
  }

  return { opts }
}

const BOOTSTRAP_HELP = `atomsyn-cli bootstrap — Batch import existing local docs into Atomsyn.

3-phase funnel (D-003): TRIAGE (~30s, 0 LLM) → SAMPLING (~5min, 1 LLM call)
                        → DEEP DIVE (~30min serial / ~8min parallel)

Two-stage protocol (D-011): default flow is dry-run + commit:
  1. atomsyn-cli bootstrap --path ~/Documents --dry-run
     → produces markdown report at ~/.atomsyn/bootstrap-sessions/<id>.md
     → user edits / deletes lines they don't want
  2. atomsyn-cli bootstrap --commit <session-id>
     → reads the (possibly edited) markdown, calls LLM to assemble atom JSON,
       and writes via atomsyn-cli ingest

Flags:
  --path <dir>             Source directory, repeatable
  --phase triage|sampling|deep-dive|all   (default: all)
  --parallel               Phase 3 four-way sub-agent (token cost 4x, opt-in)
  --include-pattern <csv>  Glob whitelist (e.g. "*.md,*.txt")
  --exclude-pattern <csv>  Glob blacklist (stacks with .atomsynignore)
  --dry-run                Emit markdown report only (no atoms written)
  --commit <session-id>    Materialize a previously dry-run'd session
  --resume <session-id>    Continue an interrupted session
  --user-correction "..."  Inline correction injected into Phase 2 hypothesis
  --markdown-corrected-file <path>
                           Override the session markdown with edits from a file
                           (used by the GUI commit endpoint)

Exit codes:
  0  success
  1  generic failure (LLM / IO / schema)
  2  --path / --resume / --commit not found
  3  user aborted at an AskUserQuestion gate
  4  validation failure / sensitive scan filtered everything

See openspec/changes/2026-04-bootstrap-skill/ for the full contract.`

async function cmdBootstrap(args) {
  const parsed = parseBootstrapArgs(args)
  if (parsed.error) {
    process.stderr.write(`Error: ${parsed.error}\n`)
    process.exit(parsed.code || 1)
  }
  const { opts } = parsed
  if (opts.showHelp) {
    console.log(BOOTSTRAP_HELP)
    return
  }

  // ----- Lazy imports of bootstrap library modules ------------------------
  const { runTriage } = await import('./lib/bootstrap/triage.mjs')
  const { runSampling } = await import('./lib/bootstrap/sampling.mjs')
  const { runDeepDiveDryRun, writeDryRunMarkdown } = await import('./lib/bootstrap/deepDive.mjs')
  const sessionLib = await import('./lib/bootstrap/session.mjs')

  // ----- --commit branch (B10 / B11 / B12) ---------------------------------
  if (opts.commit) {
    const { runCommit } = await import('./lib/bootstrap/commit.mjs')
    const session = await sessionLib.loadSession(opts.commit)
    if (!session) {
      process.stderr.write(`✗ Session ${opts.commit} not found in ${sessionLib.sessionsDir()}\n`)
      process.exit(2)
    }
    const { path: dataDir } = resolveDataDir()
    try { sessionLib.assertSessionDataDir(session, dataDir) }
    catch (err) {
      process.stderr.write(`✗ ${err.message}\n`)
      process.exit(2)
    }

    // Resolve markdown source: --markdown-corrected-file > session.dry_run_markdown_path
    const mdPath = opts.markdownCorrectedFile || session.dry_run_markdown_path
    if (!mdPath) {
      process.stderr.write(`✗ Session ${session.id} has no dry-run markdown to commit. Run --dry-run first.\n`)
      process.exit(2)
    }
    if (!existsSync(mdPath)) {
      process.stderr.write(`✗ Markdown file not found: ${mdPath}\n`)
      process.exit(2)
    }
    const markdownText = await (await import('node:fs/promises')).readFile(mdPath, 'utf8')

    session.status = sessionLib.SESSION_STATUS.COMMIT_IN_PROGRESS
    await sessionLib.writeSession(session)

    process.stderr.write(`▶ COMMIT — re-parsing ${mdPath} + calling LLM to assemble atoms…\n`)
    let result
    try {
      result = await runCommit({ session, markdownText, dataDir })
    } catch (err) {
      await sessionLib.failSession(session, 'commit', err.message)
      try {
        await appendUsageLog(dataDir, {
          ts: new Date().toISOString(),
          type: 'bootstrap.failed',
          action: 'bootstrap.failed',
          session_id: session.id,
          phase: 'commit',
          error: err.message?.slice(0, 200),
        })
      } catch { /* ignore */ }
      process.stderr.write(`✗ Commit failed: ${err.message}\n`)
      // session is preserved (B12)
      process.exit(err.code === 'COMMIT_EMPTY' ? 4 : 1)
    }

    session.atoms_created = {
      ...session.atoms_created,
      experience: (session.atoms_created?.experience || 0) + result.atomsCreated.experience,
      fragment: (session.atoms_created?.fragment || 0) + result.atomsCreated.fragment,
      profile: (session.atoms_created?.profile || 0) + (result.atomsCreated.profile || 0),
    }
    session.commit_skipped = result.skipped
    session.commit_duplicates = result.duplicates
    session.commit_parse_errors = result.parseErrors
    session.commit_profile_snapshot = result.profile_snapshot
    session.commit_profile_trigger = result.profile_trigger
    session.commit_atom_ids = result.atomIds
    session.status = sessionLib.SESSION_STATUS.COMMIT_COMPLETED
    session.endedAt = new Date().toISOString()
    await sessionLib.writeSession(session)
    try {
      await appendUsageLog(dataDir, {
        ts: new Date().toISOString(),
        type: 'bootstrap.commit_completed',
        action: 'bootstrap.commit_completed',
        session_id: session.id,
        atoms_created: result.atomsCreated,
        skipped: result.skipped.length,
        duplicates: result.duplicates.length,
        profile_trigger: result.profile_trigger,
      })
    } catch { /* ignore */ }

    // B16 · Markdown commit summary on stdout (mirrors dry-run report style)
    const summaryLines = []
    summaryLines.push(`## Commit complete · session ${session.id}`)
    summaryLines.push('')
    summaryLines.push(`**Atoms created**: ${result.atomsCreated.experience} experience(s) + ${result.atomsCreated.fragment} fragment(s)${result.atomsCreated.profile ? ` + 1 profile (${result.profile_trigger})` : ''}`)
    if (result.duplicates.length > 0) summaryLines.push(`**Duplicates skipped**: ${result.duplicates.length} (B14, threshold 0.8)`)
    if (result.skipped.length > 0) summaryLines.push(`**Ingest failures**: ${result.skipped.length}`)
    if (result.parseErrors.length > 0) summaryLines.push(`**Markdown parse warnings**: ${result.parseErrors.length}`)
    if (result.atomIds.length > 0) {
      summaryLines.push('')
      summaryLines.push(`### Atom ids`)
      summaryLines.push('')
      for (const id of result.atomIds) summaryLines.push(`- \`${id}\``)
    }
    process.stdout.write(summaryLines.join('\n') + '\n')

    process.stderr.write(`✓ commit complete: ${result.atomsCreated.experience} experiences + ${result.atomsCreated.fragment} fragments ingested.\n`)
    if (result.atomsCreated.profile) {
      process.stderr.write(`  Profile updated via applyProfileEvolution (trigger: ${result.profile_trigger})\n`)
    }
    if (result.duplicates.length > 0) {
      process.stderr.write(`  ${result.duplicates.length} candidates skipped as duplicates (B14 dedup, threshold 0.8)\n`)
    }
    if (result.skipped.length > 0) {
      process.stderr.write(`  ${result.skipped.length} atoms could not be ingested (see session.commit_skipped[])\n`)
    }
    if (result.parseErrors.length > 0) {
      process.stderr.write(`  ${result.parseErrors.length} markdown parse warnings (see session.commit_parse_errors[])\n`)
    }
    process.stderr.write(`  Session: ${session.id}\n`)
    return
  }

  // ----- --resume branch (B18) --------------------------------------------
  if (opts.resume) {
    const session = await sessionLib.loadSession(opts.resume)
    if (!session) {
      process.stderr.write(`✗ Session ${opts.resume} not found in ${sessionLib.sessionsDir()}\n`)
      process.exit(2)
    }
    const { path: dataDir } = resolveDataDir()
    try { sessionLib.assertSessionDataDir(session, dataDir) }
    catch (err) {
      process.stderr.write(`✗ ${err.message}\n`)
      process.exit(2)
    }

    process.stderr.write(`▶ Resuming session ${session.id} (status: ${session.status || 'unknown'})\n`)

    // Fast-fail terminal states
    if (session.status === sessionLib.SESSION_STATUS.COMMIT_COMPLETED) {
      process.stderr.write(
        `✓ Session ${session.id} already committed — nothing to resume. ` +
        `${session.atoms_created?.experience || 0} experiences + ${session.atoms_created?.fragment || 0} fragments + ${session.atoms_created?.profile || 0} profile.\n`
      )
      return
    }
    if (session.status === sessionLib.SESSION_STATUS.DRY_RUN_COMPLETED) {
      process.stderr.write(
        `✓ Session ${session.id} already finished dry-run. To materialize:\n  atomsyn-cli bootstrap --commit ${session.id}\n`
      )
      return
    }

    // Reuse the session's original options for path / pattern
    const baseOpts = session.options || {}
    if (!session.paths || session.paths.length === 0) {
      process.stderr.write(`✗ Session ${session.id} has no paths recorded. Cannot resume.\n`)
      process.exit(2)
    }

    // Fresh runs of remaining phases. We do NOT trust the prior partial deep-dive
    // markdown — it may be incomplete. Resume restarts from the next un-completed phase.
    const { runTriage } = await import('./lib/bootstrap/triage.mjs')
    const { runSampling } = await import('./lib/bootstrap/sampling.mjs')
    const { runDeepDiveDryRun, writeDryRunMarkdown } = await import('./lib/bootstrap/deepDive.mjs')

    const resumeFromTriage = !session.phase1_overview
    const resumeFromSampling = !session.phase2_hypothesis
    let triageResult, samplingResult

    if (resumeFromTriage) {
      process.stderr.write(`▶ (resume) Phase 1 · TRIAGE\n`)
      try {
        triageResult = await runTriage({
          paths: session.paths,
          includePattern: baseOpts.includePattern,
          excludePattern: baseOpts.excludePattern,
        })
        session.phase1_overview = {
          totalFiles: triageResult.fileList.length,
          totalBytes: triageResult.totalBytes,
          byExt: triageResult.byExt,
          sensitive_skipped: triageResult.sensitiveSkipped.map((s) => s.relPath),
          recencyBuckets: triageResult.recencyBuckets,
          warnings: triageResult.warnings,
        }
      } catch (err) {
        await sessionLib.failSession(session, 'triage', err.message)
        process.stderr.write(`✗ TRIAGE (resume) failed: ${err.message}\n`)
        process.exit(1)
      }
    } else {
      process.stderr.write(`✓ (resume) Phase 1 · TRIAGE — skipped (already in session)\n`)
      // Re-run triage for the file list (cheap, no LLM). The prior phase1_overview
      // is preserved as historical record; we just need fileList for phase 2/3.
      triageResult = await runTriage({
        paths: session.paths,
        includePattern: baseOpts.includePattern,
        excludePattern: baseOpts.excludePattern,
      })
    }

    if (resumeFromSampling) {
      process.stderr.write(`▶ (resume) Phase 2 · SAMPLING\n`)
      try {
        samplingResult = await runSampling({
          fileList: triageResult.fileList,
          userCorrection: baseOpts.userCorrection,
        })
        session.phase2_hypothesis = samplingResult.hypothesis
      } catch (err) {
        await sessionLib.failSession(session, 'sampling', err.message)
        process.stderr.write(`✗ SAMPLING (resume) failed: ${err.message}\n`)
        process.exit(1)
      }
    } else {
      process.stderr.write(`✓ (resume) Phase 2 · SAMPLING — skipped (hypothesis already in session)\n`)
      samplingResult = { hypothesis: session.phase2_hypothesis, sampleFiles: [], markdown: '', rawLlmText: '' }
    }

    process.stderr.write(`▶ (resume) Phase 3 · DEEP DIVE — re-running dry-run from scratch (per-file resume not yet supported)\n`)
    let dryRunResult
    try {
      dryRunResult = await runDeepDiveDryRun({
        fileList: triageResult.fileList,
        hypothesis: samplingResult.hypothesis,
        onProgress: ({ processed, total }) => {
          if (processed % 10 === 0 || processed === total) process.stderr.write(`  ${processed}/${total} files processed\n`)
        },
      })
    } catch (err) {
      await sessionLib.failSession(session, 'deep-dive', err.message)
      process.stderr.write(`✗ DEEP DIVE (resume) failed: ${err.message}\n`)
      process.exit(1)
    }
    session.phase3_progress = dryRunResult.stats
    session.phase3_skipped = dryRunResult.skipped
    const mdFile = sessionLib.sessionMarkdownFile(session.id)
    await writeDryRunMarkdown(mdFile, dryRunResult.markdown)
    session.dry_run_markdown_path = mdFile
    session.status = sessionLib.SESSION_STATUS.DRY_RUN_COMPLETED
    session.endedAt = new Date().toISOString()
    await sessionLib.writeSession(session)

    process.stdout.write(dryRunResult.markdown + '\n')
    process.stderr.write(`\n✓ resume complete. ${dryRunResult.stats.candidates} candidates surfaced.\n`)
    process.stderr.write(`  Markdown report: ${mdFile}\n`)
    process.stderr.write(`  Next: review the markdown, then run atomsyn-cli bootstrap --commit ${session.id}\n`)
    return
  }

  // ----- Dry-run / full path ----------------------------------------------
  const { path: dataDir } = resolveDataDir()
  const session = await sessionLib.createSession({
    paths: opts.paths,
    options: {
      phase: opts.phase,
      parallel: opts.parallel,
      includePattern: opts.includePattern,
      excludePattern: opts.excludePattern,
      dryRun: opts.dryRun,
      userCorrection: opts.userCorrection,
    },
    dataDir,
  })

  // B17 · usage-log: bootstrap_started
  try {
    await appendUsageLog(dataDir, {
      ts: new Date().toISOString(),
      type: 'bootstrap.started',
      action: 'bootstrap.started',
      session_id: session.id,
      paths: opts.paths,
      phase: opts.phase,
      parallel: opts.parallel,
    })
  } catch { /* growth dir may not exist on first run; ignore */ }

  process.stderr.write(`▶ bootstrap session ${session.id} created (data dir: ${dataDir})\n`)
  process.stderr.write(`▶ Phase 1 · TRIAGE — scanning ${opts.paths.length} root(s)…\n`)

  // ----- Phase 1: TRIAGE ---------------------------------------------------
  let triageResult
  try {
    triageResult = await runTriage({
      paths: opts.paths,
      includePattern: opts.includePattern,
      excludePattern: opts.excludePattern,
    })
  } catch (err) {
    await sessionLib.failSession(session, 'triage', err.message)
    try {
      await appendUsageLog(dataDir, {
        ts: new Date().toISOString(),
        type: 'bootstrap.failed',
        action: 'bootstrap.failed',
        session_id: session.id,
        phase: 'triage',
        error: err.message?.slice(0, 200),
      })
    } catch { /* ignore */ }
    process.stderr.write(`✗ TRIAGE failed: ${err.message}\n`)
    process.exit(1)
  }
  session.phase1_overview = {
    totalFiles: triageResult.fileList.length,
    totalBytes: triageResult.totalBytes,
    byExt: triageResult.byExt,
    sensitive_skipped: triageResult.sensitiveSkipped.map((s) => s.relPath),
    recencyBuckets: triageResult.recencyBuckets,
    warnings: triageResult.warnings,
  }
  session.status = sessionLib.SESSION_STATUS.TRIAGE_COMPLETED
  await sessionLib.writeSession(session)
  try {
    await appendUsageLog(dataDir, {
      ts: new Date().toISOString(),
      type: 'bootstrap.phase_completed',
      action: 'bootstrap.phase_completed',
      session_id: session.id,
      phase: 'triage',
      files_kept: triageResult.fileList.length,
      sensitive_skipped: triageResult.sensitiveSkipped.length,
    })
  } catch { /* ignore */ }

  if (triageResult.fileList.length === 0) {
    process.stderr.write(`✗ No files surfaced after privacy + ignore filters. Aborting.\n`)
    await sessionLib.failSession(session, 'triage', 'no files surfaced')
    process.exit(4)
  }

  process.stdout.write(triageResult.markdown + '\n')

  if (opts.phase === 'triage') {
    process.stderr.write(`✓ Phase 1 complete. session: ${session.id}\n`)
    return
  }
  process.stdout.write('\n---\n\n')

  // ----- Phase 2: SAMPLING --------------------------------------------------
  process.stderr.write(`▶ Phase 2 · SAMPLING — picking representatives + 1 LLM call…\n`)
  let samplingResult
  try {
    samplingResult = await runSampling({
      fileList: triageResult.fileList,
      userCorrection: opts.userCorrection,
    })
  } catch (err) {
    await sessionLib.failSession(session, 'sampling', err.message)
    process.stderr.write(`✗ SAMPLING failed: ${err.message}\n`)
    process.stderr.write(
      `  (If this is "LLM_NOT_CONFIGURED", set ATOMSYN_LLM_API_KEY in your shell.)\n`
    )
    process.exit(1)
  }
  session.phase2_hypothesis = samplingResult.hypothesis
  session.status = sessionLib.SESSION_STATUS.SAMPLING_COMPLETED
  await sessionLib.writeSession(session)
  try {
    await appendUsageLog(dataDir, {
      ts: new Date().toISOString(),
      type: 'bootstrap.phase_completed',
      action: 'bootstrap.phase_completed',
      session_id: session.id,
      phase: 'sampling',
      sample_files: samplingResult.sampleFiles?.length || 0,
    })
  } catch { /* ignore */ }

  process.stdout.write(samplingResult.markdown + '\n')

  if (opts.phase === 'sampling') {
    process.stderr.write(`✓ Phase 2 complete. session: ${session.id}\n`)
    return
  }
  process.stdout.write('\n---\n\n')

  // ----- Phase 3: DEEP DIVE (dry-run path B9) -------------------------------
  process.stderr.write(`▶ Phase 3 · DEEP DIVE — ${triageResult.fileList.length} files (dry-run: ${opts.dryRun || opts.phase === 'deep-dive'})…\n`)
  session.status = sessionLib.SESSION_STATUS.DEEP_DIVE_IN_PROGRESS
  await sessionLib.writeSession(session)

  // For now, all paths through Phase 3 use dry-run output. Commit path
  // (`--commit <id>` after a dry-run) lands in B10.
  let dryRunResult
  try {
    dryRunResult = await runDeepDiveDryRun({
      fileList: triageResult.fileList,
      hypothesis: samplingResult.hypothesis,
      onProgress: ({ processed, total }) => {
        if (processed % 10 === 0 || processed === total) {
          process.stderr.write(`  ${processed}/${total} files processed\n`)
        }
      },
    })
  } catch (err) {
    await sessionLib.failSession(session, 'deep-dive', err.message)
    process.stderr.write(`✗ DEEP DIVE failed: ${err.message}\n`)
    process.exit(1)
  }
  session.phase3_progress = { processed: dryRunResult.stats.processed, total: dryRunResult.stats.total }
  session.phase3_skipped = dryRunResult.skipped
  const mdFile = sessionLib.sessionMarkdownFile(session.id)
  await writeDryRunMarkdown(mdFile, dryRunResult.markdown)
  session.dry_run_markdown_path = mdFile
  session.status = sessionLib.SESSION_STATUS.DRY_RUN_COMPLETED
  session.endedAt = new Date().toISOString()
  await sessionLib.writeSession(session)
  try {
    await appendUsageLog(dataDir, {
      ts: new Date().toISOString(),
      type: 'bootstrap.dry_run_completed',
      action: 'bootstrap.dry_run_completed',
      session_id: session.id,
      candidates: dryRunResult.stats.candidates,
      skipped: dryRunResult.stats.skipped,
      processed: dryRunResult.stats.processed,
    })
  } catch { /* ignore */ }

  process.stdout.write(dryRunResult.markdown + '\n')
  process.stderr.write(`\n✓ dry-run complete. ${dryRunResult.stats.candidates} candidates surfaced.\n`)
  process.stderr.write(`  Markdown report: ${mdFile}\n`)
  process.stderr.write(`  Session id: ${session.id}\n`)
  process.stderr.write(`  Next: review the markdown, then run\n`)
  process.stderr.write(`    atomsyn-cli bootstrap --commit ${session.id}\n`)
}

async function cmdMentor(args) {
  const { path: dataDir } = resolveDataDir()

  // Parse --range and --format flags
  let range = 'month'
  let format = 'report'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--range' && args[i + 1]) range = args[++i]
    if (args[i] === '--format' && args[i + 1]) format = args[++i]
  }

  const months = range === 'week' ? 1 : range === 'month' ? 1 : 12
  const { analyzeDimensions, analyzeTimeline, analyzeCoverage, analyzeGaps } = await import('./lib/analysis.mjs')

  const [dimensions, timeline, coverage, gaps] = await Promise.all([
    analyzeDimensions(dataDir),
    analyzeTimeline(dataDir, months),
    analyzeCoverage(dataDir),
    analyzeGaps(dataDir),
  ])

  if (format === 'data') {
    console.log(JSON.stringify({ dimensions, timeline, coverage, gaps }, null, 2))
    return
  }

  // --- Markdown report ---
  const rangeLabel = range === 'week' ? '近一周' : range === 'month' ? '近一月' : '全部'
  const lines = []

  lines.push(`## 📊 认知复盘 · ${rangeLabel}`)
  lines.push('')

  // Overall stats
  lines.push(`### 总体画像`)
  lines.push(`- 经验碎片: **${dimensions.total}** 条`)
  lines.push(`- 近 7 天: **${timeline.velocity.last7d}** 条 · 近 30 天: **${timeline.velocity.last30d}** 条 · 趋势: ${timeline.velocity.trend === 'up' ? '📈 上升' : timeline.velocity.trend === 'down' ? '📉 下降' : '➡️ 稳定'}`)
  lines.push(`- 连续产出: **${timeline.streak.current}** 天 (最长 ${timeline.streak.longest} 天)`)
  lines.push(`- 知行比: **${gaps.theoryPracticeRatio.ratio}** (${gaps.theoryPracticeRatio.fragments} 碎片 / ${gaps.theoryPracticeRatio.methodologies} 方法论)`)
  lines.push('')

  // Top roles
  const topRoles = Object.entries(dimensions.byRole).sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (topRoles.length > 0) {
    lines.push(`### 💪 活跃角色`)
    topRoles.forEach(([role, count]) => lines.push(`- **${role}**: ${count} 条碎片`))
    lines.push('')
  }

  // Coverage
  if (coverage.frameworks.length > 0) {
    lines.push(`### 📚 框架覆盖率`)
    coverage.frameworks.forEach((fw) => {
      const bar = '█'.repeat(Math.round(fw.coveragePercent / 10)) + '░'.repeat(10 - Math.round(fw.coveragePercent / 10))
      lines.push(`- ${fw.name}: ${bar} **${fw.coveragePercent}%** (${fw.coveredNodes}/${fw.nodeCount})`)
    })
    lines.push('')
  }

  // Gaps
  const gapItems = []
  gaps.uncoveredMethodologies.slice(0, 5).forEach((u) => {
    gapItems.push(`- **${u.frameworkName}** / ${u.nodeName} — ${u.methodologyCount} 个方法论但无实践`)
  })
  gaps.staleDimensions.slice(0, 3).forEach((s) => {
    gapItems.push(`- "${s.value}" 已 ${s.daysSince} 天未新增`)
  })
  if (gaps.theoryPracticeRatio.ratio < 3) {
    gapItems.push(`- 知行比 ${gaps.theoryPracticeRatio.ratio} (建议 > 3)`)
  }
  if (gapItems.length > 0) {
    lines.push(`### ⚠️ 盲区警示`)
    gapItems.forEach((l) => lines.push(l))
    lines.push('')
  }

  lines.push('---')
  lines.push('💡 想深入讨论某个话题？直接追问我。')

  console.log(lines.join('\n'))

  // Log usage (must include ts + type for GrowthPage compatibility)
  await appendUsageLog(dataDir, { ts: new Date().toISOString(), type: 'mentor', action: 'mentor', range, format })
}

const HELP = `${color.bold}${color.cyan}atomsyn-cli${color.reset} — Atomsyn V2.0 CLI

Usage:
  atomsyn-cli write  --stdin               Create a new experience atom
  atomsyn-cli update --id <id> --stdin     Merge new fields into an existing atom.
                                         Atomic: if name changes, moves the
                                         file to the new slug folder and
                                         removes the old folder if empty.
                                         Safe for cold-start agent sessions.
  atomsyn-cli get    --id <id>             Print the full JSON of one atom
                                         (exit 2 if not found)
  atomsyn-cli find   --query "..." [--top N]
                                         Search experience atoms by keyword,
                                         returns id + name + path (stdout JSON).
                                         Use this BEFORE write/update to
                                         decide "new vs merge".
  atomsyn-cli read   --query "..." [--top N]
                                         Retrieve matching atoms as markdown
                                         (agent-friendly output for atomsyn-read)
  atomsyn-cli reindex                      Rebuild data/index/knowledge-index.json
  atomsyn-cli where                        Print resolved data directory + source
  atomsyn-cli install-skill [--target claude|cursor|all] [--dry-run] [--no-path]
                                         Install atomsyn-write / atomsyn-read skills
                                         into ~/.claude/skills and/or
                                         ~/.cursor/skills, plus a stable
                                         CLI shim at ~/.atomsyn/bin/atomsyn-cli
  atomsyn-cli mentor [--range week|month|all] [--format data|report]
                                         Cognitive review: analyze knowledge gaps
  atomsyn-cli supersede --id <old-id> --input <new-atom-file> [--no-archive-old]
                                         V2.x · 用新 atom 取代旧 atom (默认同时 archive 旧 atom)
  atomsyn-cli archive --id <id> [--reason "..."] [--restore]
                                         V2.x · 软删除 atom (read/find 默认不返); --restore 反归档
  atomsyn-cli prune [--limit N]
                                         V2.x · 扫描候选 (永远 dry-run, D-005), 输出 JSON 让用户/Agent 裁决
  atomsyn-cli bootstrap --path <dir> [--dry-run] [--commit <session-id>] [--resume <session-id>]
                                         V2.x bootstrap-skill · 引导式批量冷启动:
                                         3 阶段 funnel (TRIAGE → SAMPLING → DEEP DIVE)
                                         典型流: --dry-run 出 markdown 报告 → 用户校对
                                                 → --commit <session-id> 入库
                                         详见: atomsyn-cli bootstrap --help
  atomsyn-cli --help                       Show this help

Write input (loose — CLI owns all bookkeeping):
  Required:  name, sourceContext, insight, tags[]
  Optional:  sourceAgent, keySteps[], codeArtifacts[], relatedAtoms[],
             relatedFrameworks[], sessionId, nameEn
  Auto:      id, schemaVersion, kind, createdAt, updatedAt, stats

Data dir resolution:
  1. $ATOMSYN_DEV_DATA_DIR                   (dev override)
  2. ~/.atomsyn-config.json dataDir    (user-customized)
  3. platform default                    (macOS: ~/Library/Application Support/atomsyn)

Typical flow (from atomsyn-write SKILL.md):
  echo '{"name":"...","sourceContext":"...","insight":"...","tags":["..."]}' \\
    | atomsyn-cli write --stdin
`

async function main() {
  const argv = process.argv.slice(2)
  const [cmd, ...rest] = argv

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP)
    return
  }

  try {
    switch (cmd) {
      case 'write':
        await cmdWrite(rest)
        break
      case 'read':
        await cmdRead(rest)
        break
      case 'reindex':
        await cmdReindex()
        break
      case 'where':
        await cmdWhere()
        break
      case 'find':
        await cmdFind(rest)
        break
      case 'get':
        await cmdGet(rest)
        break
      case 'update':
        await cmdUpdate(rest)
        break
      case 'ingest':
        await cmdIngest(rest)
        break
      case 'install-skill':
        await cmdInstallSkill(rest)
        break
      case 'mentor':
        await cmdMentor(rest)
        break
      case 'supersede':
        await cmdSupersede(rest)
        break
      case 'archive':
        await cmdArchive(rest)
        break
      case 'prune':
        await cmdPrune(rest)
        break
      case 'bootstrap':
        await cmdBootstrap(rest)
        break
      default:
        die(`Unknown command: ${cmd}. Run atomsyn-cli --help for usage.`)
    }
  } catch (err) {
    die(err.stack || err.message || String(err))
  }
}

main()
