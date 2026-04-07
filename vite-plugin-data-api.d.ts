/**
 * Vite dev plugin: exposes a tiny REST API over the local /data folder.
 *
 * Endpoints (all under /api):
 *   GET    /api/frameworks                        → list all frameworks
 *   GET    /api/frameworks/:id                    → one framework
 *
 *   GET    /api/atoms                             → list all atoms (flat)
 *   GET    /api/atoms/:id                         → one atom (looked up by id)
 *   POST   /api/atoms                             → create atom { ...Atom }
 *   PUT    /api/atoms/:id                         → update atom
 *   DELETE /api/atoms/:id                         → delete atom
 *
 *   GET    /api/projects                          → list projects
 *   GET    /api/projects/:id                      → one project
 *   POST   /api/projects                          → create
 *   PUT    /api/projects/:id                      → update
 *   DELETE /api/projects/:id                      → delete
 *
 *   GET    /api/projects/:id/practices            → list practices in project
 *   POST   /api/projects/:id/practices            → create practice
 *   PUT    /api/projects/:id/practices/:pid       → update practice
 *   DELETE /api/projects/:id/practices/:pid       → delete practice
 *
 *   GET    /api/index                             → knowledge index
 *   POST   /api/index/rebuild                     → force rebuild
 *
 *   GET    /api/usage-log                         → recent usage events
 *   POST   /api/usage-log                         → append one event
 *
 *   GET    /api/llm-config                        → llm.config.json
 *   PUT    /api/llm-config                        → save (sans api key)
 *
 *   GET    /api/psychological-log                 → psych entries
 *   POST   /api/psychological-log                 → append
 *
 * Side effects: any write to atoms / projects / practices triggers an
 * automatic index rebuild.
 *
 * This plugin is intentionally framework-free (no express) so the dev
 * server stays a single Vite process. When the user later wraps this app
 * in Tauri, swap src/lib/dataApi.ts to call @tauri-apps/api/fs instead.
 */
import type { Plugin } from 'vite';
interface Options {
    dataDir: string;
    /**
     * Optional path to a read-only seed directory. On plugin startup, if
     * `dataDir` is empty or missing frameworks/, the plugin will copy
     * frameworks + methodology atoms from `seedFrom` non-destructively
     * (existing files are never overwritten). Usually this is the project's
     * own `/data/` directory, which ships V1's seed content.
     */
    seedFrom?: string;
}
export declare function dataApiPlugin(opts: Options): Plugin;
export {};
