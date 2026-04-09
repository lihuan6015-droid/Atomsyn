# CCL Atlas · Project Memory

This is a **Personal Meta-Skill Vault (V1.5: 主权元认知层)** — a local-first
cross-platform Tauri desktop app that turns scattered methodology notes +
crystallized AI session experiences + local skill inventory into a
**callable, growable, 100%-local, agent-bidirectional** knowledge system
for one user. **L1** = human-facing GUI (Atlas / Playground / Growth /
Experiences / Skill Map / Settings). **L2** = AI-facing interface via
`atlas-cli` + `atlas-write` / `atlas-read` skills installed into Claude
Code and Cursor.

📄 PRD: `docs/PRD.md` (V1) · `docs/PRD-v1.5-delta.md` (V1.5 增量) · **`docs/PRD-v2.0.md` (V2.0 ← 当前)**
🎯 战略: `docs/framing/v1.5-problem-framing.md` · `docs/framing/v2.0-problem-framing.md` (V2.0 战略锚点) · **`docs/framing/v2.x-north-star.md` (V2.x 北极星 ← 当前)**
🛠 V1.5 归档: `docs/plans/v1.5-implementation-plan.md` · `docs/plans/v1.5-resume-state.md` · `docs/releases/v1.5.md`
🚀 V2.0 启动: `docs/plans/v2.0-handoff.md` · `docs/plans/v2.0-implementation-plan.md` · **`docs/plans/v2.0-m0-complete.md` (M0 完成 + M1 交接)**
🎨 Visual mockups: `docs/mockups/atlas.html`, `docs/mockups/atom-card.html`

**当前版本**: V2.1 (P0+P1 已交付)。产品定位:**认知双向操作系统 (仓库 + 结构 + 教练)**。已交付: 方法库泛化 (P0) + 统计可视化 (P0) + 认知洞察/AI复盘 (P1) + 导师模式 Skill (P1) + 认知雷达轻量版 (P1) + 书架占位页 (P2占位)。下一步: §6 聊天模块改进 + §4 书架功能实现。启动新会话前先读 `docs/framing/v2.x-north-star.md` (北极星) + `docs/plans/v2.x-vision-handoff.md` (V2.x 愿景交接)。

---

## Your role in this project

When the user opens Claude Code in this directory, you are a **协作建设者**:

1. **沉淀助手** (Sediment helper) — When given a learning note / article / chat
   summary, follow `skills/ingest-atom.skill.md` to convert it into a
   schema-compliant atom JSON file in the right framework + cell folder.

2. **实战档案员** (Practice archivist) — When the user reports applying a
   methodology in a real project, follow `skills/ingest-practice.skill.md`
   to record it as a Practice JSON under that project.

3. **索引维护员** (Index maintainer) — After any atom/practice/framework
   change, ensure `data/index/knowledge-index.json` is regenerated. The
   running dev server does this automatically; if it's not running, you
   may run `npm run reindex`.

---

## Data folder layout (always respect)

```
data/
├── frameworks/<id>.json                       Framework definitions
├── atoms/<framework>/<cell>/<slug>.json       Knowledge atoms
├── projects/<projectId>/meta.json             Project metadata
├── projects/<projectId>/practices/<id>.json   Project execution records
├── index/knowledge-index.json                 Auto-generated lightweight index
└── growth/usage-log.jsonl                     Append-only usage events

config/
└── llm.config.json                            LLM provider config (NO api keys)

skills/
├── ingest-atom.skill.md                       Note → Atom flow spec
├── ingest-practice.skill.md                   Insight → Practice flow spec
├── copilot.system.md                          Copilot persona
└── schemas/                                   JSON Schemas (validation source of truth)
```

---

## Iron rules (never break)

- **NEVER delete** files under `data/` unless the user explicitly asks
- **NEVER write** API keys into any JSON / git-tracked file
- **ALWAYS validate** new objects against `skills/schemas/*.schema.json`
- **ALWAYS preserve** ID uniqueness — atoms use `atom_<slug>`, projects
  use `project-NNN-<slug>`, practices use `practice_<slug>_<timestamp>`
- **ALWAYS update timestamps** (`updatedAt`) when mutating an object
- **ALWAYS rebuild index** after writing — Copilot and Spotlight depend on it

---

## Key data invariants

- An atom belongs to **exactly one** framework + cell. Check
  `data/frameworks/<frameworkId>.json` to see valid `cellId` values.
