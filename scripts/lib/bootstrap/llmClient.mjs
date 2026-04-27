/**
 * scripts/lib/bootstrap/llmClient.mjs · bootstrap-skill change · minimal Node LLM client.
 *
 * Why a new client (rather than reusing src/lib/llmClient.ts):
 *   - The TS client depends on Zustand + localStorage (browser-only).
 *   - The CLI runs on Node. We need a tiny OpenAI-compatible HTTP wrapper
 *     that reads config from the platform default location.
 *
 * Config resolution (in order):
 *   1. ATOMSYN_LLM_API_KEY / ATOMSYN_LLM_BASE_URL / ATOMSYN_LLM_MODEL env vars
 *   2. <dataDir>/../config/llm.config.json (the GUI's storage location)
 *   3. fail with a friendly message
 *
 * The client supports a single primitive: `chatComplete({ system, user, opts })`.
 * No streaming, no tool calls — bootstrap doesn't need them.
 *
 * For testing, callers can pass `{ fetchImpl }` to inject a stub fetch.
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'
const DEFAULT_MODEL = 'claude-sonnet-4-6'

/**
 * Resolve LLM config from env or llm.config.json. Returns { apiKey, baseUrl,
 * model, provider }. Throws when no config is available.
 */
export async function resolveLlmConfig({ dataDir, configPath } = {}) {
  // 1. Environment variables (cleanest dev override)
  const envKey = process.env.ATOMSYN_LLM_API_KEY
  if (envKey) {
    return {
      apiKey: envKey,
      baseUrl: process.env.ATOMSYN_LLM_BASE_URL || DEFAULT_BASE_URL,
      model: process.env.ATOMSYN_LLM_MODEL || DEFAULT_MODEL,
      provider: process.env.ATOMSYN_LLM_PROVIDER || 'anthropic',
      source: 'env',
    }
  }

  // 2. config/llm.config.json next to dataDir (GUI location)
  let cfgPath = configPath
  if (!cfgPath && dataDir) {
    cfgPath = join(dirname(dataDir), 'config', 'llm.config.json')
  }
  if (cfgPath && existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(await readFile(cfgPath, 'utf8'))
      const provider = cfg.activeProvider || 'anthropic'
      const p = cfg.providers?.[provider] || {}
      // The GUI stores the API key in localStorage, not in this file (per
      // the existing CLAUDE.md iron rule). The CLI cannot read localStorage.
      // → If we got here without ATOMSYN_LLM_API_KEY, surface a clear error.
      const e = new Error(
        `LLM config found at ${cfgPath} but API key is stored in the GUI's ` +
        `localStorage, which the CLI cannot read. Set ATOMSYN_LLM_API_KEY ` +
        `in your shell environment to enable bootstrap LLM calls.`
      )
      e.code = 'LLM_KEY_UNAVAILABLE'
      e.partialConfig = {
        baseUrl: p.baseUrl || DEFAULT_BASE_URL,
        model: p.model || DEFAULT_MODEL,
        provider,
      }
      throw e
    } catch (parseErr) {
      if (parseErr.code === 'LLM_KEY_UNAVAILABLE') throw parseErr
      // Fall through to the no-config error
    }
  }

  const e = new Error(
    `No LLM credentials available. Set ATOMSYN_LLM_API_KEY (and optionally ` +
    `ATOMSYN_LLM_BASE_URL / ATOMSYN_LLM_MODEL / ATOMSYN_LLM_PROVIDER) before ` +
    `running bootstrap. See docs for the v1 D-012 contract.`
  )
  e.code = 'LLM_NOT_CONFIGURED'
  throw e
}

/**
 * Send one chat completion request and return the assistant message text.
 *
 * @param {object} args
 * @param {string} args.system          - System prompt
 * @param {string} args.user            - User message body
 * @param {object} [args.config]        - { apiKey, baseUrl, model, provider }; if absent, resolveLlmConfig({}) is called
 * @param {number} [args.maxTokens]     - default 4096
 * @param {number} [args.temperature]   - default 0.2 (bootstrap wants stable output)
 * @param {(req: Request|string, init?: RequestInit) => Promise<Response>} [args.fetchImpl]
 * @returns {Promise<{ text: string, usage: object|null, raw: object }>}
 */
export async function chatComplete({
  system,
  user,
  config,
  maxTokens = 4096,
  temperature = 0.2,
  fetchImpl,
}) {
  const cfg = config || (await resolveLlmConfig({}))
  const fetchFn = fetchImpl || globalThis.fetch
  if (!fetchFn) throw new Error('No fetch implementation available (Node 18+ required, or pass fetchImpl).')

  const provider = cfg.provider || 'anthropic'

  if (provider === 'anthropic') {
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/messages'
    const body = {
      model: cfg.model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '<no body>')
      const e = new Error(`LLM request failed: ${res.status} ${res.statusText} — ${txt.slice(0, 400)}`)
      e.code = 'LLM_HTTP_ERROR'
      e.status = res.status
      throw e
    }
    const json = await res.json()
    const text = (json.content || []).map((c) => c.text || '').join('')
    return { text, usage: json.usage || null, raw: json }
  }

  // OpenAI-compatible (OpenAI / DeepSeek / Together / etc.)
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const body = {
    model: cfg.model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>')
    const e = new Error(`LLM request failed: ${res.status} ${res.statusText} — ${txt.slice(0, 400)}`)
    e.code = 'LLM_HTTP_ERROR'
    e.status = res.status
    throw e
  }
  const json = await res.json()
  const text = json?.choices?.[0]?.message?.content || ''
  return { text, usage: json.usage || null, raw: json }
}

