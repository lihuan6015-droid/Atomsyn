# Implementation Handoff · 2026-04 双 Change 实施交接

> **目的**: 让任意 Agent (主 Claude / 子 agent / 新会话压缩后的延续) 在**不需要回看历史对话**的情况下, 准确理解本批两个 change 的实施意图、顺序、耦合关系和验证标准, 端到端推进开发到合并归档。
>
> **状态**: handoff (实施前已对齐, 等待开工信号)
> **创建**: 2026-04-26
> **关联 changes**:
> - `openspec/changes/2026-04-cognitive-evolution/` (P0, 先实施)
> - `openspec/changes/2026-04-bootstrap-skill/` (P1, 依赖前者)

---

## 0 · 给延续会话的开场提示

如果你是被新会话激活的 Agent, **先读这 5 个文件** (按顺序), 加起来约 4500 行, 是本次实施的全部上下文:

1. `.claude/CLAUDE.md` — 项目铁律 + 数据布局 + 双通道架构
2. `docs/framing/v2.x-north-star.md` — V2.x 北极星 (一定要先理解三层架构)
3. `openspec/README.md` — OpenSpec 流程 (变更管理规范)
4. `openspec/changes/IMPLEMENTATION-HANDOFF.md` (本文) — 双 change 实施交接 (你正在读)
5. `openspec/changes/2026-04-cognitive-evolution/proposal.md` + `design.md` — 第一个要实施的 change

读完上面 5 个文件后, 你应该能回答以下问题, 不能就再读对应的 spec:

- Atomsyn 是什么? V2.x 北极星是什么? (从 v2.x-north-star.md)
- 为什么要做"认知演化"? (从 cognitive-evolution proposal §3)
- supersede / archive / prune 三个新命令分别解决什么问题? (从 cognitive-evolution design §5.1.3-5.1.5)
- profile atom 单例 + previous_versions[] 是什么? (从 bootstrap-skill design §4.2 + D-010)
- dry-run + commit 两阶段协议是什么? (从 bootstrap-skill D-011)
- 两个 change 之间的耦合点在哪? (从本文 §3 + cognitive-evolution D-008)

---

## 1 · 实施意图一句话

我们要让 Atomsyn 的认知**会演化、会冷启动**:

- **演化** (cognitive-evolution): 旧认知不再是僵化的, 通过 staleness 信号 + collision check + supersede / archive / prune 协议, 让"打破→重建"成为一等公民
- **冷启动** (bootstrap-skill): 新用户不再面对空账户, 通过 `atomsyn-bootstrap` skill + CLI, 引导式地把硬盘上的过程文档批量提炼成 1 条 profile + N 条 fragment/experience atom

两者合起来兑现 V2.x 北极星: **"让你积累的认知, 在需要时醒来"** —— 醒来时**还是新鲜的**, 而不是 6 个月前的过时认知。

---

## 2 · 实施顺序与里程碑

### 强约束: cognitive-evolution **必须先合并**

bootstrap 一次性写入大量 atom, 如果没有 supersede/staleness 机制, 后续修正路径全靠手删 → 知识库污染。Profile atom 也依赖 cognitive-evolution 的 `applyProfileEvolution` 函数 (见 cognitive-evolution D-008)。

### 三阶段时序

```
Phase α · cognitive-evolution 实施 (~2-3 周)
   ├─ Schema/数据迁移 (A 组任务)
   ├─ CLI 实现 (B 组, 含 applyProfileEvolution 函数 D-008)
   ├─ GUI 最小化改动 (C 组)
   ├─ 数据 API 双通道 (D 组)
   ├─ 三个 Skill 协作更新 (E 组, atomsyn-read/write/mentor)
   ├─ 文档 (F 组)
   ├─ 测试 + dogfood (G 组)
   └─ 合并主分支 (满足 V1-V8)

Phase β · bootstrap-skill 实施 (~2-3 周, 依赖 α 已合并)
   ├─ Schema/数据迁移 (A 组, 含 profile-atom.schema.json)
   ├─ CLI 实现 (B 组, 含 dry-run + commit 两阶段)
   ├─ GUI 实现 (C 组, 含 BootstrapWizard + ProfilePage 校准模块)
   ├─ 数据 API 双通道 (D 组, 8 个新端点)
   ├─ Skill 契约 (E 组, 第 4 个 atomsyn-bootstrap skill)
   ├─ 文档 (F 组)
   ├─ 测试 + dogfood (G 组, 含 V11/V12/V13 跨任务回归)
   └─ 合并主分支 (满足 V1-V13)

Phase γ · 联调 + 归档
   ├─ 端到端打通: bootstrap → atom 入库 → cognitive-evolution staleness 生效 → mentor 主动建议 prune
   ├─ profile 演化闭环: bootstrap commit → GUI 校准 verified=true → 90 天后 staleness 提示 → 用户回校准
   ├─ 30 天 dogfood 复盘 (回看 confidence_decay 半衰期是否需调)
   └─ 两个 change 各自 mv 到 openspec/archive/2026/04/, 在 docs/plans/v2.2-bootstrap.md 写叙事段落
```

