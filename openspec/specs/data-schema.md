# Data Schema · 顶层数据形态总览

> **一句话**: 本文档是 Atomsyn 数据形态的**高层结构总览**和**变更历史索引**。详细的 JSON Schema 是真理之源, 在 `skills/schemas/` 下; 本文是地图, 不是真理。
>
> **修改规则**: 严禁直接编辑本文件正文部分。任何 schema 变更必须:
> 1. 通过一次 openspec change
> 2. 在该 change 内更新 `skills/schemas/*.schema.json` (真理源)
> 3. 在该 change 归档时, 在本文件 §Schema Changelog 区追加一行变更摘要
>
> **真理源位置**: `skills/schemas/`

---

## 1 · 顶层数据形态

```
data/
├── frameworks/                    方法论骨架定义
│   └── <framework-id>.json
│
├── atoms/                         认知原子 (核心实体)
│   ├── <framework>/<cell>/        methodology kind 原子
│   ├── experience/<slug>/         experience kind 原子 (atomsyn-write 创建)
│   ├── fragment/<slug>/           fragment kind 原子 (碎片提炼)
│   ├── skill-inventory/<tool>/    skill-inventory kind 原子 (扫描本地 skills)
│   └── profile/main/              profile kind 原子 (单例, 全库唯一; D-010, V2.x bootstrap-skill)
│       └── atom_profile_main.json   ← 永远只有这 1 个文件
│
├── projects/                      项目实体
│   └── <project-id>/
│       ├── meta.json
│       └── practices/
│           └── <practice-id>.json
│
├── analysis/                      分析报告
│   └── reports/<report-id>.json
│
├── notes/                         笔记模块数据
│   └── <note-slug>/
│       ├── content.md
│       └── images/
│
├── chat/                          聊天会话
│   └── sessions/<session-id>.json
│
├── growth/
│   └── usage-log.jsonl            事件流 (append-only)
│
├── psych/
│   └── log.jsonl                  心理自查事件 (append-only)
│
├── index/
│   └── knowledge-index.json       自动生成的轻量级索引
│
└── .seed-state.json               seed version + sha256 manifest
```

---

## 2 · 核心实体一览

| 实体 | Schema 文件 | 主要字段 (摘要) | 创建路径 |
|---|---|---|---|
| Framework | `skills/schemas/framework.schema.json` | id, name, cells[], parentFrameworkId | 用户手建 / seed |
| Atom (methodology) | `skills/schemas/atom.schema.json` | id, kind:"methodology", frameworkId, cellId, parentAtomId | seed / 用户手建 |
| Atom (experience) | 同上, kind 不同 | id, kind:"experience", linkedMethodologies[] | atomsyn-cli ingest/write |
| Atom (fragment) | 同上 | id, kind:"fragment", sourceNoteId | 碎片提炼流程 |
| Atom (skill-inventory) | 同上 | id, kind:"skill-inventory", tool, path | scan-skills |
| Atom (profile, V2.x) | `skills/schemas/profile-atom.schema.json` | id (固定 `atom_profile_main`, 单例 D-010), kind:"profile", identity (开放对象 — role / working_style / primary_languages[] / primary_tools[]), preferences (5 维 0-1 数值: scope_appetite / risk_tolerance / detail_preference / autonomy / architecture_care, 与 plan-tune 同名同语义 D-008), knowledge_domains[], recurring_patterns[], verified (bool, 默认 false 直到用户 GUI 校准 D-007), verifiedAt (ISO), inferred_at (ISO), source_summary (string, 不存原始内容), evidence_atom_ids[], previous_versions[] (数组 of {version, supersededAt, snapshot, trigger ∈ {bootstrap_initial, bootstrap_rerun, user_calibration, agent_evolution, restore_previous}, evidence_delta[]}, D-010 单例 + 历史快照追溯 替代 supersede 链) | atomsyn-cli bootstrap (commit 阶段 trigger=bootstrap_initial/bootstrap_rerun) / GUI ProfilePage 校准 (trigger=user_calibration) / restore 历史版本 (trigger=restore_previous) |
| Project | `skills/schemas/project.schema.json` | id, name, pinnedAtoms[], status | 用户手建 |
| Practice | `skills/schemas/practice.schema.json` | id, atomId, projectId, outcome | atomsyn-cli + GUI |

### 任意 kind atom 上的 additive 字段 (V2.x bootstrap-skill)

任意 kind 的 atom (methodology / experience / fragment / skill-inventory / profile) 的 `stats` 字段都新增两个 additive 可选字段:

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| `stats.imported` | bool | `false` | 是否由 `atomsyn-cli bootstrap` 写入 (区分用户后续手动沉淀); mentor v2 可基于此过滤"忽略 imported 看真实新沉淀" (D8) |
| `stats.bootstrap_session_id` | string \| null | `null` | 写入此 atom 的 bootstrap session id (`boot_<uuid>`); 用于追溯到具体冷启动会话 |

> 旧 atom 默认 `imported=undefined` / `bootstrap_session_id=undefined`, schema 校验通过 (additive 兼容); reindex 不需要 patch 旧数据。

### 续表 (回到原核心实体)

| 实体 | Schema 文件 | 主要字段 (摘要) | 创建路径 |
|---|---|---|---|
| Analysis Report | `skills/schemas/analysis-report.schema.json` (TODO 确认) | id, range, blindSpots[], trends[] | atomsyn-mentor |

