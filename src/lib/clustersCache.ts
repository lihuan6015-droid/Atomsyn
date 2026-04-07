/**
 * V2.0 M3 · Clusters cache — reads/writes data/taxonomy/clusters.json.
 *
 * The clusters file stores pre-computed role+situation groupings for the
 * EmergentView. It's regenerated on demand (user clicks "重新聚类") or
 * auto-generated when empty.
 *
 * Currently: simple extraction of unique role+situation pairs from existing
 * fragments. Future: LLM-based semantic clustering.
 */

import type { AtomAny } from '@/types'
import { isExperienceFragment } from '@/types'

export interface Cluster {
  role: string
  situation: string
  count: number
}

export interface ClustersData {
  version: '2.0'
  generatedAt: string
  clusters: Cluster[]
}

/**
 * Extract clusters from existing atoms (no LLM call — pure aggregation).
 * This is the V2.0 MVP approach. V2.x may add LLM-based re-clustering.
 */
export function extractClusters(atoms: AtomAny[]): ClustersData {
  const fragments = atoms.filter(isExperienceFragment)
  const map = new Map<string, Cluster>()

  for (const f of fragments) {
    if (f.private) continue
    const key = `${f.role}|${f.situation}`
    const existing = map.get(key)
    if (existing) {
      existing.count++
    } else {
      map.set(key, { role: f.role, situation: f.situation, count: 1 })
    }
  }

  const clusters = Array.from(map.values()).sort((a, b) => b.count - a.count)

  return {
    version: '2.0',
    generatedAt: new Date().toISOString(),
    clusters,
  }
}
