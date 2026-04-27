# CCL Atlas · Project Memory

This is a **Personal Meta-Skill Vault (V1.5: 主权元认知层)** — a local-first
cross-platform Tauri desktop app that turns scattered methodology notes +
crystallized AI session experiences + local skill inventory into a
**callable, growable, 100%-local, agent-bidirectional** knowledge system
for one user. **L1** = human-facing GUI (Atlas / Playground / Growth /
Experiences / Skill Map / Settings). **L2** = AI-facing interface via
`atlas-cli` + `atlas-write` / `atlas-read` skills installed into Claude
Code and Cursor.

📄 PRD: `docs/prd/PRD-v1.md` (V1) · `docs/prd/PRD-v1.5-delta.md` (V1.5 增量) · **`docs/prd/PRD-v2.0.md` (V2.0 ← 当前)**
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
├── atoms/profile/main/atom_profile_main.json  Profile singleton (D-010 of 2026-04-bootstrap-skill, ≤1 active)
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
- **profile atom 默认 verified=false**, 不被 atomsyn-read 自动注入直到用户在 GUI ProfilePage (Growth 子 tab "画像") 校准 (D-007 of 2026-04-bootstrap-skill); profile 永远是单例 id=`atom_profile_main` (D-010), 跨多次 bootstrap / 校准 / restore 用 `previous_versions[]` 追溯, 不产生独立 profile

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
| "初始化 atomsyn / bootstrap / 把 ~/X 倒进来" | 引导用户走 dry-run + commit 两步 (D-011 of 2026-04-bootstrap-skill), 别一步到位; profile 单例语义保留 (D-010); GUI 入口三选一: 聊天页"初始化向导"按钮 / 聊天输入框 `/bootstrap [path]` (bootstrap-tools B1-B3) / 粘贴本地路径触发 banner (D-002); 默认走 agentic 模式, 不动就别加 `--mode funnel` |

---

## Environment (V1.5)

