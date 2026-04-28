/**
 * scripts/lib/bootstrap/agentic.mjs · bootstrap-tools change.
 *
 * Phase 3 DEEP DIVE in agentic mode (D-001): instead of v1's hard-coded 5-layer
 * funnel that calls the LLM once per file, we hand the LLM a small toolset
 * (`agentTools.mjs`) and let it explore the user's directory tree itself
 * via tool-use, deciding which files to `read` and which to skip.
 *
 * Output contract: the loop produces the same markdown report shape that v1
 * `deepDive.renderDryRunMarkdown` produces, so the downstream `commit.mjs`
 * runCommit() prompt stays unchanged. The "Agent 探索轨迹" section is
 * appended at the end so a human reviewer can audit which paths the LLM
 * actually opened.
 *
 * Loop budget (D-009): two hard ceilings — `maxLoops=30` rounds AND
 * `maxTokens=100_000` cumulative input+output. Either trips → terminate with
 * partial-result markdown.
 */

import { statSync } from 'node:fs'
import { createAgentTools } from './agentTools.mjs'
import { chatWithTools } from './llmClient.mjs'
import { loadPrompt } from './extract.mjs'

const DEFAULT_MAX_LOOPS = 30
const DEFAULT_MAX_TOKENS = 100_000
const TOOL_RESULT_MAX_BYTES = 8 * 1024  // cap per tool_result we feed back

/**
 * Tool descriptors handed to the LLM. Names match `agentTools.mjs` exports
 * verbatim so dispatch is a simple `tools[name](...)` call.
 */
export const AGENT_TOOL_SCHEMAS = [
  {
    name: 'ls',
    description: 'List entries (files + subdirectories) under an absolute directory path. Returns up to 200 entries.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute directory path inside the sandbox.' } },
      required: ['path'],
    },
  },
  {
    name: 'stat',
    description: 'Return size / mtime / type for a single file or directory.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'glob',
    description: 'Match files under `root` with a glob pattern (supports *, **, ?, and brace expansion {a,b}). Up to 500 matches.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.{md,docx,pdf}"' },
        root: { type: 'string', description: 'Absolute directory inside sandbox to walk' },
      },
      required: ['pattern', 'root'],
    },
  },
  {
    name: 'grep',
    description: 'Case-insensitive regex match inside a single file. Returns up to 50 hit lines from the first 16 KB.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        file: { type: 'string' },
      },
      required: ['pattern', 'file'],
    },
  },
  {
    name: 'read',
    description: 'Extract content from a file via the markdown/docx/pdf/code/text extractor chain. Returns at most 16 KB of text with weak-sensitive substrings already redacted; strong-sensitive files are skipped.',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
      },
      required: ['file'],
    },
  },
]

/**
 * Run the agentic deep-dive.
 *
 * @param {object} args
 * @param {string[]} args.paths           sandbox roots
 * @param {object}   args.hypothesis      Phase 2 hypothesis (used as system prior)
 * @param {object}   [args.session]       to receive `agent_trace[]` writes
 * @param {function} [args.onProgress]    ({ loop, tokens, lastTool }) → void
 * @param {object}   [args.llmConfig]
 * @param {function} [args.fetchImpl]
 * @param {number}   [args.maxLoops=30]
 * @param {number}   [args.maxTokens=100_000]
 *
 * @returns {Promise<{
 *   markdown: string,
 *   stats: { loops, tokens, toolCalls, finalReason },
 *   skipped: Array<{relPath, reason}>,
 *   profileAccum: object,
 *   trace: Array<object>,
 * }>}
 */
