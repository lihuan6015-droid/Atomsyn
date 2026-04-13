/**
 * Analysis engine — port of scripts/lib/analysis.mjs for browser runtime.
 * Uses Tauri FS helpers instead of Node.js fs.
 */

import {
  getDataDir,
  joinPathSync,
  readJSON,
  walk,
  fileExists,
} from './fsHelpers'
import { readTextFile, readDir } from '@tauri-apps/plugin-fs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(a: string | Date, b: string | Date): number {
  return Math.floor(
    Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24)
  )
}

async function readJSONSafe(filePath: string): Promise<any> {
  try {
    return JSON.parse(await readTextFile(filePath))
  } catch {
    return null
  }
}

async function loadFragments(
  dataDir: string,
  opts: { includePrivate?: boolean } = {}
): Promise<any[]> {
  const experienceDir = joinPathSync(dataDir, 'atoms', 'experience')
  const files = await walk(experienceDir)
  const fragments: any[] = []
  for (const f of files) {
    const atom = await readJSONSafe(f)
    if (!atom || atom.kind !== 'experience') continue
    if (!opts.includePrivate && atom.private) continue
    if (atom.stats?.userDemoted) continue
    fragments.push(atom)
  }
  return fragments
}

async function loadMethodologies(dataDir: string): Promise<any[]> {
  const atomsDir = joinPathSync(dataDir, 'atoms')
  if (!(await fileExists(atomsDir))) return []
  const entries = await readDir(atomsDir)
  const methodologies: any[] = []
  for (const e of entries) {
    if (!e.isDirectory || e.name === 'experience' || e.name === 'skill-inventory')
      continue
    const fwDir = joinPathSync(atomsDir, e.name)
    const files = await walk(fwDir)
    for (const f of files) {
      const atom = await readJSONSafe(f)
      if (atom && atom.kind === 'methodology') methodologies.push(atom)
    }
  }
  return methodologies
}

async function loadFrameworks(dataDir: string): Promise<any[]> {
  const fwDir = joinPathSync(dataDir, 'frameworks')
  if (!(await fileExists(fwDir))) return []
  const entries = await readDir(fwDir)
  const frameworks: any[] = []
  for (const e of entries) {
    if (!e.isFile || !e.name.endsWith('.json')) continue
    const fw = await readJSONSafe(joinPathSync(fwDir, e.name))
    if (fw) frameworks.push(fw)
  }
  return frameworks
}

function getFrameworkNodes(fw: any): Array<{ id: any; name: string }> {
  const nodes: Array<{ id: any; name: string }> = []
  if (fw.layoutType === 'matrix' && fw.matrix?.cells) {
    for (const cell of fw.matrix.cells)
      nodes.push({ id: cell.stepNumber, name: cell.name })
  } else if (fw.layoutType === 'list' && fw.list?.categories) {
    for (const cat of fw.list.categories)
      nodes.push({ id: cat.id, name: cat.name })
  } else if (fw.layoutType === 'tree' && fw.tree?.roots) {
    const collect = (arr: any[]) => {
      for (const n of arr) {
        nodes.push({ id: n.id, name: n.name })
        if (n.children) collect(n.children)
      }
    }
    collect(fw.tree.roots)
  }
  return nodes
}

// ---------------------------------------------------------------------------
// 1. Dimension Analysis
// ---------------------------------------------------------------------------

export async function analyzeDimensions(dataDir: string) {
  const fragments = await loadFragments(dataDir)
  const now = new Date()

  const byRole: Record<string, number> = {}
  const bySituation: Record<string, number> = {}
  const byActivity: Record<string, number> = {}
  const byInsightType: Record<string, number> = {}
  let recent = 0, moderate = 0, stale = 0

  for (const f of fragments) {
    if (f.role) byRole[f.role] = (byRole[f.role] || 0) + 1
    if (f.situation) bySituation[f.situation] = (bySituation[f.situation] || 0) + 1
    if (f.activity) byActivity[f.activity] = (byActivity[f.activity] || 0) + 1
    if (f.insight_type) byInsightType[f.insight_type] = (byInsightType[f.insight_type] || 0) + 1
    const age = daysBetween(now, f.createdAt || f.updatedAt || now)
    if (age <= 30) recent++
    else if (age <= 90) moderate++
    else stale++
  }

  const roles = Object.keys(byRole).sort((a, b) => byRole[b] - byRole[a])
  const situations = Object.keys(bySituation).sort((a, b) => bySituation[b] - bySituation[a])
  const counts = roles.map(() => situations.map(() => 0))
  for (const f of fragments) {
    const ri = roles.indexOf(f.role)
    const si = situations.indexOf(f.situation)
    if (ri >= 0 && si >= 0) counts[ri][si]++
  }

  return {
    total: fragments.length,
    byRole,
    bySituation,
    byActivity,
    byInsightType,
    crossMatrix: { roles, situations, counts },
    recency: { recent, moderate, stale },
  }
}

