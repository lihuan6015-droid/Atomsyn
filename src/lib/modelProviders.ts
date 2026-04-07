/**
 * V2.0 M1 · Provider metadata registry.
 *
 * Each entry describes a model provider: display name, logo, default base URL,
 * and which ModelTypes it supports. The order here is the display order in
 * the provider grid.
 */

import type { ModelType, ProviderId } from '@/types/modelConfig'

import qwenLogo from '@/assets/logos/qwen.svg'
import glmLogo from '@/assets/logos/glm.svg'
import deepseekLogo from '@/assets/logos/deepseek.svg'
import kimiLogo from '@/assets/logos/kimi.png'
import minimaxLogo from '@/assets/logos/minimax.svg'
import doubaoLogo from '@/assets/logos/doubao.svg'
import siliconflowLogo from '@/assets/logos/siliconflow.svg'
import openaiLogo from '@/assets/logos/openai.svg'
import anthropicLogo from '@/assets/logos/anthropic.svg'
import customLogo from '@/assets/logos/custom.svg'

export interface ProviderMeta {
  id: ProviderId
  name: string
  logo: string
  defaultBaseUrl: string
  supportedTypes: ModelType[]
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    logo: openaiLogo,
    defaultBaseUrl: 'https://api.openai.com/v1',
    supportedTypes: ['llm', 'vlm', 'embedding', 'asr'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    logo: anthropicLogo,
    defaultBaseUrl: 'https://api.anthropic.com',
    supportedTypes: ['llm', 'vlm'],
  },
  {
    id: 'qwen',
    name: '通义千问',
    logo: qwenLogo,
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    supportedTypes: ['llm', 'vlm', 'embedding'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    logo: deepseekLogo,
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    supportedTypes: ['llm'],
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    logo: glmLogo,
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    supportedTypes: ['llm', 'vlm', 'embedding'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    logo: kimiLogo,
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    supportedTypes: ['llm'],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    logo: minimaxLogo,
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    supportedTypes: ['llm'],
  },
  {
    id: 'doubao',
    name: '豆包',
    logo: doubaoLogo,
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    supportedTypes: ['llm', 'vlm'],
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    logo: siliconflowLogo,
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    supportedTypes: ['llm', 'vlm', 'embedding'],
  },
  {
    id: 'custom',
    name: '自定义',
    logo: customLogo,
    defaultBaseUrl: '',
    supportedTypes: ['llm', 'vlm', 'asr', 'embedding'],
  },
]

export const PROVIDER_MAP = new Map(PROVIDERS.map((p) => [p.id, p]))

/** Get providers that support a given model type */
export function getProvidersForType(type: ModelType): ProviderMeta[] {
  return PROVIDERS.filter((p) => p.supportedTypes.includes(type))
}
