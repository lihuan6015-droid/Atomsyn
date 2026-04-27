/**
 * scripts/lib/bootstrap/extract.mjs · bootstrap-skill change · prompt loader.
 *
 * D-012 (HARD-CODED CONTRACT, v1):
 *   - Prompt templates live ONLY in <project>/scripts/bootstrap/prompts/*.md
 *   - NO env override
 *   - NO config file override
 *   - NO user data dir override
 *
 * Why: bootstrap is the user's first impression of inference quality. If
 * users can self-tune the prompt and break it, the resulting bad atoms get
 * blamed on Atomsyn. v2 will reconsider once the templates are stable.
 *
 * Implementation note: the loader resolves prompts relative to THIS file
 * (scripts/lib/bootstrap/) so that the bundled CLI shim under
 * ~/.atomsyn/bin/ can find them via the bundled scripts/bootstrap/prompts/
 * (the Tauri install_agent_skills command copies the prompts dir alongside
 * the CLI script tree — see Rust install logic for the parallel work).
 *
 * The 5 layers of the funnel (D-002, Agent 工程派 5 层):
 *   L1 Profile      → deep-dive-l1-l2.md (shared with L2)
 *   L2 Preferences  → deep-dive-l1-l2.md
 *   L3 Episodic     → deep-dive-l3.md
 *   L4 Domain       → deep-dive-l4.md
 *   L5 Reflections  → deep-dive-l5.md
 */

import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// scripts/lib/bootstrap/extract.mjs → ../../bootstrap/prompts/
const PROMPT_DIR = resolve(__dirname, '..', '..', 'bootstrap', 'prompts')

const PROMPT_FILES = Object.freeze({
  triage: 'triage.md',
  sampling: 'sampling.md',
  'deep-dive-l1-l2': 'deep-dive-l1-l2.md',
  'deep-dive-l3': 'deep-dive-l3.md',
  'deep-dive-l4': 'deep-dive-l4.md',
  'deep-dive-l5': 'deep-dive-l5.md',
  commit: 'commit.md',
})

/** Map a 5-layer label (L1..L5) to its prompt key. L1 and L2 share. */
export function promptKeyForLayer(layer) {
  switch (String(layer).toUpperCase()) {
    case 'L1':
    case 'L2': return 'deep-dive-l1-l2'
    case 'L3': return 'deep-dive-l3'
    case 'L4': return 'deep-dive-l4'
    case 'L5': return 'deep-dive-l5'
    default: throw new Error(`Unknown deep-dive layer: ${layer}. Expected L1-L5.`)
  }
}

/**
 * Synchronous loader (preferred — avoids async ceremony at startup time and
 * matches CLI semantics of "fail fast if templates are missing").
 *
 * @param {keyof typeof PROMPT_FILES} key
 * @returns {string} prompt body
 * @throws {Error} when key unknown OR file missing OR unreadable
 */
export function loadPrompt(key) {
  const filename = PROMPT_FILES[key]
  if (!filename) throw new Error(`Unknown prompt key: ${key}. Valid keys: ${Object.keys(PROMPT_FILES).join(', ')}`)
  const path = join(PROMPT_DIR, filename)
  if (!existsSync(path)) {
    throw new Error(
      `Bootstrap prompt missing: ${path}. ` +
      `Prompts are HARD-CODED in scripts/bootstrap/prompts/ (D-012). ` +
      `If you're running from a packaged install, re-run install-skill to refresh.`
    )
  }
  return readFileSync(path, 'utf8')
}

/** Async variant for the rare path that prefers it (e.g. concurrent loads). */
export async function loadPromptAsync(key) {
  const filename = PROMPT_FILES[key]
  if (!filename) throw new Error(`Unknown prompt key: ${key}.`)
  const path = join(PROMPT_DIR, filename)
  return readFile(path, 'utf8')
}

/** Diagnostic: confirm all 7 templates are present. Used by self-test. */
export function verifyPromptsBundled() {
  const missing = []
  for (const [key, filename] of Object.entries(PROMPT_FILES)) {
    if (!existsSync(join(PROMPT_DIR, filename))) missing.push(`${key} → ${filename}`)
  }
  return { ok: missing.length === 0, missing, dir: PROMPT_DIR }
}

/**
 * **DO NOT** add ENV-var or config-file override paths here. v1 contract
 * (D-012) requires that the only way to change a prompt is to edit the
 * checked-in file. Any deviation must be a new ADR.
 */