export async function runAgenticDeepDive(args) {
  const {
    paths,
    hypothesis = {},
    session,
    onProgress = () => {},
    llmConfig,
    fetchImpl,
    maxLoops = DEFAULT_MAX_LOOPS,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = args

  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('runAgenticDeepDive: paths must be a non-empty array')
  }

  const trace = []
  const tools = createAgentTools({
    sandboxRoots: paths,
    onTrace: (entry) => {
      trace.push(entry)
      if (session && Array.isArray(session.agent_trace)) {
        session.agent_trace.push(entry)
      }
    },
  })

  const system = loadPrompt('agentic-deepdive')
  const userOpening = renderUserOpening(paths, hypothesis)

  const messages = [{ role: 'user', text: userOpening }]
  let totalTokens = 0
  let loop = 0
  let lastAssistantText = ''
  let finalReason = 'completed'

  while (loop < maxLoops && totalTokens < maxTokens) {
    loop++
    let resp
    try {
      resp = await chatWithTools({
        system,
        messages,
        tools: AGENT_TOOL_SCHEMAS,
        config: llmConfig,
        fetchImpl,
        maxTokens: 4096,
        temperature: 0.2,
      })
    } catch (err) {
      finalReason = `llm_error: ${err.message?.slice(0, 200) || err}`
      break
    }
    totalTokens += resp.usage?.total_tokens || 0
    if (resp.text) lastAssistantText = resp.text
    onProgress({ loop, tokens: totalTokens, lastTool: resp.toolCalls?.[0]?.name || null })

    messages.push({ role: 'assistant', text: resp.text, toolCalls: resp.toolCalls })

    if (resp.stop_reason !== 'tool_use' || !resp.toolCalls || resp.toolCalls.length === 0) {
      finalReason = 'completed'
      break
    }

    // Run each tool serially (D-006: no concurrency, predictable trace order).
    const toolResults = []
    for (const call of resp.toolCalls) {
      const fn = tools[call.name]
      if (typeof fn !== 'function') {
        toolResults.push({
          tool_call_id: call.id,
          content: JSON.stringify({ error: `unknown_tool: ${call.name}` }),
          is_error: true,
        })
        continue
      }
      let result
      try {
        result = await invokeTool(fn, call.input || {})
      } catch (err) {
        result = { error: err.code || err.message || String(err) }
      }
      const serialized = JSON.stringify(result)
      const trimmed = serialized.length > TOOL_RESULT_MAX_BYTES
        ? serialized.slice(0, TOOL_RESULT_MAX_BYTES) + '"…tool_result truncated"}'
        : serialized
      toolResults.push({
        tool_call_id: call.id,
        content: trimmed,
        is_error: !!(result && result.error),
      })
    }
    messages.push({ role: 'tool', toolResults })

    if (totalTokens >= maxTokens) finalReason = 'token_limit'
    if (loop >= maxLoops) finalReason = 'loop_limit'
  }
  if (loop >= maxLoops && finalReason === 'completed') finalReason = 'loop_limit'
  if (totalTokens >= maxTokens && finalReason === 'completed') finalReason = 'token_limit'

  const stats = {
    loops: loop,
    tokens: totalTokens,
    toolCalls: trace.length,
    finalReason,
  }
  const profileAccum = {
    identity: hypothesis.identity || {},
    preferences: hypothesis.preferences || {},
    knowledge_domains: Array.isArray(hypothesis.knowledge_domains) ? [...hypothesis.knowledge_domains] : [],
    recurring_patterns: Array.isArray(hypothesis.recurring_patterns) ? [...hypothesis.recurring_patterns] : [],
    evidence_atom_ids: [],
  }
  const skipped = trace
    .filter((t) => t.tool === 'read' && /skipped:/.test(t.result_summary))
    .map((t) => ({ relPath: t.args?.file, reason: t.result_summary }))

  const finalMarkdown = lastAssistantText.trim() ||
    `## Phase 3 · DEEP DIVE — dry-run report (D-011)\n\nNo candidates surfaced (agent loop exited with reason: ${finalReason}).\n`

  const markdown = appendTraceSection(finalMarkdown, trace, stats)

  return { markdown, stats, skipped, profileAccum, trace }
}

function renderUserOpening(paths, hypothesis) {
  const lines = []
  lines.push(`Sandbox roots (you may explore inside these only):`)
  for (const p of paths) {
    let kind = 'unknown'
    try {
      const st = statSync(p)
      if (st.isDirectory()) kind = 'dir'
      else if (st.isFile()) kind = 'file'
    } catch { /* leave as 'unknown' */ }
    lines.push(`- [${kind}] ${p}`)
  }
  lines.push('')
  lines.push(`Tips:`)
  lines.push(`- Roots marked **[file]** are individual files the user explicitly picked. Don't \`ls\` them — call \`read\` directly.`)
  lines.push(`- Roots marked **[dir]** can be explored with \`ls\` / \`glob\` first.`)
  lines.push('')
  lines.push(`Phase 2 hypothesis (treat as a prior, not gospel):`)
  lines.push('```json')
  lines.push(JSON.stringify(hypothesis, null, 2))
  lines.push('```')
  lines.push('')
  lines.push(`Now explore. End with the final markdown candidate report. Do not output JSON.`)
  return lines.join('\n')
}

async function invokeTool(fn, input) {
  // Dispatch by tool signature. Each tool's known argument names live in
  // AGENT_TOOL_SCHEMAS; we destructure positionally.
  if (input.path !== undefined && Object.keys(input).length === 1) return fn(input.path)
  if (input.pattern !== undefined && input.root !== undefined) return fn(input.pattern, input.root)
  if (input.pattern !== undefined && input.file !== undefined) return fn(input.pattern, input.file)
  if (input.file !== undefined) return fn(input.file)
  // Last resort: spread positional values.
  return fn(...Object.values(input))
}

function appendTraceSection(markdown, trace, stats) {
  const lines = []
  lines.push(markdown.trim())
  lines.push('')
  lines.push(`---`)
  lines.push(`### Agent 探索轨迹 (${trace.length} 次工具调用)`)
  lines.push('')
  lines.push(`- loops: **${stats.loops}** · tokens: **${stats.tokens}** · final: **${stats.finalReason}**`)
  const reads = trace.filter((t) => t.tool === 'read')
  const reads_ok = reads.filter((t) => !/skipped:/.test(t.result_summary))
  const reads_skipped = reads.filter((t) => /skipped:/.test(t.result_summary))
  lines.push(`- reads: **${reads.length}** total · ${reads_ok.length} returned text · ${reads_skipped.length} skipped`)
  lines.push(`- glob: ${trace.filter((t) => t.tool === 'glob').length} · ls: ${trace.filter((t) => t.tool === 'ls').length} · stat: ${trace.filter((t) => t.tool === 'stat').length} · grep: ${trace.filter((t) => t.tool === 'grep').length}`)
  lines.push('')
  lines.push(`<details>`)
  lines.push(`<summary>Tool trace timeline (click to expand)</summary>`)
  lines.push('')
  for (const t of trace.slice(0, 200)) {
    const args = JSON.stringify(t.args || {}).slice(0, 100)
    const errMark = t.error ? ' ❌' : ''
    lines.push(`- \`${t.tool}\`(${args}) → ${t.result_summary}${errMark} · ${t.duration_ms}ms`)
  }
  if (trace.length > 200) lines.push(`- … and ${trace.length - 200} more`)
  lines.push('')
  lines.push(`</details>`)
  return lines.join('\n')
}
