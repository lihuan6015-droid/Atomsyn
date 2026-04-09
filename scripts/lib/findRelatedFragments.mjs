/**
 * findRelatedFragments — M4 reverse-lookup library
 *
 * Given a methodology atom ID, find all experience fragments whose
 * `linked_methodologies` array contains that ID, filtered by confidence.
 *
 * Usage:
 *   import { findRelatedFragments } from './lib/findRelatedFragments.mjs'
 *   const frags = await findRelatedFragments(dataDir, 'atom_macro_scanning', { threshold: 0.7, top: 3 })
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Walk a directory tree and collect all .json file paths.
 */
async function walkJson(dir) {
  const out = []
  if (!existsSync(dir)) return out
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walkJson(full)))
    else if (e.isFile() && e.name.endsWith('.json')) out.push(full)
  }
  return out
}

/**
 * Find experience fragments linked to a given methodology atom.
 *
 * @param {string} dataDir - Resolved data directory path
 * @param {string} methodologyAtomId - The methodology atom ID to reverse-lookup
 * @param {object} opts
 * @param {number} [opts.threshold=0.7] - Minimum confidence to include
 * @param {number} [opts.top=3] - Max fragments to return
 * @param {boolean} [opts.includePrivate=false] - Include private (情绪复盘) fragments
 * @returns {Promise<Array<{atom: object, path: string, confidence: number}>>}
 */
export async function findRelatedFragments(dataDir, methodologyAtomId, opts = {}) {
  const { threshold = 0.7, top = 3, includePrivate = false } = opts

  const experienceDir = join(dataDir, 'atoms', 'experience')
  const files = await walkJson(experienceDir)

  const candidates = []

  for (const f of files) {
    try {
      const atom = JSON.parse(await readFile(f, 'utf8'))

      // Only look at fragments (not crystallized experiences without linked_methodologies)
      const linkedMethods = atom.linked_methodologies
      if (!Array.isArray(linkedMethods) || linkedMethods.length === 0) continue

      // Check if this fragment links to the target methodology
      if (!linkedMethods.includes(methodologyAtomId)) continue

      // Respect privacy: skip private atoms unless explicitly included
      if (atom.private && !includePrivate) continue

      // Respect user demotion
      if (atom.stats?.userDemoted) continue

      // Determine confidence: locked atoms always rank highest
      const isLocked = atom.stats?.locked === true
      const confidence = isLocked ? 1.0 : (atom.confidence || 0)

      // Filter by threshold (locked atoms always pass)
      if (!isLocked && confidence < threshold) continue

      candidates.push({ atom, path: f, confidence, locked: isLocked })
    } catch {
      /* skip corrupted files */
    }
  }

  // Sort: locked first, then by confidence desc, then by createdAt desc
  candidates.sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1
    if (a.confidence !== b.confidence) return b.confidence - a.confidence
    const aTime = a.atom.createdAt || ''
    const bTime = b.atom.createdAt || ''
    return bTime.localeCompare(aTime)
  })

  return candidates.slice(0, top)
}

/**
 * Batch reverse-lookup: for multiple methodology atom IDs, find related fragments.
 * Returns a Map<methodologyId, fragments[]>.
 *
 * More efficient than calling findRelatedFragments N times (single file scan).
 */
export async function findRelatedFragmentsBatch(dataDir, methodologyIds, opts = {}) {
  const { threshold = 0.7, top = 3, includePrivate = false } = opts

  const experienceDir = join(dataDir, 'atoms', 'experience')
  const files = await walkJson(experienceDir)

  // Map<methodologyId, Array<{atom, path, confidence, locked}>>
  const buckets = new Map()
  for (const id of methodologyIds) buckets.set(id, [])

  const idSet = new Set(methodologyIds)

  for (const f of files) {
    try {
      const atom = JSON.parse(await readFile(f, 'utf8'))
      const linkedMethods = atom.linked_methodologies
      if (!Array.isArray(linkedMethods) || linkedMethods.length === 0) continue
      if (atom.private && !includePrivate) continue
      if (atom.stats?.userDemoted) continue

      const isLocked = atom.stats?.locked === true
      const confidence = isLocked ? 1.0 : (atom.confidence || 0)
      if (!isLocked && confidence < threshold) continue

      for (const mid of linkedMethods) {
        if (idSet.has(mid)) {
          buckets.get(mid).push({ atom, path: f, confidence, locked: isLocked })
        }
      }
    } catch {
      /* skip */
    }
  }

  // Sort and truncate each bucket
  for (const [, frags] of buckets) {
    frags.sort((a, b) => {
      if (a.locked !== b.locked) return a.locked ? -1 : 1
      if (a.confidence !== b.confidence) return b.confidence - a.confidence
      const aTime = a.atom.createdAt || ''
      const bTime = b.atom.createdAt || ''
      return bTime.localeCompare(aTime)
    })
    frags.splice(top)
  }

  return buckets
}
