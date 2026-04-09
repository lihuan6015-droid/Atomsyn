/**
 * Vite dev plugin: exposes a tiny REST API over the local /data folder.
 *
 * Endpoints (all under /api):
 *   GET    /api/frameworks                        → list all frameworks
 *   GET    /api/frameworks/:id                    → one framework
 *   POST   /api/frameworks                        → create framework
 *   PUT    /api/frameworks/:id                    → update framework
 *   DELETE /api/frameworks/:id                    → delete framework + atoms
 *   GET    /api/frameworks/:id/stats              → coverage statistics
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
 *   GET    /api/analysis/dimensions                → dimension clustering stats
 *   GET    /api/analysis/timeline                  → time-series trends
 *   GET    /api/analysis/coverage                  → cross-framework coverage
 *   GET    /api/analysis/gaps                      → blind spot detection
 *   GET    /api/analysis/reports                   → list AI reports
 *   POST   /api/analysis/reports                   → create report
 *   GET    /api/analysis/reports/:id               → one report
 *   PUT    /api/analysis/reports/:id               → update report
 *   DELETE /api/analysis/reports/:id               → delete report
 *
 *   GET    /api/psychological-log                 → psych entries
 *   POST   /api/psychological-log                 → append
 *
 *   GET    /api/notes/meta                        → notes global metadata
 *   PUT    /api/notes/meta                        → update notes metadata
 *   GET    /api/notes                             → list all notes
 *   GET    /api/notes/:id                         → one note (meta + content)
 *   POST   /api/notes                             → create note
 *   PUT    /api/notes/:id                         → update note
 *   DELETE /api/notes/:id                         → soft delete (→ .trash)
 *   POST   /api/notes/:id/move                    → move to group
 *   POST   /api/notes/:id/restore                 → restore from trash
 *   DELETE /api/notes/trash/:id                   → permanent delete
 *   GET    /api/notes/trash                       → list trashed notes
 *   POST   /api/notes/:id/attachment              → upload attachment
 *
 *   GET    /api/chat/sessions                     → chat session index
 *   POST   /api/chat/sessions                     → create session
 *   GET    /api/chat/sessions/:id                 → one session (full history)
 *   PUT    /api/chat/sessions/:id                 → update session
 *   DELETE /api/chat/sessions/:id                 → delete session
 *   GET    /api/chat/soul                         → SOUL.md content
 *   GET    /api/chat/agents                       → AGENTS.md content
 *   GET    /api/chat/memory                       → memory entries (JSONL)
 *   POST   /api/chat/memory                       → append memory entry
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
