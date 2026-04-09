import { useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ChevronRight, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Framework, FrameworkTreeNode, AtomAny, MethodologyAtom } from '@/types'
import { isMethodologyAtom } from '@/types'

interface Props {
  framework: Framework & { layoutType: 'tree' }
  atoms: AtomAny[]
}

export function TreeFrameworkView({ framework, atoms }: Props) {
  const roots = framework.tree?.roots ?? []

  const atomsByNode = useMemo(() => {
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

  if (roots.length === 0) {
    return (
      <button
        className="flex flex-col items-center justify-center py-20 text-neutral-400 dark:text-neutral-500 hover:text-violet-500 transition-colors w-full"
        onClick={() => window.dispatchEvent(new CustomEvent('ccl:open-new-atom', { detail: { frameworkId: framework.id } }))}
      >
        <Plus className="w-8 h-8 mb-3 opacity-50" />
        <p className="text-sm">暂无方法论，点击添加</p>
      </button>
    )
  }

  return (
    <div className="space-y-3">
      {roots.map((node, i) => (
        <TreeNodeCard
          key={node.id}
          node={node}
          atomsByNode={atomsByNode}
          depth={0}
          index={i}
          inheritedColor={node.color}
          frameworkId={framework.id}
        />
      ))}
    </div>
  )
}

function countNodeAtoms(
  node: FrameworkTreeNode,
  atomsByNode: Map<string, MethodologyAtom[]>
): number {
  let count = atomsByNode.get(node.id)?.length ?? 0
  if (node.children) {
    for (const child of node.children) {
      count += countNodeAtoms(child, atomsByNode)
    }
  }
  return count
}

function TreeNodeCard({
  node,
  atomsByNode,
  depth,
  index,
  inheritedColor,
  frameworkId,
}: {
  node: FrameworkTreeNode
  atomsByNode: Map<string, MethodologyAtom[]>
  depth: number
  index: number
  inheritedColor?: string
  frameworkId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const nodeAtoms = atomsByNode.get(node.id) ?? []
  const hasChildren = node.children && node.children.length > 0
  const totalAtoms = countNodeAtoms(node, atomsByNode)
  const color = node.color || inheritedColor || '#A78BFA'

  const toggle = useCallback(() => setExpanded((v) => !v), [])

  const isRoot = depth === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
      style={{ marginLeft: depth > 0 ? 24 : 0 }}
    >
      <div
        className={cn(
          'group relative rounded-2xl border transition-all duration-300',
          isRoot
            ? 'border-neutral-200/80 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/40 glass'
            : 'border-neutral-100/60 dark:border-neutral-800/50 bg-white/40 dark:bg-neutral-900/20'
        )}
      >
        {/* Color accent bar for root nodes */}
        {isRoot && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
            style={{ backgroundColor: color }}
          />
        )}

        {/* Dashed connector for non-root nodes */}
        {depth > 0 && (
          <div
            className="absolute -left-4 top-1/2 w-4 border-t border-dashed border-neutral-300 dark:border-neutral-700"
          />
        )}

        <button
          onClick={toggle}
          className={cn(
            'w-full text-left flex items-center gap-3',
            isRoot ? 'pl-5 pr-4 py-4' : 'pl-4 pr-3 py-3'
          )}
        >
          {/* Expand/collapse icon */}
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="w-4 h-4 text-neutral-400 dark:text-neutral-500 shrink-0 transition-transform" />
            ) : (
              <ChevronRight className="w-4 h-4 text-neutral-400 dark:text-neutral-500 shrink-0 transition-transform" />
            )
          ) : (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'font-semibold text-neutral-900 dark:text-neutral-100',
                  isRoot ? 'text-sm' : 'text-[0.8125rem]'
                )}
              >
                {node.name}
              </span>
              {node.nameEn && (
                <span className="text-[0.6875rem] text-neutral-400 dark:text-neutral-500">
                  {node.nameEn}
                </span>
              )}
            </div>
            {node.tagline && (
              <p className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                {node.tagline}
              </p>
            )}
          </div>

          {/* Atom count badge */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 dark:bg-neutral-800/80 border border-neutral-200/50 dark:border-neutral-700/50 shrink-0">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span
              className="text-[0.6875rem] font-semibold tabular-nums"
              style={{ color }}
            >
              {totalAtoms}
            </span>
          </div>
        </button>

        {/* Children and leaf atoms */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              {/* Atoms for this node + add button */}
              <div className={cn(
                'border-t border-neutral-100 dark:border-neutral-800/60 pt-2 pb-2 space-y-1',
                isRoot ? 'pl-5 pr-4' : 'pl-4 pr-3'
              )}>
                {nodeAtoms.length > 0 ? (
                  <>
                    {nodeAtoms.map((atom) => (
                      <Link
                        key={atom.id}
                        to={`/atom/atoms/${atom.id}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors group/item"
                      >
                        <span
                          className="w-1 h-1 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-[0.8125rem] text-neutral-700 dark:text-neutral-300 truncate flex-1">
                          {atom.name}
                        </span>
                        <ChevronRight className="w-3 h-3 text-neutral-300 dark:text-neutral-600 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      </Link>
                    ))}
                  </>
                ) : (
                  <p className="px-3 py-1 text-[0.6875rem] text-neutral-400 dark:text-neutral-500">
                    暂无原子
                  </p>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    window.dispatchEvent(new CustomEvent('ccl:open-new-atom', { detail: { frameworkId, cellId: node.id } }))
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  添加方法论
                </button>
              </div>

              {/* Child nodes */}
              {hasChildren && (
                <div className={cn(
                  'pb-3 space-y-2',
                  isRoot ? 'pl-3 pr-2' : 'pl-2 pr-1',
                  'pt-1'
                )}>
                  {node.children!.map((child, ci) => (
                    <TreeNodeCard
                      key={child.id}
                      node={child}
                      atomsByNode={atomsByNode}
                      depth={depth + 1}
                      index={ci}
                      inheritedColor={color}
                      frameworkId={frameworkId}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
