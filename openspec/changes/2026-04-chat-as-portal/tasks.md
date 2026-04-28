# Tasks · 2026-04-chat-as-portal

> **状态**: **ready** — proposal approved, design locked (D-001 ~ D-007 全部 accepted). 进入 implement 阶段.
>
> **强约束**: B 组 (L2 真实可用性验证) **必须先于** A 组 (L1 减负) — 见 proposal §7 R1 + D-004 后果. 如果 B 验证不达标 (触发率 < 80%), A 组冻结, 升级路径见 D-004 (调 description → 主推 prompt 复制 → 起 followup change), 永远不走"加 GUI tool-use 兜底" 路径.

---

## B · L2 真实可用性验证 + 加固 (先做, 依 D-005 + D-006 + D-008/D-009/D-010)

> **强约束**: B 组先于 A. B5 触发率 < 80% 时, A 组冻结, 走 D-004 升级路径.

- [x] **B0. SKILL.md + SOUL.md + AGENTS.md + cli write-profile** (依 D-008/D-009/D-010/D-011, 2026-04-28 实测后新增):
  - [x] B0.1 atomsyn-bootstrap SKILL.md frontmatter description 重写 (Agent 视角, 触发关键词加固, 删除"v1 仅支持 X 格式"约束)
  - [x] B0.2 atomsyn-bootstrap SKILL.md 主体 rewrite (Agent-driven 7 步: where → triage → 自读任何格式 → 抽象 profile → markdown 候选报告 → cli write 入 experience → cli write-profile 入 profile → reindex; 删除 sampling/deep-dive/commit 段)
  - [x] B0.3 删除"v1 仅支持 .md/.txt/.json/源代码" 类格式约束 (随 B0.2 完成)
  - [x] B0.4 SOUL.md 加 "运行环境与边界" 段 (双份: `skills/chat/SOUL.md` + `~/Library/Application Support/atomsyn/chat/SOUL.md`)
  - [x] B0.5 AGENTS.md 加 "🚀 atomsyn-bootstrap (引导外部 Agent 执行)" 段 + Skill 路由决策树加 bootstrap 路由 (双份)
  - [x] B0.6 审查 atomsyn-write/read/mentor SKILL.md 错位 → **审查结果**: 三个 SKILL.md 已是 Agent 视角, 无需大改
  - [x] B0.7 atomsyn-cli 加 `write-profile --stdin` (依 D-011): 复用 `evolution.mjs::applyProfileEvolution`, 自动 trigger (initial/rerun), rerun 强制 reset verified=false, 拒空 payload (exit 4); smoke test 三场景 (initial / rerun / empty) 全过
  - [x] B0.8 SKILL.md 加 Step 2.5 (证据驱动 profile 抽象) + Step 4.5 (cli write-profile 入库) + Step 3 markdown 字段级 diff 校准协议; Iron Promises 加 B-I5; 反模式加 placeholder + rerun 跳过 diff 两条; v1 限制段移除"agent-driven 不写 profile"
  - [x] B0.9 重新部署 SKILL 到三家 (`install-skill --target all`)

- [x] **B1. atomsyn-cli install-skill 加 Codex 支持** (依 D-005, design §5.1):
  - [x] B1.1 调研 Codex CLI skill 加载路径 → 用户级全局: `~/.agents/skills/<skill>/SKILL.md` (来源: developers.openai.com/codex/skills)
  - [x] B1.2 在 `scripts/atomsyn-cli.mjs` 的 `TARGET_SKILL_DIRS` 加 `codex` 分支 (路径 `~/.agents/skills/`)
  - [x] B1.3 `--target all` 自动装三家 (`Object.keys(TARGET_SKILL_DIRS)` 自动覆盖)
  - [x] B1.4 `cmdWhere` 输出 additive 新增 `cliShim` + `skills` (列出三家 target 的目录存在 + 4 skill 安装状态), 顶层字段保持向后兼容
- [ ] **B2. 实测 atomsyn-bootstrap 在 Claude Code 触发**:
  - [ ] B2.1 跑 `atomsyn-cli install-skill --target claude`, 验证 `~/.claude/skills/atomsyn-bootstrap/SKILL.md` 存在
  - [ ] B2.2 新 Claude Code 会话发 5 个测试 prompt, 记录命中情况
- [ ] **B3. 实测在 Cursor 触发**: 同 B2 流程, `--target cursor`
- [ ] **B4. 实测在 Codex 触发** (依 D-005): 同 B2 流程, `--target codex`
- [ ] **B5. 60 测试点全矩阵实测** (D-006): 5 场景 × 4 skill × 3 工具
  - 场景: "记下这个洞察 X" / "找用户访谈方法" / "帮我复盘最近一个月" / "我在做 X 项目, 有什么相关经验" / "下一步该学什么"
  - 输出 `docs/guide/external-agent-integration-test-results.md` (新文件), 含 60 行测试矩阵 + 触发率统计 + 失败分类
