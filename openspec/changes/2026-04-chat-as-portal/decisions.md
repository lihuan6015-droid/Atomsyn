# Decisions · 2026-04-chat-as-portal

> **怎么用**: 设计阶段把可预见的关键决策写进来。proposal 的 OQ-1 ~ OQ-7 在 review 阶段拍板后, 转入这里成为 D-001 ~ D-00N (accepted).
>
> **核心原则**: 决策的"理由"和"备选方案"才是这份文档的真正价值。

---

> **当前状态**: **proposed** — 所有 OQ 待 review 阶段拍板, 拍板后逐条转为 D-XXX (accepted).

---

## D-001 · BootstrapWizard 保留作高级后门 (来自 OQ-1)

**状态**: accepted
**日期**: 2026-04-28
**决策人**: 用户 + 主 agent

### 背景

bootstrap-tools 已交付的 BootstrapWizard 5 屏 + 多选 + agent_trace timeline 是真实工作。本 change 战略调整后, 聊天页不再做 bootstrap 重流程入口, 但 Wizard 本身的去留有 2 个选项:
- (i) 完全删除 (~600 行代码 + useBootstrapStore + bootstrapApi 相关)
- (ii) 保留作"高级用户后门" (聊天页入口移除, 但 Settings 里保留入口)

### 决策

**(ii) 保留作高级后门**: BootstrapWizard 整套代码保留, 聊天页移除所有入口 (`/bootstrap` 命令改语义见 D-002, PathDetectionBanner 删除见 D-003, atomsyn:open-bootstrap 监听移除); 在 Settings 增加 "高级 → Bootstrap 向导" 入口, 标签明确为"高级 / 离线 / 调试" 用户场景。

### 理由

- bootstrap-tools v2 的 ~600 行通过 184 assertion 验证, 是已通过门禁的资产, 直接删 = 把验证过的工程砸掉
- 真痛点是"聊天页有显眼入口让普通用户误入重流程", 而不是 Wizard 存在本身
- 移除聊天页入口已经满足 proposal §6 指标 3 ("聊天页不再有任何明显入口指向 Wizard")
- 离线场景 (无外部 Agent / 无网络) + 调试场景 (开发者验证 dry-run/commit 协议) 仍需要 GUI 路径

### 备选方案

- **(i) 完全删除**: 优势 = 代码库瘦身, 单一路径; 弊端 = 高级/离线/调试场景失去 GUI 工具, 沉没成本浪费, 删之前需要先验证 (ii) 是否真有维护负担, 否则是过早优化
- **(ii) 保留作后门** (选中): 优势 = 不浪费已做工作, 离线/调试有兜底; 弊端 = 双路径维护成本

### 后果

- A1 任务执行 (ii) 路径: 不删代码, 仅移除聊天页入口 + 加 Settings 入口
- 6 个月后 review trigger: 如果 Settings 入口打开率 < 1% (通过 usage-log 量化), 起新 change `2026-XX-bootstrap-wizard-removal` 真删
- 维护契约: BootstrapWizard 不接收新功能, 仅 bug fix; 主路径升级 (例如 LLM prompt 模板) 不强制同步到 Wizard

---

## D-002 · `/bootstrap` 命令改语义为输出引导卡片 (来自 OQ-3)

**状态**: accepted
**日期**: 2026-04-28
**决策人**: 用户 + 主 agent

### 背景

ChatInput.SkillCommandPalette 的 `/bootstrap` 命令当前打开 Wizard。本 change 后:
- (i) 完全删除该命令
- (ii) 改语义: `/bootstrap` 触发 LLM 输出 `[[handoff:bootstrap]]` 引导卡片 (而不是真打开 Wizard)

### 决策

**(ii) 改语义**: `/bootstrap` 命令保留在 SkillCommandPalette, 但触发后不再 dispatch `atomsyn:open-bootstrap` CustomEvent; 改为在用户输入框预填一段触发提示词 (e.g. "我想把 X 倒进 atomsyn") 或直接走 LLM 输出 `[[handoff:bootstrap|{...}]]` 卡片. 具体实现选项见 design §3.1.

### 理由

- 命令面板里出现 `/bootstrap` 是产品层面的"能力可发现性" — 用户能看到 atomsyn 有这能力, 比"完全藏起来"教育意义大得多
- 改语义比删除更教育用户: 用户输入 `/bootstrap` 后**看见**正确路径 (handoff 卡片 + 推荐去 Cursor) 而不是"找不到入口"困惑
- 与本 change 命题 (L1 引导 + L2 执行) 一致: 命令面板是 L1 的"导航入口", 真正执行在 L2

### 备选方案

