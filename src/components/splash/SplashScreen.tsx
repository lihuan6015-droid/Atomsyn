import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import atomsynLogo from '@/assets/atomsyn-logo.png'
import { cn } from '@/lib/cn'
import { isTauri } from '@/lib/dataPath'
import { runInitSequence, type InitStep, type InitStepId } from '@/lib/initRunner'
import { InitStepRow } from './InitStepRow'

const STEP_ORDER: InitStepId[] = ['data-dir', 'frameworks', 'methodology', 'skill-check']

const STEP_LABELS: Record<InitStepId, string> = {
  'data-dir': '准备数据目录',
  frameworks: '初始化方法论骨架',
  methodology: '加载知识图书馆',
  'skill-check': '检测 Agent Skill 安装',
}

const INITIAL_STEPS: InitStep[] = STEP_ORDER.map((id) => ({
  id,
  label: STEP_LABELS[id],
  status: 'pending',
}))

interface Props {
  onComplete: () => void
  /** Set false to force user to click the "进入" button even after all steps ok. */
  autoAdvance?: boolean
}

export function SplashScreen({ onComplete, autoAdvance = false }: Props) {
  const [steps, setSteps] = useState<InitStep[]>(INITIAL_STEPS)
  const [isDone, setIsDone] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [runToken, setRunToken] = useState(0)
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const webMode = !isTauri()

  const runSequence = useCallback(() => {
    setSteps(INITIAL_STEPS)
    setIsDone(false)
    setHasError(false)

    runInitSequence((step) => {
      setSteps((prev) => prev.map((s) => (s.id === step.id ? step : s)))
    })
      .then((finalSteps) => {
        const anyError = finalSteps.some((s) => s.status === 'error')
        setHasError(anyError)
        setIsDone(true)
      })
      .catch((err: unknown) => {
        console.error('[splash] runInitSequence failed', err)
        setHasError(true)
        setIsDone(true)
      })
  }, [])

  useEffect(() => {
    runSequence()
  }, [runSequence, runToken])

  // Auto-advance a short moment after done (if no errors)
  useEffect(() => {
    if (isDone && !hasError && autoAdvance) {
      autoAdvanceTimer.current = setTimeout(() => {
        onComplete()
      }, 1100)
    }
    return () => {
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current)
        autoAdvanceTimer.current = null
      }
    }
  }, [isDone, hasError, autoAdvance, onComplete])

  const completedCount = useMemo(
    () => steps.filter((s) => s.status === 'ok' || s.status === 'skipped').length,
    [steps],
  )
  const totalCount = steps.length
  const progressPct = Math.round((completedCount / totalCount) * 100)

  const currentRunningLabel = useMemo(() => {
    const running = steps.find((s) => s.status === 'running')
    return running ? STEP_LABELS[running.id] : null
  }, [steps])

  const footerText = hasError
    ? '初始化遇到问题，请重试'
    : isDone
      ? '✓ 准备就绪'
      : currentRunningLabel
        ? `正在${currentRunningLabel} …`
        : '正在准备你的知识库 …'

  // V1.5 · Splash now respects the persisted theme (light by default
  // on first launch; dark if user previously set it). The `dark` class
  // on <html> has already been applied by the inline script in
  // index.html before this component mounts, so tailwind `dark:`
  // utilities cascade correctly here.
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')

  return (
    <div
      role="dialog"
      aria-label="Atomsyn 启动中"
      aria-busy={!isDone}
      aria-live="polite"
      className={cn(
        'fixed inset-0 z-[100]',
        isDark ? 'bg-[#0a0a0b]' : 'bg-white',
      )}
      data-tauri-drag-region
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center',
          'hero-gradient',
          isDark ? 'text-neutral-100' : 'text-neutral-900',
        )}
      >
      {/* Radial violet glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(139, 92, 246, 0.25), transparent 60%)',
        }}
      />

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-8 px-6">
        {/* Brand block */}
        <div className="splash-brand flex flex-col items-center gap-3 text-center">
          <div
            className={cn(
              'h-20 w-20 rounded-2xl overflow-hidden',
              'shadow-lg shadow-violet-500/30 ring-1 ring-white/10',
            )}
          >
            <img src={atomsynLogo} alt="Atomsyn" className="w-full h-full object-cover" />
          </div>
          <h1 className={cn('text-3xl font-semibold tracking-tight', isDark ? 'text-white' : 'text-neutral-900')}>
            Atomsyn
          </h1>
          <p className={cn('text-xs uppercase tracking-[0.2em]', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
            认知双向操作系统
          </p>
        </div>

        {/* Tagline */}
        <p className={cn('max-w-md text-center text-sm leading-relaxed', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
          让你积累的认知，在需要时醒来
        </p>

        {webMode && (
          <div
            className={cn(
              'rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1',
              'text-[0.6875rem] font-medium uppercase tracking-wider text-amber-300',
            )}
          >
            开发模式 · Web Preview
          </div>
        )}

        {/* Step list */}
        <div className="flex w-full flex-col gap-2">
          {steps.map((step, i) => (
            <InitStepRow key={step.id} step={step} index={i} />
          ))}
        </div>

        {/* Footer */}
        <div className="flex min-h-[44px] flex-col items-center gap-3">
          <div
            className={cn(
              'text-sm',
              hasError
                ? isDark
                  ? 'text-rose-400'
                  : 'text-rose-600'
                : isDone
                  ? isDark
                    ? 'text-emerald-400'
                    : 'text-emerald-600'
                  : isDark
                    ? 'text-neutral-400'
                    : 'text-neutral-500',
            )}
          >
            {footerText}
          </div>

          {isDone && !hasError && (
            <button
              type="button"
              onClick={() => {
                if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current)
                onComplete()
              }}
              className={cn(
                'splash-cta group flex items-center gap-2 rounded-full px-5 py-2',
                'bg-gradient-to-r from-violet-500 to-sky-500 text-white text-sm font-medium',
                'shadow-lg shadow-violet-500/25 ring-1 ring-white/10',
                'transition-transform duration-300 hover:scale-[1.03]',
              )}
            >
              进入 Atomsyn
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}

          {hasError && (
            <button
              type="button"
              onClick={() => setRunToken((t) => t + 1)}
              className={cn(
                'rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-1.5',
                'text-sm font-medium text-rose-300 hover:bg-rose-500/15',
              )}
            >
              重试
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-violet-500 via-sky-500 to-emerald-500 transition-[width] duration-500 ease-out"
          style={{
            width: `${progressPct}%`,
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>

      <style>{`
        @keyframes splash-row-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes splash-brand-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .splash-row {
          opacity: 0;
          animation: splash-row-in 380ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .splash-brand {
          animation: splash-brand-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .splash-cta {
          animation: splash-row-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .splash-row, .splash-brand, .splash-cta {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
      </div>
    </div>
  )
}