// ---------------------------------------------------------------------------
// 2. Timeline Analysis
// ---------------------------------------------------------------------------

export async function analyzeTimeline(dataDir: string, months = 12) {
  const fragments = await loadFragments(dataDir)
  const methodologies = await loadMethodologies(dataDir)
  const now = new Date()

  const monthLabels: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthLabels.push(d.toISOString().slice(0, 7))
  }

  const fragsByMonth: Record<string, any[]> = {}
  for (const m of monthLabels) fragsByMonth[m] = []
  for (const f of fragments) {
    const m = (f.createdAt || '').slice(0, 7)
    if (fragsByMonth[m]) fragsByMonth[m].push(f)
  }

  const methByMonth: Record<string, number> = {}
  for (const m of monthLabels) methByMonth[m] = 0
  for (const m of methodologies) {
    const month = (m.createdAt || '').slice(0, 7)
    if (methByMonth[month] !== undefined) methByMonth[month]++
  }

  const monthlyData = monthLabels.map((m) => {
    const frags = fragsByMonth[m] || []
    const roleCounts: Record<string, number> = {}
    const insightCounts: Record<string, number> = {}
    for (const f of frags) {
      if (f.role) roleCounts[f.role] = (roleCounts[f.role] || 0) + 1
      if (f.insight_type)
        insightCounts[f.insight_type] = (insightCounts[f.insight_type] || 0) + 1
    }
    return {
      month: m,
      fragmentCount: frags.length,
      methodologyCount: methByMonth[m] || 0,
      topRoles: Object.entries(roleCounts)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)
        .map((e) => e[0]),
      topInsightTypes: Object.entries(insightCounts)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)
        .map((e) => e[0]),
    }
  })

  // Streak
  const daySet = new Set<string>()
  for (const f of fragments) {
    if (f.createdAt) daySet.add(f.createdAt.slice(0, 10))
  }
  const sortedDays = Array.from(daySet).sort()
  let currentStreak = 0
  let longestStreak = 0

  if (sortedDays.length > 0) {
    const today = now.toISOString().slice(0, 10)
    let streak = 0
    const checkDate = new Date(today)
    while (true) {
      const key = checkDate.toISOString().slice(0, 10)
      if (daySet.has(key)) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else break
    }
    currentStreak = streak
    let run = 1
    longestStreak = 1
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1])
      const curr = new Date(sortedDays[i])
      if (daysBetween(prev, curr) === 1) {
        run++
        if (run > longestStreak) longestStreak = run
      } else run = 1
    }
    if (sortedDays.length === 0) longestStreak = 0
  }

  const last7d = fragments.filter(
    (f) => f.createdAt && daysBetween(now, f.createdAt) <= 7
  ).length
  const last30d = fragments.filter(
    (f) => f.createdAt && daysBetween(now, f.createdAt) <= 30
  ).length
  const prev30d = fragments.filter(
    (f) =>
      f.createdAt &&
      daysBetween(now, f.createdAt) > 30 &&
      daysBetween(now, f.createdAt) <= 60
  ).length
  const trend =
    last30d > prev30d * 1.1 ? 'up' : last30d < prev30d * 0.9 ? 'down' : 'stable'

  return {
    months: monthlyData,
    streak: { current: currentStreak, longest: longestStreak },
    velocity: { last7d, last30d, trend },
  }
}

// ---------------------------------------------------------------------------
// 3. Coverage Analysis
// ---------------------------------------------------------------------------

