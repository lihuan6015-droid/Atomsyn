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
  FolderOpen,
  Info,
  Loader2,
  Moon,
  Palette,
  Plug,
  Sun,
  RefreshCw,
  Pen,
  ShieldCheck,
  X,
  Plus,
  Check,
  Circle,
} from 'lucide-react'
import { appVersionApi, indexApi, seedApi } from '@/lib/dataApi'
import { getDataDirInfo, describeDataSource, type DataDirInfo } from '@/lib/dataPath'
import { openContainingFolder } from '@/lib/openPath'
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

type SectionKey = 'ai' | 'agent' | 'appearance' | 'data' | 'updates' | 'about'

const SECTIONS: { key: SectionKey; label: string; icon: typeof Bot }[] = [
  { key: 'ai', label: '模型', icon: Bot },
  { key: 'agent', label: 'Agent Skill', icon: Plug },
  { key: 'appearance', label: '外观', icon: Palette },
  { key: 'data', label: '数据', icon: Database },
  { key: 'updates', label: '版本与更新', icon: Download },
  { key: 'about', label: '关于', icon: Info },
]

export function SettingsPage() {
  const [active, setActive] = useState<SectionKey>('ai')

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-neutral-200/70 dark:border-white/10 p-4 space-y-1">
        <div className="text-[0.6875rem] uppercase tracking-wider text-neutral-500 px-2 mb-2">
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
        {active === 'agent' && <AgentSection />}
        {active === 'appearance' && <AppearanceSection />}
        {active === 'data' && <DataSection />}
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
          <Bot className="w-5 h-5 text-violet-500" /> 模型配置
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
                        <div className="text-[0.6875rem] text-neutral-500 font-mono truncate">
                          {m.modelId}
                        </div>
                      </div>

                      {/* Default badge */}
                      {m.isDefault && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-[0.625rem] font-medium bg-violet-500/15 text-violet-600 dark:text-violet-400">
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
                          className="text-[0.6875rem] text-neutral-500 hover:text-violet-500 shrink-0"
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
                            className="text-[0.6875rem] text-red-500 hover:text-red-600"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-[0.6875rem] text-neutral-400"
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
        <span className="text-[0.6875rem] text-neutral-400">导出不含 API Key，导入后请手动补充</span>
      </section>

      {/* Agent permissions (global) */}
      <AgentPermissionsInline />

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
// Agent Skill — one-click installation
// ---------------------------------------------------------------------------

interface SkillStatus {
  claudeSkillInstalled: boolean
  cursorSkillInstalled: boolean
  cliShimInstalled: boolean
}

interface SkillInstallResult {
  claudeInstalled: boolean
  cursorInstalled: boolean
  cliInstalled: boolean
  nodeAvailable: boolean
  nodeVersion: string | null
  filesCopied: number
  detail: string
}

function AgentSection() {
  const showToast = useAppStore((s) => s.showToast)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<SkillStatus | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [nodeInfo, setNodeInfo] = useState<{ available: boolean; version: string | null } | null>(null)

  useEffect(() => {
    checkStatus()
  }, [])

  async function checkStatus() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const res = await invoke<{ counts: SkillStatus }>('init_check_skill_installation')
      if (res?.counts) setStatus(res.counts)
    } catch {
      // Web dev mode — no Tauri backend
    }
  }

  async function handleInstall() {
    setBusy(true)
    setLastResult(null)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const res = await invoke<SkillInstallResult>('install_agent_skills')
      setNodeInfo({ available: res.nodeAvailable, version: res.nodeVersion })
      const msg = res.filesCopied > 0
        ? `已安装 ${res.filesCopied} 个文件`
        : '所有 Skill 已是最新版本'
      setLastResult(res.nodeAvailable ? msg : msg + '（⚠️ 未检测到 Node.js）')
      showToast(msg)
      await checkStatus()
    } catch (e: any) {
      const msg = '安装失败：' + (e?.message ?? String(e))
      setLastResult(msg)
      showToast(msg)
    } finally {
      setBusy(false)
    }
  }

  async function openNodeSite() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_path', { path: 'https://nodejs.org/' })
    } catch {
      window.open('https://nodejs.org/', '_blank')
    }
  }

  const items = [
    { label: 'Claude Code Skill', ok: status?.claudeSkillInstalled },
    { label: 'Cursor Skill', ok: status?.cursorSkillInstalled },
    { label: 'CLI Shim (atomsyn-cli)', ok: status?.cliShimInstalled },
  ]

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Plug className="w-5 h-5 text-violet-500" /> Agent Skill
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          将 atomsyn-read / write / mentor 技能安装到你的 AI 编码工具中。
        </p>
      </header>

      <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 p-4 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-neutral-700 dark:text-neutral-300">{item.label}</span>
            {status === null ? (
              <span className="text-neutral-400 text-xs">检测中...</span>
            ) : item.ok ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" /> 已安装
              </span>
            ) : (
              <span className="flex items-center gap-1 text-neutral-400">
                <Circle className="w-3.5 h-3.5" /> 未安装
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleInstall}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
          {busy ? '安装中...' : '安装 / 更新 Skill'}
        </button>
        {lastResult && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">{lastResult}</span>
        )}
      </div>

      {/* Node.js detection warning */}
      {nodeInfo && !nodeInfo.available && (
        <div className="rounded-xl border border-amber-300/50 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-900/10 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <span className="text-base">⚠️</span> 未检测到 Node.js
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400/80">
            atomsyn-cli 需要 Node.js 运行环境。Skill 文件已安装成功，但 CLI 命令（供 Claude Code / Cursor 调用）在安装 Node.js 后才能正常工作。
          </p>
          <button
            onClick={openNodeSite}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors"
          >
            前往 nodejs.org 安装
          </button>
        </div>
      )}

      {nodeInfo?.available && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <Check className="w-3 h-3" /> Node.js {nodeInfo.version} 已就绪
        </p>
      )}

      <p className="text-xs text-neutral-400">
        将 atomsyn-write、atomsyn-read、atomsyn-mentor 复制到已检测的 AI 工具目录，
        同时安装 atomsyn-cli 命令行工具并更新 shell PATH。
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------
function AppearanceSection() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const uiScale = useAppStore((s) => s.uiScale)
  const setUIScale = useAppStore((s) => s.setUIScale)

  const SCALE_OPTIONS: { value: 90 | 100 | 110 | 120; label: string }[] = [
    { value: 90, label: '紧凑' },
    { value: 100, label: '标准' },
    { value: 110, label: '舒适' },
    { value: 120, label: '大字' },
  ]

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Palette className="w-5 h-5 text-sky-500" /> 外观
        </h1>
        <p className="text-sm text-neutral-500 mt-1">主题和界面缩放。</p>
      </header>

      {/* Theme */}
      <section className="space-y-2">
        <h2 className="text-xs font-medium text-neutral-600 dark:text-neutral-300">主题</h2>
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
      </section>

      {/* UI Scale */}
      <section className="space-y-2">
        <h2 className="text-xs font-medium text-neutral-600 dark:text-neutral-300">界面缩放</h2>
        <div className="flex gap-2">
          {SCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setUIScale(opt.value)}
              className={cn(
                'flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all',
                uiScale === opt.value
                  ? 'border-violet-500/60 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                  : 'border-neutral-200/70 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400',
              )}
            >
              <div>{opt.label}</div>
              <div className="text-[0.6875rem] font-normal mt-0.5 opacity-60">{opt.value}%</div>
            </button>
          ))}
        </div>
        <p className="text-[0.6875rem] text-neutral-500">
          调整全局界面文字和元素的缩放比例。
        </p>
      </section>
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
  const [dataDirInfo, setDataDirInfo] = useState<DataDirInfo | null>(null)

  useEffect(() => {
    getDataDirInfo().then(setDataDirInfo).catch(() => undefined)
  }, [])

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

  async function handleOpenFolder() {
    if (!dataDirInfo?.path) return
    const result = await openContainingFolder(dataDirInfo.path + '/dummy')
    showToast(result.message)
  }

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-500" /> 数据
        </h1>
        <p className="text-sm text-neutral-500 mt-1">本地数据存放位置和索引管理。</p>
      </header>
      <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 p-4 space-y-3">
        <div className="text-xs text-neutral-500">数据目录</div>
        <code className="block text-xs bg-neutral-100 dark:bg-white/5 px-3 py-2 rounded-lg break-all">
          {dataDirInfo?.path ?? '加载中...'}
        </code>
        {dataDirInfo && (
          <div className="text-[0.6875rem] text-neutral-400">
            来源：{describeDataSource(dataDirInfo)}
          </div>
        )}
        <button
          onClick={handleOpenFolder}
          disabled={!dataDirInfo}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300/70 dark:border-white/10 text-xs hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          在文件管理器中打开
        </button>
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
          <span className="text-neutral-500">Version：</span> v{APP_VERSION}
        </div>
        <div>
          <span className="text-neutral-500">PRD：</span>{' '}
          <code className="text-xs">docs/prd/PRD-v2.0.md</code>
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
// Agent Permissions — simplified global toggles (merged into AI/Model section)
// ---------------------------------------------------------------------------
interface GlobalAgentPerms {
  canRead: boolean
  canWrite: boolean
  requireConfirmWrite: boolean
  updatedAt: string
}

