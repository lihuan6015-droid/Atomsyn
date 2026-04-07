/**
 * Provider-agnostic LLM client for the Copilot.
 *
 * - Loads non-sensitive config from llmConfigApi (config/llm.config.json)
 * - Loads API key from localStorage (key: 'ccl-llm-api-key')
 * - Loads system prompt from /skills/copilot.system.md (with inlined fallback)
 * - Returns a structured Copilot response object
 * - NEVER throws — always returns a valid response, even on failure
 */

import Anthropic from '@anthropic-ai/sdk'
import type { KnowledgeIndex, LLMConfig, Project } from '@/types'
import { llmConfigApi } from '@/lib/dataApi'

export const LLM_API_KEY_STORAGE = 'ccl-llm-api-key'

export interface CopilotRecommendation {
  atomId: string
  reason: string
  priority?: number
}

export type CopilotIntent = 'recommend' | 'clarify' | 'acknowledge'

export interface CopilotResponse {
  intent: CopilotIntent
  message: string
  recommendations: CopilotRecommendation[]
  followUp?: string
}

export interface CallCopilotArgs {
  userMessage: string
  knowledgeIndex: KnowledgeIndex | null
  currentProjectContext?: Project | null
}

// ---------------------------------------------------------------------------
// Inlined fallback system prompt (mirrors /skills/copilot.system.md)
// ---------------------------------------------------------------------------
const FALLBACK_SYSTEM_PROMPT = `你是 CCL PM Tool 的 AI 副驾驶（Copilot）——一个植入在用户的个人元能力沉淀系统内部的"场景导航员"。

## 你的唯一职责
回答用户「我现在遇到这个痛点，应该打开哪张方法论卡片」这一类问题。

## 你不做的事
- 不要回答"X 方法论是什么"——这是卡片自己的工作。让用户去打开卡片读。
- 不要凭你自己的训练知识推荐知识库没有的方法论。
- 不要伪造原子 ID。每张你推荐的卡片都必须真实存在于注入的索引里。
- 不要在 v1 阶段尝试创建/修改/删除任何卡片或 Practice。v1 是只读模式。
- 不要长篇大论。简洁、精准、可执行。

## 你的回复格式
严格输出 JSON（不要包含 markdown 代码块包裹），结构如下：

{
  "intent": "recommend | clarify | acknowledge",
  "message": "一段中文回复（不超过 3 句话）",
  "recommendations": [
    { "atomId": "atom_xxx", "reason": "为什么推荐这张（一句话）", "priority": 1 }
  ],
  "followUp": "可选：一个引导用户进一步提供信息的问题"
}

## 推荐原则
1. 优先项目内已 pin 的原子
2. 优先有父子关系的伞级原子
3. 3-5 张就够了
4. 解释要具体

## 反幻觉
宁可推荐 0 张并诚实说"知识库里暂时没有特别匹配的方法论"，也不要编造一张不存在的卡片。`

let cachedSystemPrompt: string | null = null

async function loadSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt
  try {
    const res = await fetch('/skills/copilot.system.md')
    if (res.ok) {
      const text = await res.text()
      if (text && text.length > 50) {
        cachedSystemPrompt = text
        return text
      }
    }
  } catch {
    /* fall through to fallback */
  }
  cachedSystemPrompt = FALLBACK_SYSTEM_PROMPT
  return FALLBACK_SYSTEM_PROMPT
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getStoredApiKey(): string | null {
  if (typeof localStorage === 'undefined') return null
  const v = localStorage.getItem(LLM_API_KEY_STORAGE)
  return v && v.trim() ? v.trim() : null
}

export function setStoredApiKey(key: string) {
  localStorage.setItem(LLM_API_KEY_STORAGE, key)
}

export function clearStoredApiKey() {
  localStorage.removeItem(LLM_API_KEY_STORAGE)
}

function trimIndex(idx: KnowledgeIndex | null, max: number): KnowledgeIndex | null {
  if (!idx) return null
  return {
    ...idx,
    atoms: idx.atoms.slice(0, max),
  }
}