- **Stack**: Vite + React 18 + TS + TailwindCSS + Zustand + Framer Motion + **Tauri v2**
- **Data API**: Dual-channel architecture (see § Tauri 双通道架构 below)
- **Run dev (web)**: `npm install && npm run dev` → http://localhost:5173
- **Run dev (desktop)**: `npm run tauri:dev` (need rustup + macOS native title bar handles drag)
- **Build**: `npm run build` (runs `tsc -b && vite build`) — note: `npm run lint` only runs `tsc --noEmit` on src/, `npm run build` is the only check that catches `tsconfig.node.json` errors
- **Cargo check**: `export PATH="$HOME/.cargo/bin:$PATH" && (cd src-tauri && cargo check)`
- **Reindex**: `npm run reindex`
- **L2 CLI shim**: `~/.ccl-atlas/bin/atlas-cli` (sh script wrapping the project's `scripts/atlas-cli.mjs` — install via `node scripts/atlas-cli.mjs install-skill --target claude,cursor`)

## L2 · atomsyn-cli command surface (V2.x contract)

> 历史命名为 `atlas-cli` (V1.5), V2.0 重命名为 `atomsyn-cli`。

```
atomsyn-cli write   --stdin              # create new experience atom (loose JSON in)
atomsyn-cli update  --id <id> --stdin    # merge into existing atom; atomically moves slug folder if name changed
atomsyn-cli get     --id <id>            # print one atom JSON (exit 2 if not found)
atomsyn-cli find    --query "..."        # search experience atoms by keyword (skill uses BEFORE write/update)
atomsyn-cli read    --query "..."        # markdown output for atomsyn-read skill consumption
atomsyn-cli mentor  [--range week|month|all] [--format data|report]   # cognitive review (V2.0)

# V2.x cognitive-evolution (2026-04 change)
atomsyn-cli supersede --id <old-id> --input <new-atom-file> [--no-archive-old]   # 用新 atom 取代旧 atom (默认 archive 旧的)
atomsyn-cli archive --id <id> [--reason "..."] [--restore]                       # 软删除 atom; --restore 反归档
atomsyn-cli prune [--limit N]                                                    # dry-run 扫描候选 (永远不自动 mutate)

# V2.x bootstrap-skill + bootstrap-tools (2026-04 changes) · 引导式批量冷启动
atomsyn-cli bootstrap --path <dir-or-file> [--path <X> ...]
                      [--mode agentic|funnel]                       # bootstrap-tools D-001: agentic 默认
                      [--phase triage|sampling|deep-dive|all]
                      [--dry-run | --commit <session-id> | --resume <session-id>]
                      [--include-pattern <csv>] [--exclude-pattern <csv>]
                      [--user-correction "..."] [--markdown-corrected-file <path>]
                      # bootstrap-tools v2: agentic 模式 LLM 用 ls/stat/glob/grep/read 工具集探索
                      # 支持 .md/.markdown/.txt/.docx/.pdf/.json/.yaml (extractors/ 链)
                      # agentic 失败自动 fallback funnel 一次 + WARN (D-008)
                      # dry-run/commit 两步协议 (bootstrap-skill D-011)
                      # session.agent_trace[] additive 字段 (D-003)
                      # session 持久化到 ~/.atomsyn/bootstrap-sessions/

atomsyn-cli reindex
atomsyn-cli where
atomsyn-cli install-skill --target claude,cursor
```

V2.x 共享标志 (read / find 也接受):
- `--show-history`: 不过滤 supersededBy 的 atom, history 字段含 supersedes id 列表
- `--include-profile`: 不过滤 kind=profile 的 atom (debug 用)
- `--json`: read 命令的 JSON 输出 mode (含 staleness 字段)

V2.x write/update 默认开启 collision check; `--no-check-collision` 关闭, 或 `ATOMSYN_DISABLE_COLLISION_CHECK=1` 环境变量。

The three skills `~/.claude/skills/atomsyn-{write,read,mentor}/` (also installed under Cursor) drive these commands. **Agent never writes JSON to disk directly** — always through the CLI so schema validation, slug derivation, lock checks, and usage logging are centralized.

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
6. **How GUI talks to disk in Tauri** → `src/lib/tauri-api/` (TS router using @tauri-apps/plugin-fs)
7. **How Tauri Rust commands work** → `src-tauri/src/lib.rs` (resolve_data_dir, init_*, seed_*, scan_skills)
8. **Visual reference** → `docs/mockups/*.html`

---

## Tauri 双通道架构 (Data API dual-channel)

### 请求流

```
dataApi.ts  http('/frameworks')
  ├─ Dev mode (Vite):  fetch('/api/frameworks') → vite-plugin-data-api.ts middleware
  └─ Tauri packaged:   dispatch('GET', '/frameworks') → src/lib/tauri-api/router.ts
                          → routes/frameworks.ts → @tauri-apps/plugin-fs
```

### 关键决策点

`src/lib/dataApi.ts` 的 `http()` 函数通过 `isTauri() && import.meta.env.PROD` 检测运行环境：
- **Dev 模式 (`npm run dev`) + Tauri dev (`npm run tauri:dev`)**: 直接 `fetch('/api/...')` → Vite 中间件处理
- **Tauri 打包模式**: 懒加载 `tauri-api/router.ts` → 路由到对应 handler → 通过 Tauri FS 插件读写文件

> **⚠️ 重要**: `tauri:dev` 模式下 `isTauri()` 返回 `true`，但必须使用 Vite fetch 路径（因为 Vite server 在运行）。只有 `import.meta.env.PROD === true`（打包模式）才走 Tauri API router。忽略这一点会导致 `tauri:dev` 模式下所有 API 调用静默失败。

### 添加新 API 端点的规则

**必须同时在两处实现**:
1. `vite-plugin-data-api.ts` — dev 模式实现
2. `src/lib/tauri-api/routes/*.ts` — Tauri 模式实现

**检查清单**:
- [ ] 路由在 `router.ts` 的 `handlers` 数组中注册
- [ ] 使用 `fsHelpers.ts` 的 `readJSON`/`writeJSON`/`walk` 等标准函数
- [ ] 写操作后调用 `rebuildIndex()` (如果影响索引数据)
- [ ] 二进制文件（图片等）使用 `convertFileSrc()` 而非 `/api/fs/` URL
- [ ] `npm run build` + `cargo check` 通过

### 文件结构

```
src/lib/tauri-api/
├── fsHelpers.ts           封装 @tauri-apps/plugin-fs 的标准 I/O 函数
├── router.ts              路由分发（method + path → handler）
├── rebuildIndex.ts        索引重建逻辑
├── analysisEngine.ts      分析聚合引擎（移植自 scripts/lib/analysis.mjs）
└── routes/
    ├── frameworks.ts      frameworks CRUD + stats
    ├── atoms.ts           atoms CRUD + track-view + related-fragments + calibrate
    ├── projects.ts        projects + practices CRUD
    ├── notes.ts           notes 完整生命周期（含图片 URL 重写）
    ├── chat.ts            chat sessions + soul/agents + memory
    ├── analysis.ts        分析端点 + reports CRUD
    ├── misc.ts            index, usage-log, psych-log, llm-config, app-version, seed-*
    └── fileServing.ts     /api/fs/{path} 二进制文件服务
```

### 图片文件服务

- **Dev 模式**: `<img src="/api/fs/notes/...">` → Vite 中间件直接读文件
- **Tauri 模式**: Notes handler 在加载内容时自动将 `/api/fs/` URL 重写为 `convertFileSrc()` 资产协议 URL
- **上传图片时**: `NoteEditor.tsx` 在 Tauri 模式下直接生成 `convertFileSrc()` URL

### atomsyn-cli 打包兼容

CLI 安装路径: `~/.atomsyn/bin/atomsyn-cli.mjs`（由 Tauri `install_agent_skills` 从 bundled resources 复制）

- 核心命令 (write, update, get, find, read, where) 使用 `resolveDataDir()` → 不依赖 PROJECT_ROOT ✅
- `reindex` 命令：优先尝试 `PROJECT_ROOT/scripts/rebuild-index.mjs`，不存在时使用内联实现 ✅
- `install-skill` 命令：仅在开发模式使用，打包模式由 Rust `install_agent_skills` 处理

### V2.x bootstrap-skill API (2026-04 change)

bootstrap session 端点 + profile 4 端点已实现双通道 (`vite-plugin-data-api.ts` + `src/lib/tauri-api/routes/{atoms,bootstrap}.ts`):

- `GET /atoms/profile` · `GET /atoms/profile/versions` · `POST /atoms/profile/restore` · `POST /atoms/:id/calibrate-profile`
- `GET /bootstrap/sessions` · `GET /bootstrap/sessions/:id` · `POST /bootstrap/sessions/:id/commit` · `DELETE /bootstrap/sessions/:id`

**packaged Tauri commit caveat**: `POST /bootstrap/sessions/:id/commit` 在 packaged 模式当前返回 501 (Tauri 无 shell 插件 + 无中心化 LLM 客户端, 不能 spawn `atomsyn-cli ingest` 子进程)。tauri:dev 模式 GUI 走 Vite 中间件正常。打包模式 fallback: `~/.atomsyn/bin/atomsyn-cli bootstrap --commit <id>` 直跑, 待后续 Rust shell command 包装。

### V2.x bootstrap-tools (2026-04 change · v2 增量)

- 文档解析: 新增 `scripts/lib/bootstrap/extractors/` 目录 — markdown / code / text / **docx (mammoth)** / **pdf (pdfjs-dist legacy)**, 统一 `{text, meta, skipped?, reason?}` 输出 (D-004)
- Agent 工具集: `scripts/lib/bootstrap/agentTools.mjs` 5 原子 (`ls / stat / glob / grep / read`), path-prefix 沙箱 (D-006), 中文路径 NFC normalize, 上限 ls=200 / glob=500 / grep=50 hits / read=16KB
- agentic loop: `scripts/lib/bootstrap/agentic.mjs::runAgenticDeepDive` — LLM tool-use 替代硬编码 funnel (D-001), 双重上限 maxLoops=30 + maxTokens=100k (D-009); `scripts/lib/bootstrap/llmClient.mjs::chatWithTools` 双分支 Anthropic + OpenAI (D-005)
- session schema 加 `options.mode` + `agent_trace[]` (additive, D-003); v1 session 加载零异常
- ChatInput `/bootstrap` 命令 + 路径粘贴 banner (D-002): 派发 `atomsyn:open-bootstrap` CustomEvent → ChatPage 监听打开向导
- BootstrapWizard PathsScreen 多选目录 + 多选具体文件 (filter md/markdown/txt/docx/pdf/json/yaml); DryrunScreen 加 agent_trace timeline 折叠面板
- Tauri capabilities/default.json fs:scope 加 `$HOME/Documents/{,**}` + `Downloads/{,**}` + `Desktop/{,**}` (D-007), **不加** `~/**`

**铁律新增**: agentic 失败时 cmdBootstrap 自动 fallback funnel 一次 + WARN (D-008); v1 funnel 实现 (`deepDive.mjs`) 保留作 fallback, 不删, 待 6 个月观察后再决
