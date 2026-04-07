/**
 * V2.0 M3 · Role View — shows all atoms grouped by situation within a role.
 *
 * Used for both auto-grouped roles and user-created skeletons.
 */

import { useMemo } from 'react'
import { Inbox } from 'lucide-react'
import type { AtomAny } from '@/types'
import { KnowledgeCard } from './KnowledgeCard'

interface Props {
  atoms: AtomAny[]
  role: string
}

export function RoleView({ atoms, role }: Props) {
  const filtered = useMemo(() => {
    // Exclude skill-inventory (has its own Skill Map page)
    const nonSkill = atoms.filter((a) => a.kind !== 'skill-inventory')
    if (role === '未分类') {
      return nonSkill.filter((a) => !(a as any).role)
    }
    return nonSkill.filter((a) => (a as any).role === role)
  }, [atoms, role])

  // Sub-group by situation
  const groups = useMemo(() => {
    const map = new Map<string, AtomAny[]>()
    for (const a of filtered) {
      const situation = (a as any).situation as string || '通用'
      if (!map.has(situation)) map.set(situation, [])
      map.get(situation)!.push(a)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [filtered])

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
        <Inbox className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">{role} 分类下暂无知识</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(([situation, groupAtoms]) => (
        <section key={situation}>
          <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
            {situation}
            <span className="ml-2 text-neutral-400 font-mono">{groupAtoms.length}</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {groupAtoms.map((a) => (
              <KnowledgeCard key={a.id} atom={a} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
