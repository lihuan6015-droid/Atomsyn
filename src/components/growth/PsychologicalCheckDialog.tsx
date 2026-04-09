/**
 * Monthly 3-question self-check dialog (US-20).
 * Opens during the last 3 days of the month if no entry exists yet.
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, X } from 'lucide-react'
import { psychApi } from '@/lib/dataApi'
import type {
  ConfidenceAnswer,
  PsychologicalEntry,
  ThreeWayAnswer,
} from '@/types'
import { useAppStore } from '@/stores/useAppStore'

interface Props {
  open: boolean
  month: string // "2026-04"
  onClose: () => void
  onSaved: (entry: PsychologicalEntry) => void
}

export function PsychologicalCheckDialog({ open, month, onClose, onSaved }: Props) {
  const showToast = useAppStore((s) => s.showToast)
  const [freq, setFreq] = useState<ThreeWayAnswer>('same')
  const [conf, setConf] = useState<ThreeWayAnswer>('same')
  const [tool, setTool] = useState<ConfidenceAnswer>('same')
  const [busy, setBusy] = useState(false)

  async function handleSave() {
    setBusy(true)
    try {
      const entry = await psychApi.add({
        month,
        forgettingFrequency: freq,
        jobConfidence: conf,
        withoutToolFeeling: tool,
      })
      showToast('✓ 已记录本月自查')
      onSaved(entry)
      onClose()
    } catch (e: any) {
      showToast('保存失败：' + (e?.message ?? 'unknown'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="pointer-events-auto w-full max-w-md rounded-3xl bg-white dark:bg-[#0c0c0e] border border-neutral-200/70 dark:border-white/10 shadow-2xl p-6 space-y-5"
            >
              <header className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center shadow-lg shadow-pink-500/30">
                    <Heart className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-base font-semibold">月末心理自查</div>
                    <div className="text-[0.6875rem] text-neutral-500">
                      {month} · 3 个问题，30 秒
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </header>

              <Question
                title="1. 这个月「忘记方法论」的频率"
                value={freq}
                onChange={setFreq}
                options={[
                  { v: 'down', label: '😌 减少了', tone: 'good' },
                  { v: 'same', label: '😐 差不多', tone: 'neutral' },
                  { v: 'up', label: '😟 更多了', tone: 'bad' },
                ]}
              />
              <Question
                title="2. 对自己专业能力的信心"
                value={conf}
                onChange={setConf}
                options={[
                  { v: 'down', label: '😟 下降', tone: 'bad' },
                  { v: 'same', label: '😐 持平', tone: 'neutral' },
                  { v: 'up', label: '😌 上升', tone: 'good' },
                ]}
              />
              <Question
                title="3. 不带工具一周时的感觉"
                value={tool}
                onChange={setTool}
                options={[
                  { v: 'morePanic', label: '😰 更慌', tone: 'bad' },
                  { v: 'same', label: '😐 一样', tone: 'neutral' },
                  { v: 'moreCertain', label: '😎 更笃定', tone: 'good' },
                ]}
              />

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={onClose}
                  className="text-xs text-neutral-500 hover:underline"
                >
                  稍后再说
                </button>
                <button
                  onClick={handleSave}
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 text-white text-sm shadow-lg shadow-pink-500/30 disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

function Question<T extends string>({
  title,
  value,
  onChange,
  options,
}: {
  title: string
  value: T
  onChange: (v: T) => void
  options: { v: T; label: string; tone: 'good' | 'neutral' | 'bad' }[]
}) {
  return (
    <div>
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => {
          const active = value === o.v
          return (
            <button
              key={o.v}
              onClick={() => onChange(o.v)}
              className={
                'rounded-xl border px-2 py-2 text-xs transition-all ' +
                (active
                  ? 'border-violet-500/60 bg-violet-500/10 text-violet-700 dark:text-violet-300 font-medium'
                  : 'border-neutral-200/70 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5')
              }
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default PsychologicalCheckDialog
