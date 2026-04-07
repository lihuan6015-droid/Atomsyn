/**
 * Settings page — sidebar + right pane.
 * Sections: AI Copilot · Appearance · Data · About
 */
import { useEffect, useState } from 'react'
import {
  Bot,
  Database,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Moon,
  Palette,
  Save,
  Sun,
  TestTube2,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { llmConfigApi, indexApi } from '@/lib/dataApi'
import {
  LLM_API_KEY_STORAGE,
  getStoredApiKey,
  setStoredApiKey,
  testCopilotConnection,
} from '@/lib/llmClient'
import type { LLMConfig, LLMProvider } from '@/types'
import { useAppStore } from '@/stores/useAppStore'

type SectionKey = 'ai' | 'appearance' | 'data' | 'about'

const SECTIONS: { key: SectionKey; label: string; icon: typeof Bot }[] = [
  { key: 'ai', label: 'AI 副驾驶', icon: Bot },
  { key: 'appearance', label: '外观', icon: Palette },
  { key: 'data', label: '数据', icon: Database },
  { key: 'about', label: '关于', icon: Info },
]

export function SettingsPage() {
  const [active, setActive] = useState<SectionKey>('ai')

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-neutral-200/70 dark:border-white/10 p-4 space-y-1">
        <div className="text-[11px] uppercase tracking-wider text-neutral-500 px-2 mb-2">
          设置
        </div>
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const isActive = active === s.key
          return (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={
                'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ' +
                (isActive
                  ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300 font-medium'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5')
              }
            >
              <Icon className="w-4 h-4" />
              {s.label}
            </button>
          )
        })}
      </aside>

      {/* Pane */}
      <main className="flex-1 overflow-y-auto scrollbar-subtle p-8">
        {active === 'ai' && <AISection />}
        {active === 'appearance' && <AppearanceSection />}
        {active === 'data' && <DataSection />}
        {active === 'about' && <AboutSection />}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Section
