/**
 * Settings page — sidebar + right pane.
 * Sections: AI Copilot · Appearance · Data · About
 */
import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  Database,
  Download,
  Eye,
  Info,
  Loader2,
  Moon,
  Palette,
  Sun,
  RefreshCw,
  Pen,
  ShieldCheck,
  X,
  Plus,
  AlertTriangle,
} from 'lucide-react'
import { appVersionApi, indexApi, seedApi, usageApi } from '@/lib/dataApi'
import { APP_RELEASES_URL, APP_VERSION } from '@/lib/appVersionCheck'
import { SeedUpdateDialog } from '@/components/seed/SeedUpdateDialog'
import type { AppVersionResult, SeedCheckResult } from '@/types'
import type { ModelConfig, ModelType, ModelConfigExport } from '@/types/modelConfig'
import { MODEL_TYPE_LABELS } from '@/types/modelConfig'
import { PROVIDER_MAP } from '@/lib/modelProviders'
import { useModelConfigStore } from '@/stores/useModelConfigStore'
import { ModelConfigDialog } from '@/components/settings/ModelConfigDialog'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/useAppStore'

type SectionKey = 'ai' | 'appearance' | 'data' | 'agents' | 'updates' | 'about'

const SECTIONS: { key: SectionKey; label: string; icon: typeof Bot }[] = [
  { key: 'ai', label: 'AI 副驾驶', icon: Bot },
  { key: 'appearance', label: '外观', icon: Palette },
  { key: 'data', label: '数据', icon: Database },
  { key: 'agents', label: 'Agent 权限', icon: ShieldCheck },
  { key: 'updates', label: '版本与更新', icon: Download },
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
        {active === 'agents' && <AgentPermissionsSection />}
        {active === 'updates' && <UpdatesSection />}
        {active === 'about' && <AboutSection />}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Section — V2.0 M1 multi-model configuration
// ---------------------------------------------------------------------------
function AISection() {
  const showToast = useAppStore((s) => s.showToast)
  const models = useModelConfigStore((s) => s.models)
  const copilot = useModelConfigStore((s) => s.copilot)
  const removeModel = useModelConfigStore((s) => s.removeModel)
  const setDefault = useModelConfigStore((s) => s.setDefault)
  const updateModel = useModelConfigStore((s) => s.updateModel)
  const updateCopilot = useModelConfigStore((s) => s.updateCopilot)
  const exportConfig = useModelConfigStore((s) => s.exportConfig)
  const importConfig = useModelConfigStore((s) => s.importConfig)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<ModelType>('llm')
  const [editModel, setEditModel] = useState<ModelConfig | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function openAdd(type: ModelType) {
    setDialogType(type)
    setEditModel(null)
    setDialogOpen(true)
  }

  function openEdit(model: ModelConfig) {
    setDialogType(model.type)
    setEditModel(model)
    setDialogOpen(true)
  }

  function handleDelete(id: string) {
    removeModel(id)
    setConfirmDelete(null)
    showToast('已删除模型配置')
  }

  function handleExport() {
    const data = exportConfig()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `atomsyn-models-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('已导出（不含 API Key）')
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as ModelConfigExport
        if (data.version !== '2.0' || !Array.isArray(data.models)) {
          showToast('文件格式不正确')
          return
        }
        const count = models.length
        if (count > 0) {
          const confirmed = window.confirm(
            `导入将替换当前 ${count} 个模型配置。API Key 不包含在导入文件中，需要重新输入。\n\n确认导入？`
          )
          if (!confirmed) return
        }
        importConfig(data)
        showToast('已导入配置，请为每个模型补充 API Key')
      } catch {
        showToast('解析失败')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const MODEL_TYPES: ModelType[] = ['llm', 'vlm', 'asr', 'embedding']

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet-500" /> AI 模型配置
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          配置多个模型提供商，支持 LLM / VLM / ASR / Embedding 四类模型。
        </p>
      </header>

      {/* Model type groups */}
      {MODEL_TYPES.map((type) => {
        const typeModels = models.filter((m) => m.type === type)
        return (
          <section key={type} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                {MODEL_TYPE_LABELS[type]}
              </h2>
              <button
                onClick={() => openAdd(type)}
                className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
              >
                <Plus className="w-3.5 h-3.5" /> 添加
              </button>
            </div>

            {typeModels.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300/60 dark:border-white/10 px-4 py-6 text-center">
                <p className="text-xs text-neutral-400">暂无配置</p>
                <button
                  onClick={() => openAdd(type)}
                  className="mt-2 text-xs text-violet-500 hover:text-violet-600"
                >
                  + 添加第一个 {MODEL_TYPE_LABELS[type]}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {typeModels.map((m) => {
                  const providerMeta = PROVIDER_MAP.get(m.provider)
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
                        m.isDefault
                          ? 'border-violet-500/40 bg-violet-500/5'
                          : 'border-neutral-200/60 dark:border-white/8 hover:border-neutral-300 dark:hover:border-white/15',
                      )}
                    >
                      {/* Logo */}
                      {providerMeta && (
                        <img
                          src={providerMeta.logo}
                          alt={providerMeta.name}
                          className="w-6 h-6 rounded object-contain shrink-0"
                        />
                      )}

                      {/* Name + model ID */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{m.name}</div>
                        <div className="text-[11px] text-neutral-500 font-mono truncate">
                          {m.modelId}
                        </div>
                      </div>

                      {/* Default badge */}
                      {m.isDefault && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/15 text-violet-600 dark:text-violet-400">
                          默认
                        </span>
                      )}

                      {/* Enable/disable toggle */}
                      <button
                        onClick={() => updateModel(m.id, { enabled: !m.enabled })}
                        className={cn(
                          'relative w-9 h-5 rounded-full transition-colors shrink-0',
                          m.enabled
                            ? 'bg-emerald-500'
                            : 'bg-neutral-300 dark:bg-white/10',
                        )}
                        title={m.enabled ? '已启用' : '已禁用'}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                            m.enabled ? 'translate-x-4' : 'translate-x-0',
                          )}
                        />
                      </button>

                      {/* Actions */}
                      {!m.isDefault && (
                        <button
                          onClick={() => setDefault(m.id)}
                          className="text-[11px] text-neutral-500 hover:text-violet-500 shrink-0"
                          title="设为默认"
                        >
                          设为默认
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(m)}
                        className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 shrink-0"
                        title="编辑"
                      >
                        <Pen className="w-3.5 h-3.5 text-neutral-500" />
                      </button>
                      {confirmDelete === m.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="text-[11px] text-red-500 hover:text-red-600"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-[11px] text-neutral-400"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(m.id)}
                          className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0"
                          title="删除"
                        >
                          <X className="w-3.5 h-3.5 text-neutral-400 hover:text-red-500" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}

      {/* Copilot settings */}
      <section className="space-y-3 pt-2 border-t border-neutral-200/50 dark:border-white/5">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          Copilot 设置
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max Context Atoms">
            <input
              type="number"
              min={5}
              max={200}
              value={copilot.maxContextAtoms}
              onChange={(e) =>
                updateCopilot({ maxContextAtoms: Number(e.target.value) || 30 })
              }
              className={inputClass}
            />
          </Field>
        </div>
        <div className="space-y-2">
          <Toggle
            label="自动跳转到推荐卡片"
            checked={copilot.enableAutoNavigate}
            onChange={(v) => updateCopilot({ enableAutoNavigate: v })}
          />
          <Toggle
            label="记录对话日志"
            checked={copilot.logConversations}
            onChange={(v) => updateCopilot({ logConversations: v })}
          />
        </div>
      </section>

      {/* Import / Export */}
      <section className="flex items-center gap-3 pt-2 border-t border-neutral-200/50 dark:border-white/5">
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300/70 dark:border-white/10 text-sm hover:bg-neutral-100 dark:hover:bg-white/5"
        >
          <Download className="w-4 h-4" /> 导出配置
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300/70 dark:border-white/10 text-sm hover:bg-neutral-100 dark:hover:bg-white/5"
        >
          <RefreshCw className="w-4 h-4" /> 导入配置
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
        <span className="text-[11px] text-neutral-400">导出不含 API Key，导入后请手动补充</span>
      </section>

      {/* Dialog */}
      <ModelConfigDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        modelType={dialogType}
        editModel={editModel}
      />
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
          <span className="text-neutral-500">App：</span> Atomsyn
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
// Agent Permissions (V1.5 · T-6.3)
// ---------------------------------------------------------------------------
interface AgentPermissionEntry {
  agentName: string
  canRead: boolean
  canWrite: boolean
  requireConfirmWrite: boolean
  lastSeenAt?: string
  totalWrites?: number
  totalReads?: number
}
interface AgentPermissionsConfig {
  agents: Record<string, AgentPermissionEntry>
  updatedAt: string
}

const AGENT_PERM_STORAGE = 'atomsyn:agent-permissions'
// TODO(v1.6): persist to ~/.atomsyn-config.json via Tauri command
const AGENT_CHIP_COLORS = [
  'bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/30',
  'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30',
  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
  'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30',
  'bg-pink-500/10 text-pink-700 dark:text-pink-300 ring-pink-500/30',
]
function hashColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AGENT_CHIP_COLORS[h % AGENT_CHIP_COLORS.length]
}
function loadAgentPerms(): AgentPermissionsConfig {
  try {
    const raw = localStorage.getItem(AGENT_PERM_STORAGE)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { agents: {}, updatedAt: new Date().toISOString() }
}
function saveAgentPerms(cfg: AgentPermissionsConfig) {
  localStorage.setItem(AGENT_PERM_STORAGE, JSON.stringify(cfg))
}
function relativeTime(iso?: string): string {
  if (!iso) return '从未'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

function AgentPermissionsSection() {
  const showToast = useAppStore((s) => s.showToast)
  const [cfg, setCfg] = useState<AgentPermissionsConfig>(() => loadAgentPerms())
  const [loading, setLoading] = useState(true)
  const [manualName, setManualName] = useState('')

  useEffect(() => {
    usageApi
      .list()
      .then((events) => {
        // V1.5 agent events carry loose shape: { action, agentName, ts, ... }
        const anyEvents = events as unknown as Array<Record<string, unknown>>
        const stats: Record<
          string,
          { writes: number; reads: number; lastSeenAt: string }
        > = {}
        for (const e of anyEvents) {
          const name = typeof e.agentName === 'string' ? e.agentName : null
          const action = typeof e.action === 'string' ? e.action : null
          const ts = typeof e.ts === 'string' ? e.ts : null
          if (!name || !action) continue
          if (action !== 'read' && action !== 'write') continue
          if (!stats[name]) stats[name] = { writes: 0, reads: 0, lastSeenAt: ts ?? '' }
          if (action === 'write') stats[name].writes++
          else stats[name].reads++
          if (ts && ts > stats[name].lastSeenAt) stats[name].lastSeenAt = ts
        }
        setCfg((prev) => {
          const next: AgentPermissionsConfig = {
            ...prev,
            agents: { ...prev.agents },
          }
          for (const [name, s] of Object.entries(stats)) {
            const existing = next.agents[name]
            next.agents[name] = {
              agentName: name,
              canRead: existing?.canRead ?? true,
              canWrite: existing?.canWrite ?? true,
              requireConfirmWrite: existing?.requireConfirmWrite ?? false,
              lastSeenAt: s.lastSeenAt || existing?.lastSeenAt,
              totalWrites: s.writes,
              totalReads: s.reads,
            }
          }
          next.updatedAt = new Date().toISOString()
          saveAgentPerms(next)
          return next
        })
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => setLoading(false))
  }, [])

  function updateAgent(name: string, patch: Partial<AgentPermissionEntry>) {
    setCfg((prev) => {
      const existing = prev.agents[name]
      if (!existing) return prev
      const next: AgentPermissionsConfig = {
        ...prev,
        agents: {
          ...prev.agents,
          [name]: { ...existing, ...patch },
        },
        updatedAt: new Date().toISOString(),
      }
      saveAgentPerms(next)
      return next
    })
    showToast(`✓ 已更新 ${name} 权限`)
  }

  function removeAgent(name: string) {
    setCfg((prev) => {
      const { [name]: _removed, ...rest } = prev.agents
      void _removed
      const next: AgentPermissionsConfig = {
        agents: rest,
        updatedAt: new Date().toISOString(),
      }
      saveAgentPerms(next)
      return next
    })
    showToast(`✓ 已移除 ${name}`)
  }

  function addManual() {
    const name = manualName.trim()
    if (!name) return
    if (cfg.agents[name]) {
      showToast(`${name} 已存在`)
      return
    }
    setCfg((prev) => {
      const next: AgentPermissionsConfig = {
        agents: {
          ...prev.agents,
          [name]: {
            agentName: name,
            canRead: true,
            canWrite: true,
            requireConfirmWrite: false,
          },
        },
        updatedAt: new Date().toISOString(),
      }
      saveAgentPerms(next)
      return next
    })
    setManualName('')
    showToast(`✓ 已添加 ${name}`)
  }

  const list = Object.values(cfg.agents).sort((a, b) =>
    a.agentName.localeCompare(b.agentName)
  )

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet-500" /> Agent 权限
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          管理哪些 AI agent 可以读写你的 Atomsyn。
        </p>
      </header>

      {/* V1.5 warning banner */}
      <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="leading-relaxed">
          <div className="font-medium mb-0.5">V1.5 暂未启用硬性拦截</div>
          配置暂存于浏览器本地，Tauri 桌面版将写入{' '}
          <code className="text-[11px]">~/.atomsyn-config.json</code>。
          当前开关仅作为 UI 契约，真实权限强制将在 V1.6 接入。
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> 正在读取使用日志…
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300/70 dark:border-white/10 px-4 py-8 text-center text-sm text-neutral-500">
          尚未发现任何 agent · 在 Claude Code 里调用 atlas-write / atlas-read
          后会自动出现
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <div
              key={a.agentName}
              className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/50 dark:bg-white/[0.02] p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ring-1',
                      hashColor(a.agentName)
                    )}
                  >
                    <Bot className="w-3 h-3" />
                    {a.agentName}
                  </span>
                  <div className="text-[11px] text-neutral-500 mt-2">
                    {a.totalWrites ?? 0} 次写入 · {a.totalReads ?? 0} 次读取 · 最近活跃{' '}
                    {relativeTime(a.lastSeenAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeAgent(a.agentName)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  title="移除"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1 pt-1 border-t border-neutral-200/60 dark:border-white/5">
                <PermToggle
                  icon={<Eye className="w-3.5 h-3.5" />}
                  label="读权限"
                  checked={a.canRead}
                  onChange={(v) => updateAgent(a.agentName, { canRead: v })}
                />
                <PermToggle
                  icon={<Pen className="w-3.5 h-3.5" />}
                  label="写权限"
                  checked={a.canWrite}
                  onChange={(v) => updateAgent(a.agentName, { canWrite: v })}
                />
                <PermToggle
                  icon={<ShieldCheck className="w-3.5 h-3.5" />}
                  label="写入需确认"
                  badge="V1.5 UI 只 · V1.6 生效"
                  checked={a.requireConfirmWrite}
                  onChange={(v) =>
                    updateAgent(a.agentName, { requireConfirmWrite: v })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual add */}
      <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 p-4">
        <div className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-2">
          手动添加 agent
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addManual()
            }}
            className={inputClass}
            placeholder="例如 cursor、windsurf、codex-cli …"
          />
          <button
            type="button"
            onClick={addManual}
            disabled={!manualName.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white text-sm shadow-lg shadow-violet-500/30 disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform shrink-0"
          >
            <Plus className="w-4 h-4" />
            添加 agent
          </button>
        </div>
      </div>
    </div>
  )
}

function PermToggle({
  icon,
  label,
  badge,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  badge?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between py-1.5 cursor-pointer">
      <span className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
        <span className="text-neutral-400">{icon}</span>
        {label}
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30 font-normal">
            {badge}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={
          'relative w-10 h-6 rounded-full transition-colors shrink-0 ' +
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

// ---------------------------------------------------------------------------
// Updates (V1.5 · dual update channels: app + seed methodology)
// ---------------------------------------------------------------------------
function UpdatesSection() {
  const showToast = useAppStore((s) => s.showToast)
  const setSeedUpdateAvailable = useAppStore((s) => s.setSeedUpdateAvailable)
  const setAppUpdateAvailable = useAppStore((s) => s.setAppUpdateAvailable)

  const [appResult, setAppResult] = useState<AppVersionResult | null>(null)
  const [seedResult, setSeedResult] = useState<SeedCheckResult | null>(null)
  const [appBusy, setAppBusy] = useState(false)
  const [seedBusy, setSeedBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    appVersionApi
      .check()
      .then((r) => {
        setAppResult(r)
        setAppUpdateAvailable(r.hasUpdate)
      })
      .catch(() => undefined)
    seedApi
      .check()
      .then((r) => {
        setSeedResult(r)
        setSeedUpdateAvailable(r.hasUpdate && !r.dismissed)
      })
      .catch(() => undefined)
  }, [setAppUpdateAvailable, setSeedUpdateAvailable])

  async function handleAppCheck() {
    setAppBusy(true)
    try {
      const r = await appVersionApi.check()
      setAppResult(r)
      setAppUpdateAvailable(r.hasUpdate)
      if (r.hasUpdate) {
        showToast(`发现新版本: v${r.latest}`)
      } else if (r.reason === 'v1.5-not-published') {
        showToast('当前为 V1.5 本地版本,GitHub 仓库尚未发布')
      } else {
        showToast('已是最新版本')
      }
    } catch (e: any) {
      showToast('检查失败：' + (e?.message ?? 'unknown'))
    } finally {
      setAppBusy(false)
    }
  }

  async function handleSeedCheck() {
    setSeedBusy(true)
    try {
      const r = await seedApi.check()
      setSeedResult(r)
      const should = r.hasUpdate && !r.dismissed
      setSeedUpdateAvailable(should)
      if (should) {
        setDialogOpen(true)
      } else if (r.reason === 'dogfood-same-dir') {
        showToast('开发模式 · 项目目录即数据目录')
      } else if (r.reason === 'first-install') {
        showToast('首次安装,种子已就绪')
      } else if (r.dismissed) {
        showToast('此版本已被你跳过提醒')
      } else {
        showToast('方法论库已是最新')
      }
    } catch (e: any) {
      showToast('检查失败：' + (e?.message ?? 'unknown'))
    } finally {
      setSeedBusy(false)
    }
  }

  async function handleResetDismiss() {
    try {
      await seedApi.resetDismiss()
      showToast('✓ 已清空跳过版本列表')
      // re-check so the badge can re-appear if applicable
      const r = await seedApi.check()
      setSeedResult(r)
      setSeedUpdateAvailable(r.hasUpdate && !r.dismissed)
    } catch (e: any) {
      showToast('操作失败：' + (e?.message ?? 'unknown'))
    }
  }

  function relTime(iso?: string): string {
    if (!iso) return '—'
    const t = Date.parse(iso)
    if (Number.isNaN(t)) return iso
    const diff = Date.now() - t
    if (diff < 60_000) return '刚刚'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
    return `${Math.floor(diff / 86_400_000)} 天前`
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Download className="w-5 h-5 text-violet-500" /> 版本与更新
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          独立的两个更新通道:应用程序版本 + 内置方法论库版本。
        </p>
      </header>

      {/* App version */}
      <section className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/50 dark:bg-white/[0.02] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-sky-500" />
          <h2 className="text-sm font-semibold">应用程序版本</h2>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
          <div className="text-neutral-500">当前版本</div>
          <div className="font-mono text-neutral-800 dark:text-neutral-200">
            v{APP_VERSION}
          </div>
          <div className="text-neutral-500">最新版本</div>
          <div className="text-neutral-700 dark:text-neutral-300">
            {appResult?.latest
              ? `v${appResult.latest}`
              : '即将发布到 GitHub · V1.5 为本地版本'}
          </div>
          <div className="text-neutral-500">Releases</div>
          <a
            href={APP_RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="text-violet-600 dark:text-violet-400 hover:underline truncate"
          >
            {APP_RELEASES_URL}
          </a>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleAppCheck}
            disabled={appBusy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-neutral-300/70 dark:border-white/10 text-xs hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50"
          >
            {appBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            检查更新
          </button>
        </div>
        {/*
          TODO(V1.6): replace the stub with a real GitHub Releases fetch:
          const res = await fetch('https://api.github.com/repos/circlelee/atomsyn/releases/latest')
          const json = await res.json()
          const latest = json.tag_name?.replace(/^v/, '')
          // compare with APP_VERSION using a tiny semver helper
        */}
      </section>

      {/* Seed methodology */}
      <section className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/50 dark:bg-white/[0.02] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-emerald-500" />
          <h2 className="text-sm font-semibold">种子方法论库</h2>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
          <div className="text-neutral-500">已安装版本</div>
          <div className="font-mono text-neutral-800 dark:text-neutral-200">
            {seedResult?.installedVersion ?? '—'}
          </div>
          <div className="text-neutral-500">最新种子版本</div>
          <div className="font-mono text-neutral-800 dark:text-neutral-200">
            {seedResult?.seedVersion ?? '—'}
          </div>
          <div className="text-neutral-500">上次同步</div>
          <div className="text-neutral-700 dark:text-neutral-300">
            {relTime(seedResult?.lastSyncedAt)}
          </div>
          {seedResult?.reason && (
            <>
              <div className="text-neutral-500">状态</div>
              <div className="text-neutral-600 dark:text-neutral-400">
                {seedResult.reason}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleSeedCheck}
            disabled={seedBusy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-neutral-300/70 dark:border-white/10 text-xs hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50"
          >
            {seedBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            检查更新
          </button>
          <button
            type="button"
            onClick={handleResetDismiss}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-neutral-300/70 dark:border-white/10 text-xs hover:bg-neutral-100 dark:hover:bg-white/5"
          >
            重置提醒设置
          </button>
        </div>
      </section>

      <SeedUpdateDialog
        open={dialogOpen}
        result={seedResult}
        onClose={() => setDialogOpen(false)}
        onSynced={() => {
          // refresh after sync
          seedApi.check().then(setSeedResult).catch(() => undefined)
        }}
      />
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
