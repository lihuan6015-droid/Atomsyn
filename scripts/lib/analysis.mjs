/**
 * analysis.mjs — Shared analysis aggregation engine
 *
 * Provides four analysis functions used by both:
 *   1. vite-plugin-data-api.ts (GET /api/analysis/* endpoints)
 *   2. atomsyn-cli.mjs (atomsyn-cli mentor subcommand)
 *
 * All functions take a resolved dataDir path and return plain objects
 * ready for JSON serialization.
 *
 * Zero npm dependencies — only node stdlib.
 */

import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all .json file paths under `dir`. */
async function walkJson(dir) {
  const out = []
  if (!existsSync(dir)) return out
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walkJson(full)))
    else if (e.isFile() && e.name.endsWith('.json')) out.push(full)
  }
  return out
}

/** Safely parse a JSON file, returning null on failure. */
async function readJSONSafe(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

/** Days between two ISO dates. */
function daysBetween(a, b) {
  return Math.floor(Math.abs(new Date(a) - new Date(b)) / (1000 * 60 * 60 * 24))
}

/** Load all experience fragments (kind: 'experience') excluding private/demoted. */
async function loadFragments(dataDir, { includePrivate = false } = {}) {
  const experienceDir = join(dataDir, 'atoms', 'experience')
  const files = await walkJson(experienceDir)
  const fragments = []
  for (const f of files) {
    const atom = await readJSONSafe(f)
    if (!atom || atom.kind !== 'experience') continue
    if (!includePrivate && atom.private) continue
    if (atom.stats?.userDemoted) continue
    fragments.push(atom)
  }
  return fragments
}

/** Load all methodology atoms across all frameworks. */
async function loadMethodologies(dataDir) {
  const atomsDir = join(dataDir, 'atoms')
  if (!existsSync(atomsDir)) return []

  const entries = await readdir(atomsDir, { withFileTypes: true })
  const methodologies = []

  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'experience' || e.name === 'skill-inventory') continue
    const fwDir = join(atomsDir, e.name)
    const files = await walkJson(fwDir)
    for (const f of files) {
      const atom = await readJSONSafe(f)
      if (atom && atom.kind === 'methodology') {
        methodologies.push(atom)
      }
    }
  }
  return methodologies
}

/** Load all framework definitions. */
async function loadFrameworks(dataDir) {
  const fwDir = join(dataDir, 'frameworks')
  if (!existsSync(fwDir)) return []
  const entries = await readdir(fwDir, { withFileTypes: true })
  const frameworks = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue
    const fw = await readJSONSafe(join(fwDir, e.name))
    if (fw) frameworks.push(fw)
  }
  return frameworks
}