- **(i) 完全删除**: 优势 = 代码减法; 弊端 = 用户不再知道 atomsyn 有 bootstrap 能力, 需要从用户指南反推, 学习曲线陡
- **(ii) 改语义** (选中): 优势 = 命令面板维持完整性, 用户能在最明显的位置发现并理解 L2 路径; 弊端 = 用户输入后期待"立即执行"但拿到卡片会有短暂失望

### 后果

- A2 任务执行 (ii) 路径: SkillCommandPalette 保留 `/bootstrap` 条目, 行为改为预填提示词或直接生成 handoff 卡片
- 卡片视觉必须做到位 (proposal §6 指标 4 + C1 任务) — 失望感来自卡片看起来像"不能用", 而不是"指向另一个工具"
- 卡片永远含一键复制完整 prompt 按钮 (D-004 安全网) — 即使用户不想切 Cursor, 也能直接 copy 用

---

## D-003 · PathDetectionBanner 完全删除 (来自 OQ-4)

**状态**: accepted
**日期**: 2026-04-28
**决策人**: 用户 + 主 agent

### 背景

ChatInput.onPaste 检测绝对路径触发 PathDetectionBanner。本 change 后该流程不再有用 (路径粘贴 → bootstrap 链路移除):
- (i) 完全删除
- (ii) 改用途 (e.g. 给"添加为笔记 source" 等其他场景预留)

### 决策

**(i) 完全删除** PathDetectionBanner 组件 + ChatInput 的 onPaste 路径检测逻辑 + 相关 zustand store 字段 (如 `pendingPath`).

### 理由

- 移除 bootstrap 入口后, PathDetectionBanner 唯一服务的链路消失, 留着 = 死代码
- "改用途"是过早设计 — 未来"路径粘贴 → 笔记 source" 真有需求再起新组件即可, 此时复用旧组件反而限制设计自由度
- 删除是干净的减法, 命中 proposal §6 指标 3 + 减少未来误用风险

### 备选方案

- **(i) 完全删除** (选中): 干净, 0 维护成本; 未来需求来时再设计
- **(ii) 改用途**: 提前抽象, 容易做错, 留着像"半成品"

### 后果

- A2 任务: 删 `src/components/chat/PathDetectionBanner.tsx` + ChatInput.onPaste 检测代码 + zustand store 相关字段
- git 历史保留 — 未来如需复活可恢复
- 不在 specs/ 留任何相关契约

---

---

## D-004 · 不做 GUI tool-use 兜底, 用"复制 prompt" 作为安全网 (来自 OQ-6)

**状态**: accepted
**日期**: 2026-04-28
**决策人**: 用户 + 主 agent

### 背景

如果 B 组实测发现 SKILL.md 在 Claude Code/Cursor 触发率 < 80%, 且调 description 后仍无改善:
- (i) 不做兜底 (坚持本 change 命题), 让 L2 触发问题成为已知 bug 推动外部 Agent 升级
- (ii) 在 L1 GUI 加 tool-use 重构作为兜底 (= 路径 B, 工程量 2-3 周, 但与本 change 命题冲突)

### 决策

**(i) 不做 GUI tool-use 兜底**. 真正的安全网是 ExternalAgentHandoffCard 永远含**一键复制完整 prompt** 按钮 — 即使外部 Agent 的 SKILL selector 没自动命中, 用户粘贴完整 prompt 给 Cursor/Claude Code 也能跑出完整流程 (因为 SKILL.md 里的指引还会被加载到 Agent 上下文).

### 理由

- 选 (ii) 等于把本 change 的核心命题反过来 — 与 V2.x 北极星 §6 哲学 3 "大厂结构性不会做" 直接冲突
- SKILL 触发率不达标的真实原因 99% 是 description 写得不够好 (中英文关键词覆盖、上下文示例、长度) — 这是 prompt engineering 问题, 不是架构问题, 工程上调几次 description 就能解
- 路径 B (GUI tool-use) 的工程成本 2-3 周, 而 atomsyn 的内置 LLM 长期不会比 Cursor/Claude Code 内置的更先进 — 这条路投入越多越亏
- "一键复制 prompt" 是设计选择不是工程: 完整 prompt 写得好 + 用户体验流畅, 比 SKILL 自动触发更可靠 (因为 prompt 里可以显式说"加载 ~/.claude/skills/atomsyn-bootstrap/SKILL.md")

### 备选方案

- **(i) 不做兜底** (选中): 风险 = L2 触发不到位时短期无法立即覆盖, 但 "复制 prompt" 做得好可以补; 长期收益 = 战略不反复, 工程聚焦
- **(ii) 做 GUI tool-use 兜底**: 风险 = 战略反复 / 工程膨胀 (2-3 周) / 与哲学 3 冲突 / 必输竞争; 收益 = 短期用户体验闭环

