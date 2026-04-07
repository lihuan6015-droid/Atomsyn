import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { homedir, platform } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { dataApiPlugin } from './vite-plugin-data-api'

/**
 * Unified data directory resolver — mirrors scripts/atomsyn-cli.mjs and
 * src-tauri/src/lib.rs so the GUI, the CLI, and the Tauri shell all read
 * and write to the *same* directory.
 *
 * Resolution order:
 *   1. $ATOMSYN_DEV_DATA_DIR env var           (dev override, e.g. project /data)
 *   2. ~/.atomsyn-config.json `dataDir`  (user-customized)
 *   3. Platform default:
 *        macOS   ~/Library/Application Support/atomsyn
 *        Linux   ~/.local/share/atomsyn
 *        Windows %APPDATA%/atomsyn
 *
 * The `seedFrom` field tells the plugin where to copy V1 seed data
 * (frameworks + methodology atoms) on first run if the resolved data
 * directory is empty. Packaged Tauri uses its own `init_seed_*` commands
 * and does not go through this path.
 */
function resolveDataDir(): { dataDir: string; seedFrom: string; source: string } {
  const projectData = path.resolve(__dirname, 'data')
  const seedFrom = projectData

  // 1. env override
  if (process.env.ATOMSYN_DEV_DATA_DIR) {
    return {
      dataDir: process.env.ATOMSYN_DEV_DATA_DIR,
      seedFrom,
      source: 'env',
    }
  }

  // 2. user config
  const cfgPath = path.join(homedir(), '.atomsyn-config.json')
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
      if (cfg.dataDir && typeof cfg.dataDir === 'string') {
        return { dataDir: cfg.dataDir, seedFrom, source: 'config' }
      }
    } catch {
      /* ignore invalid config */
    }
  }

  // 3. platform default
  const home = homedir()
  let base: string
  switch (platform()) {
    case 'darwin':
      base = path.join(home, 'Library', 'Application Support')
      break
    case 'win32':
      base = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
      break
    default:
      base = path.join(home, '.local', 'share')
  }
  return {
    dataDir: path.join(base, 'atomsyn'),
    seedFrom,
    source: 'default',
  }
}

const { dataDir, seedFrom, source } = resolveDataDir()

// eslint-disable-next-line no-console
console.log(
  `[atomsyn] data dir: ${dataDir}  (source: ${source})${source !== 'env' ? `  · seed: ${seedFrom}` : ''}`,
)

export default defineConfig({
  plugins: [react(), dataApiPlugin({ dataDir, seedFrom })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})