/** Extract all node definitions from a framework (matrix/list/tree). */
function getFrameworkNodes(fw) {
  const nodes = []
  if (fw.layoutType === 'matrix' && fw.matrix?.cells) {
    for (const cell of fw.matrix.cells) {
      nodes.push({ id: cell.stepNumber, name: cell.name })
    }
  } else if (fw.layoutType === 'list' && fw.list?.categories) {
    for (const cat of fw.list.categories) {
      nodes.push({ id: cat.id, name: cat.name })
    }
  } else if (fw.layoutType === 'tree' && fw.tree?.roots) {
    const collect = (arr) => {
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

/**
 * Aggregate experience fragments by their four classification dimensions.
 * Returns counts, cross-matrix, and recency breakdown.
 *
 * @param {string} dataDir
 * @returns {Promise<object>} DimensionAnalysis
 */
export async function analyzeDimensions(dataDir) {
  const fragments = await loadFragments(dataDir)
  const now = new Date()

  const byRole = {}
  const bySituation = {}
  const byActivity = {}
  const byInsightType = {}

  let recent = 0
  let moderate = 0
  let stale = 0

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

  // Build cross-matrix: role × situation
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

/**
 * Aggregate fragment creation over time (monthly buckets).
 * Also computes streak and velocity metrics.
 *
 * @param {string} dataDir
 * @param {number} [months=12]
 * @returns {Promise<object>} TimelineAnalysis
 */
export async function analyzeTimeline(dataDir, months = 12) {
  const fragments = await loadFragments(dataDir)
  const methodologies = await loadMethodologies(dataDir)
  const now = new Date()

  // Generate month labels for the requested range
  const monthLabels = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthLabels.push(d.toISOString().slice(0, 7))
  }

  // Group fragments by month
  const fragsByMonth = {}
  for (const m of monthLabels) fragsByMonth[m] = []
  for (const f of fragments) {
    const m = (f.createdAt || '').slice(0, 7)
    if (fragsByMonth[m]) fragsByMonth[m].push(f)
  }

  // Group methodologies by creation month
  const methByMonth = {}
  for (const m of monthLabels) methByMonth[m] = 0
  for (const m of methodologies) {
    const month = (m.createdAt || '').slice(0, 7)
    if (methByMonth[month] !== undefined) methByMonth[month]++
  }

  const monthlyData = monthLabels.map((m) => {
    const frags = fragsByMonth[m] || []
    // Top roles
    const roleCounts = {}
    const insightCounts = {}
    for (const f of frags) {
      if (f.role) roleCounts[f.role] = (roleCounts[f.role] || 0) + 1
      if (f.insight_type) insightCounts[f.insight_type] = (insightCounts[f.insight_type] || 0) + 1
    }
    const topRoles = Object.entries(roleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((e) => e[0])
    const topInsightTypes = Object.entries(insightCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((e) => e[0])

    return {
      month: m,
      fragmentCount: frags.length,
      methodologyCount: methByMonth[m] || 0,
      topRoles,
      topInsightTypes,
    }
  })

  // Streak: consecutive days with at least one fragment
  const daySet = new Set()
  for (const f of fragments) {
    if (f.createdAt) daySet.add(f.createdAt.slice(0, 10))
  }
  const sortedDays = Array.from(daySet).sort()

  let currentStreak = 0
  let longestStreak = 0
  if (sortedDays.length > 0) {
    const today = now.toISOString().slice(0, 10)
    // Walk backwards from today
    let streak = 0
    let checkDate = new Date(today)
    while (true) {
      const key = checkDate.toISOString().slice(0, 10)
      if (daySet.has(key)) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else {
        break
      }
    }
    currentStreak = streak

    // Longest streak ever
    let run = 1
    longestStreak = 1
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1])
      const curr = new Date(sortedDays[i])
      if (daysBetween(prev, curr) === 1) {
        run++
        if (run > longestStreak) longestStreak = run
      } else {
        run = 1
      }
    }
    if (sortedDays.length === 0) longestStreak = 0
  }

  // Velocity
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
  const trend = last30d > prev30d * 1.1 ? 'up' : last30d < prev30d * 0.9 ? 'down' : 'stable'

  return {
    months: monthlyData,
    streak: { current: currentStreak, longest: longestStreak },
    velocity: { last7d, last30d, trend },
  }
}

// ---------------------------------------------------------------------------
// 3. Coverage Analysis
// ---------------------------------------------------------------------------

/**
 * Cross-framework coverage summary — how much real experience covers
 * each framework's methodology nodes.
 *
 * @param {string} dataDir
 * @returns {Promise<object>} CoverageAnalysis
 */
export async function analyzeCoverage(dataDir) {
  const frameworks = await loadFrameworks(dataDir)
  const methodologies = await loadMethodologies(dataDir)
  const fragments = await loadFragments(dataDir)

  // Build reverse map: methodologyId → fragment count
  const fragCountByMethod = {}
  for (const f of fragments) {
    const links = f.linked_methodologies || []
    for (const mid of links) {
      fragCountByMethod[mid] = (fragCountByMethod[mid] || 0) + 1
    }
  }

  // Build methodologyId → frameworkId+cellId map
  const methodByFwCell = {}
  for (const m of methodologies) {
    const key = `${m.frameworkId}::${m.cellId}`
    if (!methodByFwCell[key]) methodByFwCell[key] = []
    methodByFwCell[key].push(m.id)
  }

  let totalNodes = 0
  let totalCovered = 0
  let totalFrags = 0

  const fwResults = frameworks.map((fw) => {
    const nodes = getFrameworkNodes(fw)
    let coveredNodes = 0
    let fwFragments = 0

    for (const node of nodes) {
      const key = `${fw.id}::${node.id}`
      const methIds = methodByFwCell[key] || []
      let nodeFragCount = 0
      for (const mid of methIds) {
        nodeFragCount += fragCountByMethod[mid] || 0
      }
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
      coveragePercent: nodes.length > 0 ? Math.round((coveredNodes / nodes.length) * 100) : 0,
      totalFragments: fwFragments,
    }
  })

  return {
    frameworks: fwResults,
    overall: {
      totalNodes,
      coveredNodes: totalCovered,
      coveragePercent: totalNodes > 0 ? Math.round((totalCovered / totalNodes) * 100) : 0,
      totalFragments: totalFrags,
    },
  }
}

// ---------------------------------------------------------------------------
// 4. Gap Analysis
// ---------------------------------------------------------------------------

/**
 * Detect blind spots: uncovered methodologies, stale dimensions,
 * and theory-practice ratio.
 *
 * @param {string} dataDir
 * @returns {Promise<object>} GapAnalysis
 */
export async function analyzeGaps(dataDir) {
  const frameworks = await loadFrameworks(dataDir)
  const methodologies = await loadMethodologies(dataDir)
  const fragments = await loadFragments(dataDir)
  const now = new Date()

  // --- Uncovered methodologies ---
  // Build reverse map: methodologyId → fragment count
  const fragCountByMethod = {}
  for (const f of fragments) {
    const links = f.linked_methodologies || []
    for (const mid of links) {
      fragCountByMethod[mid] = (fragCountByMethod[mid] || 0) + 1
    }
  }

  // Group methodologies by framework + node
  const methByFwNode = {}
  for (const m of methodologies) {
    const key = `${m.frameworkId}::${m.cellId}`
    if (!methByFwNode[key]) methByFwNode[key] = { frameworkId: m.frameworkId, cellId: m.cellId, methods: [] }
    methByFwNode[key].methods.push(m)
  }

  // Build framework name lookup
  const fwNameMap = {}
  for (const fw of frameworks) fwNameMap[fw.id] = fw.name

  // Build node name lookup
  const nodeNameMap = {}
  for (const fw of frameworks) {
    const nodes = getFrameworkNodes(fw)
    for (const n of nodes) nodeNameMap[`${fw.id}::${n.id}`] = n.name
  }

  const uncoveredMethodologies = []
  for (const [key, group] of Object.entries(methByFwNode)) {
    const totalFrags = group.methods.reduce((sum, m) => sum + (fragCountByMethod[m.id] || 0), 0)
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

  // --- Stale dimensions ---
  // For each dimension value, find the most recent fragment using it
  const dimensionLastSeen = {}
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

  const staleDimensions = []
  for (const [, entry] of Object.entries(dimensionLastSeen)) {
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

  // --- Theory-practice ratio ---
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
