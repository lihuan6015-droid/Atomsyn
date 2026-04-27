/**
 * scripts/lib/bootstrap/commit.mjs · bootstrap-skill change · commit stage (B10-B12).
 *
 * Two-stage protocol (D-011): the user has already run `--dry-run`, edited
 * the markdown, and is now invoking `--commit <session-id>`. This module:
 *
 *   1. Loads the session + (optionally overridden) markdown report
 *   2. Re-parses the markdown into a candidates list (B12: tolerant parser)
 *   3. Calls the LLM with commit.md prompt to assemble JSON envelope
 *      (atoms[] + profile_snapshot)
 *   4. Spawns `atomsyn-cli ingest --stdin` for each fragment
 *      Spawns `atomsyn-cli write --stdin` for each experience atom
 *      Returns the profile_snapshot for B13 (caller wires applyProfileEvolution)
 *   5. Returns counts + skipped list for the session metadata
 *
 * Profile write itself happens in B13 — caller passes profile_snapshot to
 * scripts/lib/evolution.mjs::applyProfileEvolution.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPrompt } from './extract.mjs'
import { chatComplete } from './llmClient.mjs'
import { detectCollision, applyProfileEvolution } from '../evolution.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = resolve(__dirname, '..', '..', 'atomsyn-cli.mjs')
const NODE = process.execPath

/**
 * Parse a dry-run markdown report into structured candidates. Tolerant of
 * user inline edits — accepts mostly-valid blocks, drops blocks that lost
 * their `### title` line entirely.
 *
 * @param {string} md
 * @returns {{ candidates: Array<object>, profile_block: string|null, parseErrors: Array<string> }}
 */