**判断 phase α 完成的硬指标** (cognitive-evolution tasks.md V1-V8 全部勾掉):
- npm run build / lint / cargo check 全过
- npm run reindex 后 ~200 个老 atom 全过校验
- 主流 dogfood 路径 (read 温度计 → write collision → supersede → archive → mentor prune) 端到端跑通
- usage-log 含新事件类型

**判断 phase β 完成的硬指标** (bootstrap-skill tasks.md V1-V13 全部勾掉, 重点 V11-V13):
- profile 单例不变量: `find <dataDir>/atoms/profile -name 'atom_profile_*.json' | wc -l` = 1
- dry-run + commit 两阶段端到端 (用户在 GUI 删除部分候选后 commit, 删的不入库)
- GUI 校准模块端到端 (verified toggle / restore previous_versions / 90 天提示)

---

## 3 · 两个 change 的耦合点 (重要)

### 3.1 共享代码: `scripts/lib/evolution.mjs::applyProfileEvolution`

cognitive-evolution 在 B1 任务实现这个函数 (含签名、推快照入栈、覆写顶层、更新索引)。bootstrap-skill 在 B13 任务**调用**这个函数 (commit 阶段写入 profile 时使用)。

签名 (在 cognitive-evolution design §4.2.1 定义):
```js
applyProfileEvolution({
  newSnapshot: {
    preferences: {scope_appetite, risk_tolerance, ...},
    identity: {role, working_style, ...},
    knowledge_domains: [...],
    recurring_patterns: [...],
    evidence_atom_ids: [...]
  },
  trigger: 'bootstrap_initial' | 'bootstrap_rerun' | 'user_calibration' | 'agent_evolution'
}) → ProfileAtom (写盘后返回最新版)
```

### 3.2 共享 schema: `previous_versions[]` 字段

由 bootstrap-skill 在 A2 任务 (新建 `skills/schemas/profile-atom.schema.json`) 定义, cognitive-evolution 不直接定义但需要感知 (在 staleness 公式中读 verifiedAt 字段)。

**协议**: bootstrap-skill 实施时, schema 的字段命名以 cognitive-evolution design §4.2.1 中的描述为准, 不擅自改动。

### 3.3 imported atom 的 staleness 兜底

bootstrap 写入的 atom 默认:
- `confidence: 0.5`
- `lastAccessedAt: null`
- `stats.imported: true`
- `stats.bootstrap_session_id: <id>`

cognitive-evolution 的 `computeStaleness` 函数在遇到 imported atom 时:
- 如果 `lastAccessedAt=null`, 用 `createdAt` 兜底, 不让"刚 import 的 atom 立即被标 stale"
- 这条逻辑在 cognitive-evolution B13 任务实现, 必须在 bootstrap-skill 实施前完成

---

## 4 · 关键决策快查 (实施时不要重新想)

### cognitive-evolution

| 决策 | 内容 | 来源 |
|---|---|---|
| D-001 | 选 supersede 必做、fork 列 future | accepted |
| D-002 | 不新增 delete, 只 archive (软删除) | accepted |
| D-003 | 三机制全做: read staleness + write collision + supersede/prune | accepted |
| D-004 | lastAccessedAt 由 CLI 在 read/find 命中时被动更新 | accepted |
| D-005 | prune 永远 dry-run + 用户裁决, 绝不 LLM 自动改库 | accepted |
| D-006 | confidence_decay v1: 指数衰减, 半衰期 180 天 | accepted (30 天 dogfood 后回看) |
| D-007 | collision check v1: 关键词重叠 + 反义短语库, 不上 embedding | accepted |
| D-008 | profile 享受演化协议但用 previous_versions[] 替代 supersede 链 | accepted (与 bootstrap-skill 联动) |

### bootstrap-skill

