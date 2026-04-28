# Decisions · 2026-04-chat-as-portal

> **怎么用**: 设计阶段把可预见的关键决策写进来。proposal 的 OQ-1 ~ OQ-7 在 review 阶段拍板后, 转入这里成为 D-001 ~ D-00N (accepted).
>
> **核心原则**: 决策的"理由"和"备选方案"才是这份文档的真正价值。

---

> **当前状态**: **proposed** — 所有 OQ 待 review 阶段拍板, 拍板后逐条转为 D-XXX (accepted).

---

## D-001 · [TODO 待拍板] BootstrapWizard 命运 (来自 OQ-1)

**状态**: proposed
**日期**: [TODO]
**决策人**: 用户 + 主 agent

### 背景

bootstrap-tools 已交付的 BootstrapWizard 5 屏 + 多选 + agent_trace timeline 是真实工作。本 change 战略调整后, 聊天页不再做 bootstrap 重流程入口, 但 Wizard 本身的去留有 2 个选项:
- (i) 完全删除 (~600 行代码 + useBootstrapStore + bootstrapApi 相关)
- (ii) 保留作"高级用户后门" (聊天页入口移除, 但 Settings 里保留入口)

### 决策

[TODO] 待 review

### 理由

[TODO] 待决策后填

### 备选方案

- **(i) 完全删除**: 优势 = 代码库瘦身, 单一路径; 弊端 = 高级用户失去 GUI 工具, 沉没成本浪费
- **(ii) 保留作后门**: 优势 = 不浪费已做工作, 高级用户有兜底; 弊端 = 双路径维护成本, 聊天页 vs Settings 入口认知割裂

### 后果

[TODO] 待决策后填

---

## D-002 · [TODO 待拍板] `/bootstrap` 命令命运 (来自 OQ-3)

**状态**: proposed
**日期**: [TODO]
**决策人**: 用户 + 主 agent

### 背景

ChatInput.SkillCommandPalette 的 `/bootstrap` 命令当前打开 Wizard。本 change 后:
- (i) 完全删除该命令
- (ii) 改语义: `/bootstrap` 触发 LLM 输出 `[[handoff:bootstrap]]` 引导卡片 (而不是真打开 Wizard)

### 决策

[TODO]

### 理由 / 备选 / 后果

[TODO]

---

## D-003 · [TODO 待拍板] PathDetectionBanner 命运 (来自 OQ-4)

**状态**: proposed
**日期**: [TODO]
**决策人**: 用户 + 主 agent

### 背景

ChatInput.onPaste 检测绝对路径触发 PathDetectionBanner。本 change 后该流程不再有用 (路径粘贴 → bootstrap 链路移除):
- (i) 完全删除
- (ii) 改用途 (e.g. 给"添加为笔记 source" 等其他场景预留)

### 决策

[TODO]

---

## D-004 · [TODO 待拍板] L2 验证失败时的 fallback (来自 OQ-6)

**状态**: proposed
**日期**: [TODO]
**决策人**: 用户 + 主 agent

### 背景

如果 B 组实测发现 SKILL.md 在 Claude Code/Cursor 触发率 < 80%, 且调 description 后仍无改善:
- (i) 不做兜底 (坚持本 change 命题), 让 L2 触发问题成为已知 bug 推动外部 Agent 升级
- (ii) 在 L1 GUI 加 tool-use 重构作为兜底 (= 路径 B, 工程量 2-3 周, 但与本 change 命题冲突)

### 决策

[TODO] 决策时机: B3/B4 测试结果出来后

### 备选方案

- (i) 风险: L2 触发不到位 = atomsyn 失去入口, 整个产品价值不能兑现
- (ii) 风险: 战略反复 / 工程膨胀 / 与北极星 §6 哲学 3 冲突

---

## D-005 · [TODO 待拍板] 推荐外部 Agent 优先级 (来自 OQ-5)

**状态**: proposed
**日期**: [TODO]
**决策人**: 用户 + 主 agent

### 背景

handoff 卡片应推荐用户用哪个 Agent? 用户群体可能有多种偏好:
- 开发者: Cursor / Claude Code (CLI)
- 产品经理 / 学习者: Claude Desktop App / ChatGPT
- 高级研究: Codex

### 决策

[TODO]

---

## D-006 · [TODO 待拍板] 触发率测试方法 (来自 OQ-7)

**状态**: proposed
**日期**: [TODO]
**决策人**: 主 agent

### 背景

B3 任务需要量化外部 Agent 对 SKILL.md 的触发率, 但当前没有自动化工具:
- (i) 手动跑 40 个测试点, 人工记录
- (ii) 写 atomsyn-cli skill-test 子命令模拟外部 Agent 调用 SKILL.md (工程量未知, 可能很大, 因为要逆向 Claude Code/Cursor 的 skill selector)

### 决策

[TODO] 决策时机: design 阶段研究完工程量后

---

> **追加新决策**时, 复制 D-XXX 模板 entry。决策被新决策替代时, 旧决策状态改为 `superseded by D-XXX`, 不删除。
> **归档前**再扫一遍, 把 proposed 状态的决策定型为 accepted (或 rejected)。
