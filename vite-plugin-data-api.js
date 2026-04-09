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
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
/**
 * Non-destructively copy bundled seed data into a user's data directory.
 * Mirrors the semantics of src-tauri/src/lib.rs `init_seed_*` commands.
 * Only runs when the target is empty for that sub-tree.
 */
async function seedDataDir(dataDir, seedFrom) {
    if (dataDir === seedFrom)
        return;
    if (!existsSync(seedFrom))
        return;
    async function copyRecursiveNoOverwrite(src, dst) {
        if (!existsSync(src))
            return 0;
        let copied = 0;
        await fs.mkdir(dst, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });
        for (const e of entries) {
            const s = path.join(src, e.name);
            const d = path.join(dst, e.name);
            if (e.isDirectory()) {
                copied += await copyRecursiveNoOverwrite(s, d);
            }
            else if (e.isFile()) {
                if (!existsSync(d)) {
                    await fs.copyFile(s, d);
                    copied += 1;
                }
            }
        }
        return copied;
    }
    async function countJsonRecursive(dir) {
        if (!existsSync(dir))
            return 0;
        let n = 0;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory())
                n += await countJsonRecursive(full);
            else if (e.isFile() && e.name.endsWith('.json'))
                n += 1;
        }
        return n;
    }
    // Seed frameworks (only if target frameworks dir has zero .json files)
    const fwTarget = path.join(dataDir, 'frameworks');
    const fwSource = path.join(seedFrom, 'frameworks');
    if (existsSync(fwSource)) {
        const existing = await countJsonRecursive(fwTarget);
        if (existing === 0) {
            const n = await copyRecursiveNoOverwrite(fwSource, fwTarget);
            // eslint-disable-next-line no-console
            console.log(`[atomsyn] seeded ${n} frameworks → ${fwTarget}`);
        }
    }
    // Seed methodology atoms (all subtrees under atoms/ except experience/skill-inventory)
    const atomsSource = path.join(seedFrom, 'atoms');
    const atomsTarget = path.join(dataDir, 'atoms');
    if (existsSync(atomsSource)) {
        const entries = await fs.readdir(atomsSource, { withFileTypes: true });
        for (const e of entries) {
            if (!e.isDirectory())
                continue;
            // User-mutable trees — never seeded (user grows them)
            if (e.name === 'experience' || e.name === 'skill-inventory')
                continue;
            const s = path.join(atomsSource, e.name);
            const d = path.join(atomsTarget, e.name);
            const existing = await countJsonRecursive(d);
            if (existing === 0) {
                const n = await copyRecursiveNoOverwrite(s, d);
                // eslint-disable-next-line no-console
                console.log(`[atomsyn] seeded ${n} methodology atoms → ${d}`);
            }
        }
    }
    // Ensure user-mutable subdirs exist (so walks + writes don't fail)
    for (const sub of [
        'atoms/experience',
        'atoms/skill-inventory',
        'growth',
        'index',
        'projects',
        'chat',
        'chat/sessions',
        'chat/memory',
    ]) {
        await fs.mkdir(path.join(dataDir, sub), { recursive: true });
    }
    // Seed chat SOUL.md + AGENTS.md (non-destructively)
    const chatSeedSource = path.join(seedFrom, '..', 'skills', 'chat');
    if (existsSync(chatSeedSource)) {
        for (const f of ['SOUL.md', 'AGENTS.md']) {
            const src = path.join(chatSeedSource, f);
            const dst = path.join(dataDir, 'chat', f);
            if (existsSync(src) && !existsSync(dst)) {
                await fs.copyFile(src, dst);
                // eslint-disable-next-line no-console
                console.log(`[atomsyn] seeded chat/${f} → ${dst}`);
            }
        }
    }
    // V1.5 fix · write initial .seed-state.json the very first time we seed.
    // Without this, the seed-check endpoint short-circuits to
    // "first-install" forever and the user never sees the update prompt
    // when they edit SEED_VERSION.json locally. We record the current seed
    // version + a manifest of the files we just copied so subsequent
    // bumps to SEED_VERSION.json diff cleanly.
    try {
        const stateFile = path.join(dataDir, '.seed-state.json');
        if (!existsSync(stateFile)) {
            const manifest = await loadSeedManifest(seedFrom);
            if (manifest?.version) {
                const fileManifest = {};
                const rootPaths = manifest.contents?.rootPaths ?? [
                    'data/frameworks/',
                    'data/atoms/product-innovation-24/',
                ];
                const files = await collectSeedFiles(seedFrom, rootPaths);
                for (const rel of files) {
                    const userAbs = path.join(dataDir, rel);
                    if (existsSync(userAbs)) {
                        fileManifest[rel] = await sha256File(userAbs);
                    }
                }
                await writeSeedState(dataDir, {
                    installedVersion: manifest.version,
                    dismissedVersions: [],
                    lastSyncedAt: new Date().toISOString(),
                    manifest: fileManifest,
                });
                // eslint-disable-next-line no-console
                console.log(`[atomsyn] initialized .seed-state.json at version ${manifest.version}`);
            }
        }
    }
    catch (err) {
        // Non-fatal — the seed-check endpoint will just keep reporting
        // first-install until the next successful write.
        // eslint-disable-next-line no-console
        console.warn('[atomsyn] seed-state init failed (non-fatal):', err);
    }
}
// ---------- helpers ---------------------------------------------------------
async function readJSON(file, fallback) {
    try {
        const raw = await fs.readFile(file, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
async function writeJSON(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
async function walk(dir, exts = ['.json']) {
    const out = [];
    if (!existsSync(dir))
        return out;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            out.push(...(await walk(full, exts)));
        }
        else if (exts.some((x) => e.name.endsWith(x))) {
            out.push(full);
        }
    }
    return out;
}
function send(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
}
async function readBody(req) {
    return new Promise((resolve, reject) => {
        let buf = '';
        req.on('data', (chunk) => (buf += chunk.toString()));
        req.on('end', () => {
            if (!buf)
                return resolve({});
            try {
                resolve(JSON.parse(buf));
            }
            catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}
// ---------- core entity locators -------------------------------------------
async function findAtomFile(dataDir, atomId) {
    const atomsDir = path.join(dataDir, 'atoms');
    const files = await walk(atomsDir);
    for (const f of files) {
        try {
            const j = JSON.parse(await fs.readFile(f, 'utf-8'));
            if (j.id === atomId)
                return f;
        }
        catch { }
    }
    return null;
}
async function findPracticeFile(dataDir, projectId, practiceId) {
    const dir = path.join(dataDir, 'projects', projectId, 'practices');
    if (!existsSync(dir))
        return null;
    const files = await walk(dir);
    for (const f of files) {
        try {
            const j = JSON.parse(await fs.readFile(f, 'utf-8'));
            if (j.id === practiceId)
                return f;
        }
        catch { }
    }
    return null;
}
async function loadAllAtoms(dataDir) {
    const files = await walk(path.join(dataDir, 'atoms'));
    const atoms = [];
    for (const f of files) {
        try {
            atoms.push({
                ...(JSON.parse(await fs.readFile(f, 'utf-8'))),
                _file: path.relative(dataDir, f),
                // Absolute path so the frontend can open the enclosing folder via
                // the openContainingFolder helper in src/lib/openPath.ts.
                _absPath: path.resolve(f),
            });
        }
        catch { }
    }
    return atoms;
}
async function loadAllFrameworks(dataDir) {
    const dir = path.join(dataDir, 'frameworks');
    if (!existsSync(dir))
        return [];
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
    const result = [];
    for (const f of files) {
        try {
            result.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8')));
        }
        catch { }
    }
    return result;
}
async function loadAllProjects(dataDir) {
    const dir = path.join(dataDir, 'projects');
    if (!existsSync(dir))
        return [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const projects = [];
    for (const e of entries) {
        if (!e.isDirectory())
            continue;
        const metaFile = path.join(dir, e.name, 'meta.json');
        if (existsSync(metaFile)) {
            try {
                projects.push(JSON.parse(await fs.readFile(metaFile, 'utf-8')));
            }
            catch { }
        }
    }
    return projects;
}
async function loadProjectPractices(dataDir, projectId) {
    const dir = path.join(dataDir, 'projects', projectId, 'practices');
    if (!existsSync(dir))
        return [];
    const files = await walk(dir);
    const out = [];
    for (const f of files) {
        try {
            out.push(JSON.parse(await fs.readFile(f, 'utf-8')));
        }
        catch { }
    }
    return out;
}
// ---------- index rebuild --------------------------------------------------
async function rebuildIndex(dataDir) {
    const frameworks = await loadAllFrameworks(dataDir);
    const allAtoms = await loadAllAtoms(dataDir);
    // V1.5: The knowledge-index.json `atoms` field stays methodology-only for
    // backward compatibility with Copilot/Spotlight search. Experience atoms
    // and skill-inventory items live under data/atoms/{experience,skill-inventory}/
    // and will get their own index fields in Sprint 2. Treat missing kind as
    // methodology (pre-V1.5 legacy).
    const atoms = allAtoms.filter((a) => (a.kind ?? 'methodology') === 'methodology');
    const experienceAtoms = allAtoms.filter((a) => a.kind === 'experience');
    const skillInventoryAtoms = allAtoms.filter((a) => a.kind === 'skill-inventory');
    const projects = await loadAllProjects(dataDir);
    // count atoms per framework
    const fwAtomCount = {};
    for (const a of atoms) {
        fwAtomCount[a.frameworkId] = (fwAtomCount[a.frameworkId] || 0) + 1;
    }
    const cellNameByFrameworkAndCell = {};
    for (const f of frameworks) {
        cellNameByFrameworkAndCell[f.id] = {};
        for (const c of f.matrix?.cells ?? []) {
            cellNameByFrameworkAndCell[f.id][c.stepNumber] = c.name;
        }
    }
    // collect projectsByAtomId for stats sync
    const projectsUsingAtom = {};
    for (const p of projects) {
        const practices = await loadProjectPractices(dataDir, p.id);
        const atomIds = new Set();
        for (const pr of practices)
            atomIds.add(pr.atomId);
        for (const pin of p.pinnedAtoms ?? [])
            atomIds.add(pin.atomId);
        for (const aid of atomIds) {
            ;
            (projectsUsingAtom[aid] ??= []).push(p.id);
        }
    }
    const indexedAtoms = atoms.map((a) => ({
        id: a.id,
        name: a.name,
        nameEn: a.nameEn,
        frameworkId: a.frameworkId,
        cellId: a.cellId,
        cellName: cellNameByFrameworkAndCell[a.frameworkId]?.[a.cellId] ?? '',
        tags: a.tags ?? [],
        tagline: (a.coreIdea ?? '').slice(0, 80),
        whenToUse: a.whenToUse ?? '',
        path: a._file,
    }));
    const indexedProjects = projects.map((p) => {
        const practiceAtoms = (projectsUsingAtom['__byProject'] || []);
        return {
            id: p.id,
            name: p.name,
            innovationStage: p.innovationStage,
            atomsUsed: Array.from(new Set([...(p.pinnedAtoms?.map((x) => x.atomId) ?? [])])),
        };
    });
    const indexedExperiences = experienceAtoms.map((e) => ({
        id: e.id,
        name: e.name,
        tags: e.tags ?? [],
        sourceAgent: e.sourceAgent ?? 'user',
        sourceContext: e.sourceContext ?? '',
        insightExcerpt: (e.insight ?? '').slice(0, 200),
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        path: e._file,
    }));
    const indexedSkillInventory = skillInventoryAtoms.map((s) => ({
        id: s.id,
        name: s.name,
        toolName: s.toolName ?? 'custom',
        rawDescription: s.rawDescription ?? '',
        aiGeneratedSummary: s.aiGeneratedSummary,
        tags: s.tags ?? [],
        localPath: s.localPath ?? '',
        updatedAt: s.updatedAt,
    }));
    const index = {
        generatedAt: new Date().toISOString(),
        version: 1,
        frameworks: frameworks.map((f) => ({
            id: f.id,
            name: f.name,
            atomCount: fwAtomCount[f.id] || 0,
        })),
        atoms: indexedAtoms,
        projects: indexedProjects,
        experiences: indexedExperiences,
        skillInventory: indexedSkillInventory,
    };
    await writeJSON(path.join(dataDir, 'index', 'knowledge-index.json'), index);
    // also reverse-sync atom.stats.usedInProjects from practice data
    for (const a of atoms) {
        const used = projectsUsingAtom[a.id] ?? [];
        if (JSON.stringify(a.stats?.usedInProjects ?? []) !== JSON.stringify(used)) {
            const file = path.join(dataDir, a._file);
            const fresh = JSON.parse(await fs.readFile(file, 'utf-8'));
            fresh.stats = fresh.stats || { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 };
            fresh.stats.aiInvokeCount ??= 0;
            fresh.stats.humanViewCount ??= 0;
            fresh.stats.usedInProjects = used;
            fresh.updatedAt = new Date().toISOString();
            await writeJSON(file, fresh);
        }
    }
    return index;
}
function sha256File(file) {
    return fs.readFile(file).then((buf) => 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'));
}
async function walkRelative(root) {
    const out = [];
    if (!existsSync(root))
        return out;
    async function recur(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory())
                await recur(full);
            else if (e.isFile())
                out.push(path.relative(root, full));
        }
    }
    await recur(root);
    return out;
}
async function loadSeedManifest(seedRoot) {
    const file = path.join(seedRoot, 'SEED_VERSION.json');
    if (!existsSync(file))
        return null;
    try {
        return JSON.parse(await fs.readFile(file, 'utf-8'));
    }
    catch {
        return null;
    }
}
function seedStateFile(dataDir) {
    return path.join(dataDir, '.seed-state.json');
}
async function loadSeedState(dataDir) {
    const file = seedStateFile(dataDir);
    if (!existsSync(file))
        return null;
    try {
        return JSON.parse(await fs.readFile(file, 'utf-8'));
    }
    catch {
        return null;
    }
}
async function writeSeedState(dataDir, state) {
    await writeJSON(seedStateFile(dataDir), state);
}
/**
 * Walk all files under each rootPath relative to seedRoot. Returns
 * relative paths (relative to seedRoot) so the same paths can be looked up
 * inside dataDir for diffing.
 */
async function collectSeedFiles(seedRoot, rootPaths) {
    const out = [];
    for (const rp of rootPaths) {
        const stripped = rp.replace(/^data\//, '').replace(/\/$/, '');
        const abs = path.join(seedRoot, stripped);
        if (!existsSync(abs))
            continue;
        const files = await walkRelative(abs);
        for (const rel of files) {
            out.push(path.join(stripped, rel));
        }
    }
    return out;
}
/**
 * Compute the diff between seed and user data. Uses the saved manifest from
 * the previous sync (if any) to detect user modifications:
 *  - file in seed but not in user → added
 *  - file in both, content equal → unchanged
 *  - file in both, content differs, local hash === manifest[path] → updated (safe to overwrite)
 *  - file in both, content differs, local hash !== manifest[path] → user-modified-kept
 *  - file in user under seed paths but not in seed → removed-from-seed
 */
async function computeSeedDiff(seedRoot, dataDir, rootPaths, prevManifest) {
    const seedFiles = await collectSeedFiles(seedRoot, rootPaths);
    const seedSet = new Set(seedFiles);
    const diff = {
        added: [],
        updated: [],
        userModifiedKept: [],
        removedFromSeed: [],
        unchanged: 0,
    };
    for (const rel of seedFiles) {
        const seedAbs = path.join(seedRoot, rel);
        const userAbs = path.join(dataDir, rel);
        if (!existsSync(userAbs)) {
            diff.added.push(rel);
            continue;
        }
        const [seedHash, userHash] = await Promise.all([sha256File(seedAbs), sha256File(userAbs)]);
        if (seedHash === userHash) {
            diff.unchanged += 1;
            continue;
        }
        const pristine = prevManifest[rel] && prevManifest[rel] === userHash;
        if (pristine) {
            diff.updated.push(rel);
        }
        else {
            diff.userModifiedKept.push(rel);
        }
    }
    // detect removed-from-seed: walk user-side roots
    const userFiles = await collectSeedFiles(dataDir, rootPaths);
    for (const rel of userFiles) {
        if (!seedSet.has(rel))
            diff.removedFromSeed.push(rel);
    }
    return diff;
}
/**
 * Apply the diff: copy `added` + `updated` files from seed to user. Skips
 * userModifiedKept and removedFromSeed entirely. Rebuilds the manifest from
 * the post-sync state and writes .seed-state.json.
 */
async function applySeedSync(seedRoot, dataDir, manifest, diff) {
    const toCopy = [...diff.added, ...diff.updated];
    let synced = 0;
    for (const rel of toCopy) {
        const src = path.join(seedRoot, rel);
        const dst = path.join(dataDir, rel);
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.copyFile(src, dst);
        synced += 1;
    }
    // rebuild manifest from post-sync user state for ALL seed paths
    const postFiles = await collectSeedFiles(seedRoot, manifest.contents.rootPaths);
    const newManifest = {};
    for (const rel of postFiles) {
        const userAbs = path.join(dataDir, rel);
        if (existsSync(userAbs)) {
            newManifest[rel] = await sha256File(userAbs);
        }
    }
    const state = {
        installedVersion: manifest.version,
        dismissedVersions: (await loadSeedState(dataDir))?.dismissedVersions ?? [],
        lastSyncedAt: new Date().toISOString(),
        manifest: newManifest,
    };
    await writeSeedState(dataDir, state);
    return { synced, skipped: diff.userModifiedKept.length };
}
// ---------- main plugin ----------------------------------------------------
export function dataApiPlugin(opts) {
    const { dataDir, seedFrom } = opts;
    return {
        name: 'ccl-pm-data-api',
        async configureServer(server) {
            // First-run seed: non-destructively copy V1 seed data from the project
            // /data/ (or whatever seedFrom points at) into the resolved user data
            // directory if it's empty. Mirrors src-tauri/src/lib.rs init_seed_*.
            if (seedFrom) {
                try {
                    await seedDataDir(dataDir, seedFrom);
                }
                catch (err) {
                    // eslint-disable-next-line no-console
                    console.warn('[atomsyn] seed failed (non-fatal):', err);
                }
            }
            const middleware = async (req, res, next) => {
                if (!req.url || !req.url.startsWith('/api/'))
                    return next();
                const url = new URL(req.url, 'http://localhost');
                const parts = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean).map(decodeURIComponent);
                const method = req.method?.toUpperCase() || 'GET';
                try {
                    // ---------- native file serving ----------
                    if (parts[0] === 'fs') {
                        if (method !== 'GET')
                            return send(res, 405, { error: 'Method Not Allowed' });
                        const relativePath = decodeURIComponent(parts.slice(1).join('/'));
                        const absPath = path.join(dataDir, relativePath);
                        if (!absPath.startsWith(dataDir)) {
                            return send(res, 403, { error: 'Forbidden' });
                        }
                        if (!existsSync(absPath)) {
                            return send(res, 404, { error: 'not found' });
                        }
                        const mimeType = absPath.endsWith('.png') ? 'image/png' :
                            absPath.endsWith('.jpg') || absPath.endsWith('.jpeg') ? 'image/jpeg' :
                                absPath.endsWith('.webp') ? 'image/webp' :
                                    absPath.endsWith('.gif') ? 'image/gif' :
                                        absPath.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
                        res.setHeader('Content-Type', mimeType);
                        res.statusCode = 200;
                        res.end(await fs.readFile(absPath));
                        return;
                    }
                    // ---------- frameworks ----------
                    if (parts[0] === 'frameworks') {
                        if (method === 'GET' && parts.length === 1) {
                            return send(res, 200, await loadAllFrameworks(dataDir));
                        }
                        // GET /api/frameworks/:id/stats — coverage statistics
                        if (method === 'GET' && parts.length === 3 && parts[2] === 'stats') {
                            const fwFile = path.join(dataDir, 'frameworks', `${parts[1]}.json`);
                            if (!existsSync(fwFile))
                                return send(res, 404, { error: 'not found' });
                            const fw = JSON.parse(await fs.readFile(fwFile, 'utf-8'));
                            const nodes = [];
                            if (fw.layoutType === 'matrix') {
                                for (const c of fw.matrix?.cells ?? []) {
                                    nodes.push({ id: c.stepNumber, name: c.name, path: c.atomCategoryPath });
                                }
                            }
                            else if (fw.layoutType === 'list') {
                                for (const c of fw.list?.categories ?? []) {
                                    nodes.push({ id: c.id, name: c.name, path: c.atomCategoryPath });
                                }
                            }
                            else if (fw.layoutType === 'tree') {
                                const walkTree = (treeNodes) => {
                                    for (const n of treeNodes) {
                                        nodes.push({ id: n.id, name: n.name, path: n.atomCategoryPath });
                                        if (n.children)
                                            walkTree(n.children);
                                    }
                                };
                                walkTree(fw.tree?.roots ?? []);
                            }
                            // Load all methodology atoms for this framework
                            const fwAtomsDir = path.join(dataDir, 'atoms', parts[1]);
                            const methodologyFiles = await walk(fwAtomsDir);
                            const methodologies = [];
                            for (const f of methodologyFiles) {
                                try {
                                    methodologies.push(JSON.parse(await fs.readFile(f, 'utf-8')));
                                }
                                catch { /* skip */ }
                            }
                            // Load all experience fragments and index by linked_methodologies
                            const experienceDir = path.join(dataDir, 'atoms', 'experience');
                            const expFiles = await walk(experienceDir);
                            const fragmentsByMethodology = {};
                            for (const f of expFiles) {
                                try {
                                    const frag = JSON.parse(await fs.readFile(f, 'utf-8'));
                                    const lm = frag.linked_methodologies;
                                    if (!Array.isArray(lm))
                                        continue;
                                    for (const mid of lm) {
                                        fragmentsByMethodology[mid] = (fragmentsByMethodology[mid] || 0) + 1;
                                    }
                                }
                                catch { /* skip */ }
                            }
                            // Map methodologies to nodes by cellId matching
                            const methodologiesByNode = {};
                            for (const m of methodologies) {
                                const nodeId = String(m.cellId ?? '');
                                if (!methodologiesByNode[nodeId])
                                    methodologiesByNode[nodeId] = [];
                                methodologiesByNode[nodeId].push(m);
                            }
                            // Build per-node stats
                            let totalMethodologies = 0;
                            let totalFragments = 0;
                            let coveredNodes = 0;
                            const statsNodes = nodes.map((node) => {
                                const nodeKey = String(node.id);
                                const nodeMethods = methodologiesByNode[nodeKey] ?? [];
                                const methodologyIds = nodeMethods.map((m) => m.id);
                                let fragmentCount = 0;
                                for (const mid of methodologyIds) {
                                    fragmentCount += fragmentsByMethodology[mid] || 0;
                                }
                                totalMethodologies += nodeMethods.length;
                                totalFragments += fragmentCount;
                                if (fragmentCount > 0)
                                    coveredNodes++;
                                return {
                                    nodeId: node.id,
                                    name: node.name,
                                    methodologyCount: nodeMethods.length,
                                    fragmentCount,
                                    methodologyIds,
                                };
                            });
                            return send(res, 200, {
                                frameworkId: parts[1],
                                frameworkName: fw.name,
                                nodes: statsNodes,
                                total: {
                                    nodeCount: nodes.length,
                                    coveredNodes,
                                    totalMethodologies,
                                    totalFragments,
                                    coveragePercent: nodes.length > 0 ? Math.round((coveredNodes / nodes.length) * 100) : 0,
                                },
                            });
                        }
                        if (method === 'GET' && parts.length === 2) {
                            const all = await loadAllFrameworks(dataDir);
                            const f = all.find((x) => x.id === parts[1]);
                            return f ? send(res, 200, f) : send(res, 404, { error: 'not found' });
                        }
                        // POST /api/frameworks — create new framework
                        if (method === 'POST' && parts.length === 1) {
                            const body = await readBody(req);
                            if (!body.name)
                                return send(res, 400, { error: 'name is required' });
                            const id = body.id || body.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
                            const now = new Date().toISOString();
                            const fw = { ...body, id, schemaVersion: 1, createdAt: now, updatedAt: now };
                            const fwFile = path.join(dataDir, 'frameworks', `${id}.json`);
                            if (existsSync(fwFile)) {
                                return send(res, 409, { error: `framework already exists: ${id}` });
                            }
                            await writeJSON(fwFile, fw);
                            // Create atom directory structure based on layoutType
                            if (fw.layoutType === 'matrix') {
                                for (const cell of fw.matrix?.cells ?? []) {
                                    const segments = cell.atomCategoryPath.split('/');
                                    const folder = path.join(dataDir, 'atoms', ...segments);
                                    await fs.mkdir(folder, { recursive: true });
                                }
                            }
                            else if (fw.layoutType === 'list') {
                                for (const cat of fw.list?.categories ?? []) {
                                    const folder = path.join(dataDir, 'atoms', id, cat.id);
                                    await fs.mkdir(folder, { recursive: true });
                                }
                            }
                            else if (fw.layoutType === 'tree') {
                                const mkdirTree = async (treeNodes) => {
                                    for (const n of treeNodes) {
                                        const folder = path.join(dataDir, 'atoms', id, n.id);
                                        await fs.mkdir(folder, { recursive: true });
                                        if (n.children)
                                            await mkdirTree(n.children);
                                    }
                                };
                                await mkdirTree(fw.tree?.roots ?? []);
                            }
                            await rebuildIndex(dataDir);
                            return send(res, 201, fw);
                        }
                        // PUT /api/frameworks/:id — update framework
                        if (method === 'PUT' && parts.length === 2) {
                            const fwFile = path.join(dataDir, 'frameworks', `${parts[1]}.json`);
                            if (!existsSync(fwFile))
                                return send(res, 404, { error: 'not found' });
                            const existing = JSON.parse(await fs.readFile(fwFile, 'utf-8'));
                            const body = await readBody(req);
                            const merged = { ...existing, ...body, id: existing.id, updatedAt: new Date().toISOString() };
                            await writeJSON(fwFile, merged);
                            await rebuildIndex(dataDir);
                            return send(res, 200, merged);
                        }
                        // DELETE /api/frameworks/:id — delete framework
                        if (method === 'DELETE' && parts.length === 2) {
                            const fwFile = path.join(dataDir, 'frameworks', `${parts[1]}.json`);
                            if (!existsSync(fwFile))
                                return send(res, 404, { error: 'not found' });
                            await fs.unlink(fwFile);
                            const atomsDir = path.join(dataDir, 'atoms', parts[1]);
                            if (existsSync(atomsDir)) {
                                await fs.rm(atomsDir, { recursive: true, force: true });
                            }
                            await rebuildIndex(dataDir);
                            return send(res, 200, { ok: true });
                        }
                    }
                    // ---------- atoms ----------
                    if (parts[0] === 'atoms') {
                        if (method === 'GET' && parts.length === 1) {
                            return send(res, 200, await loadAllAtoms(dataDir));
                        }
                        if (method === 'GET' && parts.length === 2) {
                            const file = await findAtomFile(dataDir, parts[1]);
                            if (!file)
                                return send(res, 404, { error: 'not found' });
                            const atomData = JSON.parse(await fs.readFile(file, 'utf-8'));
                            atomData._file = path.relative(dataDir, file);
                            atomData._absPath = path.resolve(file);
                            return send(res, 200, atomData);
                        }
                        if (method === 'POST' && parts.length === 1) {
                            const body = await readBody(req);
                            const now = new Date().toISOString();
                            body.createdAt ||= now;
                            body.updatedAt = now;
                            body.bookmarks ||= [];
                            body.stats ||= { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 };
                            body.schemaVersion = 1;
                            // 1) Handle 'experience' / 'fragment' (V2.0)
                            if (body.kind === 'experience') {
                                if (!body.id) {
                                    return send(res, 400, { error: 'id is required for experience atoms' });
                                }
                                const slug = body.id.replace(/^atom_(exp|frag)_/, '').replace(/_/g, '-');
                                const folder = path.join(dataDir, 'atoms', 'experience', slug);
                                await fs.mkdir(folder, { recursive: true });
                                const file = path.join(folder, `${body.id}.json`);
                                await writeJSON(file, body);
                                await rebuildIndex(dataDir);
                                return send(res, 201, body);
                            }
                            // 2) Handle 'methodology' (Legacy/Default)
                            const fw = body.frameworkId;
                            if (!fw || !body.id) {
                                return send(res, 400, { error: 'frameworkId and id are required' });
                            }
                            // resolve cell folder from framework cell mapping
                            const fwFile = path.join(dataDir, 'frameworks', `${fw}.json`);
                            if (!existsSync(fwFile)) {
                                return send(res, 400, { error: `framework not found: ${fw}` });
                            }
                            const fwData = JSON.parse(await fs.readFile(fwFile, 'utf-8'));
                            // Resolve atomCategoryPath from any layout type
                            let atomCategoryPath;
                            if (fwData.layoutType === 'matrix' && fwData.matrix?.cells) {
                                const cell = fwData.matrix.cells.find((c) => c.stepNumber === body.cellId);
                                atomCategoryPath = cell?.atomCategoryPath;
                            }
                            else if (fwData.layoutType === 'list' && fwData.list?.categories) {
                                const cat = fwData.list.categories.find((c) => c.id === body.cellId);
                                atomCategoryPath = cat?.atomCategoryPath;
                            }
                            else if (fwData.layoutType === 'tree' && fwData.tree?.roots) {
                                const findNode = (nodes) => {
                                    for (const n of nodes) {
                                        if (n.id === body.cellId)
                                            return n;
                                        if (n.children) {
                                            const found = findNode(n.children);
                                            if (found)
                                                return found;
                                        }
                                    }
                                    return null;
                                };
                                const node = findNode(fwData.tree.roots);
                                atomCategoryPath = node?.atomCategoryPath;
                            }
                            if (!atomCategoryPath) {
                                return send(res, 400, { error: `cellId ${body.cellId} not in framework` });
                            }
                            const folder = path.join(dataDir, 'atoms', atomCategoryPath);
                            const slug = body.id.replace(/^atom_/, '').replace(/_/g, '-');
                            const file = path.join(folder, `${slug}.json`);
                            await writeJSON(file, body);
                            await rebuildIndex(dataDir);
                            return send(res, 201, body);
                        }
                        if (method === 'PUT' && parts.length === 2) {
                            const file = await findAtomFile(dataDir, parts[1]);
                            if (!file)
                                return send(res, 404, { error: 'not found' });
                            const body = await readBody(req);
                            body.updatedAt = new Date().toISOString();
                            body.schemaVersion = 1;
                            await writeJSON(file, body);
                            await rebuildIndex(dataDir);
                            return send(res, 200, body);
                        }
                        // V2.0 M2: lightweight view counter bump (no full atom body required)
                        if (method === 'PATCH' && parts.length === 3 && parts[2] === 'track-view') {
                            const file = await findAtomFile(dataDir, parts[1]);
                            if (!file)
                                return send(res, 404, { error: 'not found' });
                            const atom = JSON.parse(await fs.readFile(file, 'utf-8'));
                            atom.stats = atom.stats || {};
                            atom.stats.humanViewCount = (atom.stats.humanViewCount || 0) + 1;
                            atom.stats.lastUsedAt = new Date().toISOString();
                            await writeJSON(file, atom);
                            return send(res, 200, { ok: true, humanViewCount: atom.stats.humanViewCount });
                        }
                        // V2.0 M4: find experience fragments linked to a methodology atom
                        if (method === 'GET' && parts.length === 3 && parts[2] === 'related-fragments') {
                            const targetId = parts[1];
                            const experienceDir = path.join(dataDir, 'atoms', 'experience');
                            const results = [];
                            const walkJsonFiles = async (dir) => {
                                const out = [];
                                if (!existsSync(dir))
                                    return out;
                                const entries = await fs.readdir(dir, { withFileTypes: true });
                                for (const e of entries) {
                                    const full = path.join(dir, e.name);
                                    if (e.isDirectory())
                                        out.push(...(await walkJsonFiles(full)));
                                    else if (e.isFile() && e.name.endsWith('.json'))
                                        out.push(full);
                                }
                                return out;
                            };
                            const files = await walkJsonFiles(experienceDir);
                            for (const f of files) {
                                try {
                                    const atom = JSON.parse(await fs.readFile(f, 'utf-8'));
                                    const lm = atom.linked_methodologies;
                                    if (!Array.isArray(lm) || !lm.includes(targetId))
                                        continue;
                                    if (atom.stats?.userDemoted)
                                        continue;
                                    const isLocked = atom.stats?.locked === true;
                                    const confidence = isLocked ? 1.0 : (atom.confidence || 0);
                                    results.push({ atom, confidence, locked: isLocked });
                                }
                                catch { /* skip */ }
                            }
                            results.sort((a, b) => {
                                if (a.locked !== b.locked)
                                    return a.locked ? -1 : 1;
                                return b.confidence - a.confidence;
                            });
                            return send(res, 200, results.slice(0, 10));
                        }
                        // V2.0 M4: calibrate a fragment's link (lock/unlock + confidence)
                        if (method === 'PATCH' && parts.length === 3 && parts[2] === 'calibrate') {
                            const file = await findAtomFile(dataDir, parts[1]);
                            if (!file)
                                return send(res, 404, { error: 'not found' });
                            const calBody = await readBody(req);
                            const atom = JSON.parse(await fs.readFile(file, 'utf-8'));
                            atom.stats = atom.stats || {};
                            if (calBody.locked !== undefined)
                                atom.stats.locked = calBody.locked;
                            if (calBody.confidence !== undefined)
                                atom.confidence = calBody.confidence;
                            // If locking, set confidence to 1.0
                            if (calBody.locked === true)
                                atom.confidence = 1.0;
                            atom.updatedAt = new Date().toISOString();
                            await writeJSON(file, atom);
                            return send(res, 200, { ok: true, locked: atom.stats.locked, confidence: atom.confidence });
                        }
                        if (method === 'DELETE' && parts.length === 2) {
                            const file = await findAtomFile(dataDir, parts[1]);
                            if (!file)
                                return send(res, 404, { error: 'not found' });
                            await fs.unlink(file);
                            await rebuildIndex(dataDir);
                            return send(res, 200, { ok: true });
                        }
                    }
                    // ---------- projects ----------
                    if (parts[0] === 'projects') {
                        if (method === 'GET' && parts.length === 1) {
                            return send(res, 200, await loadAllProjects(dataDir));
                        }
                        if (method === 'GET' && parts.length === 2) {
                            const all = await loadAllProjects(dataDir);
                            const p = all.find((x) => x.id === parts[1]);
                            return p ? send(res, 200, p) : send(res, 404, { error: 'not found' });
                        }
                        if (method === 'POST' && parts.length === 1) {
                            const body = await readBody(req);
                            if (!body.id || !body.name)
                                return send(res, 400, { error: 'id and name required' });
                            const now = new Date().toISOString();
                            body.createdAt ||= now;
                            body.updatedAt = now;
                            body.schemaVersion = 1;
                            body.pinnedAtoms ||= [];
                            body.stageHistory ||= [];
                            const file = path.join(dataDir, 'projects', body.id, 'meta.json');
                            await writeJSON(file, body);
                            // ensure practices dir exists
                            await fs.mkdir(path.join(dataDir, 'projects', body.id, 'practices'), {
                                recursive: true,
                            });
                            await rebuildIndex(dataDir);
                            return send(res, 201, body);
                        }
                        if (method === 'PUT' && parts.length === 2) {
                            const file = path.join(dataDir, 'projects', parts[1], 'meta.json');
                            if (!existsSync(file))
                                return send(res, 404, { error: 'not found' });
                            const body = await readBody(req);
                            body.updatedAt = new Date().toISOString();
                            body.schemaVersion = 1;
                            await writeJSON(file, body);
                            await rebuildIndex(dataDir);
                            return send(res, 200, body);
                        }
                        if (method === 'DELETE' && parts.length === 2) {
                            const dir = path.join(dataDir, 'projects', parts[1]);
                            if (!existsSync(dir))
                                return send(res, 404, { error: 'not found' });
                            await fs.rm(dir, { recursive: true, force: true });
                            await rebuildIndex(dataDir);
                            return send(res, 200, { ok: true });
                        }
                        // /api/projects/:id/practices ...
                        if (parts.length >= 3 && parts[2] === 'practices') {
                            const projectId = parts[1];
                            if (method === 'GET' && parts.length === 3) {
                                return send(res, 200, await loadProjectPractices(dataDir, projectId));
                            }
                            if (method === 'POST' && parts.length === 3) {
                                const body = await readBody(req);
                                if (!body.id)
                                    return send(res, 400, { error: 'id required' });
                                body.projectId = projectId;
                                body.schemaVersion = 1;
                                const now = new Date().toISOString();
                                body.createdAt ||= now;
                                body.updatedAt = now;
                                const file = path.join(dataDir, 'projects', projectId, 'practices', `${body.id}.json`);
                                await writeJSON(file, body);
                                await rebuildIndex(dataDir);
                                return send(res, 201, body);
                            }
                            if (method === 'PUT' && parts.length === 4) {
                                const file = await findPracticeFile(dataDir, projectId, parts[3]);
                                if (!file)
                                    return send(res, 404, { error: 'not found' });
                                const body = await readBody(req);
                                body.updatedAt = new Date().toISOString();
                                body.schemaVersion = 1;
                                await writeJSON(file, body);
                                await rebuildIndex(dataDir);
                                return send(res, 200, body);
                            }
                            if (method === 'DELETE' && parts.length === 4) {
                                const file = await findPracticeFile(dataDir, projectId, parts[3]);
                                if (!file)
                                    return send(res, 404, { error: 'not found' });
                                await fs.unlink(file);
                                await rebuildIndex(dataDir);
                                return send(res, 200, { ok: true });
                            }
                        }
                    }
                    // ---------- index ----------
                    if (parts[0] === 'index') {
                        if (method === 'GET' && parts.length === 1) {
                            const file = path.join(dataDir, 'index', 'knowledge-index.json');
                            if (!existsSync(file)) {
                                return send(res, 200, await rebuildIndex(dataDir));
                            }
                            return send(res, 200, await readJSON(file, {}));
                        }
                        if (method === 'POST' && parts[1] === 'rebuild') {
                            return send(res, 200, await rebuildIndex(dataDir));
                        }
                    }
                    // ---------- scan skills (V1.5 · hot rescan) ----------
                    if (parts[0] === 'scan-skills' && method === 'POST') {
                        try {
                            const { spawn, execFileSync } = await import('node:child_process');
                            // Step 1: Sync source skills to IDE directories (install-skill)
                            // This ensures ~/.claude/skills/ and ~/.cursor/skills/ have the latest SKILL.md
                            const cliPath = path.resolve(process.cwd(), 'scripts', 'atomsyn-cli.mjs');
                            try {
                                execFileSync('node', [cliPath, 'install-skill', '--target', 'all', '--no-path'], {
                                    timeout: 10000,
                                    stdio: 'ignore',
                                });
                            }
                            catch { /* non-fatal: scan can proceed even if install-skill fails */ }
                            // Step 2: Scan IDE skill directories
                            const scriptPath = path.resolve(process.cwd(), 'scripts', 'scan-skills.mjs');
                            const result = await new Promise((resolve, reject) => {
                                let stdout = '';
                                let stderr = '';
                                const proc = spawn('node', [scriptPath, '--verbose'], {
                                    env: { ...process.env, ATOMSYN_SCAN_DATA_DIR: dataDir },
                                    stdio: ['ignore', 'pipe', 'pipe'],
                                });
                                proc.stdout.on('data', (chunk) => (stdout += chunk.toString()));
                                proc.stderr.on('data', (chunk) => (stderr += chunk.toString()));
                                proc.on('error', reject);
                                proc.on('exit', (code) => {
                                    if (code !== 0) {
                                        return reject(new Error(`scan-skills exited ${code}: ${stderr || stdout}`));
                                    }
                                    // Parse summary from stdout (scan-skills prints `N added / M unchanged / K removed`)
                                    const m = stdout.match(/(\d+)\s*added[^\d]+(\d+)\s*unchanged(?:[^\d]+(\d+)\s*removed)?/i);
                                    resolve({
                                        added: m ? parseInt(m[1], 10) : 0,
                                        unchanged: m ? parseInt(m[2], 10) : 0,
                                        removed: m && m[3] ? parseInt(m[3], 10) : 0,
                                    });
                                });
                            });
                            await rebuildIndex(dataDir);
                            return send(res, 200, { ok: true, ...result });
                        }
                        catch (err) {
                            return send(res, 500, {
                                ok: false,
                                error: err instanceof Error ? err.message : String(err),
                            });
                        }
                    }
                    // ---------- V1.5 · seed methodology updates ----------
                    if (parts[0] === 'seed-check' && method === 'GET') {
                        if (!seedFrom) {
                            return send(res, 200, {
                                seedVersion: 'unknown',
                                installedVersion: null,
                                hasUpdate: false,
                                dismissed: false,
                                reason: 'no-seed-configured',
                            });
                        }
                        const manifest = await loadSeedManifest(seedFrom);
                        if (!manifest) {
                            return send(res, 200, {
                                seedVersion: 'unknown',
                                installedVersion: null,
                                hasUpdate: false,
                                dismissed: false,
                                reason: 'no-seed-manifest',
                            });
                        }
                        // Dogfood: when project /data IS the user data dir, comparing
                        // seed to itself is meaningless — treat as already in sync.
                        if (path.resolve(seedFrom) === path.resolve(dataDir)) {
                            return send(res, 200, {
                                seedVersion: manifest.version,
                                installedVersion: manifest.version,
                                hasUpdate: false,
                                dismissed: false,
                                reason: 'dogfood-same-dir',
                                changelog: manifest.changelog,
                            });
                        }
                        const state = await loadSeedState(dataDir);
                        const installedVersion = state?.installedVersion ?? null;
                        const dismissed = state?.dismissedVersions?.includes(manifest.version) ?? false;
                        // First install (no .seed-state.json yet) — don't spam the prompt;
                        // first-run seeding already copied the files. Just record the version.
                        if (!installedVersion) {
                            return send(res, 200, {
                                seedVersion: manifest.version,
                                installedVersion: null,
                                hasUpdate: false,
                                dismissed: false,
                                reason: 'first-install',
                                changelog: manifest.changelog,
                            });
                        }
                        const isNewer = manifest.version !== installedVersion;
                        const diff = isNewer
                            ? await computeSeedDiff(seedFrom, dataDir, manifest.contents.rootPaths, state?.manifest ?? {})
                            : undefined;
                        return send(res, 200, {
                            seedVersion: manifest.version,
                            installedVersion,
                            hasUpdate: isNewer,
                            dismissed,
                            diff,
                            changelog: manifest.changelog,
                            lastSyncedAt: state?.lastSyncedAt,
                        });
                    }
                    if (parts[0] === 'seed-sync' && method === 'POST') {
                        if (!seedFrom)
                            return send(res, 400, { error: 'no-seed-configured' });
                        const manifest = await loadSeedManifest(seedFrom);
                        if (!manifest)
                            return send(res, 400, { error: 'no-seed-manifest' });
                        if (path.resolve(seedFrom) === path.resolve(dataDir)) {
                            return send(res, 200, { ok: true, synced: 0, skipped: 0, reason: 'dogfood-same-dir' });
                        }
                        const state = await loadSeedState(dataDir);
                        const diff = await computeSeedDiff(seedFrom, dataDir, manifest.contents.rootPaths, state?.manifest ?? {});
                        const result = await applySeedSync(seedFrom, dataDir, manifest, diff);
                        await rebuildIndex(dataDir);
                        return send(res, 200, { ok: true, ...result });
                    }
                    if (parts[0] === 'seed-dismiss' && method === 'POST') {
                        const body = await readBody(req);
                        const version = typeof body.version === 'string' ? body.version : null;
                        if (!version)
                            return send(res, 400, { error: 'version required' });
                        const state = (await loadSeedState(dataDir)) ?? {
                            installedVersion: '',
                            dismissedVersions: [],
                            lastSyncedAt: '',
                            manifest: {},
                        };
                        if (!state.dismissedVersions.includes(version)) {
                            state.dismissedVersions.push(version);
                        }
                        await writeSeedState(dataDir, state);
                        return send(res, 200, { ok: true });
                    }
                    if (parts[0] === 'seed-reset-dismiss' && method === 'POST') {
                        const state = await loadSeedState(dataDir);
                        if (state) {
                            state.dismissedVersions = [];
                            await writeSeedState(dataDir, state);
                        }
                        return send(res, 200, { ok: true });
                    }
                    // ---------- V1.5 · app version (stub for V1.6 GitHub Releases) ----------
                    if (parts[0] === 'app-version' && method === 'GET') {
                        // TODO(V1.6): once the repo ships, fetch
                        //   https://api.github.com/repos/circlelee/atomsyn/releases/latest
                        // and compare tag_name vs APP_VERSION using semver. Set
                        //   { latest, hasUpdate: latest > current, releaseUrl, changelogUrl }
                        return send(res, 200, {
                            current: '0.1.0',
                            latest: null,
                            hasUpdate: false,
                            reason: 'v1.5-not-published',
                        });
                    }
                    // ---------- usage log ----------
                    if (parts[0] === 'usage-log') {
                        const file = path.join(dataDir, 'growth', 'usage-log.jsonl');
                        if (method === 'GET') {
                            if (!existsSync(file))
                                return send(res, 200, []);
                            const raw = await fs.readFile(file, 'utf-8');
                            const lines = raw
                                .split('\n')
                                .filter(Boolean)
                                .map((l) => {
                                try {
                                    return JSON.parse(l);
                                }
                                catch {
                                    return null;
                                }
                            })
                                .filter(Boolean);
                            return send(res, 200, lines);
                        }
                        if (method === 'POST') {
                            const body = await readBody(req);
                            const event = { ts: new Date().toISOString(), ...body };
                            await fs.mkdir(path.dirname(file), { recursive: true });
                            await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf-8');
                            return send(res, 201, event);
                        }
                    }
                    // ---------- llm config ----------
                    if (parts[0] === 'llm-config') {
                        const file = path.join(dataDir, '..', 'config', 'llm.config.json');
                        if (method === 'GET') {
                            return send(res, 200, await readJSON(file, {}));
                        }
                        if (method === 'PUT') {
                            const body = await readBody(req);
                            await writeJSON(file, body);
                            return send(res, 200, body);
                        }
                    }
                    // ==========================================================
                    // V2.0 M6 · Notes CRUD
                    // ==========================================================
                    if (parts[0] === 'notes') {
                        const notesDir = path.join(dataDir, 'notes');
                        const trashDir = path.join(notesDir, '.trash');
                        // Ensure notes/ and .trash/ exist
                        await fs.mkdir(notesDir, { recursive: true });
                        await fs.mkdir(trashDir, { recursive: true });
                        // --- helpers ---
                        function slugifyNote(s) {
                            return (s
                                .toLowerCase()
                                .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
                                .replace(/^-+|-+$/g, '')
                                .slice(0, 40) || 'note');
                        }
                        async function loadNoteMeta(noteDir) {
                            const metaFile = path.join(noteDir, 'meta.json');
                            return readJSON(metaFile, null);
                        }
                        async function loadNoteContent(noteDir) {
                            const contentFile = path.join(noteDir, 'content.md');
                            try {
                                return await fs.readFile(contentFile, 'utf-8');
                            }
                            catch {
                                return '';
                            }
                        }
                        async function loadFullNote(noteDir, basePath) {
                            const meta = await loadNoteMeta(noteDir);
                            if (!meta)
                                return null;
                            let content = await loadNoteContent(noteDir);
                            const relDir = path.relative(basePath, noteDir);
                            const noteSlug = path.basename(noteDir);
                            // Heal stale image paths: if the note was moved before the
                            // path-rewrite fix, content may reference /api/fs/notes/<old-path>/attachments/...
                            // Rewrite any /api/fs/notes/.../<noteSlug>/attachments/ to the current relDir.
                            const correctPrefix = `/api/fs/notes/${encodeURIComponent(relDir).replace(/%2F/g, '/')}/attachments/`;
                            const stalePattern = new RegExp(`/api/fs/notes/[^)\\s]*?${noteSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/attachments/`, 'g');
                            if (content && stalePattern.test(content)) {
                                const healed = content.replace(stalePattern, correctPrefix);
                                if (healed !== content) {
                                    content = healed;
                                    // Persist the fix so it only happens once
                                    await fs.writeFile(path.join(noteDir, 'content.md'), content, 'utf-8');
                                }
                            }
                            return { ...meta, content, _dirPath: relDir };
                        }
                        async function findNoteDirById(searchDir, noteId) {
                            if (!existsSync(searchDir))
                                return null;
                            const entries = await fs.readdir(searchDir, { withFileTypes: true });
                            for (const e of entries) {
                                if (!e.isDirectory() || e.name.startsWith('.'))
                                    continue;
                                const candidate = path.join(searchDir, e.name);
                                // Check if this dir is a note dir (has meta.json)
                                const metaFile = path.join(candidate, 'meta.json');
                                if (existsSync(metaFile)) {
                                    const meta = await readJSON(metaFile, null);
                                    if (meta?.id === noteId)
                                        return candidate;
                                }
                                else {
                                    // Recurse into group dirs
                                    const found = await findNoteDirById(candidate, noteId);
                                    if (found)
                                        return found;
                                }
                            }
                            return null;
                        }
                        async function collectAllNotes(dir, basePath) {
                            const notes = [];
                            if (!existsSync(dir))
                                return notes;
                            const entries = await fs.readdir(dir, { withFileTypes: true });
                            for (const e of entries) {
                                if (!e.isDirectory() || e.name.startsWith('.'))
                                    continue;
                                const full = path.join(dir, e.name);
                                const metaFile = path.join(full, 'meta.json');
                                if (existsSync(metaFile)) {
                                    const note = await loadFullNote(full, basePath);
                                    if (note)
                                        notes.push(note);
                                }
                                else {
                                    // Recurse into group dirs
                                    notes.push(...(await collectAllNotes(full, basePath)));
                                }
                            }
                            return notes;
                        }
                        function groupDirPath(groupId) {
                            // groupId uses "-" as separator, but folder name uses the groupId directly
                            return path.join(notesDir, groupId);
                        }
                        // --- GET /api/notes/meta ---
                        if (parts.length === 2 && parts[1] === 'meta') {
                            const metaFile = path.join(notesDir, 'meta.json');
                            if (method === 'GET') {
                                const meta = await readJSON(metaFile, { version: 1, groups: [], defaultGroup: '', sortOrder: 'updatedAt' });
                                return send(res, 200, meta);
                            }
                            if (method === 'PUT') {
                                const body = await readBody(req);
                                await writeJSON(metaFile, body);
                                return send(res, 200, body);
                            }
                        }
                        // --- GET /api/notes/trash ---
                        if (parts.length === 2 && parts[1] === 'trash' && method === 'GET') {
                            const notes = await collectAllNotes(trashDir, notesDir);
                            return send(res, 200, notes);
                        }
                        // --- DELETE /api/notes/trash/:noteId (permanent delete) ---
                        if (parts.length === 3 && parts[1] === 'trash' && method === 'DELETE') {
                            const noteId = decodeURIComponent(parts[2]);
                            const noteDir = await findNoteDirById(trashDir, noteId);
                            if (!noteDir)
                                return send(res, 404, { error: 'note not found in trash' });
                            await fs.rm(noteDir, { recursive: true, force: true });
                            return send(res, 200, { ok: true });
                        }
                        // --- GET /api/notes (list all) ---
                        if (parts.length === 1 && method === 'GET') {
                            const notes = await collectAllNotes(notesDir, notesDir);
                            return send(res, 200, notes);
                        }
                        // --- POST /api/notes (create) ---
                        if (parts.length === 1 && method === 'POST') {
                            const body = await readBody(req);
                            const title = body.title || ''; // Empty by default; display name derived from content
                            const groupId = body.groupId || '';
                            const ts = Date.now();
                            const slug = slugifyNote(title || 'note');
                            const id = `note_${slug}_${ts}`;
                            // Use ID as folder name (includes timestamp → unique)
                            const dirName = `${slug}_${ts}`;
                            const now = new Date().toISOString();
                            // Determine target directory
                            const targetDir = groupId
                                ? path.join(notesDir, groupId, dirName)
                                : path.join(notesDir, dirName);
                            await fs.mkdir(targetDir, { recursive: true });
                            const meta = {
                                id,
                                title,
                                tags: body.tags || [],
                                pinned: false,
                                crystallizeStatus: 'none',
                                linkedFragments: [],
                                groupId,
                                wordCount: 0,
                                createdAt: now,
                                updatedAt: now,
                            };
                            const content = body.content || '';
                            await writeJSON(path.join(targetDir, 'meta.json'), meta);
                            await fs.writeFile(path.join(targetDir, 'content.md'), content, 'utf-8');
                            await fs.mkdir(path.join(targetDir, 'attachments'), { recursive: true });
                            return send(res, 201, {
                                ...meta,
                                content,
                                _dirPath: path.relative(notesDir, targetDir),
                            });
                        }
                        // --- Routes with :noteId ---
                        if (parts.length >= 2 && parts[1] !== 'meta' && parts[1] !== 'trash') {
                            const noteId = decodeURIComponent(parts[1]);
                            // --- GET /api/notes/:noteId ---
                            if (parts.length === 2 && method === 'GET') {
                                const noteDir = await findNoteDirById(notesDir, noteId);
                                if (!noteDir)
                                    return send(res, 404, { error: 'note not found' });
                                const note = await loadFullNote(noteDir, notesDir);
                                return send(res, 200, note);
                            }
                            // --- PUT /api/notes/:noteId ---
                            if (parts.length === 2 && method === 'PUT') {
                                const noteDir = await findNoteDirById(notesDir, noteId);
                                if (!noteDir)
                                    return send(res, 404, { error: 'note not found' });
                                const body = await readBody(req);
                                const existingMeta = await loadNoteMeta(noteDir);
                                // Update meta
                                const updatedMeta = {
                                    ...existingMeta,
                                    ...body,
                                    id: existingMeta.id, // never overwrite id
                                    updatedAt: new Date().toISOString(),
                                };
                                delete updatedMeta.content;
                                delete updatedMeta._dirPath;
                                // Word count
                                if (body.content !== undefined) {
                                    updatedMeta.wordCount = body.content.replace(/\s+/g, ' ').trim().length;
                                }
                                // Title is ONLY set via explicit rename (body.title).
                                // Content's # heading is part of the note body, not the title.
                                // When title is empty, the GUI shows content's first line as display name.
                                await writeJSON(path.join(noteDir, 'meta.json'), updatedMeta);
                                if (body.content !== undefined) {
                                    await fs.writeFile(path.join(noteDir, 'content.md'), body.content, 'utf-8');
                                }
                                return send(res, 200, {
                                    ...updatedMeta,
                                    content: body.content ?? await loadNoteContent(noteDir),
                                    _dirPath: path.relative(notesDir, noteDir),
                                });
                            }
                            // --- DELETE /api/notes/:noteId (soft delete → .trash) ---
                            if (parts.length === 2 && method === 'DELETE') {
                                const noteDir = await findNoteDirById(notesDir, noteId);
                                if (!noteDir)
                                    return send(res, 404, { error: 'note not found' });
                                const meta = await loadNoteMeta(noteDir);
                                meta.deletedAt = new Date().toISOString();
                                await writeJSON(path.join(noteDir, 'meta.json'), meta);
                                // Move to .trash/
                                const trashTarget = path.join(trashDir, path.basename(noteDir));
                                await fs.rename(noteDir, trashTarget);
                                return send(res, 200, { ok: true });
                            }
                            // --- POST /api/notes/:noteId/move ---
                            if (parts.length === 3 && parts[2] === 'move' && method === 'POST') {
                                const noteDir = await findNoteDirById(notesDir, noteId);
                                if (!noteDir)
                                    return send(res, 404, { error: 'note not found' });
                                const body = await readBody(req);
                                const targetGroupId = body.targetGroupId ?? '';
                                // Compute old relative path for content rewriting
                                const oldRelDir = path.relative(notesDir, noteDir);
                                const targetParent = targetGroupId
                                    ? path.join(notesDir, targetGroupId)
                                    : notesDir;
                                await fs.mkdir(targetParent, { recursive: true });
                                const targetDir = path.join(targetParent, path.basename(noteDir));
                                await fs.rename(noteDir, targetDir);
                                const newRelDir = path.relative(notesDir, targetDir);
                                // Rewrite image paths in content.md: /api/fs/notes/<old>/ → /api/fs/notes/<new>/
                                const contentFile = path.join(targetDir, 'content.md');
                                try {
                                    let content = await fs.readFile(contentFile, 'utf-8');
                                    const oldPrefix = `/api/fs/notes/${encodeURIComponent(oldRelDir).replace(/%2F/g, '/')}`;
                                    const newPrefix = `/api/fs/notes/${encodeURIComponent(newRelDir).replace(/%2F/g, '/')}`;
                                    if (content.includes(oldPrefix)) {
                                        content = content.split(oldPrefix).join(newPrefix);
                                        await fs.writeFile(contentFile, content, 'utf-8');
                                    }
                                }
                                catch { /* content.md may not exist yet */ }
                                // Update meta
                                const meta = await loadNoteMeta(targetDir);
                                meta.groupId = targetGroupId;
                                meta.updatedAt = new Date().toISOString();
                                await writeJSON(path.join(targetDir, 'meta.json'), meta);
                                return send(res, 200, {
                                    ...meta,
                                    content: await loadNoteContent(targetDir),
                                    _dirPath: path.relative(notesDir, targetDir),
                                });
                            }
                            // --- POST /api/notes/:noteId/restore ---
                            if (parts.length === 3 && parts[2] === 'restore' && method === 'POST') {
                                const noteDir = await findNoteDirById(trashDir, noteId);
                                if (!noteDir)
                                    return send(res, 404, { error: 'note not found in trash' });
                                const meta = await loadNoteMeta(noteDir);
                                const targetGroupId = meta.groupId || '';
                                delete meta.deletedAt;
                                meta.updatedAt = new Date().toISOString();
                                const targetParent = targetGroupId
                                    ? path.join(notesDir, targetGroupId)
                                    : notesDir;
                                await fs.mkdir(targetParent, { recursive: true });
                                const targetDir = path.join(targetParent, path.basename(noteDir));
                                await fs.rename(noteDir, targetDir);
                                await writeJSON(path.join(targetDir, 'meta.json'), meta);
                                return send(res, 200, {
                                    ...meta,
                                    content: await loadNoteContent(targetDir),
                                    _dirPath: path.relative(notesDir, targetDir),
                                });
                            }
                            // --- GET /api/notes/:noteId/crystallize-cache ---
                            if (parts.length === 3 && parts[2] === 'crystallize-cache' && method === 'GET') {
                                const noteDir = await findNoteDirById(notesDir, noteId);
                                if (!noteDir)
                                    return send(res, 404, { error: 'note not found' });
                                const cacheFile = path.join(noteDir, 'crystallize-cache.json');
                                const cache = await readJSON(cacheFile, null);
                                if (!cache)
                                    return send(res, 200, null);
                                return send(res, 200, cache);
                            }
                            // --- PUT /api/notes/:noteId/crystallize-cache ---
                            if (parts.length === 3 && parts[2] === 'crystallize-cache' && method === 'PUT') {
                                const noteDir = await findNoteDirById(notesDir, noteId);
                                if (!noteDir)
                                    return send(res, 404, { error: 'note not found' });
                                const body = await readBody(req);
                                const cacheFile = path.join(noteDir, 'crystallize-cache.json');
                                await writeJSON(cacheFile, body);
                                return send(res, 200, body);
                            }
                            // --- DELETE /api/notes/:noteId/crystallize-cache ---
                            if (parts.length === 3 && parts[2] === 'crystallize-cache' && method === 'DELETE') {
                                const noteDir = await findNoteDirById(notesDir, noteId);
                                if (!noteDir)
                                    return send(res, 404, { error: 'note not found' });
                                const cacheFile = path.join(noteDir, 'crystallize-cache.json');
                                try {
                                    await fs.rm(cacheFile);
                                }
                                catch { /* file may not exist */ }
                                return send(res, 200, { ok: true });
                            }
                            // --- POST /api/notes/:noteId/attachment ---
                            if (parts.length === 3 && parts[2] === 'attachment' && method === 'POST') {
                                const noteDir = await findNoteDirById(notesDir, noteId);
                                if (!noteDir)
                                    return send(res, 404, { error: 'note not found' });
                                const body = await readBody(req);
                                const { filename, base64 } = body;
                                if (!filename || !base64)
                                    return send(res, 400, { error: 'filename and base64 required' });
                                const attachDir = path.join(noteDir, 'attachments');
                                await fs.mkdir(attachDir, { recursive: true });
                                const buffer = Buffer.from(base64, 'base64');
                                const filePath = path.join(attachDir, filename);
                                await fs.writeFile(filePath, buffer);
                                // Return relative path for markdown reference
                                const relativePath = `notes/${path.relative(notesDir, filePath)}`;
                                return send(res, 201, { path: relativePath });
                            }
                        }
                    }
                    // ---------- analysis (P1 · AI 复盘 + 导师模式) ----------
                    if (parts[0] === 'analysis') {
                        // Lazy-import shared analysis engine (ESM, JS-only — dev server runtime)
                        // @ts-ignore — .mjs not covered by tsconfig.node.json
                        const analysisMod = await import('./scripts/lib/analysis.mjs');
                        // GET /api/analysis/dimensions
                        if (parts[1] === 'dimensions' && method === 'GET') {
                            return send(res, 200, await analysisMod.analyzeDimensions(dataDir));
                        }
                        // GET /api/analysis/timeline?months=12
                        if (parts[1] === 'timeline' && method === 'GET') {
                            const months = parseInt(url.searchParams.get('months') || '12', 10);
                            return send(res, 200, await analysisMod.analyzeTimeline(dataDir, months));
                        }
                        // GET /api/analysis/coverage
                        if (parts[1] === 'coverage' && method === 'GET') {
                            return send(res, 200, await analysisMod.analyzeCoverage(dataDir));
                        }
                        // GET /api/analysis/gaps
                        if (parts[1] === 'gaps' && method === 'GET') {
                            return send(res, 200, await analysisMod.analyzeGaps(dataDir));
                        }
                        // --- Reports CRUD ---
                        if (parts[1] === 'reports') {
                            const reportsDir = path.join(dataDir, 'analysis', 'reports');
                            await fs.mkdir(reportsDir, { recursive: true });
                            // GET /api/analysis/reports — list all
                            if (!parts[2] && method === 'GET') {
                                const files = existsSync(reportsDir)
                                    ? (await fs.readdir(reportsDir)).filter((f) => f.endsWith('.json'))
                                    : [];
                                const reports = [];
                                for (const f of files) {
                                    try {
                                        reports.push(JSON.parse(await fs.readFile(path.join(reportsDir, f), 'utf8')));
                                    }
                                    catch { /* skip corrupted */ }
                                }
                                reports.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                                return send(res, 200, reports);
                            }
                            // POST /api/analysis/reports — create
                            if (!parts[2] && method === 'POST') {
                                const body = await readBody(req);
                                const id = `report_${Date.now()}`;
                                const report = { ...body, id, createdAt: new Date().toISOString() };
                                await fs.writeFile(path.join(reportsDir, `${id}.json`), JSON.stringify(report, null, 2), 'utf8');
                                return send(res, 201, report);
                            }
                            // Routes with :id
                            if (parts[2]) {
                                const reportId = decodeURIComponent(parts[2]);
                                const reportFile = path.join(reportsDir, `${reportId}.json`);
                                // GET /api/analysis/reports/:id
                                if (method === 'GET') {
                                    if (!existsSync(reportFile))
                                        return send(res, 404, { error: 'report not found' });
                                    return send(res, 200, JSON.parse(await fs.readFile(reportFile, 'utf8')));
                                }
                                // PUT /api/analysis/reports/:id
                                if (method === 'PUT') {
                                    if (!existsSync(reportFile))
                                        return send(res, 404, { error: 'report not found' });
                                    const existing = JSON.parse(await fs.readFile(reportFile, 'utf8'));
                                    const body = await readBody(req);
                                    const merged = { ...existing, ...body, id: reportId };
                                    await fs.writeFile(reportFile, JSON.stringify(merged, null, 2), 'utf8');
                                    return send(res, 200, merged);
                                }
                                // DELETE /api/analysis/reports/:id
                                if (method === 'DELETE') {
                                    try {
                                        await fs.rm(reportFile);
                                    }
                                    catch { /* may not exist */ }
                                    return send(res, 200, { ok: true });
                                }
                            }
                        }
                    }
                    // ---------- Chat Module (V2.x) ----------
                    if (parts[0] === 'chat') {
                        const chatDir = path.join(dataDir, 'chat');
                        const sessionsDir = path.join(chatDir, 'sessions');
                        const memoryDir = path.join(chatDir, 'memory');
                        await fs.mkdir(sessionsDir, { recursive: true });
                        await fs.mkdir(memoryDir, { recursive: true });
                        // /api/chat/soul
                        if (parts[1] === 'soul') {
                            const soulFile = path.join(chatDir, 'SOUL.md');
                            if (method === 'GET') {
                                let content = '';
                                try {
                                    content = await fs.readFile(soulFile, 'utf8');
                                }
                                catch { /* empty */ }
                                return send(res, 200, { content });
                            }
                        }
                        // /api/chat/agents
                        if (parts[1] === 'agents') {
                            const agentsFile = path.join(chatDir, 'AGENTS.md');
                            if (method === 'GET') {
                                let content = '';
                                try {
                                    content = await fs.readFile(agentsFile, 'utf8');
                                }
                                catch { /* empty */ }
                                return send(res, 200, { content });
                            }
                        }
                        // /api/chat/memory
                        if (parts[1] === 'memory') {
                            const memFile = path.join(memoryDir, 'memories.jsonl');
                            if (method === 'GET') {
                                let entries = [];
                                try {
                                    const raw = await fs.readFile(memFile, 'utf8');
                                    entries = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
                                }
                                catch { /* empty or not found */ }
                                return send(res, 200, entries);
                            }
                            if (method === 'POST') {
                                const body = await readBody(req);
                                const entry = {
                                    ...body,
                                    id: `mem_${Date.now()}`,
                                    createdAt: new Date().toISOString(),
                                };
                                await fs.appendFile(memFile, JSON.stringify(entry) + '\n', 'utf8');
                                return send(res, 201, entry);
                            }
                        }
                        // /api/chat/sessions
                        if (parts[1] === 'sessions') {
                            const indexFile = path.join(sessionsDir, 'index.json');
                            async function readSessionIndex() {
                                try {
                                    return JSON.parse(await fs.readFile(indexFile, 'utf8'));
                                }
                                catch {
                                    return { sessions: [] };
                                }
                            }
                            async function writeSessionIndex(idx) {
                                await fs.writeFile(indexFile, JSON.stringify(idx, null, 2), 'utf8');
                            }
                            // No :id → list or create
                            if (!parts[2]) {
                                // GET /api/chat/sessions → list
                                if (method === 'GET') {
                                    return send(res, 200, await readSessionIndex());
                                }
                                // POST /api/chat/sessions → create
                                if (method === 'POST') {
                                    const body = await readBody(req);
                                    const now = new Date().toISOString();
                                    const id = body.id || `sess_${Date.now()}`;
                                    const session = {
                                        id,
                                        title: body.title || '新对话',
                                        createdAt: now,
                                        updatedAt: now,
                                        modelId: body.modelId || undefined,
                                        messages: body.messages || [],
                                        summary: undefined,
                                    };
                                    await fs.writeFile(path.join(sessionsDir, `${id}.json`), JSON.stringify(session, null, 2), 'utf8');
                                    // Update index
                                    const idx = await readSessionIndex();
                                    idx.sessions.unshift({
                                        id,
                                        title: session.title,
                                        updatedAt: now,
                                        messageCount: session.messages.length,
                                        preview: '',
                                    });
                                    await writeSessionIndex(idx);
                                    return send(res, 201, session);
                                }
                            }
                            // Routes with :id
                            if (parts[2]) {
                                const sessId = decodeURIComponent(parts[2]);
                                const sessFile = path.join(sessionsDir, `${sessId}.json`);
                                // GET /api/chat/sessions/:id
                                if (method === 'GET') {
                                    if (!existsSync(sessFile))
                                        return send(res, 404, { error: 'session not found' });
                                    return send(res, 200, JSON.parse(await fs.readFile(sessFile, 'utf8')));
                                }
                                // PUT /api/chat/sessions/:id
                                if (method === 'PUT') {
                                    const body = await readBody(req);
                                    let session = { id: sessId, messages: [] };
                                    try {
                                        session = JSON.parse(await fs.readFile(sessFile, 'utf8'));
                                    }
                                    catch { /* new */ }
                                    const merged = { ...session, ...body, id: sessId, updatedAt: new Date().toISOString() };
                                    await fs.writeFile(sessFile, JSON.stringify(merged, null, 2), 'utf8');
                                    // Update index
                                    const idx = await readSessionIndex();
                                    const entry = idx.sessions.find((s) => s.id === sessId);
                                    if (entry) {
                                        entry.title = merged.title || entry.title;
                                        entry.updatedAt = merged.updatedAt;
                                        entry.messageCount = (merged.messages || []).length;
                                        const lastMsg = (merged.messages || []).slice(-1)[0];
                                        entry.preview = lastMsg ? (lastMsg.content || '').slice(0, 80) : '';
                                    }
                                    else {
                                        idx.sessions.unshift({
                                            id: sessId,
                                            title: merged.title || '新对话',
                                            updatedAt: merged.updatedAt,
                                            messageCount: (merged.messages || []).length,
                                            preview: '',
                                        });
                                    }
                                    await writeSessionIndex(idx);
                                    return send(res, 200, merged);
                                }
                                // DELETE /api/chat/sessions/:id
                                if (method === 'DELETE') {
                                    try {
                                        await fs.rm(sessFile);
                                    }
                                    catch { /* may not exist */ }
                                    const idx = await readSessionIndex();
                                    idx.sessions = idx.sessions.filter((s) => s.id !== sessId);
                                    await writeSessionIndex(idx);
                                    return send(res, 200, { ok: true });
                                }
                            }
                        }
                    }
                    // ---------- psychological log ----------
                    if (parts[0] === 'psychological-log') {
                        const file = path.join(dataDir, 'growth', 'psychological-log.json');
                        if (method === 'GET') {
                            return send(res, 200, await readJSON(file, []));
                        }
                        if (method === 'POST') {
                            const body = await readBody(req);
                            const list = await readJSON(file, []);
                            list.push({ ...body, submittedAt: new Date().toISOString() });
                            await writeJSON(file, list);
                            return send(res, 201, body);
                        }
                    }
                    send(res, 404, { error: `route not handled: ${method} ${url.pathname}` });
                }
                catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('[data-api] error', err);
                    send(res, 500, { error: String(err) });
                }
            };
            server.middlewares.use(middleware);
            // build index on server boot
            rebuildIndex(dataDir).catch((err) => {
                // eslint-disable-next-line no-console
                console.error('[data-api] initial index rebuild failed:', err);
            });
        },
    };
}