export function parseDryRunMarkdown(md) {
  const text = String(md)
  const lines = text.split(/\r?\n/)
  const candidates = []
  const parseErrors = []
  let profile_block = null

  // Find the "Profile snapshot" section (one block, optional)
  const profileStart = lines.findIndex((l) => /^###\s+Profile snapshot/i.test(l))
  if (profileStart >= 0) {
    const blockEnd = lines.findIndex((l, i) => i > profileStart && /^###?\s+/.test(l))
    profile_block = lines.slice(profileStart, blockEnd >= 0 ? blockEnd : undefined).join('\n')
  }

  // Find candidate atoms — they live under the "### Candidate atoms" heading
  // and are themselves `#### <title>` sub-blocks.
  const candidatesStart = lines.findIndex((l) => /^###\s+Candidate atoms/i.test(l))
  if (candidatesStart < 0) {
    parseErrors.push('no "Candidate atoms" section found — assuming user kept zero candidates')
    return { candidates, profile_block, parseErrors }
  }

  // Walk forward, collect each #### block until next ### or end
  let i = candidatesStart + 1
  while (i < lines.length) {
    if (/^###\s+/.test(lines[i]) && !/^####\s+/.test(lines[i])) break
    if (/^####\s+/.test(lines[i])) {
      const title = lines[i].replace(/^####\s+/, '').trim()
      i++
      const body = []
      while (i < lines.length && !/^####\s+/.test(lines[i]) && !(/^###\s+/.test(lines[i]) && !/^####\s+/.test(lines[i]))) {
        body.push(lines[i])
        i++
      }
      const block = body.join('\n')
      const cand = parseCandidateBlock(title, block)
      if (cand.layer && cand.insight) {
        candidates.push(cand)
      } else {
        parseErrors.push(`candidate "${title}" missing layer or insight — skipped`)
      }
      continue
    }
    i++
  }

  return { candidates, profile_block, parseErrors }
}

function parseCandidateBlock(title, body) {
  function field(name) {
    const re = new RegExp(`^[-\\s*]*\\*\\*${name}\\*\\*\\s*:\\s*(.+?)$`, 'im')
    const m = body.match(re)
    return m ? m[1].trim() : ''
  }
  function fieldJsonArray(name) {
    const raw = field(name)
    if (!raw) return []
    try { return JSON.parse(raw.replace(/'/g, '"')) }
    catch { return raw.split(/[,，]/).map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean) }
  }
  return {
    title,
    layer: field('layer'),
    documentPath: field('document'),
    insight: field('insight'),
    raw_excerpt: field('raw_excerpt'),
    confidence: parseFloat(field('confidence')) || 0.5,
    suggested_tags: fieldJsonArray('suggested_tags'),
    suggested_role: field('suggested_role'),
    suggested_situation: field('suggested_situation'),
    suggested_activity: field('suggested_activity'),
    insight_type: field('insight_type'),
  }
}

/**
 * Call the commit LLM prompt with a list of (user-approved) candidates.
 * Returns { atoms, profile_snapshot } envelope.
 *
 * The prompt instructs the model to emit a single JSON object — we extract
 * it tolerantly (similar to parseHypothesis).
 */
export async function buildAtomsViaLlm({
  candidates,
  hypothesis,
  bootstrapSessionId,
  llmConfig,
  fetchImpl,
}) {
  if (candidates.length === 0) {
    return { atoms: [], profile_snapshot: hypothesis || null }
  }
  const system = loadPrompt('commit')
  const user =
    `bootstrap_session_id: ${bootstrapSessionId}\n` +
    `phase2_hypothesis: ${JSON.stringify(hypothesis || {}, null, 2)}\n` +
    `\nmarkdown_candidates: (${candidates.length} items, JSON serialized)\n` +
    JSON.stringify(candidates, null, 2)

  const { text } = await chatComplete({
    system, user, config: llmConfig, fetchImpl,
    maxTokens: 8192, temperature: 0.1,
  })
  return parseCommitEnvelope(text)
}

export function parseCommitEnvelope(text) {
  const cleaned = String(text).trim()
  // direct
  try { return normalizeEnvelope(JSON.parse(cleaned)) } catch { /* fallthrough */ }
  // fenced
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]+?)```/i)
  if (fence) {
    try { return normalizeEnvelope(JSON.parse(fence[1].trim())) } catch { /* fallthrough */ }
  }
  // greedy
  const obj = cleaned.match(/\{[\s\S]*\}/)
  if (obj) {
    try { return normalizeEnvelope(JSON.parse(obj[0])) } catch { /* fallthrough */ }
  }
  const e = new Error(`Commit LLM did not return parseable JSON. First 500 chars: ${cleaned.slice(0, 500)}`)
  e.code = 'COMMIT_LLM_BAD_OUTPUT'
  throw e
}

function normalizeEnvelope(obj) {
  return {
    atoms: Array.isArray(obj.atoms) ? obj.atoms : [],
    profile_snapshot: obj.profile_snapshot || null,
  }
}

/**
 * Spawn `atomsyn-cli ingest --stdin` (for fragments) or
 * `atomsyn-cli write --stdin` (for experience-crystallized atoms) and pipe
 * the JSON in. Returns the parsed CLI stdout (atom_id) on success.
 *
 * @param {object} atomJson
 * @param {'ingest'|'write'} subcommand
 * @param {string} [dataDir] – passed via env so the spawned CLI uses the same data dir
 * @returns {Promise<{ ok: true, output: string } | { ok: false, error: string }>}
 */
export function spawnAtomsynWrite(atomJson, subcommand, dataDir) {
  return new Promise((resolveProm) => {
    const args = [CLI_PATH, subcommand, '--stdin']
    const env = { ...process.env }
    if (dataDir) env.ATOMSYN_DEV_DATA_DIR = dataDir
    const child = spawn(NODE, args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('close', (code) => {
      if (code === 0) resolveProm({ ok: true, output: out.trim() })
      else resolveProm({ ok: false, error: err.trim() || `exit ${code}` })
    })
    child.on('error', (e) => resolveProm({ ok: false, error: e.message }))
    child.stdin.write(JSON.stringify(atomJson))
    child.stdin.end()
  })
}

/**
 * Walk the data dir's atoms/ tree and load every atom JSON. Used for B14
 * dedup: we feed the corpus into detectCollision before each ingest so we
 * can skip near-duplicates cheaply (in-memory, no per-atom subprocess spawn).
 */
async function loadAtomCorpus(dataDir) {
  const root = join(dataDir, 'atoms')
  if (!existsSync(root)) return []
  const out = []
  async function walk(dir) {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) }
    catch { return }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.isFile() && e.name.endsWith('.json')) {
        try { out.push(JSON.parse(await readFile(full, 'utf8'))) }
        catch { /* skip bad json */ }
      }
    }
  }
  await walk(root)
  return out
}

/**
 * Profile singleton I/O for applyProfileEvolution deps. The function lives at
 * <dataDir>/atoms/profile/main/atom_profile_main.json (D-010).
 */
const PROFILE_REL_PATH = ['atoms', 'profile', 'main', 'atom_profile_main.json']

async function readProfileImpl(dataDir) {
  const file = join(dataDir, ...PROFILE_REL_PATH)
  if (!existsSync(file)) return null
  try { return JSON.parse(await readFile(file, 'utf8')) }
  catch { return null }
}

async function writeProfileImpl(dataDir, profile) {
  const file = join(dataDir, ...PROFILE_REL_PATH)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(profile, null, 2) + '\n', 'utf8')
}

/**
 * Reindex via the bundled CLI (subprocess). Same dataDir env override pattern
 * as spawnAtomsynWrite. Used as the rebuildIndex dep for applyProfileEvolution.
 */
function reindexViaCli(dataDir) {
  return new Promise((resolveProm, rejectProm) => {
    const env = { ...process.env }
    if (dataDir) env.ATOMSYN_DEV_DATA_DIR = dataDir
    const child = spawn(NODE, [CLI_PATH, 'reindex'], { env, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('close', (code) => {
      if (code === 0) resolveProm()
      else rejectProm(new Error(`reindex exited with ${code}: ${err.trim()}`))
    })
    child.on('error', rejectProm)
  })
}

/**
 * Build a minimal atom-shape object suitable for detectCollision (B14). The
 * collision detector reads tags / role / situation / insight / summary —
 * the experience+fragment atom builders already populate these.
 */
function shapeForCollision(atom) {
  return {
    id: atom.id || `__pending_${Math.random().toString(36).slice(2, 8)}`,
    tags: atom.tags || [],
    role: atom.role || '',
    situation: atom.situation || '',
    insight: atom.insight || '',
    summary: atom.summary || '',
  }
}

/**
 * Run the full commit stage. Returns the counts + the profile_snapshot for
 * the caller to feed into applyProfileEvolution (B13 — also wired here).
 *
 * @param {object} opts
 * @param {object} opts.session
 * @param {string} opts.markdownText
 * @param {object} [opts.llmConfig]
 * @param {function} [opts.fetchImpl]
 * @param {string} opts.dataDir
 * @param {number} [opts.dedupThreshold=0.8]   B14 — collision score above which we skip
 *
 * @returns {Promise<{
 *   atomsCreated: { experience: number, fragment: number, profile: 0|1 },
 *   atomIds: string[],
 *   skipped: Array<{ candidate: object, error: string }>,
 *   duplicates: Array<{ candidate: object, matchedId: string, score: number, reason: string }>,
 *   profile_snapshot: object|null,
 *   profile_trigger: string|null,
 *   parseErrors: string[]
 * }>}
 */
export async function runCommit(opts) {
  const { session, markdownText, llmConfig, fetchImpl, dataDir, dedupThreshold = 0.8 } = opts

  const { candidates, profile_block, parseErrors } = parseDryRunMarkdown(markdownText)
  if (candidates.length === 0 && !profile_block) {
    const e = new Error(
      `Commit failed: no candidates found in markdown (parseErrors: ${parseErrors.join('; ')}). ` +
      `Session ${session.id} preserved — fix the markdown and re-run --commit.`
    )
    e.code = 'COMMIT_EMPTY'
    throw e
  }

  // Build atoms via LLM
  const { atoms, profile_snapshot } = await buildAtomsViaLlm({
    candidates,
    hypothesis: session.phase2_hypothesis,
    bootstrapSessionId: session.id,
    llmConfig, fetchImpl,
  })

  // B14 · load corpus once for in-memory dedup. Filter out archived /
  // superseded atoms to avoid spurious overlap with already-retired material.
  const corpus = (await loadAtomCorpus(dataDir)).filter((a) => !a.archivedAt && !a.supersededBy)

  const counts = { experience: 0, fragment: 0, profile: 0 }
  const atomIds = []
  const skipped = []
  const duplicates = []

  for (const atom of atoms) {
    // Detect kind from shape: fragment has summary + insight_type; experience has insight + sourceContext
    let subcommand
    if (atom.summary && atom.insight_type) subcommand = 'ingest'  // fragment
    else if (atom.insight && atom.sourceContext) subcommand = 'write' // experience
    else {
      skipped.push({ candidate: atom, error: 'cannot infer subcommand from atom shape (missing summary+insight_type or insight+sourceContext)' })
      continue
    }

    // B14 dedup
    const collisions = detectCollision(shapeForCollision(atom), corpus, { maxCandidates: 3 })
    const dup = collisions.find((c) => c.score >= dedupThreshold)
    if (dup) {
      duplicates.push({
        candidate: { name: atom.name || atom.title, kind: subcommand },
        matchedId: dup.id,
        score: dup.score,
        reason: dup.reason,
      })
      continue
    }

    // Ensure imported flag + session id pass through
    atom.stats = atom.stats || {}
    atom.stats.imported = true
    atom.stats.bootstrap_session_id = session.id

    const res = await spawnAtomsynWrite(atom, subcommand, dataDir)
    if (res.ok) {
      counts[subcommand === 'ingest' ? 'fragment' : 'experience']++
      try {
        const parsed = JSON.parse(res.output)
        if (parsed.id) atomIds.push(parsed.id)
        else if (parsed.atom?.id) atomIds.push(parsed.atom.id)
      } catch { /* CLI may print plaintext; skip id capture */ }
    } else {
      skipped.push({ candidate: atom, error: res.error })
    }
  }

  // B13 · profile singleton via applyProfileEvolution
  let profile_trigger = null
  if (profile_snapshot) {
    const existingProfile = await readProfileImpl(dataDir)
    profile_trigger = existingProfile ? 'bootstrap_rerun' : 'bootstrap_initial'
    try {
      // Patch evidence_atom_ids with the ids we just minted (best-effort).
      const enrichedSnapshot = {
        ...profile_snapshot,
        evidence_atom_ids: Array.from(new Set([
          ...(profile_snapshot.evidence_atom_ids || []),
          ...atomIds,
        ])),
      }
      await applyProfileEvolution(
        {
          dataDir,
          readProfile: readProfileImpl,
          writeProfile: writeProfileImpl,
          rebuildIndex: reindexViaCli,
        },
        {
          newSnapshot: enrichedSnapshot,
          trigger: profile_trigger,
          evidenceDelta: atomIds,
        },
      )
      counts.profile = 1
    } catch (err) {
      // Profile write failure should not retroactively fail the atom ingests.
      // Surface as a skipped entry so the user sees it.
      skipped.push({ candidate: { kind: 'profile' }, error: `applyProfileEvolution failed: ${err.message}` })
    }
  }

  return {
    atomsCreated: counts,
    atomIds,
    skipped,
    duplicates,
    profile_snapshot,
    profile_trigger,
    parseErrors,
  }
}
