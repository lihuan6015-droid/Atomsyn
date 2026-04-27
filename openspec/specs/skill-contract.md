# Skill Contract · Atomsyn 三个 Skill 的稳定契约

> **一句话**: 本契约锁定 `atomsyn-write` / `atomsyn-read` / `atomsyn-mentor` 三个 Skill 的触发条件、Token 预算、不可变承诺。它们安装到 Claude Code / Cursor 后, 是用户与 Atomsyn 的核心 Agent-facing 入口。
>
> **修改规则**: 严禁直接编辑本文件。任何 Skill 契约变更必须通过一次 openspec change。
>
> **Skill 文件位置**:
> - 项目内源文件: `skills/atomsyn-*.skill.md`
> - 安装后: `~/.claude/skills/atomsyn-*/` (Claude Code) · Cursor 同样位置

---

## 1 · 三个 Skill 的角色总览

| Skill | 哲学 | 何时触发 |
|---|---|---|
| `atomsyn-write` | **沉淀即投资** —— 自带主动建议哲学, 在自然停顿时短问一句 "要不要记一下" | 对话中产生了"如果不记下来未来不会知道"的认知 |
| `atomsyn-read` | **默认主动 + 空结果沉默** —— 任何非闲聊的实质性工作开始前都先调一次 | 用户提出实质性问题, 先看本地资产 |
| `atomsyn-mentor` | **数据驱动 + 教练闭环** —— 主动分析盲区和趋势, 推用户行动 | 用户说 "复盘" / "导师模式" / "回顾一下" / "我最近学了什么" / "我的盲区" |
| `atomsyn-bootstrap` | **引导式批量冷启动 + 用户主权** —— 把硬盘上散落的过程文档按 5 层架构提炼成 1 profile + N experience/fragment, 三阶段 funnel + dry-run/commit 两阶段, 让用户全程在场 (V2.x bootstrap-skill) | 用户说 "初始化 atomsyn / bootstrap atomsyn / 把 ~/X 倒进来 / 从我之前的笔记导入 / 第一次用 atomsyn" |

---

## 2 · `atomsyn-write` 契约

### 2.1 触发条件
[TODO] 详细触发条件待 change 锁定。当前文档参考: `skills/atomsyn-write.skill.md`

### 2.2 不可变承诺 (Invariants)

[TODO] 预占位:

- W-I1. **永不绕过 CLI**: write Skill 不直接写文件, 只通过 `atomsyn-cli ingest/write/update`
- W-I2. **写前先 find**: 写入前必须调用 `atomsyn-cli find` 检查是否已存在相似 atom, 优先 update 而非新建
- W-I3. **不替用户决定**: 不主动写入, 只在自然停顿时**问一句**, 用户拒绝则沉默
- W-I4. **schema 严格**: 任何写入必须通过 schema 校验, 失败时**不重试**, 让 CLI 报错给用户
- W-I5. **collision 不阻塞** (V2.x): write/update 默认开启 collision check; 检测到候选时, write 已成功, 通过 stdout `collision_candidates` + stderr 警告告知 Agent, **必须用 AskUserQuestion 让用户裁决** (保留 / supersede / fork-暂未支持), 严禁默默 supersede
- W-I6. **archived/superseded 只读** (V2.x): update 拒绝改 archived 或 superseded 的 atom (exit 3), 用户必须先 archive --restore 才能继续编辑

### 2.3 Token 预算
[TODO]

### 2.4 输入/输出格式
[TODO]


## 3 · `atomsyn-read` 契约

### 3.1 触发条件
[TODO] 当前文档参考: `skills/atomsyn-read.skill.md`

### 3.2 不可变承诺

[TODO] 预占位:

