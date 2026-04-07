# CCL PM Tool · Project Memory

This is a **Personal Meta-Skill Vault** — a local-first cross-platform desktop app that
turns scattered methodology notes (product, UI/UX, Agent dev, ...) into a
**callable, growable, project-bound knowledge system** for one user.

📄 Full PRD: `docs/PRD.md`
🎨 Visual mockups: `docs/mockups/atlas.html`, `docs/mockups/atom-card.html`

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

## Environment

- **Stack**: Vite + React 18 + TS + TailwindCSS + Zustand + Framer Motion
- **Data API**: Vite dev plugin in `vite-plugin-data-api.ts` (no Tauri yet — that's a future opt-in)
- **Run**: `npm install && npm run dev` → http://localhost:5173
- **Type-check**: `npm run lint`
- **Tauri shell** (later): planned but not in v1 alpha — to add, install Rust then `npm install -D @tauri-apps/cli && npx tauri init`

---

## Visual language (design contract)

- Style: **Linear / Raycast variant of Apple/Google** (modern, glass, spring animations)
- Stage colors (CSS vars in `src/index.css`): violet/sky/emerald/amber/orange/pink
- Font: Inter + JetBrains Mono
- Animation: Framer Motion or CSS spring `cubic-bezier(0.16, 1, 0.3, 1)`
- Strict adherence to **progressive disclosure (4 levels)** on atom cards
- Theme: dark-first, full light parity, persisted to localStorage
- Reference mockups: `docs/mockups/atlas.html`, `docs/mockups/atom-card.html`

---

## Where to look first

1. **Lost?** → `docs/PRD.md` § 5 (Solution Overview)
2. **Data shape?** → `src/types/index.ts` and `skills/schemas/`
3. **How to write to disk?** → `src/lib/dataApi.ts`
4. **Visual reference?** → `docs/mockups/*.html`
