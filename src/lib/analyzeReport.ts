/**
 * P1 · AI Analysis Report Service
 *
 * Generates structured analysis reports from a data snapshot via LLM.
 * Follows the same dual-branch pattern as crystallize.ts:
 *   - Anthropic SDK native mode
 *   - OpenAI-compatible fetch fallback
 */

import Anthropic from '@anthropic-ai/sdk'
import { useModelConfigStore, getModelApiKey } from '@/stores/useModelConfigStore'
import { getStoredApiKey } from '@/lib/llmClient'
import type { AnalysisReportResult, AnalysisSnapshot } from '@/types'
import type { ModelType } from '@/types/modelConfig'

// ─── Prompt ─────────────────────────────────────────────────────────

const ANALYSIS_PROMPT_URL = '/scripts/ingest/prompts/analysis-report.md'
// Note: cache is per page load — browser refresh clears it
let cachedPrompt: string | null = null

async function loadAnalysisPrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt
  try {
    const res = await fetch(ANALYSIS_PROMPT_URL)
    if (res.ok) {
      cachedPrompt = await res.text()
      return cachedPrompt
    }
  } catch { /* fallback */ }
  return FALLBACK_PROMPT
}

const FALLBACK_PROMPT = `你是一个认知教练，基于用户的知识库数据给出诚实、有洞察的分析。

请基于以下用户数据快照生成分析报告。直接输出 JSON（不要包裹在 markdown 代码块中）：

{
  "summary": "总体评估（80-150字）",
  "strengths": ["优势1（30-60字）", "优势2"],
  "blindSpots": ["盲区1（30-60字）", "盲区2"],
  "suggestions": ["具体可执行建议1（40-80字）", "建议2"],
  "narrative": "完整分析叙述（400-800字，Markdown）",
  "radar": [
    {"axis": "认知深度", "score": 0, "description": "一句话"},
    {"axis": "认知广度", "score": 0, "description": "一句话"},
    {"axis": "实践转化", "score": 0, "description": "一句话"},
    {"axis": "反思频率", "score": 0, "description": "一句话"},
    {"axis": "学习活跃", "score": 0, "description": "一句话"},
    {"axis": "理论储备", "score": 0, "description": "一句话"}
  ]
}

radar 固定 6 维度，score 0-100。语言：中文`

// ─── Main service ────────────────────────────────────────────────────