- R-I1. **空结果沉默**: 找不到相关 atom 时不输出任何东西, 不假装有内容
- R-I2. **只读不写**: read Skill 永远不写入数据 (但 read CLI 内部会被动更新 lastAccessedAt, 这是 CLI 行为, 与 Skill 无关)
- R-I3. **优先级高于训练知识**: 用户验证过的本地经验比通用知识更可信
- R-I4. **轻调用**: 默认 `--top` 不超过 5, 避免 context 爆炸
- R-I5. **温度计句不打断** (V2.x): 命中 atom 含 🌡 标记时, 追加一句温度计句 ≤ 30 tokens 自然融入回答, 不单独成段; 同 atom 一会话只提示一次; 不把"过时"当"错的"
- R-I6. **profile 不消费** (V2.x, D-007 v1): read 默认不返 kind=profile 的 atom; 仅 `--include-profile` debug flag 启用 (不暴露给 Skill); profile 校准入口在 GUI, Skill v1 仅观察

### 3.3 Token 预算
[TODO]

### 3.4 输入/输出格式
[TODO]


## 4 · `atomsyn-mentor` 契约

### 4.1 触发条件
[TODO] 当前文档参考: `skills/atomsyn-mentor.skill.md`

### 4.2 不可变承诺

[TODO] 预占位:

- M-I1. **教练不居高临下**: 输出语气是 "我看到 X, 你可能想看看", 不是 "你应该 X"
- M-I2. **数据有源**: 任何洞察必须能追溯到具体 atom / practice / 时间窗
- M-I3. **行动可执行**: 每条建议必须给 1 个 ≤ 30 分钟的下一步动作, 不给空洞鼓励
- M-I4. **不重复唤醒**: 同一盲区/趋势不在短期内重复推送 (具体阈值 [TODO])
- M-I5. **prune 永远 dry-run** (V2.x, D-005): 复盘报告末尾追加 🧹 prune 建议时, 必须**逐条 AskUserQuestion** 让用户裁决 keep/supersede/archive; LLM 严禁自动 mutate 知识库

### 4.3 Token 预算

- 复盘主报告 ≤ 3000 tokens
- **V2.x 含 prune 建议时 ≤ 5000 tokens** (主报告 3000 + prune 段 2000)

### 4.4 输入/输出格式
[TODO]


## 5 · `atomsyn-bootstrap` 契约 (V2.x bootstrap-skill)

### 5.1 frontmatter

```yaml
---
name: atomsyn-bootstrap
description: "把用户硬盘上散落的过程文档 (markdown / 笔记 / 历史聊天导出 / 源代码注释) 引导式地导入 Atomsyn 知识库, 产出 1 条 profile atom + N 条 experience/fragment atom。3 阶段 funnel: TRIAGE 扫描概览 → SAMPLING 采样画像 → DEEP DIVE 5 层归类。隐私优先: 默认敏感关键字扫描 + .atomsynignore。用户说 '初始化我的 atomsyn / 把这个目录倒进来 / bootstrap atomsyn / 从我之前的笔记导入' 时触发。"
allowed-tools: Bash, Read
---
```

### 5.2 触发条件

- **显式**: 用户说"初始化 atomsyn / bootstrap atomsyn / 把 ~/X 倒进来 / 从我之前的笔记导入 / 第一次用 atomsyn"
- **静默规则**: 检测到用户 `atomsyn-cli where` 返回的数据目录里 atom 数 < 5 且用户在做实质性 AI 任务时, **不自动触发**, 但**可以问一句**"你的 atomsyn 看起来很空, 要不要先 bootstrap 一下?"

### 5.3 不可变承诺 (Invariants)

