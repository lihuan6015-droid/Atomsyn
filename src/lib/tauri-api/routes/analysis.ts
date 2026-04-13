/**
 * Analysis routes — aggregation endpoints + reports CRUD.
 */

import type { RouteResult } from '../router'
import {
  getDataDir,
  joinPathSync,
  readJSON,
  writeJSON,
  fileExists,
  removeFile,
  ensureDir,
} from '../fsHelpers'
import { readTextFile, readDir, writeTextFile } from '@tauri-apps/plugin-fs'
import {
  analyzeDimensions,
  analyzeTimeline,
  analyzeCoverage,
  analyzeGaps,
} from '../analysisEngine'

function ok(body: any, status = 200): RouteResult {
  return { status, body }
}
function err(msg: string, status = 404): RouteResult {
  return { status, body: { error: msg } }
}

export async function handleAnalysis(
  method: string,
  parts: string[],
  body: any,
  sp: URLSearchParams
): Promise<RouteResult | null> {
  const dataDir = await getDataDir()

  // GET /analysis/dimensions
  if (parts[1] === 'dimensions' && method === 'GET') {
    return ok(await analyzeDimensions(dataDir))
  }

  // GET /analysis/timeline?months=12
  if (parts[1] === 'timeline' && method === 'GET') {
    const months = parseInt(sp.get('months') || '12', 10)
    return ok(await analyzeTimeline(dataDir, months))
  }

  // GET /analysis/coverage
  if (parts[1] === 'coverage' && method === 'GET') {
    return ok(await analyzeCoverage(dataDir))
  }

  // GET /analysis/gaps
  if (parts[1] === 'gaps' && method === 'GET') {
    return ok(await analyzeGaps(dataDir))
  }

  // --- Reports CRUD ---
  if (parts[1] === 'reports') {
    const reportsDir = joinPathSync(dataDir, 'analysis', 'reports')
    await ensureDir(reportsDir)

    // GET /analysis/reports — list all
    if (!parts[2] && method === 'GET') {
      let files: string[] = []
      try {
        const entries = await readDir(reportsDir)
        files = entries
          .filter((e: any) => e.isFile && e.name.endsWith('.json'))
          .map((e: any) => e.name)
      } catch { /* empty */ }

      const reports: any[] = []
      for (const f of files) {
        try {
          reports.push(
            JSON.parse(await readTextFile(joinPathSync(reportsDir, f)))
          )
        } catch { /* skip corrupted */ }
      }
      reports.sort((a: any, b: any) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      )
      return ok(reports)
    }

    // POST /analysis/reports — create
    if (!parts[2] && method === 'POST') {
      const id = `report_${Date.now()}`
      const report = { ...body, id, createdAt: new Date().toISOString() }
      await writeTextFile(
        joinPathSync(reportsDir, `${id}.json`),
        JSON.stringify(report, null, 2)
      )
      return ok(report, 201)
    }

    // Routes with :id
    if (parts[2]) {
      const reportId = parts[2]
      const reportFile = joinPathSync(reportsDir, `${reportId}.json`)

      if (method === 'GET') {
        if (!(await fileExists(reportFile))) return err('report not found')
        return ok(JSON.parse(await readTextFile(reportFile)))
      }

      if (method === 'PUT') {
        if (!(await fileExists(reportFile))) return err('report not found')
        const existing = JSON.parse(await readTextFile(reportFile))
        const merged = { ...existing, ...body, id: reportId }
        await writeTextFile(reportFile, JSON.stringify(merged, null, 2))
        return ok(merged)
      }

      if (method === 'DELETE') {
        await removeFile(reportFile)
        return ok({ ok: true })
      }
    }
  }

  return null
}