- [ ] **B6. 触发率 < 80% 时调 SKILL.md description** (D-004 升级路径 step 1):
  - [ ] B6.1 失败原因分类 (description 不准 / 关键词漏 / 上下文示例不足)
  - [ ] B6.2 修 4 个 skill SKILL.md 的 description / 触发关键词 / 上下文示例
  - [ ] B6.3 重跑全部 60 测试点
  - [ ] B6.4 仍不达标 → D-004 升级路径 step 2: handoff 卡片改为主推 "复制完整 prompt"
- [ ] **B7. 写 docs/guide/external-agent-integration.md**:
  - 安装步骤 (install-skill 三个 target / 环境变量 / 验证)
  - 4 个 skill (bootstrap/write/read/mentor) 各自最佳触发话术
  - Claude Code / Cursor / Codex 三个工具差异 + 已知 quirks
  - FAQ (key 隔离 / 路径泄露 cloud / 触发失败排查)

## A · L1 减负 (依 D-001 + D-002 + D-003 + D-005, 等 B 验证通过后启动)

- [ ] **A1. BootstrapWizard 保留作高级后门** (D-001 ii):
  - [ ] A1.1 **不删** `src/pages/Chat/BootstrapWizard/` 整个目录 + `useBootstrapStore` + `bootstrapApi`
  - [ ] A1.2 `ChatPage.tsx` 移除 BootstrapWizard 组件挂载 + 移除 `atomsyn:open-bootstrap` CustomEvent 监听 + 移除 `addBootstrapPath` 引用
  - [ ] A1.3 在 `src/pages/SettingsPage.tsx` (or 等价位置) 加"高级 → Bootstrap 向导"入口, 标签 "(高级 / 离线 / 调试)"
  - [ ] A1.4 该入口直接挂载 BootstrapWizard 模态 (不复用聊天页路径)
  - [ ] A1.5 加 usage-log 事件 `settings.bootstrap_wizard_opened` (用于 6 个月后判断是否真删)
- [ ] **A2. ChatInput 入口减负** (D-002 + D-003):
  - [ ] A2.1 `SkillCommandPalette.tsx` 的 `/bootstrap` 命令改语义: 选中后预填触发提示词 ("我想把 X 倒进 atomsyn") 到 ChatInput, **不再** dispatch `atomsyn:open-bootstrap`
  - [ ] A2.2 `ChatInput.tsx` 移除 `onPaste` 中的 PathDetectionBanner 触发逻辑
  - [ ] A2.3 删除文件 `src/components/chat/PathDetectionBanner.tsx`
  - [ ] A2.4 zustand store 中的 `pendingPath` / `addBootstrapPath` 等字段全部删除
  - [ ] A2.5 加 usage-log 事件 `chat.bootstrap_command_invoked`
- [ ] **A3. AGENTS.md 教 LLM 输出 handoff 卡片** (D-002 + D-005, design §5.4.3):
  - [ ] A3.1 用户私有 `~/Library/Application Support/atomsyn/chat/AGENTS.md` 加 § "🚀 atomsyn-bootstrap (引导外部 Agent 执行)" 段
  - [ ] A3.2 项目内 seed AGENTS.md (供 reset 用, 位置在 `src-tauri/resources/seed/AGENTS.md` 或等价 seed 位置) 同步更新
  - [ ] A3.3 触发关键词列表完整 (中: 导入/倒进/沉淀这批/初始化 atomsyn/把这个目录; 英: import/bootstrap/onboard/init atomsyn)
  - [ ] A3.4 输出格式 `[[handoff:bootstrap|{"task":"bootstrap","skill":"atomsyn-bootstrap","agents":[...claude-code, codex]}]]`
  - [ ] A3.5 first-run 提示 "Bootstrap 已迁移到外部 Agent..." (zustand `bootstrap_migration_seen` 标记)

## C · 美观引导组件 (依 A3 + D-005 + D-007)

- [ ] **C1. 新组件 `src/components/chat/ExternalAgentHandoffCard.tsx`** (design §5.4.1):
  - [ ] C1.1 props 类型 `ExternalAgentHandoffCardProps` (含 `task` / `skill` / `agents[]`)
  - [ ] C1.2 视觉: 玻璃态 + Inter + JetBrains Mono + Framer Motion spring 入场 (D-007)
  - [ ] C1.3 双 Agent 推荐布局 (Claude Code + Codex 并列), 各自独立操作区
  - [ ] C1.4 一键复制按钮 + 安装命令按钮 + 文档链接
  - [ ] C1.5 light + dark 主题样式