export async function analyzeCoverage(dataDir: string) {
  const frameworks = await loadFrameworks(dataDir)
  const methodologies = await loadMethodologies(dataDir)
  const fragments = await loadFragments(dataDir)

  const fragCountByMethod: Record<string, number> = {}
  for (const f of fragments) {
    for (const mid of f.linked_methodologies || []) {
      fragCountByMethod[mid] = (fragCountByMethod[mid] || 0) + 1
    }
  }

  const methodByFwCell: Record<string, string[]> = {}
  for (const m of methodologies) {
    const key = `${m.frameworkId}::${m.cellId}`
    if (!methodByFwCell[key]) methodByFwCell[key] = []
    methodByFwCell[key].push(m.id)
  }

  let totalNodes = 0
  let totalCovered = 0
  let totalFrags = 0

  const fwResults = frameworks.map((fw: any) => {
    const nodes = getFrameworkNodes(fw)
    let coveredNodes = 0
    let fwFragments = 0
    for (const node of nodes) {
      const key = `${fw.id}::${node.id}`
      const methIds = methodByFwCell[key] || []
      let nodeFragCount = 0
      for (const mid of methIds) nodeFragCount += fragCountByMethod[mid] || 0
      if (nodeFragCount > 0) coveredNodes++
      fwFragments += nodeFragCount
    }
    totalNodes += nodes.length
    totalCovered += coveredNodes
    totalFrags += fwFragments
    return {
      id: fw.id,
      name: fw.name,
      layoutType: fw.layoutType,
      nodeCount: nodes.length,
      coveredNodes,
      coveragePercent:
        nodes.length > 0 ? Math.round((coveredNodes / nodes.length) * 100) : 0,
      totalFragments: fwFragments,
    }
  })

  return {
    frameworks: fwResults,
    overall: {
      totalNodes,
      coveredNodes: totalCovered,
      coveragePercent:
        totalNodes > 0 ? Math.round((totalCovered / totalNodes) * 100) : 0,
      totalFragments: totalFrags,
    },
  }
}

// ---------------------------------------------------------------------------
// 4. Gap Analysis
// ---------------------------------------------------------------------------

export async function analyzeGaps(dataDir: string) {
  const frameworks = await loadFrameworks(dataDir)
  const methodologies = await loadMethodologies(dataDir)
  const fragments = await loadFragments(dataDir)
  const now = new Date()

  const fragCountByMethod: Record<string, number> = {}
  for (const f of fragments) {
    for (const mid of f.linked_methodologies || []) {
      fragCountByMethod[mid] = (fragCountByMethod[mid] || 0) + 1
    }
  }

  const methByFwNode: Record<
    string,
    { frameworkId: string; cellId: any; methods: any[] }
  > = {}
  for (const m of methodologies) {
    const key = `${m.frameworkId}::${m.cellId}`
    if (!methByFwNode[key])
      methByFwNode[key] = {
        frameworkId: m.frameworkId,
        cellId: m.cellId,
        methods: [],
      }
    methByFwNode[key].methods.push(m)
  }

  const fwNameMap: Record<string, string> = {}
  for (const fw of frameworks) fwNameMap[fw.id] = fw.name
  const nodeNameMap: Record<string, string> = {}
  for (const fw of frameworks) {
    for (const n of getFrameworkNodes(fw))
      nodeNameMap[`${fw.id}::${n.id}`] = n.name
  }

  const uncoveredMethodologies: any[] = []
  for (const [key, group] of Object.entries(methByFwNode)) {
    const totalFrags = group.methods.reduce(
      (sum: number, m: any) => sum + (fragCountByMethod[m.id] || 0),
      0
    )
    if (totalFrags === 0 && group.methods.length > 0) {
      uncoveredMethodologies.push({
        frameworkId: group.frameworkId,
        frameworkName: fwNameMap[group.frameworkId] || group.frameworkId,
        nodeId: group.cellId,
        nodeName: nodeNameMap[key] || String(group.cellId),
        methodologyCount: group.methods.length,
      })
    }
  }

  const dimensionLastSeen: Record<
    string,
    { dimension: string; value: string; ts: string }
  > = {}
  const dims = ['role', 'situation', 'activity', 'insight_type']
  for (const f of fragments) {
    for (const dim of dims) {
      const val = f[dim]
      if (!val) continue
      const key = `${dim}::${val}`
      const ts = f.createdAt || f.updatedAt || ''
      if (!dimensionLastSeen[key] || ts > dimensionLastSeen[key].ts) {
        dimensionLastSeen[key] = { dimension: dim, value: val, ts }
      }
    }
  }

  const staleDimensions: any[] = []
  for (const entry of Object.values(dimensionLastSeen)) {
    const days = daysBetween(now, entry.ts)
    if (days >= 90) {
      staleDimensions.push({
        dimension: entry.dimension,
        value: entry.value,
        lastSeenAt: entry.ts,
        daysSince: days,
      })
    }
  }
  staleDimensions.sort((a, b) => b.daysSince - a.daysSince)

  const ratio =
    methodologies.length > 0
      ? Math.round((fragments.length / methodologies.length) * 10) / 10
      : 0

  return {
    uncoveredMethodologies,
    staleDimensions,
    theoryPracticeRatio: {
      methodologies: methodologies.length,
      fragments: fragments.length,
      ratio,
    },
  }
}