- An atom may have a `parentAtomId` (e.g. JTBD's parent is `atom_voc_overview`)
  — this expresses the methodology umbrella relationship.
- A project's `pinnedAtoms` may reference atoms from **any** framework
  (cross-skeleton projects are first-class).
- A practice **must** reference a real `atomId` and `projectId`. The
  index rebuild will sync `atom.stats.usedInProjects` from practice data
  — never set this field manually.

---

## Quick reference: typical user requests

| User says... | You do... |
|---|---|
| "把这段笔记沉淀进去" | Read `skills/ingest-atom.skill.md` → create atom JSON |
| "我在项目 X 用了 JTBD，沉淀一下" | Read `skills/ingest-practice.skill.md` → create practice JSON |
| "重建一下索引" | `npm run reindex` (or hit `POST /api/index/rebuild` if dev server is up) |
| "新建一个骨架" | Create `data/frameworks/<id>.json` matching the framework schema, then ask if user wants seed atoms |
| "把 X 原子和 Y 原子建立父子关系" | Set `parentAtomId` + `relationType` on the child, save, rebuild index |

---

## Environment (V1.5)

- **Stack**: Vite + React 18 + TS + TailwindCSS + Zustand + Framer Motion + **Tauri v2**
- **Data API**: Vite dev plugin (`vite-plugin-data-api.ts`) in dev mode + Tauri Rust commands in packaged mode (path resolver shared via env → `~/.ccl-atlas-config.json` → platform default)
- **Run dev (web)**: `npm install && npm run dev` → http://localhost:5173
- **Run dev (desktop)**: `npm run tauri:dev` (need rustup + macOS native title bar handles drag)
- **Build**: `npm run build` (runs `tsc -b && vite build`) — note: `npm run lint` only runs `tsc --noEmit` on src/, `npm run build` is the only check that catches `tsconfig.node.json` errors
- **Cargo check**: `export PATH="$HOME/.cargo/bin:$PATH" && (cd src-tauri && cargo check)`
- **Reindex**: `npm run reindex`
- **L2 CLI shim**: `~/.ccl-atlas/bin/atlas-cli` (sh script wrapping the project's `scripts/atlas-cli.mjs` — install via `node scripts/atlas-cli.mjs install-skill --target claude,cursor`)

## L2 · atlas-cli command surface (V1.5 contract)

```
atlas-cli write   --stdin              # create new experience atom (loose JSON in)
atlas-cli update  --id <id> --stdin    # merge into existing atom; atomically moves slug folder if name changed
atlas-cli get     --id <id>            # print one atom JSON (exit 2 if not found)
atlas-cli find    --query "..."        # search experience atoms by keyword (skill uses BEFORE write/update)
atlas-cli read    --query "..."        # markdown output for atlas-read skill consumption
atlas-cli reindex
atlas-cli where
atlas-cli install-skill --target claude,cursor
```

The two skills `~/.claude/skills/atlas-write` and `~/.claude/skills/atlas-read` (also installed under Cursor) drive these commands. **Agent never writes JSON to disk directly** — always through the CLI so schema validation, slug derivation, lock checks, and usage logging are centralized.

---

## Visual language (design contract)

- Style: **Linear / Raycast variant of Apple/Google** (modern, glass, spring animations)
- Stage colors (CSS vars in `src/index.css`): violet/sky/emerald/amber/orange/pink
- Font: Inter + JetBrains Mono
- Animation: Framer Motion or CSS spring `cubic-bezier(0.16, 1, 0.3, 1)`
- Strict adherence to **progressive disclosure (4 levels)** on atom cards
- Theme: **light-first as of V1.5**, full dark parity, persisted to zustand `ccl-app` localStorage key
- Tauri native macOS title bar tracks app theme via `getCurrentWindow().setTheme()` (requires `core:window:allow-set-theme` capability — see `src-tauri/capabilities/default.json`)
- Reference mockups: `docs/mockups/atlas.html`, `docs/mockups/atom-card.html`

---

## Where to look first

1. **Lost / picking up V1.5 work** → `docs/plans/v1.5-resume-state.md` (handoff doc)
2. **Starting V2.0 work** → `docs/plans/v2.0-handoff.md` (bridge doc)
3. **Data shape?** → `src/types/index.ts` (discriminated union: methodology / experience / skill-inventory) + `skills/schemas/`
4. **How CLI works internally** → `scripts/atlas-cli.mjs`
5. **How GUI talks to disk in dev** → `vite-plugin-data-api.ts`
6. **How Tauri talks to disk in packaged mode** → `src-tauri/src/lib.rs` (resolve_data_dir, init_*, seed_*, open_path)
7. **Visual reference** → `docs/mockups/*.html`
