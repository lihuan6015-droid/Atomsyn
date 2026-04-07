/**
 * Provider-agnostic LLM client for the Copilot.
 *
 * V2.0 M1: reads model config from useModelConfigStore (Zustand)
 * instead of the old llm.config.json.
 *
 * - Loads default LLM model from the store
 * - Loads API key from localStorage per-model key
 * - Loads system prompt from /skills/copilot.system.md (with inlined fallback)
 * - Returns a structured Copilot response object
 * - NEVER throws — always returns a valid response, even on failure
 */

import Anthropic from '@anthropic-ai/sdk'
import type { KnowledgeIndex, Project } from '@/types'
import { useModelConfigStore, getModelApiKey, setModelApiKey } from '@/stores/useModelConfigStore'

// V2.0 M1: legacy key constant kept for backward compat migration
export const LLM_API_KEY_STORAGE = 'atomsyn-llm-api-key'
const LEGACY_KEY = 'ccl-llm-api-key'

export function getStoredApiKey(): string | null {
  // V2.0: try new per-model key first, fall back to legacy global key
  const store = useModelConfigStore.getState()
  const defaultLlm = store.getDefault('llm')
  if (defaultLlm) {
    const key = getModelApiKey(defaultLlm.id)
    if (key) return key
  }
  // Legacy fallback (try new key name first, then old ccl- prefix)
  const v = localStorage.getItem(LLM_API_KEY_STORAGE) ?? localStorage.getItem(LEGACY_KEY)
  return v && v.trim() ? v.trim() : null
}

export function setStoredApiKey(key: string) {
  const store = useModelConfigStore.getState()
  const defaultLlm = store.getDefault('llm')
  if (defaultLlm) {
    setModelApiKey(defaultLlm.id, key)
  }
  localStorage.setItem(LLM_API_KEY_STORAGE, key)
  // Clean up legacy key if it exists
  localStorage.removeItem(LEGACY_KEY)
}

export function clearStoredApiKey() {
  localStorage.removeItem(LLM_API_KEY_STORAGE)
  localStorage.removeItem(LEGACY_KEY)
}

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
const FALLBACK_SYSTEM_PROMPT = `你是 Atomsyn 的 AI 副驾驶（Copilot）——一个植入在用户的个人元能力沉淀系统内部的"场景导航员"。

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

function trimIndex(idx: KnowledgeIndex | null, max: number): KnowledgeIndex | null {
  if (!idx) return null
  return {
    ...idx,
    atoms: idx.atoms.slice(0, max),
  }
}

function safeParseJson(text: string): CopilotResponse | null {
  if (!text) return null
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
    const store = useModelConfigStore.getState()
    const defaultLlm = store.getDefault('llm')

    if (!defaultLlm) {
      return {
        intent: 'clarify',
        message: '还没有配置默认 LLM 模型。请前往「设置 → AI 模型配置」添加一个语言模型。',
        recommendations: [],
        followUp: '配置完成后再来问我吧。',
      }
    }

    const apiKey = getModelApiKey(defaultLlm.id) || getStoredApiKey()
    if (!apiKey) {
      return {
        intent: 'clarify',
        message: '还没有配置 API Key。请前往「设置 → AI 模型配置」填入你的密钥。',
        recommendations: [],
        followUp: '配置完成后再来问我吧。',
      }
    }

    const copilotSettings = store.copilot
    const systemPrompt = await loadSystemPrompt()
    const trimmedIndex = trimIndex(args.knowledgeIndex, copilotSettings.maxContextAtoms ?? 30)

    const exps = args.knowledgeIndex?.experiences ?? []
    const skills = args.knowledgeIndex?.skillInventory ?? []
    const progressiveDisclosure = {
      experienceCount: exps.length,
      skillCount: skills.length,
      experiences: exps.slice(0, 20).map((e) => ({
        id: e.id,
        name: e.name,
        tags: e.tags,
        sourceAgent: e.sourceAgent,
        excerpt: e.insightExcerpt,
      })),
      skills: skills.slice(0, 20).map((s) => ({
        id: s.id,
        name: s.name,
        toolName: s.toolName,
        tags: s.tags,
      })),
    }

    const userPayload = JSON.stringify(
      {
        userMessage: args.userMessage,
        knowledgeIndex: trimmedIndex,
        currentProjectContext: args.currentProjectContext ?? null,
        progressiveDisclosure,
      },
      null,
      0
    )

    const userContent =
      '请基于以下 JSON 上下文回答用户的问题，严格输出 JSON 对象（不要 markdown）。' +
      `注意: 用户还沉淀了 ${progressiveDisclosure.experienceCount} 条 agent 经验 + ` +
      `${progressiveDisclosure.skillCount} 个本地 skill (见 progressiveDisclosure 字段), ` +
      '若用户问题与这些相关, 可以在回复中按 id 引用它们。\n\n' +
      userPayload

    const maxTokens = 2048
    const temperature = 0.3

    let rawText = ''

    if (defaultLlm.provider === 'anthropic') {
      const client = new Anthropic({
        apiKey,
        baseURL: defaultLlm.baseUrl || undefined,
        dangerouslyAllowBrowser: true,
      })
      const resp = await client.messages.create({
        model: defaultLlm.modelId,
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

/** Lightweight ping for the "测试连接" button. */
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