### 后果

- B 组验证 < 80% 时升级路径 (按顺序):
  1. 先调 SKILL.md description (B4 任务) 重测
  2. 还不达标 → 把 ExternalAgentHandoffCard 默认主推"复制完整 prompt" 路径, 而不是依赖 SKILL 自动触发
  3. 仍不达标 → 起 followup change 探索其他路径 (e.g. 完整 prompt 内嵌 skill 内容), 但**不**走路径 B
- 本决策锁定后, 后续任何"GUI 加 tool-use 重构"的提议都需要新立 change 重新讨论, 不在 implement 阶段擅自加

---

## D-005 · 默认推荐 Claude Code + Codex 双 Agent (来自 OQ-5)

**状态**: accepted
**日期**: 2026-04-28
**决策人**: 用户 + 主 agent

### 背景

handoff 卡片应推荐用户用哪个 Agent? 用户群体可能有多种偏好:
- 开发者 IDE: Cursor
- 开发者 CLI: Claude Code (Anthropic 官方) / Codex (OpenAI 官方)
- 产品经理 / 学习者: Claude Desktop App / ChatGPT 网页

### 决策

**卡片默认渲染推荐 Claude Code + Codex 双 Agent**, 二者并列展示, 各自独立的"一键复制提示词"按钮, 提示词内容针对各自 Agent 的最佳触发话术。Cursor / Claude Desktop / 其他 Agent 通过 Settings → "聊天偏好 → 默认外部 Agent" 显式切换。

### 理由

- atomsyn 目标用户群更接近 CLI Agent 用户 (主权 + 终端原生 + 可编程), 而不是 Cursor IDE 用户
- Claude Code (Anthropic) + Codex (OpenAI) 双覆盖主流厂商 — 用户至少有一个有 key, 两个都有更好
- 双 Agent 推荐反映 atomsyn 的中立性 — 不绑定单一厂商, 与"100% 本地主权" 哲学一致
- Cursor 仍保留入口 (Settings 切换), 不抛弃 IDE 用户, 但不是默认主推

### 备选方案

- **(a) Cursor 优先单推**: 优势 = 开发者 IDE 主场景; 弊端 = 把 Cursor 用户当成 atomsyn 主用户群是误判, 弱化 CLI Agent 路径
- **(b) Claude Code + Codex 双推** (选中): 优势 = 主流厂商双覆盖, 中立, 反映目标用户画像; 弊端 = 卡片视觉密度更高, 需要并列设计两个提示词块
- **(c) 推所有 Agent (4+ 个)**: 优势 = 完整; 弊端 = 用户选择困难, 卡片臃肿

### 后果

- C1 任务 ExternalAgentHandoffCard props 设计:
  ```ts
  interface ExternalAgentHandoffCardProps {
    task: 'bootstrap' | 'write' | 'read' | 'mentor'
    skill: string  // e.g. 'atomsyn-bootstrap'
    agents: Array<{
      id: 'claude-code' | 'codex' | 'cursor' | 'claude-desktop'
      label: string
      prompt: string  // 针对该 Agent 优化的完整提示词
      installHint?: string  // e.g. "atomsyn-cli install-skill --target claude"
    }>
    // 默认: agents[0]=claude-code, agents[1]=codex
  }
  ```
- AGENTS.md (A4 任务) LLM 输出 `[[handoff:bootstrap|{...}]]` 时, agents 数组默认 `['claude-code', 'codex']`, 用户在 Settings 切换后由前端根据偏好重排序
- Settings 加 "聊天偏好 → 默认外部 Agent" 多选项 (Claude Code / Codex / Cursor / Claude Desktop / Custom prompt only)
- B1/B2 任务覆盖 Claude Code + Cursor 双工具实测; B3 任务**新增 Codex 为第三个测试工具** (40 测试点 → 60 测试点), 但触发率门槛仍是 ≥ 80%
- `atomsyn-cli install-skill --target` 已支持 claude + cursor, 需要确认 Codex 的 skill 安装路径 (Codex CLI 使用 `~/.codex/agents/` 还是其他位置, design §5.1 待澄清)

---

---

## D-006 · 触发率测试用手动跑测试点, 不写 skill-test 子命令 (来自 OQ-7)

**状态**: accepted
**日期**: 2026-04-28
**决策人**: 用户 + 主 agent

### 背景