function safeParseJson(text: string): CopilotResponse | null {
  if (!text) return null
  // strip ```json fences if present
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()
  try {
    const obj = JSON.parse(cleaned)
    if (typeof obj !== 'object' || obj === null) return null
    return {
      intent: (obj.intent ?? 'acknowledge') as CopilotIntent,
      message: typeof obj.message === 'string' ? obj.message : '',
      recommendations: Array.isArray(obj.recommendations) ? obj.recommendations : [],
      followUp: typeof obj.followUp === 'string' ? obj.followUp : undefined,
    }
  } catch {
    return null
  }
}

function errorResponse(msg: string): CopilotResponse {
  return {
    intent: 'clarify',
    message: '抱歉，AI 副驾驶暂时不可用：' + msg,
    recommendations: [],
    followUp: '请检查设置中的 API Key 与连接',
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function callCopilot(args: CallCopilotArgs): Promise<CopilotResponse> {
  try {
    const apiKey = getStoredApiKey()
    if (!apiKey) {
      return {
        intent: 'clarify',
        message: '还没有配置 API Key。请前往「设置 → AI 副驾驶」填入你的密钥。',
        recommendations: [],
        followUp: '配置完成后再来问我吧。',
      }
    }

    let config: LLMConfig
    try {
      config = await llmConfigApi.get()
    } catch (e: any) {
      return errorResponse('无法读取 LLM 配置 (' + (e?.message ?? 'unknown') + ')')
    }

    const provider = config.activeProvider
    const providerCfg = config.providers[provider]
    if (!providerCfg) {
      return errorResponse('当前 provider "' + provider + '" 配置缺失')
    }

    const systemPrompt = await loadSystemPrompt()
    const trimmedIndex = trimIndex(args.knowledgeIndex, config.copilot.maxContextAtoms ?? 30)

    const userPayload = JSON.stringify(
      {
        userMessage: args.userMessage,
        knowledgeIndex: trimmedIndex,
        currentProjectContext: args.currentProjectContext ?? null,
      },
      null,
      0
    )

    const userContent =
      '请基于以下 JSON 上下文回答用户的问题，严格输出 JSON 对象（不要 markdown）：\n\n' +
      userPayload

    const maxTokens = providerCfg.maxTokens ?? 2048
    const temperature = providerCfg.temperature ?? 0.3

    let rawText = ''

    if (provider === 'anthropic') {
      const client = new Anthropic({
        apiKey,
        baseURL: providerCfg.baseUrl || undefined,
        dangerouslyAllowBrowser: true,
      })
      const resp = await client.messages.create({
        model: providerCfg.model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      })
      rawText = resp.content
        .map((b: any) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim()
    } else {
      // openai / custom — OpenAI-compatible chat completions
      const baseUrl = (providerCfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
      const url = baseUrl + '/chat/completions'
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model: providerCfg.model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        return errorResponse('HTTP ' + res.status + ' ' + errBody.slice(0, 160))
      }
      const data: any = await res.json()
      rawText = data?.choices?.[0]?.message?.content ?? ''
    }

    const parsed = safeParseJson(rawText)
    if (!parsed) {
      return {
        intent: 'acknowledge',
        message: rawText || '（AI 没有返回内容）',
        recommendations: [],
      }
    }
    return parsed
  } catch (err: any) {
    return errorResponse(err?.message ?? String(err))
  }
}

/** Lightweight ping for the "测试连接" button in Settings. */
export async function testCopilotConnection(): Promise<{ ok: boolean; message: string }> {
  const resp = await callCopilot({
    userMessage: 'hi',
    knowledgeIndex: null,
    currentProjectContext: null,
  })
  if (resp.message.startsWith('抱歉，AI 副驾驶暂时不可用')) {
    return { ok: false, message: resp.message }
  }
  return { ok: true, message: '连接成功 ✓' }
}
