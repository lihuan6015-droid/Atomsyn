/**
 * V2.x Chat Module · Streaming LLM client.
 *
 * Dual-branch: Anthropic SDK (native) vs OpenAI-compatible (fetch + SSE).
 * Used exclusively by the chat UI — the existing llmClient.ts is untouched.
 */

import Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentPart[]
}

export interface ModelConfigLike {
  provider: string
  baseUrl: string
  modelId: string
}

export interface ChatStreamOptions {
  messages: ChatMessage[]
  systemPrompt: string
  modelConfig: ModelConfigLike
  apiKey: string
  onToken: (delta: string) => void
  onComplete: (fullText: string) => void
  onError: (error: Error) => void
  signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAnthropicProvider(provider: string): boolean {
  return provider === 'anthropic'
}

/** Convert to Anthropic message format, handling multimodal content. */
function toAnthropicMessages(
  msgs: ChatMessage[],
): Array<{ role: 'user' | 'assistant'; content: string | Anthropic.MessageCreateParams['messages'][0]['content'] }> {
  return msgs
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', content: m.content }
      }
      // Convert ContentPart[] to Anthropic content blocks
      const blocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = []
      for (const part of m.content) {
        if (part.type === 'text') {
          blocks.push({ type: 'text', text: part.text })
        } else if (part.type === 'image_url') {
          // Extract base64 data from data URL: "data:image/png;base64,xxxx"
          const url = part.image_url.url
          const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/)
          if (match) {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: match[2],
              },
            })
          }
        }
      }
      return { role: m.role as 'user' | 'assistant', content: blocks.length > 0 ? blocks : '' }
    })
}

// ---------------------------------------------------------------------------
// Anthropic streaming branch
// ---------------------------------------------------------------------------

async function streamAnthropic(opts: ChatStreamOptions): Promise<void> {
  const { messages, systemPrompt, modelConfig, apiKey, onToken, onComplete, onError, signal } = opts

  const client = new Anthropic({
    apiKey,
    baseURL: modelConfig.baseUrl || undefined,
    dangerouslyAllowBrowser: true,
  })

  const stream = client.messages.stream(
    {
      model: modelConfig.modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: toAnthropicMessages(messages),
    },
    { signal: signal as AbortSignal | undefined },
  )

  let fullText = ''

  stream.on('text', (delta) => {
    fullText += delta
    onToken(delta)
  })

  try {
    await stream.finalMessage()
    onComplete(fullText)
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) return
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible streaming branch (fetch + SSE)
// ---------------------------------------------------------------------------

async function streamOpenAI(opts: ChatStreamOptions): Promise<void> {
  const { messages, systemPrompt, modelConfig, apiKey, onToken, onComplete, onError, signal } = opts

  const url = modelConfig.baseUrl.replace(/\/+$/, '') + '/chat/completions'

  const body = JSON.stringify({
    model: modelConfig.modelId,
    stream: true,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
  })

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal,
    })
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) return
    onError(err instanceof Error ? err : new Error(String(err)))
    return
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    onError(new Error(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`))
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    onError(new Error('No response body'))
    return
  }

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last incomplete line in buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            fullText += delta
            onToken(delta)
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    }

    onComplete(fullText)
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) return
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Stream a chat completion from the configured LLM.
 * Routes to Anthropic SDK or generic OpenAI-compatible endpoint.
 */
export async function streamChat(options: ChatStreamOptions): Promise<void> {
  if (isAnthropicProvider(options.modelConfig.provider)) {
    return streamAnthropic(options)
  }
  return streamOpenAI(options)
}

// ---------------------------------------------------------------------------
// Non-streaming call (used by memory extraction)
// ---------------------------------------------------------------------------

export interface ChatCallOptions {
  messages: ChatMessage[]
  systemPrompt: string
  modelConfig: ModelConfigLike
  apiKey: string
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

/**
 * Non-streaming single-shot call. Returns the full assistant reply text.
 */
export async function callChat(options: ChatCallOptions): Promise<string> {
  const { messages, systemPrompt, modelConfig, apiKey, maxTokens = 256, temperature = 0, signal } = options

  if (isAnthropicProvider(modelConfig.provider)) {
    const client = new Anthropic({
      apiKey,
      baseURL: modelConfig.baseUrl || undefined,
      dangerouslyAllowBrowser: true,
    })

    const response = await client.messages.create(
      {
        model: modelConfig.modelId,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: toAnthropicMessages(messages),
      },
      { signal: signal as AbortSignal | undefined },
    )

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
  }

  // OpenAI-compatible (non-streaming)
  const url = modelConfig.baseUrl.replace(/\/+$/, '') + '/chat/completions'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelConfig.modelId,
      max_tokens: maxTokens,
      temperature,
      stream: false,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
    }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}
