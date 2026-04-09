/**
 * V2.0 M1 · Model configuration dialog.
 *
 * Ported from assess_bot's ModelConfigDialog.vue → React.
 * - Provider grid with logos
 * - Custom provider name input
 * - baseURL / modelId / apiKey (eye toggle)
 * - Test connection button with live result tag
 * - Save / Cancel
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Eye,
  EyeOff,
  Loader2,
  Plug,
  X,
} from 'lucide-react'
import type { ModelConfig, ModelType, ProviderId } from '@/types/modelConfig'
import { MODEL_TYPE_LABELS } from '@/types/modelConfig'
import { getProvidersForType, PROVIDER_MAP } from '@/lib/modelProviders'
import {
  useModelConfigStore,
  getModelApiKey,
  setModelApiKey,
} from '@/stores/useModelConfigStore'
import { testModelConnection } from '@/lib/testConnection'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  onClose: () => void
  modelType: ModelType
  editModel?: ModelConfig | null
}

export function ModelConfigDialog({ open, onClose, modelType, editModel }: Props) {
  const addModel = useModelConfigStore((s) => s.addModel)
  const updateModel = useModelConfigStore((s) => s.updateModel)

  const isEdit = !!editModel

  // Form state
  const [provider, setProvider] = useState<ProviderId | ''>('')
  const [customName, setCustomName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [modelId, setModelId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [name, setName] = useState('')
  const [maxCtxTokens, setMaxCtxTokens] = useState('128')

  // Test connection
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Saving
  const [saving, setSaving] = useState(false)

  // Populate form on open
  useEffect(() => {
    if (!open) return
    setTestResult(null)
    setShowKey(false)
    if (editModel) {
      setProvider(editModel.provider)
      setCustomName(editModel.customProviderName ?? '')
      setBaseUrl(editModel.baseUrl)
      setModelId(editModel.modelId)
      setName(editModel.name)
      setApiKey(getModelApiKey(editModel.id))
      setMaxCtxTokens(String(editModel.maxContextTokens ?? 128))
    } else {
      setProvider('')
      setCustomName('')
      setBaseUrl('')
      setModelId('')
      setName('')
      setApiKey('')
      setMaxCtxTokens('128')
    }
  }, [open, editModel])

  const providers = getProvidersForType(modelType)

  function selectProvider(id: ProviderId) {
    setProvider(id)
    const meta = PROVIDER_MAP.get(id)
    if (meta && id !== 'custom') {
      setCustomName('')
      if (meta.defaultBaseUrl && !isEdit) setBaseUrl(meta.defaultBaseUrl)
    } else {
      setCustomName('')
    }
    setTestResult(null)
  }

  async function handleTest() {
    if (!provider || !baseUrl || !modelId || !apiKey) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testModelConnection({
        provider: provider as ProviderId,
        baseUrl,
        modelId,
        apiKey,
        modelType,
      })
      setTestResult(result)
    } catch {
      setTestResult({ ok: false, message: '连接异常' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!provider || !baseUrl || !modelId) return
    if (!apiKey && !isEdit) return

    setSaving(true)
    try {
      const displayName =
        name.trim() ||
        `${PROVIDER_MAP.get(provider as ProviderId)?.name ?? provider} ${modelId}`

      const ctxTokens = parseInt(maxCtxTokens, 10) || 128

      if (isEdit && editModel) {
        updateModel(editModel.id, {
          name: displayName,
          provider: provider as ProviderId,
          customProviderName: provider === 'custom' ? customName : undefined,
          baseUrl,
          modelId,
          maxContextTokens: ctxTokens,
        })
        if (apiKey) setModelApiKey(editModel.id, apiKey)
      } else {
        const id = addModel({
          name: displayName,
          type: modelType,
          provider: provider as ProviderId,
          customProviderName: provider === 'custom' ? customName : undefined,
          baseUrl,
          modelId,
          maxContextTokens: ctxTokens,
          enabled: true,
          isDefault: false,
        })
        if (apiKey) setModelApiKey(id, apiKey)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const canTest = !!provider && !!baseUrl && !!modelId && !!apiKey
  const canSave = !!provider && !!baseUrl && !!modelId && (!!apiKey || isEdit)

  // Spring curve from CLAUDE.md design contract
  const springTransition = { type: 'spring' as const, stiffness: 400, damping: 30 }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />
          {/* Panel */}
          <div className="absolute inset-0 flex items-start justify-center pt-[8vh] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4 }}
              transition={springTransition}
              className="w-[600px] max-h-[80vh] overflow-y-auto rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-2xl pointer-events-auto"
            >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-base font-semibold">
              {isEdit ? '编辑模型配置' : '新增模型配置'}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 pb-6 space-y-5">
            {/* Model type tag */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">类型</span>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-500/10 text-violet-700 dark:text-violet-300">
                {MODEL_TYPE_LABELS[modelType]}
              </span>
            </div>

            {/* Display name */}
            <Field label="显示名称（可选）">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="如 DeepSeek Chat V3"
              />
            </Field>

            {/* Provider grid */}
            <Field label="模型提供商">
              <div className="flex flex-wrap gap-2.5">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectProvider(p.id)}
                    className={cn(
                      'flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all',
                      provider === p.id
                        ? 'border-violet-500/60 bg-violet-500/8 shadow-sm shadow-violet-500/10'
                        : 'border-neutral-200/70 dark:border-white/10 hover:border-violet-400/40 hover:bg-neutral-50 dark:hover:bg-white/5',
                    )}
                  >
                    <img
                      src={p.logo}
                      alt={p.name}
                      className="w-5 h-5 rounded object-contain"
                    />
                    <span className="text-[0.8125rem] whitespace-nowrap">{p.name}</span>
                  </button>
                ))}
              </div>
            </Field>

            {/* Custom provider name */}
            {provider === 'custom' && (
              <Field label="提供商名称">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className={inputClass}
                  placeholder="请输入自定义提供商名称"
                />
              </Field>
            )}

            {/* Base URL */}
            <Field label="API 地址">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className={inputClass}
                placeholder="https://api.example.com/v1"
              />
            </Field>

            {/* Model ID */}
            <Field label="模型 ID">
              <input
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className={inputClass}
                placeholder="如 qwen-plus, deepseek-chat, claude-sonnet-4-5"
              />
            </Field>

            {/* API Key */}
            <Field label="API Key">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={inputClass + ' pr-10'}
                  placeholder={isEdit ? '不修改请留空' : '请输入 API Key'}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[0.6875rem] text-neutral-500 mt-1">
                存储在浏览器本地（localStorage），不会写入项目文件。
              </p>
            </Field>

            {/* Max Context Tokens */}
            {modelType === 'llm' && (
              <Field label="最大上下文窗口 (K tokens)">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={maxCtxTokens}
                    onChange={(e) => setMaxCtxTokens(e.target.value)}
                    className={inputClass + ' w-24'}
                    placeholder="128"
                    min={8}
                    max={2048}
                    step={8}
                  />
                  <span className="text-xs text-neutral-400">K</span>
                  <div className="flex gap-1 ml-2">
                    {[32, 64, 128, 200, 256].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setMaxCtxTokens(String(v))}
                        className={
                          'px-2 py-0.5 rounded text-[0.6875rem] transition-colors ' +
                          (maxCtxTokens === String(v)
                            ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                            : 'bg-neutral-100 dark:bg-white/5 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-white/10')
                        }
                      >
                        {v}K
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[0.6875rem] text-neutral-500 mt-1">
                  聊天模块在上下文不超过此限制的 40-50% 前完整保留历史对话，超出后才触发渐进裁剪。
                </p>
              </Field>
            )}

            {/* Test connection + Save */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleTest}
                disabled={!canTest || testing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300/70 dark:border-white/10 text-sm hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plug className="w-4 h-4" />
                )}
                测试连接
              </button>

              {testResult && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg',
                    testResult.ok
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400',
                  )}
                >
                  {testResult.ok ? '连接成功' : testResult.message}
                </span>
              )}

              <div className="flex-1" />

              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-neutral-300/70 dark:border-white/10 text-sm hover:bg-neutral-100 dark:hover:bg-white/5"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white text-sm shadow-lg shadow-violet-500/20 disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                保存
              </button>
            </div>
          </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-xl bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}
