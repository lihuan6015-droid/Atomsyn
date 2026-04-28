# Tasks · 2026-04-chat-as-portal

> **状态**: **draft (skeleton)** — proposal 仍 in review, design 尚未锁定. 实施前必须先按 README §6 流程: review proposal → 拍 OQ-1/OQ-3/OQ-6 → 填 design → 锁 design → 才进 implement.
>
> **强约束**: B 组 (L2 真实可用性验证) **必须先于** A 组 (L1 减负) — 见 proposal §7 R1. 如果 B 验证不达标, A 组冻结, 重新评估方案 (可能要做 OQ-6 兜底).

---

## A · L1 减负 (减法工程, 等 B 验证通过后启动)

> [TODO] 待 OQ-1/OQ-3/OQ-4 拍板后填具体 task

- [ ] A1. **BootstrapWizard 命运处理** (依 OQ-1):
  - 选项 (i) 完全删除: 删 `src/pages/Chat/BootstrapWizard/index.tsx` 整个目录 + `useBootstrapStore.ts` + `bootstrapApi` 相关 + ChatPage 移除引用
  - 选项 (ii) 保留作高级后门: 仅移除聊天页入口 (ChatPage 不再 setWizardOpen, 不监听 atomsyn:open-bootstrap), 加 Settings → "高级 → bootstrap 向导" 入口
- [ ] A2. **ChatInput 入口减负**:
  - 移除 `/bootstrap` 命令 (or OQ-3 改语义为输出引导卡片)
  - 移除 `onPaste` PathDetectionBanner 触发 (or OQ-4 改用途)
  - 删 `src/components/chat/PathDetectionBanner.tsx` (or 改用途)
- [ ] A3. **ChatPage 监听清理**:
  - 移除 `atomsyn:open-bootstrap` CustomEvent 监听 (B5)
  - 移除 `addBootstrapPath` 引用
  - 移除 BootstrapWizard 组件挂载 (或视 OQ-1 调整)
- [ ] A4. **AGENTS.md 教 LLM 输出 handoff 卡片**:
  - 加新段 `### atomsyn-bootstrap (引导外部 Agent)` 替代当前的"假装能做" 描述
  - 触发关键词 → 输出 `[[handoff:bootstrap|{...}]]` action 卡片

## B · L2 真实可用性验证 + 加固 (优先做)

- [ ] B1. **真实机器实测 atomsyn-bootstrap 在 Claude Code 触发** (= 已归档 bootstrap-tools H1):
  - 跑 `atomsyn-cli install-skill --target claude` 装 SKILL.md 到 `~/.claude/skills/atomsyn-bootstrap/`
  - 在新 Claude Code 会话发: "把 ~/Documents/混沌 倒进 atomsyn"
  - 观察: SKILL.md 是否被 selector 命中 / 是否走 dry-run/commit / AskUserQuestion 是否生效
  - 记录: 触发率 / 执行准确性 / 失败原因 (description 不准 / 关键词漏 / 上下文不足)
- [ ] B2. **真实机器实测在 Cursor 触发** (= 已归档 H2):
  - 同 B1 流程, target=cursor
- [ ] B3. **测 atomsyn-write/read/mentor 在双工具触发**:
  - 5 个真实用户场景 × 4 个 skill × 2 个工具 = 40 个测试点
  - 场景: "记下这个洞察 X" / "找用户访谈方法" / "帮我复盘最近一个月" / "我在做 X 项目, 有什么相关经验" / "我下一步该学什么"
  - 记录每个测试点是否触发 + 触发后行为是否符合 SKILL.md 契约
- [ ] B4. **触发率 < 80% 时调 SKILL.md description**:
  - 加更多触发关键词 (中英文 / 同义词)
  - 加更多上下文示例
  - 调整 description 长度 (太长可能被截断, 太短描述不充分)
  - 重测验证
- [ ] B5. **写 docs/guide/external-agent-integration.md**:
  - 安装步骤 (install-skill / 环境变量 / 验证)
  - 4 个 skill 各自的最佳触发话术
  - Codex / Claude Code / Cursor 三个工具的差异 + 各自怎么用
  - 已知 quirks / FAQ

## C · 美观引导组件 (依赖 A4 AGENTS.md)

- [ ] C1. 新组件 `src/components/chat/ExternalAgentHandoffCard.tsx`:
  - props: `{ task: string, prompt: string, skill: string, recommendedAgent?: string }`
  - 视觉: Linear/Raycast 玻璃态 + Inter 字体 + spring 动画 (与 atom-card.html 风格一致)
  - 内容: 推荐 Agent (按用户偏好) + 一键复制提示词 + 对应 skill 名称 + 文档链接
- [ ] C2. `MarkdownRenderer.tsx` 识别 `[[handoff:<task>|<json>]]`:
  - 解析 JSON, 渲染 ExternalAgentHandoffCard
  - 错误兜底 (JSON parse 失败 → 显示原始 markdown)
- [ ] C3. 一键复制实现:
  - `navigator.clipboard.writeText(prompt)`
  - copy 后短暂 toast "已复制, 切到 Cursor 粘贴即可"
- [ ] C4. light + dark 主题验收

## D · 一致性与文档

- [ ] D1. 评估 `docs/framing/v2.x-north-star.md` 是否需更新 — L1/L2 边界是否需在战略文档明确加段
- [ ] D2. `openspec/specs/skill-contract.md` 加 G-I1 不变量 "L1 不实现 skill 重流程"
- [ ] D3. `openspec/specs/cli-contract.md` install-skill 章节列举支持的外部 Agent + 安装路径
- [ ] D4. 写 `docs/plans/v2.4-chat-as-portal.md` 叙事段落 (北极星对齐 + 决策回顾 + L1/L2 分工图)
- [ ] D5. 更新 `.claude/CLAUDE.md` Quick reference 表 — bootstrap 引导从 GUI 直跑改为"建议引导用户去 Cursor"

## V · Verification (跨任务回归)

- [ ] V1. `npm run build` 通过
- [ ] V2. `npm run lint` 通过
- [ ] V3. (Tauri 改动如有) `cargo check` 通过
- [ ] V4. `npm run reindex` 通过
- [ ] V5. test:bootstrap-skill / test:bootstrap-tools / test:evolution 全过 (回归)
- [ ] V6. light + dark 主题验收 (新组件 ExternalAgentHandoffCard)
- [ ] V7. **B3 触发率指标 ≥ 80%** (proposal §6 指标 1) — 必须先满足才能 ship
- [ ] V8. 用户指南 5 分钟可用性 (proposal §6 指标 4)

---

> **归档前 (本 change 完成后)**:
> 1. mv openspec/changes/2026-04-chat-as-portal openspec/archive/2026/04/
> 2. docs/plans/v2.4-chat-as-portal.md 已写
> 3. IMPLEMENTATION-HANDOFF.md 加完结状态