export async function generateAnalysisReport(
  snapshot: AnalysisSnapshot,
  modelType: ModelType = 'llm',
): Promise<AnalysisReportResult> {
  const store = useModelConfigStore.getState()
  const model = store.getDefault(modelType)
  if (!model) throw new Error('请先在设置中配置一个 LLM 模型')

  const apiKey = getModelApiKey(model.id) || getStoredApiKey()
  if (!apiKey) throw new Error('请先在设置中填入 API Key')

  const prompt = await loadAnalysisPrompt()

  // Compact snapshot to reduce token usage — trim verbose arrays
  const compactSnapshot = {
    dimensions: {
      total: snapshot.dimensions.total,
      byRole: snapshot.dimensions.byRole,
      bySituation: snapshot.dimensions.bySituation,
      byActivity: snapshot.dimensions.byActivity,
      byInsightType: snapshot.dimensions.byInsightType,
      recency: snapshot.dimensions.recency,
      // omit crossMatrix (large, LLM can infer from byRole+bySituation)
    },
    timeline: {
      velocity: snapshot.timeline.velocity,
      streak: snapshot.timeline.streak,
      // include only non-zero months
      months: snapshot.timeline.months.filter((m) => m.fragmentCount > 0 || m.methodologyCount > 0),
    },
    coverage: snapshot.coverage,
    gaps: {
      // limit to top 8 uncovered methodologies
      uncoveredMethodologies: snapshot.gaps.uncoveredMethodologies.slice(0, 8),
      staleDimensions: snapshot.gaps.staleDimensions.slice(0, 5),
      theoryPracticeRatio: snapshot.gaps.theoryPracticeRatio,
    },
  }

  const dataContent = JSON.stringify(compactSnapshot, null, 2)
  const userContent = prompt + '\n\n--- 用户数据快照 ---\n\n' + dataContent

  let rawJson = ''

  // eslint-disable-next-line no-console
  console.log('[analyzeReport] Using model:', model.name, '(', model.provider, '/', model.modelId, ')')

  // Timeout wrapper — abort after 120s to prevent infinite hang
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  try {
    if (model.provider === 'anthropic') {
      const client = new Anthropic({
        apiKey,
        baseURL: model.baseUrl || undefined,
        dangerouslyAllowBrowser: true,
      })
      // eslint-disable-next-line no-console
      console.log('[analyzeReport] Calling Anthropic API...')
      const resp = await client.messages.create({
        model: model.modelId,
        max_tokens: 16384,
        temperature: 0.3,
        messages: [{ role: 'user', content: userContent }],
      })
      rawJson = resp.content
        .map((b: any) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim()
    } else {
      const baseUrl = (model.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
      // eslint-disable-next-line no-console
      console.log('[analyzeReport] Calling OpenAI-compatible API:', baseUrl, 'model:', model.modelId, 'input ~', userContent.length, 'chars')
      const requestBody: Record<string, any> = {
        model: model.modelId,
        temperature: 0.3,
        messages: [{ role: 'user', content: userContent }],
      }
      // Don't set max_tokens — let the model control output length via prompt guidance
      let res: Response
      try {
        res = await fetch(baseUrl + '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })
      } catch (fetchErr: any) {
        // Network error, CORS block, or timeout abort
        // eslint-disable-next-line no-console
        console.error('[analyzeReport] Fetch failed:', fetchErr.name, fetchErr.message)
        if (fetchErr.name === 'AbortError') {
          throw new Error('LLM 调用超时 (120秒)。请检查网络连接或模型配置。')
        }
        throw new Error(`LLM 网络请求失败: ${fetchErr.message}。可能是 CORS 限制（web模式）或网络问题。`)
      }
      // eslint-disable-next-line no-console
      console.log('[analyzeReport] LLM response status:', res.status)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 500)}`)
      }
      const data: any = await res.json()
      rawJson = data?.choices?.[0]?.message?.content ?? ''
      const finishReason = data?.choices?.[0]?.finish_reason ?? 'unknown'
      // eslint-disable-next-line no-console
      console.log('[analyzeReport] LLM response length:', rawJson.length, 'chars, finish_reason:', finishReason)
      if (finishReason === 'length') {
        // eslint-disable-next-line no-console
        console.warn('[analyzeReport] Response truncated by max_tokens! Will attempt repair.')
      }
    }
  } finally {
    clearTimeout(timeoutId)
  }

  if (!rawJson) {
    throw new Error('LLM 返回了空内容')
  }

  // eslint-disable-next-line no-console
  console.log('[analyzeReport] Raw response (first 200 chars):', rawJson.slice(0, 200))

  // Strip markdown fences
  let cleaned = rawJson.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  let parsed: AnalysisReportResult = undefined as any
  try {
    parsed = JSON.parse(cleaned) as AnalysisReportResult
  } catch (parseErr) {
    // eslint-disable-next-line no-console
    console.error('[analyzeReport] JSON parse failed. Attempting repair. Raw tail:', cleaned.slice(-200))

    // Strategy: truncated JSON from LLM hitting max_tokens.
    // Find the last successfully parseable prefix by progressively
    // trimming from the end and closing open structures.
    let repaired = ''
    const strategies = [
      // 1. Try closing from current position
      () => {
        let s = cleaned
        // If we're mid-string (odd number of unescaped quotes), close it
        let inStr = false
        let esc = false
        for (const ch of s) {
          if (esc) { esc = false; continue }
          if (ch === '\\') { esc = true; continue }
          if (ch === '"') inStr = !inStr
        }
        if (inStr) s += '"'
        // Count and close open brackets/braces
        let br = 0
        let bk = 0
        inStr = false
        esc = false
        for (const ch of s) {
          if (esc) { esc = false; continue }
          if (ch === '\\') { esc = true; continue }
          if (ch === '"') { inStr = !inStr; continue }
          if (inStr) continue
          if (ch === '{') br++
          if (ch === '}') br--
          if (ch === '[') bk++
          if (ch === ']') bk--
        }
        while (bk > 0) { s += ']'; bk-- }
        while (br > 0) { s += '}'; br-- }
        return s
      },
      // 2. Cut at last complete "key": value before the break
      () => {
        // Find the last `"narrative"` or `"radar"` key start and truncate
        // the value, providing a minimal valid closure
        const narrativeIdx = cleaned.lastIndexOf('"narrative"')
        if (narrativeIdx > 0) {
          // Truncate narrative value and close JSON
          const before = cleaned.slice(0, narrativeIdx)
          return before + '"narrative": "(内容因长度截断)" }'
        }
        return null
      },
      // 3. Nuclear: extract fields individually via regex
      () => {
        const extract = (key: string) => {
          const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`)
          const m = cleaned.match(re)
          return m ? m[1] : null
        }
        const extractArr = (key: string) => {
          const re = new RegExp(`"${key}"\\s*:\\s*\\[((?:[^\\]]|\\n)*)\\]`)
          const m = cleaned.match(re)
          if (!m) return null
          try { return JSON.parse('[' + m[1] + ']') } catch { return null }
        }
        const summary = extract('summary')
        if (!summary) return null
        return JSON.stringify({
          summary,
          strengths: extractArr('strengths') || [],
          blindSpots: extractArr('blindSpots') || [],
          suggestions: extractArr('suggestions') || [],
          narrative: extract('narrative') || '(内容因长度截断)',
          radar: extractArr('radar'),
        })
      },
    ]

    for (const strategy of strategies) {
      const attempt = strategy()
      if (!attempt) continue
      try {
        parsed = JSON.parse(attempt) as AnalysisReportResult
        // eslint-disable-next-line no-console
        console.log('[analyzeReport] JSON repair successful (strategy used)')
        repaired = attempt
        break
      } catch { /* try next strategy */ }
    }

    if (!repaired) {
      throw new Error(`LLM 返回的内容无法解析为 JSON: ${(parseErr as Error).message}`)
    }
  }

  // Validate required fields
  if (!parsed.summary || !Array.isArray(parsed.strengths) || !Array.isArray(parsed.blindSpots)) {
    // eslint-disable-next-line no-console
    console.error('[analyzeReport] Invalid structure:', JSON.stringify(parsed).slice(0, 300))
    throw new Error('LLM 返回的数据格式不正确: 缺少 summary/strengths/blindSpots 字段')
  }

  // eslint-disable-next-line no-console
  console.log('[analyzeReport] Success! Summary:', parsed.summary.slice(0, 80))

  return {
    summary: parsed.summary,
    strengths: parsed.strengths || [],
    blindSpots: parsed.blindSpots || [],
    suggestions: parsed.suggestions || [],
    narrative: parsed.narrative || '',
    radar: Array.isArray(parsed.radar) ? parsed.radar : undefined,
  }
}
