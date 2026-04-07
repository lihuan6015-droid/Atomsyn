/**
 * Atomsyn V1.5 · First-run init sequence runner.
 *
 * Orchestrates the four Tauri init commands (ensure data dir → seed
 * frameworks → seed methodology atoms → skill check) and streams per-step
 * progress via a callback so the splash screen (N-5) can render it.
 *
 * In web/dev mode (no Tauri shell), every step resolves instantly with
 * `status: 'skipped'` — keeps the splash UI alive during `npm run dev`
 * without requiring the Rust backend.
 *
 * This module intentionally renders no UI. The splash component imports
 * `runInitSequence` and drives its own view state from the callback.
 */

import { isTauri } from './dataPath'

export type InitStepId = 'data-dir' | 'frameworks' | 'methodology' | 'skill-check'

export type InitStepStatus = 'pending' | 'running' | 'ok' | 'skipped' | 'error'

export interface InitStep {
  id: InitStepId
  label: string
  status: InitStepStatus
  detail?: string
  counts?: Record<string, unknown>
}

interface BackendStepResult {
  step: string
  status: 'ok' | 'skipped' | 'error'
  detail: string
  counts?: Record<string, unknown> | null
}

interface StepSpec {
  id: InitStepId
  label: string
  command: string
}

const STEP_SPECS: StepSpec[] = [
  { id: 'data-dir', label: '准备数据目录', command: 'init_ensure_data_dir' },
  { id: 'frameworks', label: '注入框架定义', command: 'init_seed_frameworks' },
  { id: 'methodology', label: '注入方法论原子', command: 'init_seed_methodology' },
  { id: 'skill-check', label: '检查 Skill 安装', command: 'init_check_skill_installation' },
]

/** Minimum visible hold per step, so the splash reads as a deliberate
 *  brand moment rather than flashing past. */
const MIN_STEP_HOLD_MS = 450
/** Minimum time a step spends in 'running' state before resolving. */
const MIN_RUNNING_MS = 280

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Run the first-run init sequence. Calls `onStep` once per transition
 * (running → ok/skipped/error). Resolves with the final snapshot; never
 * rejects — individual step errors are captured as `status: 'error'` so
 * the UI can decide how to surface them.
 */
export async function runInitSequence(
  onStep: (step: InitStep) => void,
): Promise<InitStep[]> {
  const results: InitStep[] = STEP_SPECS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    status: 'pending' as InitStepStatus,
  }))

  if (!isTauri()) {
    for (let i = 0; i < results.length; i += 1) {
      const running: InitStep = { ...results[i], status: 'running' }
      results[i] = running
      onStep(running)
      await wait(MIN_RUNNING_MS)
      const done: InitStep = {
        ...results[i],
        status: 'skipped',
        detail: '开发模式 · 由 Vite 数据插件接管',
      }
      results[i] = done
      onStep(done)
      if (i < results.length - 1) await wait(MIN_STEP_HOLD_MS - MIN_RUNNING_MS)
    }
    return results
  }

  const { invoke } = await import('@tauri-apps/api/core')

  for (let i = 0; i < STEP_SPECS.length; i += 1) {
    const spec = STEP_SPECS[i]
    const stepStart = Date.now()
    const running: InitStep = { ...results[i], status: 'running' }
    results[i] = running
    onStep(running)

    try {
      // Race the real backend call against a minimum running-state hold.
      const [res] = await Promise.all([
        invoke<BackendStepResult>(spec.command),
        wait(MIN_RUNNING_MS),
      ])
      const settled: InitStep = {
        id: spec.id,
        label: spec.label,
        status: res.status,
        detail: res.detail,
        counts: res.counts ?? undefined,
      }
      results[i] = settled
      onStep(settled)
    } catch (err) {
      const settled: InitStep = {
        id: spec.id,
        label: spec.label,
        status: 'error',
        detail: err instanceof Error ? err.message : String(err),
      }
      results[i] = settled
      onStep(settled)
    }

    // Ensure the whole step (running + settled) is visible long enough
    // to register as a deliberate brand beat.
    const elapsed = Date.now() - stepStart
    const remaining = MIN_STEP_HOLD_MS - elapsed
    if (remaining > 0 && i < STEP_SPECS.length - 1) await wait(remaining)
  }

  return results
}
