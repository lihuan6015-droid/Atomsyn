/**
 * V2.0 M6 Sprint 5 · Crystallize Service
 *
 * Extracts structured knowledge fragments from note content via LLM.
 * Reuses the LLM call pattern from QuickIngestDialog (Anthropic SDK +
 * OpenAI-compatible dual-branch, dynamic taxonomy injection).
 */

import Anthropic from '@anthropic-ai/sdk'
import { useModelConfigStore, getModelApiKey } from '@/stores/useModelConfigStore'
import { getStoredApiKey } from '@/lib/llmClient'
import { atomsApi } from '@/lib/dataApi'
import type { InsightType } from '@/types'
import type { ModelType } from '@/types/modelConfig'

// ─── Types ───────────────────────────────────────────────────────────

export interface CrystallizeFragment {
  title: string
  insight: string
  sourceContext: string
  role: string
  situation: string
  activity: string
  insight_type: InsightType
  tags: string[]
  confidence: number
}

export interface CrystallizeOptions {
  /** Model type to use. Default: 'llm'. Future: 'vlm' for multimodal. */
  modelType?: ModelType
}

// ─── Prompt loader ───────────────────────────────────────────────────

const CRYSTALLIZE_PROMPT_URL = '/scripts/ingest/prompts/crystallize.md'
let cachedPrompt: string | null = null

async function loadCrystallizePrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt
  try {
    const res = await fetch(CRYSTALLIZE_PROMPT_URL)
    if (res.ok) {
      cachedPrompt = await res.text()
      return cachedPrompt
    }
  } catch { /* fallback */ }
  return 'Extract knowledge fragments from the following note. Return a JSON array where each element has: title, insight, sourceContext, role, situation, activity, insight_type (one of: 反直觉/方法验证/方法证伪/情绪复盘/关系观察/时机判断/原则提炼/纯好奇), tags, confidence. Return [] if nothing worth extracting.'
}

// ─── Dynamic taxonomy ────────────────────────────────────────────────

async function buildDynamicTaxonomy(): Promise<string> {
  try {
    const allAtoms = await atomsApi.list() as any[]
    const roles = new Set<string>()
    const situations = new Set<string>()
    const activities = new Set<string>()
    const insightTypes = new Set<string>()

    for (const a of allAtoms) {
      if (a.role) roles.add(a.role)
      if (a.situation) situations.add(a.situation)
      if (a.activity) activities.add(a.activity)
      if (a.insight_type) insightTypes.add(a.insight_type)
    }

    return `
### User's Existing Dimension Values
The user already has these dimension values in their knowledge vault. Reuse them when semantically identical to avoid duplicates, but freely create new values when the content warrants a different classification:
- roles: ${Array.from(roles).join(', ')}
- situations: ${Array.from(situations).join(', ')}
- activities: ${Array.from(activities).join(', ')}
- insight_types: ${Array.from(insightTypes).join(', ')}
`
  } catch {
    return ''
  }
}

// ─── Content hash (djb2) ─────────────────────────────────────────────

/** Simple djb2 hash for change detection (not crypto). Returns hex string. */
export function contentHash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

// ─── Token estimation ────────────────────────────────────────────────

function estimateTokens(text: string): number {
  // Rough estimate: CJK ~1.5 tokens/char, English ~1.3 tokens/word
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
  const nonCjkText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
  const englishWords = nonCjkText.split(/\s+/).filter((w) => w.length > 0).length
  return Math.ceil(cjkChars * 1.5 + englishWords * 1.3)
}

// ─── Main service ────────────────────────────────────────────────────

export async function crystallizeNote(
  content: string,
  options?: CrystallizeOptions,
): Promise<CrystallizeFragment[]> {
  const modelType = options?.modelType ?? 'llm'

  const store = useModelConfigStore.getState()
  const model = store.getDefault(modelType)
  if (!model) throw new Error(`请先在设置中配置一个 ${modelType.toUpperCase()} 模型`)

  const apiKey = getModelApiKey(model.id) || getStoredApiKey()
  if (!apiKey) throw new Error('请先在设置中填入 API Key')

  const systemPrompt = await loadCrystallizePrompt()
  const dynamicTaxonomy = await buildDynamicTaxonomy()

  const userContent = systemPrompt + '\n' + dynamicTaxonomy + '\n\n' + content

  // Dynamic max_tokens: input estimate + 8192, clamped to [4096, 16384]
  const inputTokens = estimateTokens(userContent)
  const maxTokens = Math.min(16384, Math.max(4096, inputTokens + 8192))

  let rawJson = ''

  if (model.provider === 'anthropic') {
    const client = new Anthropic({
      apiKey,
      baseURL: model.baseUrl || undefined,
      dangerouslyAllowBrowser: true,
    })
    const resp = await client.messages.create({
      model: model.modelId,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [{ role: 'user', content: userContent }],
    })
    rawJson = resp.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
  } else {
    const baseUrl = (model.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.modelId,
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`)
    const data: any = await res.json()
    rawJson = data?.choices?.[0]?.message?.content ?? ''
  }

  // Strip markdown fences if present
  let cleaned = rawJson.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  const parsed = JSON.parse(cleaned)

  // Ensure we always return an array
  if (Array.isArray(parsed)) return parsed
  if (typeof parsed === 'object' && parsed !== null) return [parsed]
  return []
}