- [ ] **C2. MarkdownRenderer 加 `[[handoff:<task>|<json>]]` 解析** (design §5.4.2):
  - [ ] C2.1 在 `src/components/chat/MarkdownRenderer.tsx` 现有 action 解析器 (atom / ingest:confirm) 旁加 handoff 分支
  - [ ] C2.2 JSON parse 失败 fallback 到原始 markdown (与 ingest:confirm 一致)
  - [ ] C2.3 渲染 ExternalAgentHandoffCard
- [ ] **C3. 一键复制实现**:
  - [ ] C3.1 `navigator.clipboard.writeText(prompt)`
  - [ ] C3.2 copy 后 toast "已复制, 粘贴到 <Agent> 即可" + 含路径警示 (design §7)
  - [ ] C3.3 加 usage-log 事件 `chat.handoff_copied { task, agent }`
- [ ] **C4. Settings 加"聊天偏好 → 默认外部 Agent" 偏好** (依 D-005 后果):
  - [ ] C4.1 zustand store 加 `defaultExternalAgent: AgentId` 字段
  - [ ] C4.2 SettingsPage 增加单选 (Claude Code / Codex / Cursor / Claude Desktop)
  - [ ] C4.3 ExternalAgentHandoffCard 根据偏好排序 agents 数组 (默认排序前置用户偏好)
- [ ] **C5. usage-log schema 加新事件** (design §9):
  - [ ] C5.1 `chat.handoff_card_shown` (含 `{task, agents[]}`)
  - [ ] C5.2 `chat.handoff_copied` (含 `{task, agent}`)
  - [ ] C5.3 `chat.bootstrap_command_invoked` (空 payload)
  - [ ] C5.4 `settings.bootstrap_wizard_opened` (空 payload)

## D · 一致性与文档

- [ ] **D1.** 评估 `docs/framing/v2.x-north-star.md` 是否需更新 — L1/L2 边界是否需在战略文档明确加段 (倾向: 不动, 因为现有 §1+§6 已覆盖, 加段反而冗余)
- [ ] **D2.** `openspec/specs/skill-contract.md` 加新不变量:
  - **G-I1** "L1 不实现 skill 重流程" (design §5.3)
- [ ] **D3.** `openspec/specs/cli-contract.md` 更新:
  - [ ] D3.1 `install-skill` 章节列举支持的外部 Agent (claude / cursor / codex / all)
  - [ ] D3.2 各 target 的安装路径 (依 B1.1 调研结果)
- [ ] **D4.** 写 `docs/plans/v2.4-chat-as-portal.md` 叙事段落 (北极星对齐 + 决策回顾 + L1/L2 分工图 + 战略转折点)
- [ ] **D5.** 更新 `.claude/CLAUDE.md`:
  - [ ] D5.1 Quick reference 表 — bootstrap 入口从 "聊天页 `/bootstrap`" 改为 "外部 Agent + handoff 卡片"
  - [ ] D5.2 Tauri 双通道架构章节如无影响则不动
- [ ] **D6.** IMPLEMENTATION-HANDOFF.md §0.7 更新到 implement 进行中状态 (本次 commit 一并做)

## V · Verification (跨任务回归)

- [ ] **V1.** `npm run build` 通过
- [ ] **V2.** `npm run lint` 通过
- [ ] **V3.** `cargo check` 通过 (有 Tauri 改动如有)
- [ ] **V4.** `npm run reindex` 通过
- [ ] **V5.** 已归档 change 测试套件全过: `test:bootstrap-skill` / `test:bootstrap-tools` / `test:evolution` / `test:cli`
- [ ] **V6.** light + dark 主题视觉走查 (ExternalAgentHandoffCard + Settings 入口)
- [ ] **V7.** **B5 触发率 ≥ 80%** (proposal §6 指标 1, design §11.2) — **必须先满足才能 ship**
- [ ] **V8.** **L1 减负操作步数 ≤ 2** (proposal §6 指标 2, design §11.2) — 录屏验证
- [ ] **V9.** 用户指南 5 分钟可用性 (proposal §6 指标 4, design §11.2)
- [ ] **V10.** ExternalAgentHandoffCard 视觉与 atom-card.html 一致 (design §11.3)
- [ ] **V11.** 双 Agent 推荐信息密度合适, 不溢出 (design §11.3)
- [ ] **V12.** BootstrapWizard 通过 Settings 入口仍能正常打开 + dry-run/commit 走通 (D-001 后果回归)

---

> **归档前 (本 change 完成后)**:
> 1. mv openspec/changes/2026-04-chat-as-portal openspec/archive/2026/04/
> 2. docs/plans/v2.4-chat-as-portal.md 已写
> 3. IMPLEMENTATION-HANDOFF.md 加完结状态
