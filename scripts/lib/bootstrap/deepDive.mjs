/**
 * scripts/lib/bootstrap/deepDive.mjs · bootstrap-skill change · Phase 3 DEEP DIVE.
 *
 * Default serial mode (D-004). For each candidate file:
 *   - Read + redact weak-sensitive substrings
 *   - Call LLM with the L3 + L5 prompts (per file). L1/L2 + L4 outputs are
 *     accumulated into a profile builder for the commit stage.
 *   - In dry-run mode (D-011): emit markdown candidate blocks (one per layer
 *     output). NO atom JSON, NO ingest call. Persist to session.md.
 *   - In commit mode: assemble JSON and pipe to `atomsyn-cli ingest` (B10).
 *
 * Cap (per file, per layer): 2 retries on LLM failure, then push to
 * phase3_skipped[] and continue.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { redactWeakInText, scanFile, isStrongSensitive } from './privacy.mjs'
import { loadPrompt, promptKeyForLayer } from './extract.mjs'
import { chatComplete } from './llmClient.mjs'

const PER_FILE_INPUT_BUDGET = 8 * 1024
const MAX_CANDIDATES = 200       // soft cap for dry-run markdown size
const RETRY_LIMIT = 1            // 1 retry → 2 total attempts per LLM call

/**
 * Dry-run deep dive across the triage file list.
 *
 * @param {object} opts
 * @param {Array}  opts.fileList
 * @param {object} opts.hypothesis           Phase 2 result (used as LLM prior)
 * @param {string[]} [opts.layers]           which layers to run; default ['L3', 'L5']
 *                                           (L1+L2 + L4 are accumulated separately)
 * @param {object}  [opts.llmConfig]
 * @param {function}[opts.fetchImpl]
 * @param {function}[opts.onProgress]        ({processed, total, file}) → void
 *
 * @returns {Promise<{
 *   candidates: Array<MarkdownCandidate>,
 *   profileAccum: { identity, preferences, knowledge_domains, recurring_patterns, evidence },
 *   skipped: Array<{ relPath, reason }>,
 *   markdown: string,
 *   stats: { processed, total, candidates: number, skipped: number }
 * }>}
 */
export async function runDeepDiveDryRun(opts) {
  const {
    fileList,
    hypothesis = {},
    layers = ['L3', 'L5'],
    llmConfig,
    fetchImpl,
    onProgress = () => {},
  } = opts

  const candidates = []
  const skipped = []
  const profileAccum = {
    identity: hypothesis.identity || {},
    preferences: hypothesis.preferences || {},
    knowledge_domains: Array.isArray(hypothesis.knowledge_domains) ? [...hypothesis.knowledge_domains] : [],
    recurring_patterns: Array.isArray(hypothesis.recurring_patterns) ? [...hypothesis.recurring_patterns] : [],
    evidence_atom_ids: [], // populated at commit time once atoms have ids
  }

  let processed = 0
  for (const f of fileList) {
    processed++
    onProgress({ processed, total: fileList.length, file: f.relPath })
    if (candidates.length >= MAX_CANDIDATES) {
      skipped.push({ relPath: f.relPath, reason: 'candidate cap reached' })
      continue
    }

    // Read + redact
    const scan = await scanFile(f.absPath, { maxBytes: PER_FILE_INPUT_BUDGET })
    if (!scan.text) {
      skipped.push({ relPath: f.relPath, reason: scan.binary ? 'binary' : 'unreadable' })
      continue
    }
    if (isStrongSensitive(scan)) {
      skipped.push({ relPath: f.relPath, reason: `strong-sensitive (${scan.strong.map((h) => h.name).join(', ')})` })
      continue
    }
    const { text: redacted } = redactWeakInText(scan.text)

    // Loop over the requested layers
    for (const layer of layers) {
      try {
        const block = await callLayer(layer, {
          documentText: redacted,
          documentPath: f.relPath,
          hypothesis,
          llmConfig,
          fetchImpl,
        })
        if (block && !block.skipped) {
          candidates.push({
            ...block,
            documentPath: f.relPath,
            layer,
          })
        }
      } catch (err) {
        skipped.push({ relPath: f.relPath, reason: `${layer} LLM error: ${err.message?.slice(0, 100)}` })
      }
    }
  }

  const markdown = renderDryRunMarkdown({
    candidates,
    skipped,
    profileAccum,
    processed,
    total: fileList.length,
  })

  return {
    candidates,
    profileAccum,
    skipped,
    markdown,
    stats: {
      processed,
      total: fileList.length,
      candidates: candidates.length,
      skipped: skipped.length,
    },
  }
}

/**
 * Make one LLM call for a single layer. Returns either:
 *   { skipped: true, reason } when the LLM responds with `SKIP: …`
 *   { title, layer, insight, raw_excerpt, confidence, suggested_tags, suggested_role,
 *     suggested_situation, suggested_activity, insight_type, profile_field_hints }
 */