- **B-I1 · 永不绕过 ingest**: bootstrap 写入 atom 必须通过 `atomsyn-cli ingest`, 不直接写 disk (与全局 CLI-first 铁律一致, 见 cli-contract §4 I1)
- **B-I2 · Phase 之间是关卡**: TRIAGE → SAMPLING → DEEP DIVE 之间必须有用户确认, 不一次跑完 (D-003)
- **B-I3 · profile v1 仅观察** (D-007): 写入的 profile atom `verified=false`, **本 Skill 不让 read 自动注入** (与 atomsyn-read R-I6 一致); profile 校准入口在 GUI ProfilePage, Skill v1 不消费
- **B-I4 · 隐私默认关闭** (D-005): 没显式 `--include-pattern` 时, 默认按 `.atomsynignore` 严格过滤; 14 条敏感关键字扫描默认开启 (强敏感整文件跳过 + 弱敏感字段 redact)
- **B-I5 · session 可恢复**: 任何 phase 失败必须保留 session 状态, 用户可 `atomsyn-cli bootstrap --resume <session-id>`
- **B-I6 · dry-run 是默认推荐路径** (D-011): Skill 的标准工作流是先 `--dry-run` 输出 markdown, 用户校对后才调 `--commit` 写入。Skill 在引导用户时必须明确这两步, 不要让用户感觉 bootstrap 是"一键不可逆"
- **B-I7 · profile 单例** (D-010): 跨多次 bootstrap, profile id 始终是 `atom_profile_main`, Skill 调用演化协议时不创建新 id; 历史快照通过 `previous_versions[]` 追溯, 不进 supersede 关系网 (与 cognitive-evolution D-008 联动)
- **B-I8 · prompt 模板锁定** (D-012): bootstrap 内部使用的 LLM prompt 模板从 `scripts/bootstrap/prompts/*.md` 加载, 用户配置文件不可覆盖 (v1); v2 视用户反馈再开放 override

### 5.4 Token 预算 (单次 bootstrap)

| 阶段 | LLM calls | 预算 | 说明 |
|---|---|---|---|
| TRIAGE | 0 | 纯文件元信息 (`stat()`), 无 LLM 调用 | < 30s @ 10000 文件 |
| SAMPLING | 1 | ≤ 30k input + 4k output | < 5 min |
| DEEP DIVE 串行 (默认) | N (= 文件数) | 每次 ≤ 8k input + 2k output | 1000 文件预算 = ~10M tokens, 用户 LLM 配置成本约 $5-30 |
| DEEP DIVE 并行 (`--parallel`) | 4N | 4x token cost | < 8 min @ 1000 文件 |

文档明确告诉用户预算量级, GUI BootstrapWizard 的 token/cost 估算预览组件必须在启动前展示估算 (见 cli-contract §3.14.6)。

### 5.5 3 阶段 funnel 关卡执行流程

每个 Phase 完成后, Skill 通过 `AskUserQuestion` 让用户确认才进下一阶段。用户可在任何关卡选"放弃" (退出码 3, session 保留可 resume)。

**Phase 1 · TRIAGE (扫描概览)**:
- 触发: 用户说"我想把 ~/Documents 倒进来" → Skill 调 `atomsyn-cli bootstrap --path ~/Documents --phase triage`
- 关卡: 输出目录概览 markdown 表格 → AskUserQuestion("范围确认? 1. 全部 800 个 .md (推荐) / 2. 只看最近 1 年的 320 个 / 3. 自定义 include/exclude")

**Phase 2 · SAMPLING (采样推断画像)**:
- 触发: 用户在 Phase 1 后确认范围 → Skill 自动调 `bootstrap --resume <id> --phase sampling`
- 关卡: 输出画像假设 markdown (identity + preferences 5 维 + knowledge_domains) → AskUserQuestion("画像确认? 1. 准确, 继续 / 2. 我补充: <文本框> / 3. 重新采样")

**Phase 3 · DEEP DIVE (深读 + dry-run + commit)**:
- 默认走 dry-run 路径 (B-I6): Skill 调 `bootstrap --resume <id> --phase deep-dive --dry-run` → 输出人类友好 markdown 候选列表 + 持久化到 session `.md` 文件
- 关卡: AskUserQuestion("dry-run 报告已就绪 (50 条候选 + 1 profile 草案), 是否打开 GUI 校对? 或直接 --commit?")
- commit 阶段: Skill 调 `bootstrap --commit <session-id>` (可选 `--markdown-corrected-file`) → LLM 把保留的 markdown 候选生成完整 atom JSON → 通过 `atomsyn-cli ingest --stdin` 落盘 → profile 通过 `applyProfileEvolution` 单例语义入库

