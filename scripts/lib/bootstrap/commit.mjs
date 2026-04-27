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

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPrompt } from './extract.mjs'
import { chatComplete } from './llmClient.mjs'

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
 * Run the full commit stage. Returns the counts + the profile_snapshot for
 * the caller to feed into applyProfileEvolution (B13).
 *
 * @param {object} opts
 * @param {object} opts.session
 * @param {string} opts.markdownText                 — the (possibly user-edited) report
 * @param {object} opts.llmConfig
 * @param {function} opts.fetchImpl
 * @param {string} opts.dataDir
 *
 * @returns {Promise<{
 *   atomsCreated: { experience: number, fragment: number },
 *   atomIds: string[],
 *   skipped: Array<{ candidate: object, error: string }>,
 *   profile_snapshot: object|null,
 *   parseErrors: string[]
 * }>}
 */
export async function runCommit(opts) {
  const { session, markdownText, llmConfig, fetchImpl, dataDir } = opts

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

  const counts = { experience: 0, fragment: 0 }
  const atomIds = []
  const skipped = []

  for (const atom of atoms) {
    // Detect kind from shape: fragment has summary + insight_type; experience has insight + sourceContext
    let subcommand
    if (atom.summary && atom.insight_type) subcommand = 'ingest'  // fragment
    else if (atom.insight && atom.sourceContext) subcommand = 'write' // experience
    else {
      skipped.push({ candidate: atom, error: 'cannot infer subcommand from atom shape (missing summary+insight_type or insight+sourceContext)' })
      continue
    }
    // Ensure imported flag + session id pass through
    atom.stats = atom.stats || {}
    atom.stats.imported = true
    atom.stats.bootstrap_session_id = session.id

    const res = await spawnAtomsynWrite(atom, subcommand, dataDir)
    if (res.ok) {
      counts[subcommand === 'ingest' ? 'fragment' : 'experience']++
      // Try to extract atom id from CLI output JSON
      try {
        const parsed = JSON.parse(res.output)
        if (parsed.id) atomIds.push(parsed.id)
        else if (parsed.atom?.id) atomIds.push(parsed.atom.id)
      } catch { /* CLI may have printed plaintext; skip id capture */ }
    } else {
      skipped.push({ candidate: atom, error: res.error })
    }
  }

  return {
    atomsCreated: counts,
    atomIds,
    skipped,
    profile_snapshot,
    parseErrors,
  }
}
