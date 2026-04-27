/**
 * scripts/lib/bootstrap/session.mjs · bootstrap-skill change · session state.
 *
 * Persists bootstrap session metadata to ~/.atomsyn/bootstrap-sessions/<id>.json
 * (D-009 of cognitive-evolution + bootstrap design §5.1 副作用 + §10).
 *
 * Sessions live OUTSIDE the data dir because they are user-level metadata,
 * not knowledge atoms. The directory is auto-created on first write.
 *
 * Status state machine (B4):
 *   triage_completed → sampling_completed → deep-dive_in_progress
 *                                              ↓
 *                                          dry_run_completed
 *                                              ↓ (commit triggered)
 *                                          commit_in_progress → commit_completed
 *
 * `failed` can be reached from any state on hard error; the session file is
 * preserved so the user can `--resume`.
 *
 * Schema (informal — ad-hoc JSON, no JSON Schema yet):
 *   {
 *     id: 'boot_<uuid>',
 *     status: 'triage_completed' | ...,
 *     paths: ['/abs/path', ...],
 *     options: { phase, parallel, includePattern, excludePattern, dryRun, ... },
 *     dataDirHash: '<sha256-prefix>',  // OQ-4: bind session to a data dir
 *     startedAt: ISO,
 *     endedAt:   ISO|null,
 *     phase1_overview: { byExt: {}, totalFiles, totalBytes, sensitive_skipped: [] },
 *     phase2_hypothesis: { identity, preferences, knowledge_domains, ... },
 *     phase3_progress: { processed, total },
 *     phase3_skipped: [{ file, reason }],
 *     dry_run_markdown_path: '/abs/path/<id>.md' | null,
 *     atoms_created: { profile, experience, fragment },
 *     errors: [{ phase, message, ts }],
 *   }
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'

export const SESSION_STATUS = {
  TRIAGE_COMPLETED: 'triage_completed',
  SAMPLING_COMPLETED: 'sampling_completed',
  DEEP_DIVE_IN_PROGRESS: 'deep-dive_in_progress',
  DRY_RUN_COMPLETED: 'dry_run_completed',
  COMMIT_IN_PROGRESS: 'commit_in_progress',
  COMMIT_COMPLETED: 'commit_completed',
  FAILED: 'failed',
}

export function sessionsDir() {
  return join(homedir(), '.atomsyn', 'bootstrap-sessions')
}

export function sessionFile(id) {
  return join(sessionsDir(), `${id}.json`)
}

export function sessionMarkdownFile(id) {
  return join(sessionsDir(), `${id}.md`)
}

/**
 * Generate a new session id. Format: boot_<14-char-base36>.
 * Cryptographically random, collision-resistant for any realistic session count.
 */
export function newSessionId() {
  return `boot_${randomBytes(8).toString('hex').slice(0, 14)}`
}

/**
 * Hash a data dir absolute path → 12-char hex prefix. Used as a guard so
 * `--resume <id>` running against a different data dir refuses the resume
 * (OQ-4 resolution: bind, don't migrate).
 */
export function hashDataDir(dataDir) {
  return createHash('sha256').update(String(dataDir)).digest('hex').slice(0, 12)
}

async function ensureDir() {
  await mkdir(sessionsDir(), { recursive: true })
}

/**
 * Create a new session and write the initial JSON.
 *
 * @param {object} init
 * @param {string[]} init.paths
 * @param {object}   init.options
 * @param {string}   init.dataDir
 * @returns {Promise<object>} the created session
 */
export async function createSession(init) {
  await ensureDir()
  const id = newSessionId()
  const session = {
    id,
    status: SESSION_STATUS.TRIAGE_COMPLETED, // initial state, refined per phase
    paths: init.paths || [],
    options: init.options || {},
    dataDirHash: init.dataDir ? hashDataDir(init.dataDir) : null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    phase1_overview: null,
    phase2_hypothesis: null,
    phase3_progress: null,
    phase3_skipped: [],
    dry_run_markdown_path: null,
    atoms_created: { profile: 0, experience: 0, fragment: 0 },
    errors: [],
  }
  // Sessions start as "in flight" — TRIAGE_COMPLETED is set after triage runs.
  // We initialize without a status so callers must set it explicitly.
  delete session.status
  await writeFile(sessionFile(id), JSON.stringify(session, null, 2) + '\n', 'utf8')
  return session
}

/** Load a session JSON. Returns null when not found. */
export async function loadSession(id) {
  const file = sessionFile(id)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Persist a session. Caller is responsible for setting status / endedAt.
 * Always replaces the entire file (sessions are small, simpler than partial patch).
 */
export async function writeSession(session) {
  await ensureDir()
  await writeFile(sessionFile(session.id), JSON.stringify(session, null, 2) + '\n', 'utf8')
}

/** List all session metadata files. Returns array of summaries (no full body). */
export async function listSessions() {
  if (!existsSync(sessionsDir())) return []
  const entries = await readdir(sessionsDir())
  const out = []
  for (const f of entries) {
    if (!f.endsWith('.json')) continue
    const id = f.slice(0, -5)
    const body = await loadSession(id)
    if (!body) continue
    out.push({
      id: body.id,
      status: body.status || 'unknown',
      paths: body.paths,
      startedAt: body.startedAt,
      endedAt: body.endedAt,
      atoms_created: body.atoms_created,
    })
  }
  // newest first
  out.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
  return out
}

/**
 * Advance a session into a terminal `failed` state. Pushes to errors[]
 * but does NOT throw — caller decides whether to surface via stderr / exit.
 */
export async function failSession(session, phase, message) {
  session.status = SESSION_STATUS.FAILED
  session.endedAt = new Date().toISOString()
  session.errors.push({ phase, message: String(message).slice(0, 1000), ts: new Date().toISOString() })
  await writeSession(session)
}

/**
 * Validate that a session belongs to the current data dir. Throws when the
 * dataDirHash mismatches (OQ-4 protection).
 */
export function assertSessionDataDir(session, dataDir) {
  if (!session.dataDirHash) return // legacy sessions w/o hash: tolerate
  const expected = hashDataDir(dataDir)
  if (session.dataDirHash !== expected) {
    const e = new Error(
      `Session ${session.id} was started against a different data dir ` +
      `(hash ${session.dataDirHash}). Current data dir hash: ${expected}. ` +
      `Re-run bootstrap from scratch or set ATOMSYN_DEV_DATA_DIR to the original.`
    )
    e.code = 'SESSION_DATA_DIR_MISMATCH'
    throw e
  }
}