> [TODO] 与实际 `skills/schemas/` 文件对照核实并填齐字段, 后续 change 完成。

---

## 3 · 关键不变量 (Data Invariants)

> 来源: `CLAUDE.md` § "Key data invariants"

- **唯一归属**: 一个 atom 属于**且仅属于**一个 framework + cell。`cellId` 必须在 `data/frameworks/<frameworkId>.json` 的 cells 列表内
- **方法论族谱**: 一个 atom 可有 `parentAtomId` (e.g. JTBD's parent is `atom_voc_overview`), 表达"方法论伞"关系
- **跨骨架项目**: project 的 `pinnedAtoms` 可引用任意 framework 的 atoms (跨骨架是一等公民)
- **实践引用真实**: practice 必须引用真实存在的 `atomId` + `projectId`
- **派生字段不手填**: `atom.stats.usedInProjects` 由 reindex 从 practice 数据反向同步, 永远不要手动设置
- **ID 命名**:
  - atom: `atom_<slug>` 或 `atom_exp_<slug>_<timestamp>` (experience kind)
  - project: `project-NNN-<slug>`
  - practice: `practice_<slug>_<timestamp>`
- **时间戳**: 任何变更必须更新 `updatedAt`

---

## 4 · Discriminated Union 设计

Atom 是 discriminated union, 由 `kind` 字段判别:

```ts
type Atom =
  | MethodologyAtom    // kind: "methodology"
  | ExperienceAtom     // kind: "experience"
  | FragmentAtom       // kind: "fragment"
  | SkillInventoryAtom // kind: "skill-inventory"
  | ProfileAtom        // kind: "profile" (V2.x bootstrap-skill, 单例 D-010)
```

> 真理源: `src/types/index.ts`
>
> 本文不复制类型定义, 避免双源不一致。

---

## 5 · 派生数据 (Derived Data)

下列文件**不是真理源**, 是从核心实体派生出来的, 任何修改都应通过重建而非直接编辑:

| 文件 | 派生自 | 重建命令 |
|---|---|---|
| `data/index/knowledge-index.json` | `atoms/`, `projects/`, `practices/` | `npm run reindex` 或 `atomsyn-cli reindex` |
| `atom.stats.usedInProjects` | `practices/` | reindex 自动同步 |
| 分析报告聚合 | atoms + practices + usage-log | atomsyn-cli mentor (按需) |

---

## 6 · 双通道架构与 schema 一致性

Atomsyn 有两条数据 API 路径 (Vite dev / Tauri prod), 必须使用**同一份 schema**:

- Dev: `vite-plugin-data-api.ts` 中的写入路径
- Prod: `src/lib/tauri-api/routes/*.ts` 中的写入路径
- CLI: `scripts/atomsyn-cli.mjs` 中的写入路径

任何 schema 变更必须三处同步, 否则会出现"开发模式正常、打包模式崩溃" (或反之) 的 silent bug。

---

## 7 · 实现引用

- Schema 真理源: `skills/schemas/*.schema.json`
- TS 类型源: `src/types/index.ts`
- Reindex 实现: `scripts/rebuild-index.mjs` + `src/lib/tauri-api/rebuildIndex.ts`
- 写入入口: `scripts/atomsyn-cli.mjs` (CLI) · `vite-plugin-data-api.ts` (dev) · `src/lib/tauri-api/routes/` (prod)

---

## 8 · Schema Changelog

> 每次 change 归档时, 如改动了任何 schema, 必须在此追加。
>
> 格式: `YYYY-MM-DD · <change-id> · <schema-file> · <breaking|additive|fix> · <一句话摘要>`

- 2026-04-26 · openspec-bootstrap · n/a · n/a · 建立本契约文档骨架, 字段对照与 [TODO] 由后续 change 填补
- 2026-04-26 · 2026-04-cognitive-evolution · atom.schema.json · additive · 新增 5 个可选字段: `lastAccessedAt` (ISO 8601, read 命中节流写入) · `supersededBy` (单值 atom id) · `supersedes` (atom id 数组, 单向链表) · `archivedAt` (ISO 8601 软删除时间戳) · `archivedReason` (≤ 500 字符)
- 2026-04-26 · 2026-04-cognitive-evolution · experience-atom.schema.json · additive · 同上 5 字段
- 2026-04-26 · 2026-04-cognitive-evolution · experience-fragment.schema.json · additive · 同上 5 字段
- 2026-04-26 · 2026-04-cognitive-evolution · src/types/index.ts · additive · 新增 `AtomEvolutionFields` mixin interface, MethodologyAtom / ExperienceAtom / ExperienceFragment 三个 interface 分别 extends, skill-inventory 不参与 (演化语义不同)
- 2026-04-26 · 2026-04-bootstrap-skill · profile-atom.schema.json (new) + atom.schema.json stats additive · 新增 profile kind (单例 id=`atom_profile_main`, 文件路径 `data/atoms/profile/main/atom_profile_main.json`, 含 identity / preferences 5 维 / knowledge_domains[] / recurring_patterns[] / verified / verifiedAt / inferred_at / source_summary / evidence_atom_ids[] / `previous_versions[]` 替代 supersede 链 D-010); 所有 atom 加 `stats.imported` (bool) + `stats.bootstrap_session_id` (string|null) (additive 兼容旧数据); src/types/index.ts 新增 `ProfileAtom` 加进 `Atom` 联合类型