/**
 * Send a chat completion that supports tool-use (D-005). Both Anthropic and
 * OpenAI-compatible providers are supported behind a single normalized return
 * shape so `agentic.mjs` doesn't have to special-case providers.
 *
 * Normalized message shape (input):
 *   [{role: 'user', text: '...'},
 *    {role: 'assistant', text?: '...', toolCalls?: [{id, name, input}]},
 *    {role: 'tool', toolResults: [{tool_call_id, content}]}]
 *
 * Tool descriptors (input):
 *   [{name, description, input_schema: <JSON Schema object>}]
 *
 * Normalized response (output):
 *   {
 *     stop_reason: 'tool_use' | 'end',
 *     text: '<concatenated assistant text>',
 *     toolCalls: [{id, name, input}],
 *     usage: { input_tokens, output_tokens, total_tokens },
 *     raw: <provider-native response>,
 *   }
 *
 * @param {object} args
 * @param {string} args.system
 * @param {Array}  args.messages
 * @param {Array}  args.tools
 * @param {object} [args.config]
 * @param {function} [args.fetchImpl]
 * @param {number} [args.maxTokens=4096]
 * @param {number} [args.temperature=0.2]
 */
export async function chatWithTools({
  system,
  messages,
  tools,
  config,
  fetchImpl,
  maxTokens = 4096,
  temperature = 0.2,
}) {
  const cfg = config || (await resolveLlmConfig({}))
  const fetchFn = fetchImpl || globalThis.fetch
  if (!fetchFn) throw new Error('No fetch implementation available (Node 18+ required, or pass fetchImpl).')

  const provider = cfg.provider || 'anthropic'

  if (provider === 'anthropic') {
    return chatWithToolsAnthropic({ system, messages, tools, cfg, fetchFn, maxTokens, temperature })
  }
  return chatWithToolsOpenAI({ system, messages, tools, cfg, fetchFn, maxTokens, temperature })
}

async function chatWithToolsAnthropic({ system, messages, tools, cfg, fetchFn, maxTokens, temperature }) {
  // Convert normalized messages → Anthropic content blocks.
  const anthropicMessages = []
  for (const m of messages) {
    if (m.role === 'user') {
      anthropicMessages.push({ role: 'user', content: m.text != null ? m.text : (m.content || '') })
    } else if (m.role === 'assistant') {
      const blocks = []
      if (m.text) blocks.push({ type: 'text', text: m.text })
      if (Array.isArray(m.toolCalls)) {
        for (const tc of m.toolCalls) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input || {} })
        }
      }
      anthropicMessages.push({ role: 'assistant', content: blocks.length > 0 ? blocks : [{ type: 'text', text: '' }] })
    } else if (m.role === 'tool') {
      // Anthropic models tool_results inside a user message.
      const blocks = (m.toolResults || []).map((r) => ({
        type: 'tool_result',
        tool_use_id: r.tool_call_id,
        content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
        is_error: !!r.is_error,
      }))
      anthropicMessages.push({ role: 'user', content: blocks })
    }
  }

  const body = {
    model: cfg.model,
    max_tokens: maxTokens,
    temperature,
    system,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })),
    messages: anthropicMessages,
  }
  const res = await fetchFn(cfg.baseUrl.replace(/\/+$/, '') + '/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>')
    const e = new Error(`LLM tools request failed: ${res.status} ${res.statusText} — ${txt.slice(0, 400)}`)
    e.code = 'LLM_HTTP_ERROR'
    e.status = res.status
    throw e
  }
  const json = await res.json()
  const blocks = Array.isArray(json.content) ? json.content : []
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('')
  const toolCalls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({
    id: b.id, name: b.name, input: b.input || {},
  }))
  const stop_reason = json.stop_reason === 'tool_use' ? 'tool_use' : 'end'
  const usage = json.usage || {}
  return {
    stop_reason,
    text,
    toolCalls,
    usage: {
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    },
    raw: json,
  }
}

async function chatWithToolsOpenAI({ system, messages, tools, cfg, fetchFn, maxTokens, temperature }) {
  const openaiMessages = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') {
      openaiMessages.push({ role: 'user', content: m.text != null ? m.text : (m.content || '') })
    } else if (m.role === 'assistant') {
      const out = { role: 'assistant', content: m.text || null }
      if (Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
        out.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input || {}) },
        }))
      }
      openaiMessages.push(out)
    } else if (m.role === 'tool') {
      for (const r of m.toolResults || []) {
        openaiMessages.push({
          role: 'tool',
          tool_call_id: r.tool_call_id,
          content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
        })
      }
    }
  }

  const body = {
    model: cfg.model,
    max_tokens: maxTokens,
    temperature,
    messages: openaiMessages,
    tools: tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    })),
    tool_choice: 'auto',
  }
  const res = await fetchFn(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>')
    const e = new Error(`LLM tools request failed: ${res.status} ${res.statusText} — ${txt.slice(0, 400)}`)
    e.code = 'LLM_HTTP_ERROR'
    e.status = res.status
    throw e
  }
  const json = await res.json()
  const choice = json?.choices?.[0]
  const msg = choice?.message || {}
  const text = msg.content || ''
  const tc = Array.isArray(msg.tool_calls) ? msg.tool_calls : []
  const toolCalls = tc.map((c) => {
    let input = {}
    try { input = JSON.parse(c.function?.arguments || '{}') } catch { /* leave empty */ }
    return { id: c.id, name: c.function?.name, input }
  })
  const stop_reason = (choice?.finish_reason === 'tool_calls' || toolCalls.length > 0) ? 'tool_use' : 'end'
  const usage = json.usage || {}
  return {
    stop_reason,
    text,
    toolCalls,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    },
    raw: json,
  }
}