### 5.6 与其他 Skill 的关系

- **atomsyn-write**: bootstrap 内部走 `atomsyn-cli ingest`, 不走 write Skill 的对话流程 (write 仍是单点增量沉淀路径)
- **atomsyn-read**: 本 change v1 不修改 read 触发逻辑; read 仍**不消费** profile (R-I6); v2 待用户 GUI 校准 verified=true 后再考虑放开
- **atomsyn-mentor**: 本 change v1 不修改 mentor; v2 计划在报告里加入 profile.preferences (declared) vs 行为推断 (inferred) 的 gap 分析

---

## 6 · 跨 Skill 共享契约

### 6.1 数据目录解析
所有 Skill 必须通过 `atomsyn-cli where` 或 CLI 命令隐式解析数据目录, 不假定路径。

### 6.2 安装与升级
- 安装: `atomsyn-cli install-skill --target claude,cursor` (V2.x bootstrap-skill 后含第 4 个 skill `atomsyn-bootstrap`)
- 升级: 重新运行同命令, 旧文件被覆盖
- 卸载: 由用户手工删除 `~/.claude/skills/atomsyn-*/`

### 6.3 隐私边界
- Skill 在 prompt 里**不打印** data 目录的绝对路径 (避免泄露用户名)
- Skill 在 prompt 里**不打印** 完整 atom 内容到 LLM 服务商, 只打印必要字段
- bootstrap 特别约定 (D-005, B-I4): 给 LLM 的 prompt **包含** 文件内容片段 (这是其与其他 Skill 的关键区别), 但所有弱敏感字段 (email / phone / SSN / 身份证) 已自动 redact 为 `[REDACTED-EMAIL]` 等占位; 强敏感 (sk-xxxx / api_key=... / `-----BEGIN PRIVATE KEY-----` 等 14 条正则) 直接整文件跳过

[TODO] 详细隐私字段清单待 change 填充

---

## 7 · 实现引用

- Skill 文件: `skills/atomsyn-write.skill.md` · `skills/atomsyn-read.skill.md` · `skills/atomsyn-mentor.skill.md` · `skills/atomsyn-bootstrap/SKILL.md` (V2.x bootstrap-skill)
- 安装逻辑: `scripts/atomsyn-cli.mjs install-skill` 子命令 + Tauri `install_agent_skills` 命令
- 测试方法: 在 Claude Code / Cursor 内手动触发, 观察是否符合契约

---

## 8 · Changelog

> 每次 change 归档时, 如改动了 Skill 触发条件 / 不可变契约 / Token 预算, 在此追加。
>
> 格式: `YYYY-MM-DD · <change-id> · <skill-name> · <一句话摘要>`

- 2026-04-26 · openspec-bootstrap · all · 建立本契约文档骨架, 内容标记 [TODO] 待后续 change 填充
- 2026-04-26 · 2026-04-cognitive-evolution · all · atomsyn-read 加 W2.x 温度计句 + profile 不消费; atomsyn-write 加 collision 三选一 + archived/superseded 只读; atomsyn-mentor 加 Phase 2.5 prune 主动建议 (Token 预算 ≤ 5000), prune 严禁自动 mutate (D-005)
- 2026-04-26 · 2026-04-bootstrap-skill · atomsyn-bootstrap (new) · 新增第 4 个 skill atomsyn-bootstrap (8 条不可变承诺含 B-I6 dry-run/commit + B-I7 profile 单例 + B-I8 prompt 锁定); 新增 §5 完整契约 (frontmatter + 触发条件 + 8 条不可变承诺 + Token 预算 + 3 阶段 funnel 关卡); 现有 §5/§6/§7 重编号为 §6/§7/§8