// ---------------------------------------------------------------------------
function AISection() {
  const showToast = useAppStore((s) => s.showToast)
  const [config, setConfig] = useState<LLMConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(
    null
  )

  useEffect(() => {
    llmConfigApi
      .get()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setLoading(false))
    setApiKey(getStoredApiKey() ?? '')
  }, [])

  if (loading || !config) {
    return (
      <div className="text-sm text-neutral-500 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
      </div>
    )
  }

  const provider = config.activeProvider
  const providerCfg = config.providers[provider]

  function patchProvider(patch: Partial<typeof providerCfg>) {
    if (!config) return
    setConfig({
      ...config,
      providers: {
        ...config.providers,
        [provider]: { ...config.providers[provider], ...patch },
      },
    })
  }

  function patchCopilot(patch: Partial<LLMConfig['copilot']>) {
    if (!config) return
    setConfig({ ...config, copilot: { ...config.copilot, ...patch } })
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    try {
      // Defensively ensure the active provider is marked enabled (legacy configs default to enabled:false)
      const cfgToSave: LLMConfig = {
        ...config,
        providers: {
          ...config.providers,
          [config.activeProvider]: {
            ...config.providers[config.activeProvider],
            enabled: true,
          },
        },
      }
      await llmConfigApi.save(cfgToSave)
      setConfig(cfgToSave)
      if (apiKey.trim()) setStoredApiKey(apiKey.trim())
      else localStorage.removeItem(LLM_API_KEY_STORAGE)
      showToast('✓ 配置已保存')
    } catch (e: any) {
      showToast('保存失败：' + (e?.message ?? 'unknown'))
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!config) return
    setTesting(true)
    setTestResult(null)
    // Ensure both the API key AND the in-memory provider config are committed
    // BEFORE the test fires — otherwise the test reads stale on-disk config
    // and may route to the wrong SDK (e.g. Anthropic when user picked Custom).
    if (apiKey.trim()) setStoredApiKey(apiKey.trim())
    try {
      const cfgToSave: LLMConfig = {
        ...config,
        providers: {
          ...config.providers,
          [config.activeProvider]: {
            ...config.providers[config.activeProvider],
            enabled: true,
          },
        },
      }
      await llmConfigApi.save(cfgToSave)
      setConfig(cfgToSave)
    } catch (e: any) {
      setTestResult({ ok: false, message: '保存配置失败：' + (e?.message ?? 'unknown') })
      setTesting(false)
      return
    }
    const r = await testCopilotConnection()
    setTestResult(r)
    setTesting(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet-500" /> AI 副驾驶配置
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          配置你的 LLM 提供商，让 Copilot 在迷茫时帮你导航。
        </p>
      </header>

      <Field label="Provider">
        <select
          value={provider}
          onChange={(e) =>
            setConfig({ ...config, activeProvider: e.target.value as LLMProvider })
          }
          className={inputClass}
        >
          <option value="anthropic">Anthropic（Claude 官方 API）</option>
          <option value="openai">OpenAI（GPT 官方 API）</option>
          <option value="custom">Custom（任意 OpenAI 兼容端点：Qwen / DeepSeek / Ollama …）</option>
        </select>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5 leading-relaxed">
          💡 <span className="font-medium">使用阿里云通义千问 / DeepSeek / Ollama 等 OpenAI 兼容模型时，请选 Custom</span>。
          选错 Provider 会导致 SDK 用错请求头（例如把 Qwen 的 key 当成 Anthropic 的，从而返回 401 invalid x-api-key）。
        </p>
      </Field>

      <Field label="Model">
        <input
          type="text"
          value={providerCfg.model}
          onChange={(e) => patchProvider({ model: e.target.value })}
          className={inputClass}
          placeholder={
            provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini'
          }
        />
      </Field>

      <Field label="Base URL（可选）">
        <input
          type="text"
          value={providerCfg.baseUrl ?? ''}
          onChange={(e) => patchProvider({ baseUrl: e.target.value })}
          className={inputClass}
          placeholder={
            provider === 'anthropic'
              ? 'https://api.anthropic.com'
              : 'https://api.openai.com/v1'
          }
        />
      </Field>

      <Field label="API Key">
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className={inputClass + ' pr-10'}
            placeholder="sk-..."
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
            title={showKey ? '隐藏' : '显示'}
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="text-[11px] text-neutral-500 mt-1">
          🔒 存储在浏览器本地（localStorage），不会写入项目文件。
        </div>
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Max Tokens">
          <input
            type="number"
            value={providerCfg.maxTokens ?? 2048}
            min={64}
            max={32000}
            onChange={(e) =>
              patchProvider({ maxTokens: Number(e.target.value) || 2048 })
            }
            className={inputClass}
          />
        </Field>
        <Field label="Temperature">
          <input
            type="number"
            step={0.1}
            min={0}
            max={2}
            value={providerCfg.temperature ?? 0.3}
            onChange={(e) =>
              patchProvider({ temperature: Number(e.target.value) || 0.3 })
            }
            className={inputClass}
          />
        </Field>
        <Field label="Max Context Atoms">
          <input
            type="number"
            min={5}
            max={200}
            value={config.copilot.maxContextAtoms}
            onChange={(e) =>
              patchCopilot({ maxContextAtoms: Number(e.target.value) || 30 })
            }
            className={inputClass}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <Toggle
          label="自动跳转到推荐卡片"
          checked={config.copilot.enableAutoNavigate}
          onChange={(v) => patchCopilot({ enableAutoNavigate: v })}
        />
        <Toggle
          label="记录对话日志"
          checked={config.copilot.logConversations}
          onChange={(v) => patchCopilot({ logConversations: v })}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300/70 dark:border-white/10 text-sm hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <TestTube2 className="w-4 h-4" />
          )}
          测试连接
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white text-sm shadow-lg shadow-violet-500/30 disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存
        </button>
        {testResult && (
          <span
            className={
              'text-xs flex items-center gap-1 ' +
              (testResult.ok ? 'text-emerald-600' : 'text-red-500')
            }
          >
            {testResult.ok ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------
function AppearanceSection() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Palette className="w-5 h-5 text-sky-500" /> 外观
        </h1>
        <p className="text-sm text-neutral-500 mt-1">选择你喜欢的主题。</p>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <ThemeCard
          active={theme === 'light'}
          onClick={() => setTheme('light')}
          icon={<Sun className="w-5 h-5" />}
          label="明亮"
        />
        <ThemeCard
          active={theme === 'dark'}
          onClick={() => setTheme('dark')}
          icon={<Moon className="w-5 h-5" />}
          label="暗黑"
        />
      </div>
    </div>
  )
}

function ThemeCard({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ' +
        (active
          ? 'border-violet-500/60 bg-violet-500/10 text-violet-700 dark:text-violet-300'
          : 'border-neutral-200/70 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5')
      }
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
function DataSection() {
  const showToast = useAppStore((s) => s.showToast)
  const [busy, setBusy] = useState(false)

  async function rebuild() {
    setBusy(true)
    try {
      await indexApi.rebuild()
      showToast('✓ 索引已重建')
    } catch (e: any) {
      showToast('重建失败：' + (e?.message ?? 'unknown'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-500" /> 数据
        </h1>
        <p className="text-sm text-neutral-500 mt-1">本地数据存放位置和索引管理。</p>
      </header>
      <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 p-4 space-y-2">
        <div className="text-xs text-neutral-500">数据目录</div>
        <code className="block text-xs bg-neutral-100 dark:bg-white/5 px-2 py-1 rounded">
          ./data
        </code>
      </div>
      <button
        onClick={rebuild}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300/70 dark:border-white/10 text-sm hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        重建索引
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------
function AboutSection() {
  return (
    <div className="max-w-xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Info className="w-5 h-5 text-neutral-400" /> 关于
        </h1>
      </header>
      <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 p-4 space-y-2 text-sm">
        <div>
          <span className="text-neutral-500">App：</span> CCL PM Tool
        </div>
        <div>
          <span className="text-neutral-500">Version：</span> 0.1.0 alpha
        </div>
        <div>
          <span className="text-neutral-500">PRD：</span>{' '}
          <code className="text-xs">docs/PRD.md</code>
        </div>
        <div>
          <span className="text-neutral-500">Mockups：</span>{' '}
          <code className="text-xs">docs/mockups/atlas.html</code>,{' '}
          <code className="text-xs">docs/mockups/atom-card.html</code>
        </div>
      </div>
      <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 p-4 text-sm">
        <div className="text-xs text-neutral-500 mb-2">主要依赖</div>
        <ul className="text-xs space-y-1 text-neutral-600 dark:text-neutral-300">
          <li>React 18 · TypeScript · Vite</li>
          <li>TailwindCSS · Framer Motion · Zustand</li>
          <li>@anthropic-ai/sdk · lucide-react</li>
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// shared bits
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between py-1 cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={
          'relative w-10 h-6 rounded-full transition-colors ' +
          (checked ? 'bg-violet-500' : 'bg-neutral-300 dark:bg-white/10')
        }
      >
        <span
          className={
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ' +
            (checked ? 'translate-x-4' : 'translate-x-0')
          }
        />
      </button>
    </label>
  )
}

export default SettingsPage
