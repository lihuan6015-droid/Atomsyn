/**
 * V2.0 M1 · Test connection for model providers.
 *
 * Hits each provider's real API to verify credentials.
 * - Anthropic: POST /v1/messages with minimal payload
 * - OpenAI-compatible (openai, qwen, deepseek, glm, kimi, minimax, doubao, siliconflow, custom):
 *   POST /chat/completions with a minimal "hi" prompt
 *
 * All calls use fetch directly — no SDK dependency for test pings.
 */

import type { ModelType, ProviderId } from '@/types/modelConfig'

interface TestParams {
  provider: ProviderId
  baseUrl: string
  modelId: string
  apiKey: string
  modelType: ModelType
}

interface TestResult {
  ok: boolean
  message: string
}

const TIMEOUT_MS = 15_000

export async function testModelConnection(params: TestParams): Promise<TestResult> {
  const { provider, baseUrl, modelId, apiKey, modelType } = params

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const signal = controller.signal

    if (provider === 'anthropic') {
      return await testAnthropic(baseUrl, modelId, apiKey, signal)
    }

    if (modelType === 'embedding') {
      return await testEmbedding(baseUrl, modelId, apiKey, signal)
    }

    return await testOpenAICompatible(baseUrl, modelId, apiKey, signal)
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, message: '连接超时（15s）' }
    return { ok: false, message: e?.message ?? '连接异常' }
  } finally {
    clearTimeout(timer)
  }
}

async function testAnthropic(
  baseUrl: string,
  modelId: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<TestResult> {
  const url = baseUrl.replace(/\/+$/, '') + '/v1/messages'
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  })

  if (res.ok) return { ok: true, message: '连接成功' }

  const body = await res.text().catch(() => '')
  if (res.status === 401) return { ok: false, message: 'API Key 无效 (401)' }
  if (res.status === 404) return { ok: false, message: '模型不存在 (404)' }
  return { ok: false, message: `HTTP ${res.status}: ${body.slice(0, 120)}` }
}

async function testOpenAICompatible(
  baseUrl: string,
  modelId: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<TestResult> {
  const base = baseUrl.replace(/\/+$/, '')
  const url = base + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  })

  if (res.ok) return { ok: true, message: '连接成功' }

  const body = await res.text().catch(() => '')
  if (res.status === 401) return { ok: false, message: 'API Key 无效 (401)' }
  if (res.status === 404) return { ok: false, message: '端点或模型不存在 (404)' }
  return { ok: false, message: `HTTP ${res.status}: ${body.slice(0, 120)}` }
}

async function testEmbedding(
  baseUrl: string,
  modelId: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<TestResult> {
  const base = baseUrl.replace(/\/+$/, '')
  const url = base + '/embeddings'
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      input: 'test',
    }),
  })

  if (res.ok) return { ok: true, message: '连接成功' }

  const body = await res.text().catch(() => '')
  if (res.status === 401) return { ok: false, message: 'API Key 无效 (401)' }
  return { ok: false, message: `HTTP ${res.status}: ${body.slice(0, 120)}` }
}
