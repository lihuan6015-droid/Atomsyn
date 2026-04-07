/**
 * Onboarding wizard (US-01).
 * 4 steps: welcome → LLM config → tour hint → done.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import atomsynLogoImg from '@/assets/atomsyn-logo.png'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { useModelConfigStore } from '@/stores/useModelConfigStore'

const STEPS = ['欢迎', 'AI 配置', '探索骨架', '完成']

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const hasModels = useModelConfigStore((s) => s.models.length > 0)

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

  function goToSettings() {
    localStorage.setItem('ccl-onboarded', 'true')
    navigate('/settings')
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-violet-50 via-white to-sky-50 dark:from-[#0a0a0b] dark:via-[#0a0a0b] dark:to-[#0a0e1a]">
      {/* Top bar */}
      <header className="flex items-center justify-between p-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl overflow-hidden shadow-lg shadow-violet-500/30">
            <img src={atomsynLogoImg} alt="Atomsyn" className="w-full h-full object-cover" />
          </div>
          <div className="text-sm font-semibold">Atomsyn</div>
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
              <h1 className="text-xl font-semibold">配置 AI 模型</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                Atomsyn 支持 10+ 家模型提供商（OpenAI / Anthropic / 通义千问 / DeepSeek 等）。
                配置后副驾驶可以在你迷茫时帮你导航到正确的方法论。
              </p>
              {hasModels ? (
                <div className="rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-4 py-3 text-sm">
                  已配置模型，可继续下一步。
                </div>
              ) : (
                <div className="rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 px-4 py-3 text-sm">
                  尚未配置模型。可在设置页添加，也可稍后配置。
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  onClick={next}
                  className="text-xs text-neutral-500 hover:underline"
                >
                  暂时跳过
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToSettings}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300/70 dark:border-white/10 text-sm hover:bg-neutral-100 dark:hover:bg-white/5"
                  >
                    前往设置
                  </button>
                  <button
                    onClick={next}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white text-sm shadow-lg shadow-violet-500/30 hover:scale-[1.02] active:scale-95 transition-transform"
                  >
                    下一步 <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg shadow-emerald-500/30">
                <img src={atomsynLogoImg} alt="Atomsyn" className="w-full h-full object-cover" />
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
                现在你可以开始使用 Atomsyn 了。沉淀第一张原子，或者直接打开 Atlas 浏览。
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
