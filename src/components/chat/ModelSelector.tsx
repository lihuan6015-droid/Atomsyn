/**
 * V2.x · ModelSelector — small dropdown badge for selecting the LLM model.
 *
 * Shows current model name as a compact badge/tag in the input bar.
 * Click opens dropdown with all enabled LLM models. First option is
 * "Auto (默认)" which sets null to use the default from settings.
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Cpu, Check } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useModelConfigStore } from '@/stores/useModelConfigStore'
import { PROVIDER_MAP } from '@/lib/modelProviders'
import { cn } from '@/lib/cn'

interface ModelSelectorProps {
  currentModelId: string | null
  onSelect: (modelId: string | null) => void
}

export function ModelSelector({ currentModelId, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const models = useModelConfigStore((s) => s.models)

  const enabledLlms = models.filter((m) => m.enabled && m.type === 'llm')
  const currentModel = currentModelId
    ? enabledLlms.find((m) => m.id === currentModelId)
    : null
  const displayName = currentModel ? currentModel.name : 'Auto'
  const currentProviderMeta = currentModel ? PROVIDER_MAP.get(currentModel.provider) : null

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 rounded-md',
          'text-[0.625rem] font-medium',
          'border border-neutral-200/80 dark:border-white/10',
          'bg-neutral-50/80 dark:bg-white/[0.04]',
          'text-neutral-500 dark:text-neutral-400',
          'hover:bg-neutral-100 dark:hover:bg-white/8',
          'transition-colors duration-150',
        )}
      >
        {currentProviderMeta ? (
          <img src={currentProviderMeta.logo} alt="" className="h-2.5 w-2.5 shrink-0 rounded-sm object-contain" />
        ) : (
          <Cpu size={10} className="shrink-0 opacity-60" />
        )}
        <span className="truncate max-w-[80px]">{displayName}</span>
        <ChevronDown
          size={10}
          className={cn('shrink-0 opacity-40 transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={cn(
              'absolute bottom-full right-0 mb-1.5 z-50',
              'min-w-[180px] max-w-[240px]',
              'rounded-lg border border-neutral-200/80 dark:border-white/10',
              'bg-white/95 dark:bg-neutral-900/95',
              'backdrop-blur-xl shadow-lg',
              'py-1 overflow-hidden',
            )}
          >
            {/* Auto option */}
            <button
              type="button"
              onClick={() => { onSelect(null); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-left',
                'text-xs text-neutral-600 dark:text-neutral-400',
                'hover:bg-neutral-50 dark:hover:bg-white/5',
                'transition-colors duration-100',
                currentModelId === null && 'bg-violet-500/5 dark:bg-violet-500/10',
              )}
            >
              <span className="flex-1">Auto (默认)</span>
              {currentModelId === null && (
                <Check size={12} className="text-violet-500 dark:text-violet-400" />
              )}
            </button>

            {enabledLlms.length > 0 && (
              <div className="border-t border-neutral-100 dark:border-white/5 my-0.5" />
            )}

            {enabledLlms.map((m) => {
              const providerMeta = PROVIDER_MAP.get(m.provider)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onSelect(m.id); setOpen(false) }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-left',
                    'text-xs text-neutral-600 dark:text-neutral-400',
                    'hover:bg-neutral-50 dark:hover:bg-white/5',
                    'transition-colors duration-100',
                    currentModelId === m.id && 'bg-violet-500/5 dark:bg-violet-500/10',
                  )}
                >
                  {providerMeta && (
                    <img
                      src={providerMeta.logo}
                      alt={providerMeta.name}
                      className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
                    />
                  )}
                  <span className="flex-1 truncate">{m.name}</span>
                  {currentModelId === m.id && (
                    <Check size={12} className="text-violet-500 dark:text-violet-400" />
                  )}
                </button>
              )
            })}

            {enabledLlms.length === 0 && (
              <p className="px-3 py-2 text-[0.625rem] text-neutral-400 dark:text-neutral-500">
                未配置可用模型，请在设置中添加
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