| 决策 | 内容 | 来源 |
|---|---|---|
| D-001 | 双层产出: 1 profile + N experience/fragment | accepted |
| D-002 | 5 层架构选 ② Agent 工程派 (Profile/Preferences/Episodic/Domain/Reflections) | accepted |
| D-003 | 3 阶段 funnel (TRIAGE → SAMPLING → DEEP DIVE), 每阶段都是关卡 | accepted |
| D-004 | DEEP DIVE 默认串行, --parallel opt-in | accepted |
| D-005 | 隐私边界 = 敏感关键字扫描 + .atomsynignore | accepted |
| D-006 | Skill 命名 = atomsyn-bootstrap | accepted |
| D-007 | profile v1 仅观察, 不让 read 自动注入 | accepted |
| D-008 | profile schema 与 plan-tune 5 维兼容 | accepted |
| D-009 | GUI 入口 = 聊天页面专属"初始化向导"按钮 | accepted |
| **D-010** | **profile 单例 + previous_versions[] 数组追溯** | **accepted (用户反馈定)** |
| **D-011** | **dry-run 仅 markdown 报告, 写入再生成 JSON** | **accepted (用户反馈定)** |
| **D-012** | **LLM prompt v1 hard-code 在 scripts/bootstrap/prompts/, 不放配置文件** | **accepted (用户反馈定)** |
| **D-013** | **v1 必交付 GUI 认知画像模块 (校准入口)** | **accepted (用户反馈新增)** |

---

## 5 · 关键不变量 (实施时不能破坏)

### Atomsyn 项目级不变量 (来自 CLAUDE.md, 永不破坏)

1. 用户数据**只存**平台目录 (`~/Library/Application Support/atomsyn/`), 项目 `data/` 仅作种子源
2. **CLI-first**: 所有写入必须经过 `atomsyn-cli`, 不允许 GUI 直接 writeJSON
3. **数据 API 双通道**: 任何新端点必须**同时**在 `vite-plugin-data-api.ts` 和 `src/lib/tauri-api/routes/*.ts` 实现
4. **Schema 校验**: 新建对象必须通过 `skills/schemas/*.schema.json`
5. **ID 唯一性**: atoms 用 `atom_<slug>`, projects 用 `project-NNN-<slug>`, practices 用 `practice_<slug>_<timestamp>`
6. **永不破坏 V2.0 现有用户数据**: 所有 schema 变更 additive, 老 atom 加载零异常

### 本批 change 引入的新不变量

1. **profile 单例** (D-010): 全库永远只有 1 条活跃 profile, id=`atom_profile_main`
2. **演化保留轨迹** (D-002 + D-008): supersede / archive / restore 都不丢学习轨迹, previous_versions / archivedAt 字段保留历史
3. **prune 用户裁决** (D-005): LLM 永不自动改库, 只提议候选
4. **profile v1 仅观察** (D-007): atomsyn-read 不消费 profile 直到用户在 GUI 校准 verified=true
5. **dry-run + commit 两阶段** (D-011): bootstrap 写入永不一步到位, 用户必有机会在 markdown 上纠错
6. **prompt 模板锁定** (D-012): bootstrap LLM prompt 在 `scripts/bootstrap/prompts/*.md`, 不读用户配置

---

## 6 · 实施时的常见误区 (避坑指南)

