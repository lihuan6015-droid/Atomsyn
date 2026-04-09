import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Framework, FrameworkListCategory, AtomAny, MethodologyAtom } from '@/types'
import { isMethodologyAtom } from '@/types'

interface Props {
  framework: Framework & { layoutType: 'list' }
  atoms: AtomAny[]
}

export function ListFrameworkView({ framework, atoms }: Props) {
  const categories = framework.list?.categories ?? []

  const atomsByCategory = useMemo(() => {
    const map = new Map<string, MethodologyAtom[]>()
    for (const a of atoms) {
      if (!isMethodologyAtom(a)) continue
      if (a.frameworkId !== framework.id) continue
      const list = map.get(String(a.cellId)) ?? []
      list.push(a)
      map.set(String(a.cellId), list)
    }
    return map
  }, [atoms, framework.id])

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-400 dark:text-neutral-500">
        <Plus className="w-8 h-8 mb-3 opacity-50" />
        <p className="text-sm">暂无方法论，点击添加</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {categories.map((cat, i) => (
        <CategoryCard
          key={cat.id}
          category={cat}
          atoms={atomsByCategory.get(cat.id) ?? []}
          index={i}
          frameworkId={framework.id}
        />
      ))}
    </div>
  )
}

function CategoryCard({
  category,
  atoms,
  index,
  frameworkId,
}: {
  category: FrameworkListCategory
  atoms: MethodologyAtom[]
  index: number
  frameworkId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const count = atoms.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={cn(
          'group relative rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80',
          'bg-white/60 dark:bg-neutral-900/40 glass overflow-hidden',
          'hover:border-neutral-300 dark:hover:border-neutral-700 transition-all duration-300'
        )}
      >
        {/* Color accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
          style={{ backgroundColor: category.color }}
        />

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left pl-5 pr-4 py-4 flex items-center gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {category.name}
              </span>
              {category.nameEn && (
                <span className="text-[0.6875rem] text-neutral-400 dark:text-neutral-500">
                  {category.nameEn}
                </span>
              )}
            </div>
            {category.tagline && (
              <p className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                {category.tagline}
              </p>
            )}
          </div>

          {/* Atom count badge */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 dark:bg-neutral-800/80 border border-neutral-200/50 dark:border-neutral-700/50 shrink-0">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            <span
              className="text-[0.6875rem] font-semibold tabular-nums"
              style={{ color: category.color }}
            >
              {count}
            </span>
          </div>

          <ChevronRight
            className={cn(
              'w-4 h-4 text-neutral-400 dark:text-neutral-500 transition-transform duration-200 shrink-0',
              expanded && 'rotate-90'
            )}
          />
        </button>

        {/* Expanded atom list */}
        <AnimatePresence>
          {expanded && atoms.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="pl-5 pr-4 pb-3 border-t border-neutral-100 dark:border-neutral-800/60 pt-2 space-y-1">
                {atoms.map((atom) => (
                  <Link
                    key={atom.id}
                    to={`/atom/atoms/${atom.id}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors group/item"
                  >
                    <span
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="text-[0.8125rem] text-neutral-700 dark:text-neutral-300 truncate flex-1">
                      {atom.name}
                    </span>
                    <ChevronRight className="w-3 h-3 text-neutral-300 dark:text-neutral-600 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                  </Link>
                ))}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('ccl:open-new-atom', { detail: { frameworkId, cellId: category.id } }))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  添加方法论
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {expanded && atoms.length === 0 && (
          <div className="pl-5 pr-4 pb-3 border-t border-neutral-100 dark:border-neutral-800/60 pt-2">
            <p className="text-[0.6875rem] text-neutral-400 dark:text-neutral-500 py-2">暂无原子</p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('ccl:open-new-atom', { detail: { frameworkId, cellId: category.id } }))}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 transition-colors"
            >
              <Plus className="w-3 h-3" />
              添加方法论
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
