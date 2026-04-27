/**
 * scripts/lib/bootstrap/sampling.mjs · bootstrap-skill change · Phase 2 SAMPLING.
 *
 * Picks 15-30 representative files from the triage list, reads each, redacts
 * weak-sensitive substrings, builds an LLM input, and parses the returned
 * JSON hypothesis. This is the cheap LLM gate (~1 call, ≤ 30k input).
 *
 * Sampling rules (design.md §3.2):
 *   1. Always include any README.md / readme.md at any root.
 *   2. Always include each project's primary doc files (root-level .md).
 *   3. Sample recent files (last 30 days) preferentially.
 *   4. Pick around the median file size (skip very tiny + very huge).
 *   5. Cap total sample at 30 files OR 60 KB content, whichever first.
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { redactWeakInText, scanFile, isStrongSensitive } from './privacy.mjs'
import { loadPrompt } from './extract.mjs'
import { chatComplete } from './llmClient.mjs'

const MAX_SAMPLE_FILES = 30
const MAX_SAMPLE_BYTES = 60 * 1024
const MAX_LLM_INPUT_BYTES = 28 * 1024  // leave room for prompt + envelope

/**
 * Pick representative files from a triage fileList.
 *
 * @param {Array<{ absPath, relPath, ext, size, mtime, root }>} fileList
 * @returns {Array<...same...>}
 */
export function pickSample(fileList) {
  if (fileList.length === 0) return []
  const picked = new Map() // key = absPath → entry

  // Rule 1+2: README.md / root-level .md
  for (const f of fileList) {
    const name = basename(f.relPath).toLowerCase()
    if (name === 'readme.md' || name === 'readme.markdown') picked.set(f.absPath, f)
  }

  // Rule 3: recent first (last 30 days), pick top 10
  const now = Date.now()
  const recent = fileList
    .filter((f) => now - f.mtime.getTime() < 30 * 86400_000)
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  for (const f of recent.slice(0, 10)) picked.set(f.absPath, f)

  // Rule 4: median size
  const sizes = fileList.map((f) => f.size).sort((a, b) => a - b)
  const median = sizes[Math.floor(sizes.length / 2)] || 0
  const tolerance = median * 0.5
  const median_band = fileList.filter((f) => Math.abs(f.size - median) < tolerance && f.size < 50_000)
  median_band.sort(() => Math.random() - 0.5)
  for (const f of median_band.slice(0, 10)) picked.set(f.absPath, f)

  return Array.from(picked.values()).slice(0, MAX_SAMPLE_FILES)
}

/**
 * Read sampled files (with weak-sensitive redaction) and concatenate into one
 * LLM-friendly bundle. Returns { bundle, fileMeta, totalBytes }.
 */
export async function buildSampleBundle(samples) {
  const blocks = []
  const fileMeta = []
  let totalBytes = 0
  for (const f of samples) {
    if (totalBytes >= MAX_SAMPLE_BYTES) break
    const scan = await scanFile(f.absPath, { maxBytes: 8 * 1024 })
    if (!scan.text) continue
    if (isStrongSensitive(scan)) continue // safety net (triage already filtered)
    const { text: redacted } = redactWeakInText(scan.text)
    const truncated = redacted.length > 4096 ? redacted.slice(0, 4096) + '\n…(truncated)' : redacted
    blocks.push(`\n---\nFILE: ${f.relPath}\nMTIME: ${f.mtime.toISOString()}\nSIZE: ${f.size} bytes\n\n${truncated}\n`)
    fileMeta.push({ relPath: f.relPath, size: f.size })
    totalBytes += truncated.length
  }
  let bundle = blocks.join('')
  if (bundle.length > MAX_LLM_INPUT_BYTES) bundle = bundle.slice(0, MAX_LLM_INPUT_BYTES) + '\n…(over LLM budget — bundle truncated)'
  return { bundle, fileMeta, totalBytes }
}

/**
 * Run the full Phase 2 flow.
 *
 * @param {object} opts
 * @param {Array}  opts.fileList   from triage
 * @param {object} [opts.llmConfig] override config
 * @param {function} [opts.fetchImpl] fetch override for testing
 * @param {string} [opts.userCorrection] free-form text from prior phase 2
 *
 * @returns {Promise<{ hypothesis: object, sampleFiles: Array, markdown: string, rawLlmText: string }>}
 */