| 误区 | 正确做法 |
|---|---|
| 看到 profile 演化就建新 atom (atom_profile_v2 等) | 用 `applyProfileEvolution` 单例覆写 + previous_versions 入栈 (D-010) |
| dry-run 也跑完整 LLM 生成 atom JSON | dry-run 只生成人类可读 markdown, 不调 ingest (D-011) |
| 把 prompt 模板放 config/llm.config.json 让用户改 | v1 hard-code 在 scripts/bootstrap/prompts/*.md (D-012) |
| GUI 校准模块作为 v2 增量 | v1 必交付, 没有它 verified 永远 false 等于功能死 (D-013) |
| Agent 检测到认知矛盾就自动 supersede | 必须 AskUserQuestion 用户裁决 (D-005) |
| read 新会话就消费 profile 当系统提示 | v1 不行, 等用户校准 verified=true 后 v2 再放开 (D-007) |
| 看到 staleness 就直接 archive 旧 atom | staleness 只是信号, archive 必须用户/Agent 显式调命令 |
| collision 触发就强制阻止 write | collision 是 stderr 警告 + stdout candidates, 不阻止主流程 |
| 跨 change 共享代码用复制粘贴 | 用 `scripts/lib/evolution.mjs` 单一来源, bootstrap-skill 调它 |
| GUI 改动忽略双通道 | 任何新 API 端点必须同时在 vite-plugin-data-api.ts + tauri-api/routes 实现 |

---

## 7 · 验收清单 (跨两个 change)

实施完成后, 应该能跑通这条**端到端故事**:

```
1. 全新用户安装 Atomsyn, GUI 进聊天页 → 看到"初始化向导"按钮
2. 点击 → 选择 ~/Documents → Phase 1 TRIAGE 出概览 → 用户确认范围
3. Phase 2 SAMPLING → 系统给出"你看起来是 X 角色, 主要在 Y 领域" → 用户校准
4. Phase 3 DEEP DIVE dry-run → 输出 markdown 报告 (50 条候选 atom + 1 条 profile 草案)
5. 用户在 markdown 上删除 5 条不准确的候选 → 点"确认写入"
6. commit 阶段 → LLM 生成 JSON → 通过 atomsyn-cli ingest 写入 → reindex
7. 用户去新建的 ProfilePage → 看到 5 维滑块 + 时间线 (v1 trigger=bootstrap_initial) → 微调一下 → 切 verified=true
8. 用户回到 Atlas → 看到 50 条新 atom 进入双骨架 → 在 Cursor 开新会话提一个相关问题 → atomsyn-read 命中 atom (lastAccessedAt 自动更新)
9. 一个月后, 用户跑 atomsyn-mentor → 看到 staleness 信号 + 主动建议 prune → 用户裁决 → archive 一些旧 import
10. 三个月后, GUI 提示"画像 90+ 天未校准" → 用户回 ProfilePage 校准 → 旧 profile 入 previous_versions, 新数据生效
```

每一步都对应了两个 change 的某个具体决策点。如果哪一步走不通, 那就是某个决策点没落地, 回去查 design.md 和 decisions.md。

---

## 8 · 推荐实施工作流

### 对每个 change

```
1. 先把 proposal.md 全读, 确认目标对齐 (如有疑问停下来问用户)
2. 再读 design.md, 重点 §3 流程 + §5 接口 + §6 决策矩阵
3. 看 decisions.md 各 D-XXX (尤其 accepted 的, 已是定论)
4. 按 tasks.md A → G 顺序逐个勾, 每勾一个 commit 一次, commit message 含 change-id
5. 实施过程中如发现 design 偏离, 不直接改代码:
   (a) 在 decisions.md 追加新 ADR (D-XXX), 解释为什么偏离
   (b) 在 design.md §6 决策矩阵或对应章节更新
   (c) 然后再改代码
6. tasks.md 全勾后跑 Verification 8-13 项
7. 全过则 mv 到 openspec/archive/2026/04/<change-id>/
8. 在 docs/plans/v2.2-bootstrap.md 追加叙事段落
9. 关掉 ideas-backlog 对应条目 (如有)
```

### 对每个子 agent 调度

如果实施过程要派子 agent (例如让一个 agent 写 GUI、一个 agent 写 CLI), prompt 模板:

```
你是 atomsyn-cli 实施 sub-agent。

必读上下文 (先看):
1. /Users/circlelee/develop/atomsyn/.claude/CLAUDE.md
2. /Users/circlelee/develop/atomsyn/openspec/changes/IMPLEMENTATION-HANDOFF.md
3. /Users/circlelee/develop/atomsyn/openspec/changes/<change-id>/proposal.md
4. /Users/circlelee/develop/atomsyn/openspec/changes/<change-id>/design.md (重点 §X)
5. /Users/circlelee/develop/atomsyn/openspec/changes/<change-id>/decisions.md (D-XXX 全读)
6. /Users/circlelee/develop/atomsyn/openspec/changes/<change-id>/tasks.md (查你负责的组)

你负责完成 tasks.md 的 [组名] 任务, 即 task <X1> ~ <Xn>。

铁律:
- 不破坏 §5 列出的不变量
- 不重新决策已 accepted 的 D-XXX
- 不偏离 design.md (如必须偏离, 追加 ADR 后再改)
- 每勾一个 task 提交一个 commit (message 含 change-id)

完成后报告: 跑通的 task 列表 + 跑出来的实际行为 + 偏离 design 的地方 (如有) + 你的判断风险点 (200 字内)
```

---

## 9 · 联系点 / 升级路径

- 本文如需修改, 直接 edit 即可 (它在版本控制内)
- 实施过程中如发现两个 change 之外的新问题, 在 `docs/ideas-backlog.md` 加新条目, **不要中途扩大本批 change 范围**
- 实施完成后归档时, 把本文也保留在 `openspec/changes/IMPLEMENTATION-HANDOFF.md` (作为历史档案), 后续批次 change 起新文件 (e.g. `IMPLEMENTATION-HANDOFF-2026-05.md`)

---

> **End of handoff.** Agent 阅读至此应已建立完整实施认知。可以开始按 tasks.md 推进。
