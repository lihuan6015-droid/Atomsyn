import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import Fuse from 'fuse.js'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { atomsApi, trackUsage } from '@/lib/dataApi'
import type { Atom } from '@/types'

export function SpotlightPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [atoms, setAtoms] = useState<Atom[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    atomsApi.list().then(setAtoms).catch(() => undefined)
  }, [])

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('ccl:open-spotlight', onOpen)
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('ccl:open-spotlight', onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const fuse = useMemo(
    () =>
      new Fuse(atoms, {
        keys: ['name', 'nameEn', 'tags', 'coreIdea', 'whenToUse'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [atoms]
  )

  const results = useMemo(() => {
    if (!query.trim()) return atoms.slice(0, 12)
    return fuse.search(query).map((r) => r.item).slice(0, 20)
  }, [query, fuse, atoms])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <Command
        label="Spotlight"
        className="relative w-full max-w-xl rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 glass shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-neutral-200 dark:border-neutral-800">
          <Search className="w-4 h-4 text-neutral-400" />
          <Command.Input
            value={query}
            onValueChange={(v) => {
              setQuery(v)
              if (v.trim()) trackUsage({ type: 'atom-search', meta: { q: v } })
            }}
            placeholder="搜索原子、标签、场景..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-neutral-400"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-mono text-neutral-500">
            ESC
          </kbd>
        </div>
        <Command.List className="max-h-[50vh] overflow-y-auto p-2 scrollbar-subtle">
          <Command.Empty className="py-6 text-center text-sm text-neutral-400">
            未找到匹配的原子
          </Command.Empty>
          {results.map((atom) => (
            <Command.Item
              key={atom.id}
              value={`${atom.name} ${atom.nameEn ?? ''} ${atom.tags.join(' ')}`}
              onSelect={() => {
                setOpen(false)
                navigate(`/atoms/${atom.id}`)
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer aria-selected:bg-violet-500/10 aria-selected:text-violet-600 dark:aria-selected:text-violet-400"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{atom.name}</div>
                <div className="text-[11px] text-neutral-400 truncate">
                  {atom.nameEn} · {atom.tags.join(' · ')}
                </div>
              </div>
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  )
}
