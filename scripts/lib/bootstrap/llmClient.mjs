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
