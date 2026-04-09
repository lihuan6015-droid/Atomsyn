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
 *   atomsyn-cli reindex                  Delegate to scripts/rebuild-index.mjs
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
    atom = JSON.parse(input)
  } catch (err) {
    die(`Input is not valid JSON: ${err.message}`)
  }

  normalizeExperienceAtom(atom)

  const { path: dataDir, source } = resolveDataDir()
  await ensureDataLayout(dataDir)

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
  } catch (err) {
    console.error(`${color.yellow}Warning: usage log append failed: ${err.message}${color.reset}`)
  }

  // Return success payload to the calling skill
  console.log(
    JSON.stringify(
      {
        ok: true,
        atomId: atom.id,
        name: atom.name,
        path: outFile,
        dataDir,
        dataSource: source,
        hint: `Next time you search for tags [${atom.tags.join(', ')}] or topic "${atom.name}", atomsyn-read will surface this atom.`,
      },
      null,
      2
    )
  )
}

// ---------------------------------------------------------------------------
// Subcommand: read (V1.5 stub — basic keyword search)
// ---------------------------------------------------------------------------

async function cmdRead(args) {
  const query = getFlag(args, '--query')
  const top = parseInt(getFlag(args, '--top', '5'), 10)
  if (!query) die(`read requires --query "search terms"`)

  const { path: dataDir } = resolveDataDir()
  const experienceDir = join(dataDir, 'atoms', 'experience')

  // V1.5 stub implementation: walk experience/**/*.json and do naive keyword scoring.
  // T-2.4 in Sprint 2 may upgrade this to use knowledge-index.json + Fuse.js-style search.
  const files = await walkJson(experienceDir)
  const q = query.toLowerCase()
  const qTerms = q.split(/\s+/).filter(Boolean)

  const scored = []
  for (const f of files) {
    try {
      const atom = JSON.parse(await readFile(f, 'utf8'))
      if (atom.stats?.userDemoted) continue
      const haystack = (
        (atom.name || '') +
        ' ' +
        (atom.insight || '') +
        ' ' +
        (atom.sourceContext || '') +
        ' ' +
        (atom.tags || []).join(' ')
      ).toLowerCase()
      let score = 0
      for (const term of qTerms) {
        const occurrences = haystack.split(term).length - 1
        score += occurrences
      }
      if (score > 0) scored.push({ atom, score, path: f })
    } catch {
      /* skip corrupted */
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const results = scored.slice(0, top)

  const agentName = process.env.ATOMSYN_AGENT || 'unknown'
  const now = new Date().toISOString()

  // Append read log
  try {
    await appendUsageLog(dataDir, {
      ts: now,
      action: 'read',
      query,
      returned: results.length,
      agentName,
    })
  } catch {
    /* non-fatal */
  }

  // V2.0 M2: increment aiInvokeCount on each returned atom
  for (const { atom, path: filePath } of results) {
    try {
      const raw = JSON.parse(await readFile(filePath, 'utf8'))
      raw.stats = raw.stats || {}
      raw.stats.aiInvokeCount = (raw.stats.aiInvokeCount || 0) + 1
      raw.stats.lastUsedAt = now
      raw.stats.invokedByAgent = raw.stats.invokedByAgent || {}
      raw.stats.invokedByAgent[agentName] = (raw.stats.invokedByAgent[agentName] || 0) + 1
      await writeFile(filePath, JSON.stringify(raw, null, 2) + '\n')
    } catch {
      /* non-fatal: don't fail read over a stats bump */
    }
  }

  // Render as markdown for agent consumption
  if (results.length === 0) {
    console.log(`# No matching experience atoms for: "${query}"\n\n(Data dir: ${dataDir})\n`)
    return
  }

  const lines = [`# Atlas Read · ${results.length} result(s) for "${query}"`, '']
  for (const { atom, score } of results) {
    lines.push(`## ${atom.name}`)
    lines.push(`**Score**: ${score} · **Tags**: ${(atom.tags || []).join(', ')} · **Source**: ${atom.sourceAgent}`)
    lines.push('')
    lines.push(`> ${atom.sourceContext}`)
    lines.push('')
    lines.push(atom.insight)
    lines.push('')
    if (atom.keySteps && atom.keySteps.length) {
      lines.push('**Key steps:**')
      for (const s of atom.keySteps) lines.push(`- ${s}`)
      lines.push('')
    }
    lines.push(`*Atom id*: \`${atom.id}\``)
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  console.log(lines.join('\n'))
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
  const root = join(dataDir, 'atoms', 'experience')
  const files = await walkJson(root)
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
  const { path: dataDir } = resolveDataDir()
  const hit = await findAtomFileById(dataDir, id)
  if (!hit) {
    console.log(JSON.stringify({ ok: false, found: false, id }))
    process.exit(2) // distinct exit code so scripts can branch on "not found"
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        found: true,
        id: hit.atom.id,
        name: hit.atom.name,
        path: hit.file,
        atom: hit.atom,
      },
      null,
      2,
    ),
  )
}

async function cmdFind(args) {
  const query = getFlag(args, '--query') || ''
  const top = parseInt(getFlag(args, '--top', '10'), 10)
  const withTaxonomy = args.includes('--with-taxonomy')
  const { path: dataDir } = resolveDataDir()
  const root = join(dataDir, 'atoms', 'experience')
  const files = await walkJson(root)
  const q = query.toLowerCase().trim()
  const qTerms = q ? q.split(/\s+/).filter(Boolean) : []

  // V2.0 M2: collect dimension values for taxonomy
  const dimSets = { roles: new Set(), situations: new Set(), activities: new Set(), insight_types: new Set() }

  const matches = []
  for (const f of files) {
    try {
      const atom = JSON.parse(await readFile(f, 'utf8'))
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
    incoming = JSON.parse(input)
  } catch (err) {
    die(`Input is not valid JSON: ${err.message}`)
  }

  const { path: dataDir, source } = resolveDataDir()
  const hit = await findAtomFileById(dataDir, id)
  if (!hit) die(`No atom found with id=${id}. Use \`atomsyn-cli find --query "..."\` to search.`)

  if (hit.atom?.stats?.locked === true) {
    die(
      `Atom ${id} is locked by user (stats.locked=true). Refusing to update. Unlock in Atomsyn GUI first, or create a new atom instead.`,
    )
  }

  const merged = mergeAtomFields(hit.atom, incoming)

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
  } catch (err) {
    console.error(`${color.yellow}Warning: usage log append failed: ${err.message}${color.reset}`)
  }

  console.log(
    JSON.stringify(
      {
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
      },
      null,
      2,
    ),
  )
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

    if (dryRun) {
      results.push({ step: 'skill-copy', target: t, writeDst, readDst, dryRun: true })
      continue
    }

    await mkdir(dir, { recursive: true })
    await copyDirRecursive(atomsynWriteSrc, writeDst)
    await copyDirRecursive(atomsynReadSrc, readDst)
    results.push({ step: 'skill-copy', target: t, writeDst, readDst, ok: true })
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
// Subcommand: reindex (delegate to existing script)
// ---------------------------------------------------------------------------

async function cmdReindex() {
  const script = join(PROJECT_ROOT, 'scripts', 'rebuild-index.mjs')
  if (!existsSync(script)) {
    die(`rebuild-index.mjs not found at ${script}`)
  }
  await new Promise((res, rej) => {
    const proc = spawn('node', [script], { stdio: 'inherit' })
    proc.on('exit', (code) => (code === 0 ? res() : rej(new Error(`reindex exited with code ${code}`))))
    proc.on('error', rej)
  })
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
    fragment = JSON.parse(input)
  } catch {
    die('Invalid JSON input. Agent should generate structured JSON per the classify prompt.')
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

  // Semantic alignment: find related existing atoms
  if (atom.linked_methodologies.length === 0) {
    try {
      const experienceDir = join(dataDir, 'atoms', 'experience')
      const files = await walkJson(experienceDir)
      const q = (atom.title + ' ' + atom.tags.join(' ')).toLowerCase()
      const qTerms = q.split(/\s+/).filter(Boolean)
      for (const f of files) {
        try {
          const existing = JSON.parse(await readFile(f, 'utf8'))
          if (existing.id === id) continue
          const haystack = ((existing.name || existing.title || '') + ' ' + (existing.tags || []).join(' ')).toLowerCase()
          let score = 0
          for (const t of qTerms) score += haystack.split(t).length - 1
          if (score >= 3) atom.linked_methodologies.push(existing.id)
        } catch { /* skip */ }
      }
      atom.linked_methodologies = atom.linked_methodologies.slice(0, 5)
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

  // Reindex
  try {
    const script = join(PROJECT_ROOT, 'scripts', 'rebuild-index.mjs')
    if (existsSync(script)) {
      await new Promise((res, rej) => {
        const proc = spawn('node', [script], { stdio: 'pipe' })
        proc.on('exit', (code) => (code === 0 ? res() : rej(new Error(`reindex code ${code}`))))
        proc.on('error', rej)
      })
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
      default:
        die(`Unknown command: ${cmd}. Run atomsyn-cli --help for usage.`)
    }
  } catch (err) {
    die(err.stack || err.message || String(err))
  }
}

main()
