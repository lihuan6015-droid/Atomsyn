/**
 * V2.0 M6-Pre Phase 2 · Garden Page (content router)
 *
 * Routes to the appropriate view based on store state:
 * - activeFrameworkId → AtlasPage (framework matrix)
 * - activeRole → RoleView (role-based grouping)
 * - activeSkeletonId → SkeletonView (custom skeleton)
 * - sectionFocus: method-library → MethodLibraryWelcome
 * - sectionFocus: memory-garden → MemoryGardenWelcome
 * - default → AtomOverviewPage (元认知总览)
 */

import { useEffect, useState } from 'react'
import { BookOpen, Flower2 } from 'lucide-react'
import { atomsApi } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { AtomAny } from '@/types'
import AtlasPage from '@/pages/AtlasPage'
import { RoleView } from '@/components/garden/RoleView'
import { SkeletonView } from '@/components/garden/SkeletonView'
import { AtomOverviewPage } from '@/components/atom/AtomOverviewPage'
import { MethodLibraryWelcome } from '@/components/atom/MethodLibraryWelcome'
import { MemoryGardenWelcome } from '@/components/atom/MemoryGardenWelcome'

export function GardenPage() {
  const activeFrameworkId = useAppStore((s) => s.activeFrameworkId)
  const activeRole = useAppStore((s) => s.activeRole)
  const activeSkeletonId = useAppStore((s) => s.activeSkeletonId)
  const activeSectionFocus = useAppStore((s) => s.activeSectionFocus)
  const customSkeletons = useAppStore((s) => s.customSkeletons)

  const [atoms, setAtoms] = useState<AtomAny[]>([])

  useEffect(() => {
    atomsApi.list().then((a) => setAtoms(a as AtomAny[])).catch(() => undefined)
  }, [])

  const activeSkeleton = customSkeletons.find((s) => s.id === activeSkeletonId)

  // Determine what to render
  let title = ''
  let titleIcon: React.ReactNode = null
  let content: React.ReactNode

  if (activeFrameworkId) {
    content = <AtlasPage />
  } else if (activeRole) {
    title = activeRole === '未分类' ? '未分类知识' : activeRole
    titleIcon = <Flower2 className="w-5 h-5 text-emerald-500" />
    content = <RoleView atoms={atoms} role={activeRole} />
  } else if (activeSkeleton) {
    title = activeSkeleton.name
    titleIcon = <BookOpen className="w-5 h-5 text-violet-500" />
    content = <SkeletonView skeleton={activeSkeleton} allAtoms={atoms} />
  } else if (activeSectionFocus === 'method-library') {
    content = <MethodLibraryWelcome />
  } else if (activeSectionFocus === 'memory-garden') {
    content = <MemoryGardenWelcome />
  } else {
    content = <AtomOverviewPage />
  }

  const showHeader = !!title

  return (
    <div className="h-full flex flex-col">
      {showHeader && (
        <div className="shrink-0 px-6 pt-8 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {titleIcon}
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
        </div>
      )}

      <div className={showHeader ? 'flex-1 overflow-y-auto px-6 pb-8' : 'flex-1 overflow-y-auto'}>
        {content}
      </div>
    </div>
  )
}

export default GardenPage
