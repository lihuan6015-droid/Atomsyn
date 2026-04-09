/**
 * V2.0 M1 · Multi-model configuration types.
 *
 * Replaces the V1.5 single-provider LLMConfig.
 * Supports 4 model types × 10+ providers × N configured models.
 * API keys live in localStorage, never in persisted JSON.
 */

export type ModelType = 'llm' | 'vlm' | 'asr' | 'embedding'

export const MODEL_TYPE_LABELS: Record<ModelType, string> = {
  llm: '语言模型 (LLM)',
  vlm: '视觉模型 (VLM)',
  asr: '语音识别 (ASR)',
  embedding: '嵌入模型',
}

export type ProviderId =
  | 'qwen'
  | 'glm'
  | 'deepseek'
  | 'kimi'
  | 'minimax'
  | 'doubao'
  | 'siliconflow'
  | 'openai'
  | 'anthropic'
  | 'custom'

export interface ModelConfig {
  /** Stable unique id — `mc_<timestamp>_<random>` */
  id: string
  /** Human-readable display name, e.g. "DeepSeek Chat V3" */
  name: string
  type: ModelType
  provider: ProviderId
  /** Only used when provider === 'custom' */
  customProviderName?: string
  baseUrl: string
  modelId: string
  /** Whether this model slot is active */
  enabled: boolean
  /** Whether this is the default for its ModelType */
  isDefault: boolean
  /**
   * Maximum context window size in K tokens (e.g. 128 = 128K tokens).
   * Used by chat module's context harness to decide when to start trimming.
   * Default: 128 (128K). Common values: 32, 64, 128, 200, 256.
   */
  maxContextTokens?: number
  createdAt: string
  updatedAt: string
}

/**
 * The top-level persisted shape (localStorage).
 * API keys are stored separately: `atomsyn-model-key-<modelConfig.id>`.
 */
export interface ModelConfigStore {
  models: ModelConfig[]
  /** Copilot-specific settings (migrated from V1.5 llm.config.json) */
  copilot: CopilotSettings
}

export interface CopilotSettings {
  systemPromptRef: string
  maxContextAtoms: number
  enableAutoNavigate: boolean
  logConversations: boolean
}

/** Shape for export/import (no API keys) */
export interface ModelConfigExport {
  version: '2.0'
  exportedAt: string
  models: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>[]
  copilot: CopilotSettings
}