const AGENT_PERM_STORAGE = 'atomsyn:agent-permissions-global'

function loadGlobalAgentPerms(): GlobalAgentPerms {
  try {
    const raw = localStorage.getItem(AGENT_PERM_STORAGE)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { canRead: true, canWrite: true, requireConfirmWrite: false, updatedAt: new Date().toISOString() }
}
function saveGlobalAgentPerms(cfg: GlobalAgentPerms) {
  localStorage.setItem(AGENT_PERM_STORAGE, JSON.stringify(cfg))
}
/** Simplified global agent permissions — embedded in the Model section */
function AgentPermissionsInline() {
  const [perms, setPerms] = useState<GlobalAgentPerms>(() => loadGlobalAgentPerms())

  function update(patch: Partial<GlobalAgentPerms>) {
    setPerms((prev) => {
      const next = { ...prev, ...patch, updatedAt: new Date().toISOString() }
      saveGlobalAgentPerms(next)
      return next
    })
  }

  return (
    <section className="space-y-3 pt-2 border-t border-neutral-200/50 dark:border-white/5">
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-violet-500" />
        Agent 权限
      </h2>
      <p className="text-xs text-neutral-500">
        控制所有 AI Agent（Claude Code、Cursor 等）对 Atomsyn 知识库的访问权限。
      </p>
      <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/50 dark:bg-white/[0.02] p-4 space-y-1">
        <PermToggle
          icon={<Eye className="w-3.5 h-3.5" />}
          label="读权限"
          checked={perms.canRead}
          onChange={(v) => update({ canRead: v })}
        />
        <PermToggle
          icon={<Pen className="w-3.5 h-3.5" />}
          label="写权限"
          checked={perms.canWrite}
          onChange={(v) => update({ canWrite: v })}
        />
        <PermToggle
          icon={<ShieldCheck className="w-3.5 h-3.5" />}
          label="写入需确认"
          checked={perms.requireConfirmWrite}
          onChange={(v) => update({ requireConfirmWrite: v })}
        />
      </div>
    </section>
  )
}

function PermToggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between py-1.5 cursor-pointer">
      <span className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
        <span className="text-neutral-400">{icon}</span>
        {label}
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
              : `v${APP_VERSION}`}
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
