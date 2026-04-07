/**
 * Data directory resolution for Atomsyn V1.5.
 *
 * B3 strategy (see docs/plans/v1.5-implementation-plan.md § L1.4):
 *
 * ┌─────────────────────┬───────────────────────────────────────────────┐
 * │ Running mode        │ Data directory                                │
 * ├─────────────────────┼───────────────────────────────────────────────┤
 * │ Vite dev (browser)  │ Project `/data/` via /api/* HTTP endpoints    │
 * │ Tauri app           │ Resolved by get_data_dir command:             │
 * │                     │   1. ATOMSYN_DEV_DATA_DIR env var (dev override)  │
 * │                     │   2. ~/.atomsyn-config.json `dataDir`       │
 * │                     │   3. Platform appDataDir/atomsyn (default)  │
 * └─────────────────────┴───────────────────────────────────────────────┘
 *
 * The existing `src/lib/dataApi.ts` (which talks to /api/*) continues to
 * work unchanged in dev mode. A future refactor will branch dataApi on
 * `isTauri()` and use the Tauri fs plugin + the resolved data directory
 * for direct disk access in app mode. Until then, this module primarily
 * powers the Settings UI display of "where my data lives" (serving the
 * E6/E7 sovereignty Jobs from the framing doc).
 */

export interface DataDirInfo {
  /** Absolute filesystem path to the data directory. */
  path: string
  /** Which resolution rule won. */
  source: 'env' | 'config' | 'default' | 'dev-web'
  /** Does the directory exist on disk? */
  exists: boolean
  /** Did this call just create the directory? */
  created: boolean
}

let cached: DataDirInfo | null = null
let cachedConfigPath: string | null = null

/**
 * True when running inside a Tauri app window (as opposed to Vite dev in a browser).
 * Detection is based on the Tauri v2 internals marker that Tauri injects
 * into window before any user scripts run.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Resolve the active data directory. Cached after first call for the lifetime
 * of the page. Call `resetDataPathCache()` after user changes the config.
 */
export async function getDataDirInfo(): Promise<DataDirInfo> {
  if (cached) return cached

  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const info = await invoke<DataDirInfo>('get_data_dir')
    cached = info
    return info
  }

  // Dev/web mode — vite-plugin-data-api handles all disk I/O via /api/*.
  // We return a sentinel so Settings UI can show "project /data (dev)".
  cached = {
    path: '(project)/data',
    source: 'dev-web',
    exists: true,
    created: false,
  }
  return cached
}

/**
 * Return the path where ~/.atomsyn-config.json is expected to live.
 * Null in web/dev mode (no user config layer).
 */
export async function getConfigPath(): Promise<string | null> {
  if (cachedConfigPath !== null) return cachedConfigPath
  if (!isTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  const p = await invoke<string>('get_config_path')
  cachedConfigPath = p
  return p
}

/** Force a re-resolve on next call. Use after user edits config via Settings. */
export function resetDataPathCache(): void {
  cached = null
  cachedConfigPath = null
}

/** Convenience: human-readable label for the current data dir source. */
export function describeDataSource(info: DataDirInfo): string {
  switch (info.source) {
    case 'env':
      return '环境变量（ATOMSYN_DEV_DATA_DIR）'
    case 'config':
      return '用户自定义（~/.atomsyn-config.json）'
    case 'default':
      return '系统默认（Application Support）'
    case 'dev-web':
      return '开发模式（项目 /data/）'
  }
}
