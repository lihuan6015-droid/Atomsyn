/**
 * Skill enrichment helper · V1.5 T-4.3
 *
 * Calls the configured LLM to generate a structured summary, tags,
 * typical scenarios and trigger keywords for a single SkillInventoryItem.
 *
 * Cost-controlled, on-demand (one skill per call). Does NOT persist —
 * the caller is responsible for atomsApi.update.
 *
 * Reuses the same provider/api-key surface as src/lib/llmClient.ts:
 *   - non-sensitive provider config from llmConfigApi
 *   - API key from localStorage (LLM_API_KEY_STORAGE)
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SkillInventoryItem } from '@/types'
import { useModelConfigStore, getModelApiKey } from '@/stores/useModelConfigStore'
import { getStoredApiKey } from '@/lib/llmClient'

export interface EnrichmentResult {
  aiGeneratedSummary: string
  aiGeneratedTags: string[]
  typicalScenarios: string[]
  triggerKeywords: string[]
}

export type EnrichmentStage = 'loading-config' | 'calling-llm' | 'parsing' | 'persisting'

export interface EnrichmentOptions {
  onProgress?: (stage: EnrichmentStage) => void
}

const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 800
const FRONTMATTER_BUDGET = 1500

function truncate(input: string, max: number): string {
  if (input.length <= max) return input
  return input.slice(0, max) + '…'
}

function buildPrompt(item: SkillInventoryItem): string {
  const fmJson = (() => {
    try {
      return truncate(JSON.stringify(item.frontmatter ?? {}, null, 2), FRONTMATTER_BUDGET)
    } catch {
      return '{}'
    }
  })()

  return `你是一个 AI Skill 分类助手。请阅读下面这个本地安装的 AI skill 的元数据，
为它生成一份结构化的理解。严格只输出一个 JSON 对象,不要任何 markdown 代码块、
不要解释、不要前后缀文字。

JSON 必须包含且仅包含以下 4 个字段:
{
  "aiGeneratedSummary": "用 1-2 句中文,客观说明这个 skill 是做什么的、解决什么问题",
  "aiGeneratedTags": ["最多 8 个简短的中文或英文标签,小写,无空格"],
  "typicalScenarios": ["3-5 条该 skill 的典型使用场景,每条一句中文,以动词开头"],
  "triggerKeywords": ["3-8 个用户在对话里说出后应该联想到这个 skill 的关键词或短语"]
}

== Skill 信息 ==
名称: ${item.name}
所属工具: ${item.toolName}
原始描述: ${item.rawDescription || '(无)'}

Frontmatter:
${fmJson}
`
}

function stripJsonFences(text: string): string {
  const cleaned = text.trim()
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) return fence[1].trim()
  return cleaned
}

function sanitizeStringArray(value: unknown, max = 10): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (!t) continue
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

function parseAndValidate(rawText: string): EnrichmentResult {
  const cleaned = stripJsonFences(rawText)
  let obj: any
  try {
    obj = JSON.parse(cleaned)
  } catch (e) {
    throw new Error(
      'AI 返回内容无法解析为 JSON:\n' + truncate(rawText, 500)
    )
  }
  if (!obj || typeof obj !== 'object') {
    throw new Error('AI 返回的不是 JSON 对象')
  }
  const summary =
    typeof obj.aiGeneratedSummary === 'string' ? obj.aiGeneratedSummary.trim() : ''
  if (!summary) {
    throw new Error('AI 没有返回 aiGeneratedSummary 字段')
  }
  return {
    aiGeneratedSummary: summary,
    aiGeneratedTags: sanitizeStringArray(obj.aiGeneratedTags, 10),
    typicalScenarios: sanitizeStringArray(obj.typicalScenarios, 10),
    triggerKeywords: sanitizeStringArray(obj.triggerKeywords, 10),
  }
}

/**
 * Enriches a skill-inventory item by calling the configured LLM and returning
 * structured summary/tags/scenarios/keywords. Does NOT persist — the caller
 * is responsible for calling atomsApi.update.
 */
export async function enrichSkill(
  item: SkillInventoryItem,
  opts?: EnrichmentOptions
): Promise<EnrichmentResult> {
  const onProgress = opts?.onProgress

  onProgress?.('loading-config')
  const store = useModelConfigStore.getState()
  const defaultLlm = store.getDefault('llm')
  if (!defaultLlm || !defaultLlm.enabled) {
    throw new Error('LLM 未配置,请在设置里添加并启用一个语言模型')
  }

  const apiKey = getModelApiKey(defaultLlm.id) || getStoredApiKey()
  if (!apiKey) {
    throw new Error('LLM API key 缺失,请到「设置 → AI 模型配置」填入密钥')
  }

  const prompt = buildPrompt(item)

  onProgress?.('calling-llm')

  let rawText = ''

  if (defaultLlm.provider === 'anthropic') {
    const model = defaultLlm.modelId || DEFAULT_ANTHROPIC_MODEL
    const client = new Anthropic({
      apiKey,
      baseURL: defaultLlm.baseUrl || undefined,
      dangerouslyAllowBrowser: true,
    })
    const resp = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    })
    rawText = resp.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
  } else {
    // OpenAI-compatible chat completions
    const baseUrl = (defaultLlm.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    const url = baseUrl + '/chat/completions'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: defaultLlm.modelId,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error('LLM 请求失败 HTTP ' + res.status + ' ' + errBody.slice(0, 200))
    }
    const data: any = await res.json()
    rawText = data?.choices?.[0]?.message?.content ?? ''
  }

  if (!rawText) {
    throw new Error('AI 没有返回任何内容')
  }

  onProgress?.('parsing')
  const result = parseAndValidate(rawText)

  onProgress?.('persisting')
  return result
}
