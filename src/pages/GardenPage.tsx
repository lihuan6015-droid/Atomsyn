/**
 * V2.0 M3 · Memory Garden (记忆花园)
 *
 * Unified view: routes to AtlasPage (system preset skeletons),
 * RoleView (auto-grouped by role), or SkeletonView (user-created).
 * Quick ingest "+" button opens QuickIngestDialog.
 */

import { useEffect, useState } from 'react'
import { Flower2, Plus } from 'lucide-react'
import { atomsApi } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { AtomAny } from '@/types'
import AtlasPage from '@/pages/AtlasPage'
import { RoleView } from '@/components/garden/RoleView'
import { SkeletonView } from '@/components/garden/SkeletonView'
import { QuickIngestDialog } from '@/components/ingest/QuickIngestDialog'

export function GardenPage() {
  const activeFrameworkId = useAppStore((s) => s.activeFrameworkId)
  const activeRole = useAppStore((s) => s.activeRole)
  const activeSkeletonId = useAppStore((s) => s.activeSkeletonId)
  const customSkeletons = useAppStore((s) => s.customSkeletons)

  const [atoms, setAtoms] = useState<AtomAny[]>([])
  const [ingestOpen, setIngestOpen] = useState(false)

  useEffect(() => {
    atomsApi.list().then((a) => setAtoms(a as AtomAny[])).catch(() => undefined)
  }, [])

  function handleIngested() {
    atomsApi.list().then((a) => setAtoms(a as AtomAny[])).catch(() => undefined)
  }

  const activeSkeleton = customSkeletons.find((s) => s.id === activeSkeletonId)

  // Determine what to render
  let title = '记忆花园'
  let content: React.ReactNode

  if (activeFrameworkId) {
    // System preset skeleton → AtlasPage matrix view
    content = <AtlasPage />
    title = '' // AtlasPage has its own header
  } else if (activeRole) {
    title = activeRole === '未分类' ? '未分类知识' : activeRole
    content = <RoleView atoms={atoms} role={activeRole} />
  } else if (activeSkeleton) {
    title = activeSkeleton.name
    content = <SkeletonView skeleton={activeSkeleton} allAtoms={atoms} />
  } else {
    // Welcome / overview
    content = (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
        <Flower2 className="w-12 h-12 mb-4 text-violet-400 opacity-40" />
        <p className="text-base font-medium text-neutral-500">欢迎来到记忆花园</p>
        <p className="text-sm mt-1">从左侧选择一个骨架或角色分类开始浏览</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header bar (only when not showing AtlasPage which has its own) */}
      {!activeFrameworkId && (
        <div className="shrink-0 px-6 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Flower2 className="w-5 h-5 text-violet-500" />
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
          <button
            onClick={() => setIngestOpen(true)}
            className="h-8 px-3 rounded-lg bg-gradient-to-br from-violet-500 to-sky-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-violet-500/20 hover:scale-[1.02] active:scale-95 transition-transform"
          >
            <Plus className="w-3.5 h-3.5" />
            快速沉淀
          </button>
        </div>
      )}

      {/* Content */}
      <div className={activeFrameworkId ? 'flex-1 overflow-y-auto' : 'flex-1 overflow-y-auto px-6 pb-8'}>
        {content}
      </div>

      <QuickIngestDialog
        open={ingestOpen}
        onClose={() => setIngestOpen(false)}
        onIngested={handleIngested}
      />
    </div>
  )
}

export default GardenPage
