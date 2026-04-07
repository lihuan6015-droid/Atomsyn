/**
 * Onboarding wizard (US-01).
 * 4 steps: welcome → LLM config → tour hint → done.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Compass,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  TestTube2,
} from 'lucide-react'
import { llmConfigApi } from '@/lib/dataApi'
import {
  getStoredApiKey,
  setStoredApiKey,
  testCopilotConnection,
} from '@/lib/llmClient'
import type { LLMConfig, LLMProvider } from '@/types'

const STEPS = ['欢迎', 'AI 配置', '探索骨架', '完成']

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [config, setConfig] = useState<LLMConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [testOk, setTestOk] = useState<boolean | null>(null)

  useEffect(() => {
    llmConfigApi.get().then(setConfig).catch(() => setConfig(null))
    setApiKey(getStoredApiKey() ?? '')
  }, [])

  function skip() {
    localStorage.setItem('ccl-onboarded', 'true')
    navigate('/atlas')
  }

  function next() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  function finish() {
    localStorage.setItem('ccl-onboarded', 'true')
    navigate('/atlas')
  }

  async function handleTest() {
    if (!config) return
    if (apiKey.trim()) setStoredApiKey(apiKey.trim())
    setTesting(true)
    setTestMsg(null)
    const r = await testCopilotConnection()
    setTestOk(r.ok)
    setTestMsg(r.message)
    setTesting(false)
  }

  async function saveAndNext() {
    if (config) {
      try {
        await llmConfigApi.save(config)
      } catch {
        /* non-fatal */
      }
    }
    if (apiKey.trim()) setStoredApiKey(apiKey.trim())
    next()
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-violet-50 via-white to-sky-50 dark:from-[#0a0a0b] dark:via-[#0a0a0b] dark:to-[#0a0e1a]">
      {/* Top bar */}
      <header className="flex items-center justify-between p-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="text-sm font-semibold">CCL PM Tool</div>
        </div>
        <button
          onClick={skip}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          跳过引导 →
        </button>
      </header>

      {/* Progress */}
      <div className="px-5 max-w-2xl w-full mx-auto">
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => {
            const active = i === step
            const done = i < step
            return (
              <div key={label} className="flex-1 flex items-center gap-2">
                <div
                  className={
                    'h-1.5 flex-1 rounded-full transition-colors ' +
                    (done || active
                      ? 'bg-gradient-to-r from-violet-500 to-sky-500'
                      : 'bg-neutral-200 dark:bg-white/10')
                  }
                />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-[11px] text-neutral-500 mt-2">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={
                i === step ? 'text-violet-600 dark:text-violet-300 font-medium' : ''
              }
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-5">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="w-full max-w-xl rounded-3xl bg-white/80 dark:bg-white/5 glass border border-neutral-200/70 dark:border-white/10 shadow-2xl p-8 space-y-5"
        >
          {step === 0 && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center shadow-xl shadow-violet-500/30">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-semibold">欢迎来到方法论沉淀系统</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                把散落的方法论变成可被随时调用的「原子卡片」，让每一次实战都为下一次铺路。
                这个引导只需要 3 分钟。
              </p>
              <button
                onClick={next}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white text-sm font-medium shadow-lg shadow-violet-500/30 hover:scale-[1.02] active:scale-95 transition-transform"
              >
                开始 <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-semibold">配置 AI 副驾驶</h1>
              <p className="text-xs text-neutral-500">
                填入 API Key 后，副驾驶可以在你迷茫时帮你导航到正确的方法论。可稍后在设置中修改。
              </p>

              {!config ? (
                <div className="text-sm text-neutral-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> 加载配置…
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-neutral-500">Provider</label>
                      <select
                        value={config.activeProvider}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            activeProvider: e.target.value as LLMProvider,
                          })
                        }
                        className={inputClass}
                      >
                        <option value="anthropic">Anthropic</option>
                        <option value="openai">OpenAI</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-neutral-500">Model</label>
                      <input
                        value={config.providers[config.activeProvider].model}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            providers: {
                              ...config.providers,
                              [config.activeProvider]: {
                                ...config.providers[config.activeProvider],
                                model: e.target.value,
                              },
                            },
                          })
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500">API Key</label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className={inputClass + ' pr-10'}
                        placeholder="sk-..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-500"
                      >
                        {showKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-1">
                      🔒 仅存储在浏览器本地，不会写入项目文件。
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleTest}
                      disabled={testing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200/70 dark:border-white/10 text-xs hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50"
                    >
                      {testing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <TestTube2 className="w-3.5 h-3.5" />
                      )}
                      测试连接
                    </button>
                    {testMsg && (
                      <span
                        className={
                          'text-[11px] ' +
                          (testOk ? 'text-emerald-600' : 'text-red-500')
                        }
                      >
                        {testMsg}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  onClick={next}
                  className="text-xs text-neutral-500 hover:underline"
                >
                  暂时跳过
                </button>
                <button
                  onClick={saveAndNext}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white text-sm shadow-lg shadow-violet-500/30 hover:scale-[1.02] active:scale-95 transition-transform"
                >
                  下一步 <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Compass className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-semibold">你的第一张方法论已就绪</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                我们预置了《24 步创新框架》骨架。打开知识图书馆（Atlas）后，
                点击任意单元格即可阅读卡片。
              </p>
              <div className="rounded-2xl border border-dashed border-violet-400/50 bg-violet-500/5 p-4 text-xs text-neutral-600 dark:text-neutral-300">
                💡 提示：图书馆中的每个单元格都对应一类方法论。从「Discover」列开始浏览。
              </div>
              <div className="flex justify-end">
                <button
                  onClick={next}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white text-sm shadow-lg shadow-violet-500/30 hover:scale-[1.02] active:scale-95 transition-transform"
                >
                  下一步 <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-violet-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-semibold">一切就绪 🎉</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                现在你可以开始使用 CCL PM Tool 了。沉淀第一张原子，或者直接打开 Atlas 浏览。
              </p>
              <button
                onClick={finish}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white text-sm font-medium shadow-lg shadow-violet-500/30 hover:scale-[1.02] active:scale-95 transition-transform"
              >
                开始使用 <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </motion.div>
      </main>
    </div>
  )
}

const inputClass =
  'mt-1 w-full rounded-lg bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40'

export default OnboardingPage
