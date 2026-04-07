/**
 * V2.0 M1 · Multi-model configuration store (Zustand + persist).
 *
 * Replaces V1.5's single-provider LLMConfig.
 * - Models persisted to localStorage key 'atomsyn-model-config'
 * - API keys stored separately per model: 'atomsyn-model-key-<id>'
 * - Export strips keys; import prompts user to re-enter
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ModelConfig,
  ModelType,
  CopilotSettings,
  ModelConfigExport,
} from '@/types/modelConfig'

// ---------------------------------------------------------------------------
// API key helpers (localStorage, never persisted with model data)
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'atomsyn-model-key-'

export function getModelApiKey(modelId: string): string {
  return localStorage.getItem(KEY_PREFIX + modelId) ?? ''
}

export function setModelApiKey(modelId: string, key: string): void {
  if (key.trim()) localStorage.setItem(KEY_PREFIX + modelId, key.trim())
  else localStorage.removeItem(KEY_PREFIX + modelId)
}

export function removeModelApiKey(modelId: string): void {
  localStorage.removeItem(KEY_PREFIX + modelId)
}

// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------

function generateId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `mc_${ts}_${rand}`
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface ModelConfigState {
  models: ModelConfig[]
  copilot: CopilotSettings

  // CRUD
  addModel: (draft: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateModel: (id: string, patch: Partial<Omit<ModelConfig, 'id' | 'createdAt'>>) => void
  removeModel: (id: string) => void

  // Default model per type
  setDefault: (id: string) => void
  getDefault: (type: ModelType) => ModelConfig | undefined

  // Copilot settings
  updateCopilot: (patch: Partial<CopilotSettings>) => void

  // Export / Import
  exportConfig: () => ModelConfigExport
  importConfig: (data: ModelConfigExport) => void

  // Queries
  getModelsByType: (type: ModelType) => ModelConfig[]
  getModelById: (id: string) => ModelConfig | undefined
}

const DEFAULT_COPILOT: CopilotSettings = {
  systemPromptRef: './skills/copilot.system.md',
  maxContextAtoms: 30,
  enableAutoNavigate: true,
  logConversations: true,
}

export const useModelConfigStore = create<ModelConfigState>()(
  persist(
    (set, get) => ({
      models: [],
      copilot: DEFAULT_COPILOT,

      addModel: (draft) => {
        const now = new Date().toISOString()
        const id = generateId()
        const model: ModelConfig = { ...draft, id, createdAt: now, updatedAt: now }

        set((s) => {
          let models = [...s.models, model]
          // If this is the first model of its type, auto-set as default
          const sameType = models.filter((m) => m.type === model.type)
          if (sameType.length === 1) {
            models = models.map((m) => (m.id === id ? { ...m, isDefault: true } : m))
          }
          return { models }
        })
        return id
      },

      updateModel: (id, patch) => {
        set((s) => ({
          models: s.models.map((m) =>
            m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m,
          ),
        }))
      },

      removeModel: (id) => {
        removeModelApiKey(id)
        set((s) => {
          const removed = s.models.find((m) => m.id === id)
          let models = s.models.filter((m) => m.id !== id)
          // If removed model was default, promote the first enabled model of same type
          if (removed?.isDefault) {
            const next = models.find((m) => m.type === removed.type && m.enabled)
            if (next) {
              models = models.map((m) =>
                m.id === next.id ? { ...m, isDefault: true } : m,
              )
            }
          }
          return { models }
        })
      },

      setDefault: (id) => {
        set((s) => {
          const target = s.models.find((m) => m.id === id)
          if (!target) return s
          return {
            models: s.models.map((m) => ({
              ...m,
              isDefault: m.type === target.type ? m.id === id : m.isDefault,
            })),
          }
        })
      },

      getDefault: (type) => {
        const { models } = get()
        return (
          models.find((m) => m.type === type && m.isDefault && m.enabled) ??
          models.find((m) => m.type === type && m.enabled)
        )
      },

      updateCopilot: (patch) => {
        set((s) => ({ copilot: { ...s.copilot, ...patch } }))
      },

      exportConfig: () => {
        const { models, copilot } = get()
        return {
          version: '2.0',
          exportedAt: new Date().toISOString(),
          models: models.map(({ id: _, createdAt: _c, updatedAt: _u, ...rest }) => rest),
          copilot,
        }
      },

      importConfig: (data) => {
        const now = new Date().toISOString()
        const imported: ModelConfig[] = data.models.map((m) => ({
          ...m,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        }))
        // Enforce single default per type
        const seenDefault = new Set<string>()
        for (const m of imported) {
          if (m.isDefault) {
            if (seenDefault.has(m.type)) m.isDefault = false
            else seenDefault.add(m.type)
          }
        }
        set({ models: imported, copilot: data.copilot ?? DEFAULT_COPILOT })
      },

      getModelsByType: (type) => get().models.filter((m) => m.type === type),

      getModelById: (id) => get().models.find((m) => m.id === id),
    }),
    {
      name: 'atomsyn-model-config',
      partialize: (s) => ({
        models: s.models,
        copilot: s.copilot,
      }),
    },
  ),
)