async function callLayer(layer, { documentText, documentPath, hypothesis, llmConfig, fetchImpl }) {
  const promptKey = promptKeyForLayer(layer)
  const system = loadPrompt(promptKey)
  const user =
    `document_path: ${documentPath}\n` +
    `phase2_hypothesis: ${JSON.stringify(hypothesis, null, 2)}\n` +
    `\ndocument_text:\n\n${documentText}`

  let lastErr
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const { text } = await chatComplete({
        system, user, config: llmConfig, fetchImpl,
        maxTokens: 1500, temperature: 0.2,
      })
      return parseLayerMarkdown(text, layer)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

/**
 * Parse a single LLM markdown block (per the prompt format) into a structured
 * candidate object. Tolerates `SKIP: …` short-circuit.
 */
export function parseLayerMarkdown(text, layer) {
  const trimmed = String(text).trim()
  if (/^SKIP\s*:/i.test(trimmed)) {
    return { skipped: true, reason: trimmed.slice(5).trim() }
  }
  // Pull title from first `### …`
  const titleMatch = trimmed.match(/^###\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : `(no-title from ${layer})`

  function extract(field) {
    const re = new RegExp(`\\*\\*${field}\\*\\*\\s*:\\s*(.+?)(?=\\n-\\s*\\*\\*|$)`, 'is')
    const m = trimmed.match(re)
    return m ? m[1].trim() : null
  }

  const insight = extract('insight') || ''
  const raw_excerpt = extract('raw_excerpt') || ''
  const confidenceRaw = extract('confidence')
  const confidence = confidenceRaw ? parseFloat(confidenceRaw) : 0.5
  const tagsRaw = extract('suggested_tags')
  let suggested_tags = []
  if (tagsRaw) {
    try { suggested_tags = JSON.parse(tagsRaw.replace(/'/g, '"')) }
    catch { suggested_tags = tagsRaw.split(/[,，]/).map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean) }
  }
  const out = {
    title,
    insight,
    raw_excerpt,
    confidence: Number.isFinite(confidence) ? confidence : 0.5,
    suggested_tags,
    raw_markdown: trimmed,
  }
  // Layer-specific fields
  if (layer === 'L3' || layer === 'L5') {
    out.suggested_role = extract('suggested_role') || ''
    out.suggested_situation = extract('suggested_situation') || ''
    out.suggested_activity = extract('suggested_activity') || ''
  }
  if (layer === 'L5') {
    out.insight_type = extract('insight_type') || '原则提炼'
  }
  if (layer === 'L1' || layer === 'L2') {
    out.profile_field_hints = extract('profile_field_hints') || ''
  }
  return out
}

function renderDryRunMarkdown({ candidates, skipped, profileAccum, processed, total }) {
  const lines = []
  lines.push(`## Phase 3 · DEEP DIVE — dry-run report (D-011)`)
  lines.push('')
  lines.push(`Processed **${processed} / ${total}** files. **${candidates.length}** candidate atoms surfaced; **${skipped.length}** files skipped.`)
  lines.push('')
  lines.push(`> Below is the candidate list. Edit / delete the ones you don't want, then run \`atomsyn-cli bootstrap --commit <session-id>\` to materialize the survivors as atoms.`)
  lines.push('')
  lines.push(`### Profile snapshot (will become atom_profile_main)`)
  lines.push('')
  if (profileAccum.identity?.role) lines.push(`- **role**: ${profileAccum.identity.role}`)
  if (profileAccum.identity?.working_style) lines.push(`- **working_style**: ${profileAccum.identity.working_style}`)
  if (profileAccum.knowledge_domains?.length) lines.push(`- **knowledge_domains**: ${profileAccum.knowledge_domains.join(', ')}`)
  if (profileAccum.recurring_patterns?.length) {
    lines.push(`- **recurring_patterns**:`)
    for (const p of profileAccum.recurring_patterns) lines.push(`  - ${p}`)
  }
  lines.push('')
  lines.push(`### Candidate atoms (${candidates.length})`)
  lines.push('')
  for (const c of candidates) {
    lines.push(`#### ${c.title}`)
    lines.push('')
    lines.push(`- **layer**: ${c.layer}`)
    lines.push(`- **document**: \`${c.documentPath}\``)
    lines.push(`- **insight**: ${c.insight}`)
    lines.push(`- **raw_excerpt**: ${c.raw_excerpt}`)
    lines.push(`- **confidence**: ${c.confidence.toFixed(2)}`)
    lines.push(`- **suggested_tags**: ${JSON.stringify(c.suggested_tags || [])}`)
    if (c.suggested_role) lines.push(`- **suggested_role**: ${c.suggested_role}`)
    if (c.suggested_situation) lines.push(`- **suggested_situation**: ${c.suggested_situation}`)
    if (c.suggested_activity) lines.push(`- **suggested_activity**: ${c.suggested_activity}`)
    if (c.insight_type) lines.push(`- **insight_type**: ${c.insight_type}`)
    lines.push('')
  }
  if (skipped.length > 0) {
    lines.push(`### Skipped (${skipped.length})`)
    lines.push('')
    for (const s of skipped.slice(0, 20)) lines.push(`- \`${s.relPath}\` — ${s.reason}`)
    if (skipped.length > 20) lines.push(`- ... and ${skipped.length - 20} more`)
    lines.push('')
  }
  lines.push(`---`)
  lines.push(`Next: review the candidates above. When ready, run:`)
  lines.push('')
  lines.push('```sh')
  lines.push(`atomsyn-cli bootstrap --commit <session-id>`)
  lines.push('```')
  return lines.join('\n')
}

/** Persist the dry-run markdown to the session's .md file. */
export async function writeDryRunMarkdown(markdownPath, content) {
  await writeFile(markdownPath, content + '\n', 'utf8')
}