export async function runSampling(opts) {
  const { fileList, llmConfig, fetchImpl, userCorrection } = opts
  const samples = pickSample(fileList)
  if (samples.length === 0) {
    return {
      hypothesis: { uncertainty_notes: 'No usable files found in scan; profile inference skipped.' },
      sampleFiles: [],
      markdown: '## Phase 2 · SAMPLING\n\nNo usable files found. Skipping inference.\n',
      rawLlmText: '',
    }
  }
  const { bundle, fileMeta } = await buildSampleBundle(samples)
  const systemPrompt = loadPrompt('sampling')
  const userPrompt =
    `Sampled ${fileMeta.length} files (${bundle.length} chars total after redaction).\n` +
    (userCorrection ? `\nUser correction from prior session: ${userCorrection}\n` : '') +
    `\nSample bundle follows:\n${bundle}`

  const { text } = await chatComplete({
    system: systemPrompt,
    user: userPrompt,
    config: llmConfig,
    fetchImpl,
    maxTokens: 2048,
  })

  const hypothesis = parseHypothesis(text)
  return {
    hypothesis,
    sampleFiles: fileMeta,
    markdown: renderHypothesisMarkdown(hypothesis, fileMeta),
    rawLlmText: text,
  }
}

/**
 * Robust JSON extraction. The LLM is asked for JSON only, but real models
 * sometimes wrap it in ```json … ``` or precede it with prose. We strip
 * those and parse the largest plausible JSON block.
 */
export function parseHypothesis(text) {
  const cleaned = String(text).trim()
  // Try direct parse first
  try { return JSON.parse(cleaned) } catch { /* fallthrough */ }
  // Strip code fence
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]+?)```/i)
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()) } catch { /* fallthrough */ }
  }
  // Greedy {...} extraction
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) } catch { /* fallthrough */ }
  }
  return {
    parse_failed: true,
    raw_text_excerpt: cleaned.slice(0, 500),
    uncertainty_notes: 'LLM output was not valid JSON; user must re-calibrate manually.',
  }
}

function renderHypothesisMarkdown(h, fileMeta) {
  const lines = []
  lines.push(`## Phase 2 · SAMPLING — initial hypothesis`)
  lines.push('')
  lines.push(`Sampled **${fileMeta.length}** representative files. Below is the LLM's initial inference. Confirm or correct before Phase 3.`)
  lines.push('')
  if (h.parse_failed) {
    lines.push(`> ⚠ LLM output could not be parsed as JSON. First 500 chars:`)
    lines.push('')
    lines.push('```')
    lines.push(String(h.raw_text_excerpt || '').slice(0, 500))
    lines.push('```')
    return lines.join('\n')
  }
  if (h.identity) {
    lines.push(`### Identity`)
    if (h.identity.role) lines.push(`- **role**: ${h.identity.role}`)
    if (h.identity.working_style) lines.push(`- **working_style**: ${h.identity.working_style}`)
    if (h.identity.primary_languages?.length) lines.push(`- **primary_languages**: ${h.identity.primary_languages.join(', ')}`)
    if (h.identity.primary_tools?.length) lines.push(`- **primary_tools**: ${h.identity.primary_tools.join(', ')}`)
    lines.push('')
  }
  if (h.preferences) {
    lines.push(`### Preferences (5 维)`)
    for (const k of ['scope_appetite', 'risk_tolerance', 'detail_preference', 'autonomy', 'architecture_care']) {
      if (typeof h.preferences[k] === 'number') lines.push(`- **${k}**: ${h.preferences[k].toFixed(2)}`)
    }
    lines.push('')
  }
  if (h.knowledge_domains?.length) {
    lines.push(`### Knowledge domains`)
    for (const d of h.knowledge_domains) lines.push(`- ${d}`)
    lines.push('')
  }
  if (h.recurring_patterns?.length) {
    lines.push(`### Recurring patterns`)
    for (const p of h.recurring_patterns) lines.push(`- ${p}`)
    lines.push('')
  }
  if (h.uncertainty_notes) {
    lines.push(`### Uncertainty notes`)
    lines.push(`> ${h.uncertainty_notes}`)
    lines.push('')
  }
  lines.push(`---`)
  lines.push(`Next: confirm hypothesis (or amend with --user-correction "...") → Phase 3 DEEP DIVE.`)
  return lines.join('\n')
}