B3 任务需要量化外部 Agent 对 SKILL.md 的触发率, 但当前没有自动化工具:
- (i) 手动跑 60 个测试点 (5 场景 × 4 skill × 3 工具 = Claude Code + Cursor + Codex), 人工记录
- (ii) 写 atomsyn-cli skill-test 子命令模拟外部 Agent 调用 SKILL.md (工程量未知, 可能很大, 因为要逆向 Claude Code/Cursor/Codex 的 skill selector)

### 决策

**(i) 手动跑 60 个测试点**. 写一个轻量测试矩阵 (Markdown 表格 in `docs/guide/external-agent-integration-test-results.md`), 记录每个测试点的: 输入 prompt / SKILL 是否被命中 / Agent 实际行为是否符合 SKILL.md 契约 / 失败原因.

### 理由

- skill-test 子命令需要逆向 3 个外部 Agent 的 selector (闭源、可能持续变化), 是工程黑洞, 估计 1-2 周才能做出来一个不可靠的近似
- 手动跑 60 个测试点估计 ≤ 半天 (每个测试点 ≤ 5 分钟), ROI 远高
- 触发率测试不是高频活动 — 只在初次实测 (B 组) + 6 个月后回归时跑, 不需要自动化
- 保留升级路径: 如果未来发现某些 Agent 提供官方 selector API, 再起 followup change 加 skill-test

### 备选方案

- **(i) 手动跑** (选中): 半天搞定, 真实反映用户体验, 无逆向工程; 弊端 = 不能 CI 自动跑
- **(ii) 写 skill-test**: 优势 = 自动化, 可重复; 弊端 = 工程量黑洞, 闭源逆向, 维护成本高, 结果不可靠

### 后果

- B3 任务交付物: `docs/guide/external-agent-integration-test-results.md` 含 60 个测试点表格 + 触发率统计 + 失败原因分类
- B4 任务 (调 description) 后必须重跑全部 60 个测试点
- 6 个月后 review 触发条件: 重跑测试点, 如果触发率从 ≥80% 跌到 <80%, 起新 change `2026-XX-skill-description-refresh`

---

---

## D-007 · ExternalAgentHandoffCard 视觉延用 atom-card.html 玻璃态风格 (来自 OQ-2)

**状态**: accepted
**日期**: 2026-04-28
**决策人**: 用户 + 主 agent

### 背景

ExternalAgentHandoffCard 是本 change 唯一的新视觉资产。视觉契约 2 个选项:
- (a) 单独设计新风格 (Linear-Raycast 变体的子风格)
- (b) 延用项目已有的 `docs/mockups/atom-card.html` 玻璃态 + Inter + spring 动画契约

### 决策

**(b) 延用 atom-card.html 风格**. 新组件 `<ExternalAgentHandoffCard>` 复用以下视觉语言:
- 容器: 玻璃态 background (`bg-white/60 dark:bg-zinc-900/60` + `backdrop-blur-md`) + 圆角 + 边框
- 字体: Inter (主要) + JetBrains Mono (代码片段)
- 动画: spring `cubic-bezier(0.16, 1, 0.3, 1)` 入场, Framer Motion
- 内部布局: 标题 (skill 名 + 任务) → 推荐 Agent 列表 (Claude Code + Codex 双卡片, D-005) → 一键复制按钮 + 文档链接

### 理由

- atomsyn 视觉契约硬约束 (CLAUDE.md "Visual language") 要求所有组件统一风格 — 单独设计新风格违反契约
- atom-card.html 玻璃态 + 渐进披露契约成熟, 直接套用可加速开发
- ExternalAgentHandoffCard 与 AtomCard 在 chat 流中同框出现, 视觉一致性是基础体验

### 备选方案

- **(a) 单独设计**: 优势 = 可针对 handoff 场景定制 (e.g. 加 Agent logo 大图); 弊端 = 违反视觉契约 + 增加设计/开发成本 + 长期维护
- **(b) 延用 atom-card** (选中): 优势 = 视觉契约一致, 0 设计成本, 复用样式 token; 弊端 = 需要在固定风格下做信息密度平衡 (双 Agent 推荐 + 复制按钮 + 文档链接)

### 后果

- C1 任务直接 import 现有 Tailwind utility + 项目 CSS vars, 不引入新视觉资产
- 设计交付不需要单独 mockup — 直接代码实现 + 用 dev server 视觉走查
- light + dark 主题验收沿用项目现有契约 (V6 验证)

---

> **追加新决策**时, 复制 D-XXX 模板 entry。决策被新决策替代时, 旧决策状态改为 `superseded by D-XXX`, 不删除。
> **归档前**再扫一遍, 把 proposed 状态的决策定型为 accepted (或 rejected)。
