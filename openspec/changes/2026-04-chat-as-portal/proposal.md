---
change_id: 2026-04-chat-as-portal
title: 聊天页定位重构 — L1 与外部 Agent 互补而非竞争
status: proposed
created: 2026-04-28
owner: 主 agent + 用户
supersedes: ""
related: 2026-04-bootstrap-tools (已归档, GUI 重流程实施完成但战略上让位); 2026-04-bootstrap-skill (已归档, v1)
---

# Proposal · 聊天页定位重构 — L1 与外部 Agent 互补而非竞争

## 1 · 摘要 (TL;DR)

bootstrap-tools 实施完成后用户反思: GUI 内置聊天去复刻"重流程 (扫盘 → 解析 docx/pdf → LLM tool-use loop → dry-run/commit)"是与 Codex / Claude Code / Cursor 等成熟 Agent 直接竞争, 既不必要也不擅长。本 change 重新定位 L1 GUI 聊天页 = "**与库内 atom 互动 + 复盘 + 美观引导用户去外部成熟 Agent 跑重活**", 把 bootstrap / write 等"重数据流" 完全交给 L2 Skill (atomsyn-bootstrap / atomsyn-write); 同时验证 + 强化 L2 Skill 在 Codex / Claude Code / Cursor 中的真实可用性。

## 2 · 背景 (Context)

**bootstrap-tools 战后反思** (2026-04-28 用户):

主 agent 在 bootstrap-tools change 里, 为了让"用户在 GUI 聊天里发 /bootstrap 触发"流畅, 投入了大量 GUI 工程:
- ChatInput SkillCommandPalette 加 `/bootstrap` 命令 (B1-B3)
- PathDetectionBanner 粘贴检测 (B4-B5)
- BootstrapWizard 5 屏 + 多选目录/文件 (B6-B7)
- DryrunScreen agent_trace timeline 折叠面板 (E3)

但是**首跑用户 (= 本人) 的反馈直接指出**: "我希望直接在聊天里多轮对话, Agent 帮我做完, 而不是选文件 → 拷命令 → 切终端 → 跑 → 回 GUI"。深入讨论后, 真实结论是:

1. GUI 内置 LLM 当前没有 tool-use 能力 (`streamChat()` 不传 tools), 让它做 bootstrap 重流程要么"假做" (输出 markdown 自演), 要么大改造 (tool-use loop + spawn 子进程 + key 注入 + 流式进度), 后者工作量 ≥ 整个 bootstrap-tools change
2. 用户日常**已经在用** Codex / Claude Code / Cursor —— 这些工具已经是成熟 Agent (能 tool-use / 能 read 文件 / 能多轮交互), 重复实现一遍不增加价值
3. atomsyn 的差异化是 "100% 本地认知仓库 + 三层架构", 不是 "另一个能帮你做事的对话框"
4. V2.x 北极星 §1 + §6 已写明 "L1+L2 双层缺一不可" — L1 是用户感知 + 复盘, L2 是外部 Agent 的对接接口, 二者**不应职能重叠**

**触发事件**: bootstrap-tools 实施过程中, 用户首跑 dogfood (`/Users/circlelee/Documents/混沌/...txt`) 暴露 triage 单文件 bug (commit `ca4481b` 已修), 但讨论中真正的"卡点"是用户期望与现有 GUI 流程的根本性错位 — 要复制命令到终端的体验对**普通用户**来说不可接受。

**这个想法的来源**: 2026-04-28 用户与主 agent 在 bootstrap-tools 收尾对话中明确提出 "聊天页面只作为普通用户聊天/复盘的工具入口, 不与成熟 Agent 工具形成竞争, 而是互补关系"。

**强依赖**:
- bootstrap-tools (已归档): atomsyn-bootstrap SKILL.md / CLI / extractors / agentic loop 全套已就位, 本 change 复用其全部 L2 资产
- bootstrap-skill (已归档): profile schema / dry-run+commit 协议 / 隐私扫描 全套, 同上
- cognitive-evolution (已归档): applyProfileEvolution / staleness, 同上

## 3 · 痛点 (Problem)

**谁痛**:

(a) **新用户**: 安装 atomsyn → 打开 GUI 聊天 → 不知道 bootstrap 是什么 / 怎么启动 / 跟 Codex 已经在用的能力是不是重复; PathDetectionBanner 粘贴路径弹个提示, 又是另一个学习曲线
(b) **老用户/主 agent (本人)**: 已经在 Cursor 里跑日常代码 + Claude Code 里跑研究, 不想为"导入笔记"专门切到 atomsyn GUI; 期望直接在 Cursor 说"把 ~/X 倒进 atomsyn"就完事
(c) **未来用户**: 不希望 atomsyn 投入精力在重复造轮子 (在 GUI 内复刻外部 Agent 已经能做的事), 应该专注差异化

**痛在哪**:

- **痛点 1 · 职能错位**: GUI 聊天试图同时做"日常对话伴侣" (atomsyn-read 复盘) + "重数据 ETL 控制台" (bootstrap), 两种用户心智完全不同, UI 复杂度叠加, 每个都做不好
- **痛点 2 · 与外部 Agent 不必要竞争**: Codex/Claude Code/Cursor 已经能 tool-use / 多轮 / 流式, atomsyn GUI 把同样的能力再实现一遍 (= 路径 B 中描述的 streamChat 改造 + spawn 子进程包装) 是 2-3 周纯重复工作; 而且 atomsyn 的内置 LLM 不太可能比 Cursor/Claude Code 内置的更先进 (它们持续投入), 这条路是必输竞争
- **痛点 3 · L2 真实可用性未验证**: bootstrap-tools tasks.md 里 H1/H2/H5 (Claude Code/Cursor 真实触发 atomsyn-bootstrap) 在 v2 始终标"用户实机"未跑, 实际 SKILL.md description 在 Claude Code 是否被准确选中 (Skill 触发是黑盒) 没人知道; 如果触发不到位, 整个 L2 通路的价值是 0
- **痛点 4 · 用户感知割裂**: BootstrapWizard 5 屏 + PathDetectionBanner + agent_trace timeline 都已实现, 但**没人跑过完整 e2e 真实流** (G7 dogfood 4437 文件未跑); 这些 UI 投入在战略调整后属于"沉没成本", 不应再继续推进

**不解决会怎么样**:

- atomsyn 北极星 demo 场景 (两个月前的顿悟会安静地出现) 在新用户首跑断裂: 因为 GUI bootstrap 流程太重, 用户放弃; 又不知道可以去 Cursor 用 skill, L2 入口形同虚设
- 主 agent 持续 sunk-cost 投入 GUI bootstrap (2-3 周 streamChat 改造 + 子进程 + 异步进度 UI) 是错配资源
- "100% 本地主权 + L1+L2 双层" 的差异化叙事被自己稀释

**具体场景** (本人 2026-04-28 实测):

> 我在 Cursor 写 atomsyn 代码时, 想顺手把今天写的设计笔记 (markdown) 沉淀到 atomsyn。理想流: 在 Cursor 当前会话直接说 "把 docs/plans/v2.3-bootstrap-tools.md 沉淀进 atomsyn", Cursor 看到 SKILL atomsyn-write 触发, 自动 ingest, 一句话回我 atom_id。实际现在: 我得切到 atomsyn GUI → 找到笔记内容 → 复制粘贴 → 在 GUI 聊天用 [[ingest:confirm|...]] → 5 步操作。如果 SKILL 在 Cursor 真触发到位, 流程就是 1 句话。

## 4 · 提案 (Proposal)

### 一句话解

L1 GUI 聊天**减负** (移除 / 大幅简化 bootstrap 重流程相关 UI), L2 Skill **加固验证** (实机跑 atomsyn-bootstrap / write / read / mentor 在 Claude Code + Cursor + Codex 真实触发), L1 仅保留**美观引导卡片**让用户在外部 Agent 触发 skill。

### In-scope (本 change 必交付)

#### A · L1 减负 (减法工程)

- [ ] A1. **BootstrapWizard 决策** — 二选一: (i) 整个移除 (路径轻) (ii) 保留为"高级用户后门"但聊天页不再有任何打开入口 (路径中). 推荐 (ii), 因为已有的多选/timeline 投入是真做的不是骗用户, 留作 power user 能用就行
- [ ] A2. **ChatInput 入口减负**: 移除 `/bootstrap` 命令和 PathDetectionBanner (它们的目的是让 GUI 内做 bootstrap, 战略调整后不再需要); 保留 `/read /write /mentor` (这三个是 L1 真正的本职)
- [ ] A3. **聊天里"美观引导卡片"**: 用户在聊天发"导入 / bootstrap / 把 X 倒进来"时, GUI LLM 不再尝试跑流程, 而是输出**一张设计精美的引导卡片** "→ 在你的 Codex/Claude Code/Cursor 里说 '初始化 atomsyn, 把 ~/Documents 倒进来' 即可。原因: (1) 它们已经能多轮交互 (2) atomsyn 的 skill 已就位"; 卡片含**一键复制提示词**按钮
- [ ] A4. **AGENTS.md 调整**: 当前 §可用 Skills 把 atomsyn-bootstrap 归类为"GUI 引导 → 外部 Agent 执行", 不让 GUI LLM 假装能做

#### B · L2 验证 + 加固

- [ ] B1. **真实机器实测 atomsyn-bootstrap 在 Claude Code 触发** (= bootstrap-tools H1, 转入本 change): 跑 install-skill → 在 Claude Code 说 "把 ~/Documents/混沌 倒进 atomsyn" → 观察 Claude Code 是否正确加载 SKILL.md / 是否走 dry-run/commit 两步 / AskUserQuestion 关卡是否生效
- [ ] B2. **真实机器实测在 Cursor 触发** (= H2)
- [ ] B3. **同上, 测 atomsyn-write/read/mentor** 在 Claude Code + Cursor 双工具的 description 触发率, 用 5 个真实用户场景 (e.g. "记录这个洞察 / 找用户访谈方法 / 帮我复盘最近一个月")
- [ ] B4. **触发率不达标时调 SKILL.md description**: 关键词 / 中英文 / 上下文示例 / 如何写更让 Claude Code 内置 skill selector 命中 — 这是个 prompt engineering 问题
- [ ] B5. **写一份 "Atomsyn × 外部 Agent 用户指南"**: docs/guide/external-agent-integration.md, 含安装步骤 / 4 个 skill 各自的最佳触发话术 / 已知 quirks

#### C · 美观引导组件

- [ ] C1. **新建 `<ExternalAgentHandoffCard>` 组件** (src/components/chat/): 纯 Markdown action card 渲染, 含 logo (Codex / Claude / Cursor 按用户偏好) + 一键复制按钮 + 触发话术示例 + 对应 skill 名称
- [ ] C2. **触发逻辑**: `MarkdownRenderer.tsx` 识别 `[[handoff:bootstrap|{...}]]` action 卡片 (类似现有 `[[ingest:confirm]]` 模式)
- [ ] C3. **AGENTS.md 教 LLM 输出**: 用户提到 bootstrap / 导入 / 倒进来 时, 输出 `[[handoff:bootstrap|{"task":"bootstrap","prompt":"在 Cursor 里说: '初始化 atomsyn, 把 ~/Documents/X 倒进来'", "skill":"atomsyn-bootstrap"}]]`

#### D · 一致性与文档

- [ ] D1. 更新 `docs/framing/v2.x-north-star.md` (如需要): 明确 L1 vs L2 职能边界 (避免未来再次跨界设计)
- [ ] D2. 更新 `openspec/specs/skill-contract.md`: 加 "L1 不实现 skill 重流程" 这条不变量
- [ ] D3. 更新 `openspec/specs/cli-contract.md` 不变量章节: install-skill 不仅装到 ~/.claude + ~/.cursor, 也支持后续可能的 OpenAI Codex / 其他 Agent 路径
- [ ] D4. 写 docs/plans/v2.4-chat-as-portal.md 叙事段落

### Out-of-scope (本 change 不做, 留给后续 change)

- L1 GUI 聊天接入原生 tool-use (路径 B, 推迟至 v3 视必要性再立项 `2026-XX-chat-tool-use`)
- 让 GUI 内置 LLM 跑完整 bootstrap (战略上拒绝)
- BootstrapWizard 整个删除 (除非 A1 决策选 (i), 否则保留)
- atomsyn 自己做"成熟 Agent" 与 Codex 对标 (永不做, 不在我们能力 / 资源范围内)
- 多用户协作 / 云同步 (永远 100% 本地, 不在范围)
- 把 atomsyn-cli ATOMSYN_LLM_API_KEY 与 GUI key 打通 (本 change 通过引导用户在外部 Agent 跑, 让 atomsyn-cli 仍然只读 env, 用户在 Codex/Claude Code 里 key 是另一套)

## 5 · 北极星对齐 (North Star Alignment)

| 维度 | 回答 |
|---|---|
| 主层 | **三层架构边界澄清** — 本 change 不新增功能, 而是**澄清 L1 (GUI) 与 L2 (Skill / CLI) 的职能边界**, 让"L1+L2 双层缺一不可"哲学真正落地。L1 = 教练层入口 (复盘 + 与库内 atom 对话); L2 = 仓库 + 结构层的写入路径 (通过外部成熟 Agent 触发) |
| 喂养下游 | L1 美观引导让普通用户发现 L2 入口; L2 真实可用让 atomsyn 三层架构在外部工具中真正可触发 |
| 来自上游 | bootstrap-tools / bootstrap-skill / cognitive-evolution 三个 change 已交付的 L2 接口 (4 个 skill + atomsyn-cli 全 surface) 全部复用, 本 change 不重写 |
| 北极星主句关联 | "**让你积累的认知, 在需要时醒来**" 兑现需要 L1 与 L2 各司其职: L1 = "你看到自己的认知在生长" (复盘 + 库内对话, 这是用户 *看见* 醒来), L2 = "AI 工具能调用你的认知" (write/read/mentor/bootstrap, 这是用户 *体验* 醒来). 二者不能合并到一个 L1 框里 (会两头都做不好); 也不能只做 L2 (用户没有"看见" 反馈, 留存归零). 本 change 是这个分工的真正落地 |

哲学映射 (来自 north-star.md §6):
- 哲学 2 "L1+L2 双层缺一不可" — **本 change 的核心命题**
- 哲学 3 "大厂结构性不会做" — 大厂会把所有能力塞进自己的 chat (ChatGPT / Claude.ai / Gemini), 我们反向 — 把"做事"外包给成熟 Agent, atomsyn 只做差异化的"本地认知仓库"
- 哲学 7 "教练不居高临下" — 美观引导卡片说"在 Cursor 里说 X 即可", 是平等推荐, 不是说教

## 6 · 成功指标 (Success Metrics)

- **指标 1 · L2 触发率达标**: 在 Claude Code + Cursor 双工具上, 用 5 个真实场景测 4 个 skill (atomsyn-bootstrap/write/read/mentor) 触发, 成功率 ≥ 80% (即 20 个测试中 ≥ 16 个触发到位). 验证方式: B3/B4 任务实测记录
- **指标 2 · L1 简化生效**: 用户从打开 GUI 到知道"bootstrap 应该去 Cursor 跑" 的路径 ≤ 2 步 (打开聊天 + 看到引导卡片). 验证方式: 录屏 + 操作步数计数, 当前是"用户在 GUI 找半天 bootstrap 入口" 不可量化失败
- **指标 3 · BootstrapWizard 不再是 GUI 默认推荐**: 聊天页不再有任何明显入口指向 Wizard (移除 `/bootstrap` 命令 + PathDetectionBanner). 验证方式: 代码扫描 + 视觉走查
- **指标 4 · 外部 Agent 用户指南可用**: 用户读完 `docs/guide/external-agent-integration.md` 能 5 分钟内配好 skill + 跑通一次 bootstrap. 验证方式: 一个未读过 Atomsyn 任何文档的人按指南操作的耗时
- **指标 5 · 战略稳定性**: 本 change 完成 90 天内, 不再出现"L1 应该实现 X 重流程"的反向讨论 (除非真实用户需求驱动). 验证方式: 6 个月后 review

## 7 · 风险与未知 (Risks & Unknowns)

### 已知风险

- **R1 · L2 触发不到位但已无 L1 退路**: 如果 SKILL.md 在 Claude Code/Cursor description 选择失灵 (Skill selector 是黑盒), 用户既找不到 GUI 入口又无法在外部 Agent 触发, atomsyn 等于死路。**缓解**: B 组先验证后减负, 即 B 先于 A; 如果 B 验证失败, A 不动 (BootstrapWizard 仍是兜底)
- **R2 · 用户认知反弹**: 已经习惯 "atomsyn 自己能做 bootstrap" 的早期用户 (如本人) 在 GUI 找不到入口会困惑。**缓解**: 美观引导卡片 + 一键复制, 用户感知 "我做了一次, 知道下次去 Cursor 跑" 即可; BootstrapWizard 走 A1(ii) 留作高级后门
- **R3 · 外部 Agent 描述变化**: Codex/Claude Code/Cursor 的 skill 选择算法可能升级, 现在测的"触发率 ≥ 80%" 6 个月后可能下降. **缓解**: 美观引导卡片含**一键复制提示词** — 用户即使 SKILL 没自动触发, 也能直接发完整 prompt 给 Agent
- **R4 · 沉没成本心理**: bootstrap-tools 的 B+E 组 (PathDetectionBanner / Wizard 多选 / agent_trace timeline) 是真做了的, 战略调整后部分功能"用不上"会让人不舍得移除. **缓解**: 不强制 100% 删除 (A1 留 (ii) 路径); 真删的部分 (PathDetectionBanner) 在 git 历史保留, 未来如需复活可恢复
- **R5 · "atomsyn 的差异化是什么"叙事压力**: 一旦 L1 不做 bootstrap 重流程, 用户可能问 "那 atomsyn 跟 Notion + Cursor 的组合有啥区别". **缓解**: 加强叙事, 突出 (a) 100% 本地 (Notion 云端) (b) 双骨架结构 (Notion 是树状/数据库, atomsyn 是方法论 × 经验相遇) (c) profile + cognitive evolution 是任何外部工具不会做的
- **R6 · 真实用户与开发者用户的偏好分歧**: 本人 (开发者) 重度用 Cursor, 但**普通用户** (产品经理 / 学习者 / 学生) 可能不用 Cursor. 让他们去装 Cursor + 配 skill 是巨大门槛. **缓解**: B5 用户指南分开写 — 开发者路径 (Cursor) + Claude Desktop App 路径 + ChatGPT/OpenAI Codex 路径, 兼容多种用户

### 待澄清

- [ ] OQ-1 · BootstrapWizard 走 A1(i) 完全删除, 还是 (ii) 保留作高级后门? **倾向 (ii)**, 但需要用户最终拍板, 涉及 ~600 行代码删除决策
- [ ] OQ-2 · 美观引导卡片 [[handoff:bootstrap]] 的视觉具体怎么设计? Linear 风格? 含 Logo + 一键复制按钮? 设计交付规格 [TODO 在 design 阶段澄清]
- [ ] OQ-3 · ChatInput 的 `/bootstrap` 命令删除还是改语义? 倾向**改语义**: `/bootstrap` 触发引导卡片输出 (而不是真打开 Wizard), 让命令面板保持完整
- [ ] OQ-4 · PathDetectionBanner 是否真删? 它的产品价值"用户粘贴路径感知"在 atomsyn 之外仍可触发其他场景 (e.g. "添加为笔记 source"); 但当前它只服务 bootstrap. 倾向先删, 未来其他需求再做
- [ ] OQ-5 · L1 / L2 用户群体的优先级? 本 change 假设"开发者用户 + Cursor / Claude Code"是主流, 但应该用 docs/framing 重新审视用户画像
- [ ] OQ-6 · 是否需要做"GUI 内嵌真 tool-use" (路径 B) 作为 fallback? 即使 L2 失败也有兜底? **倾向不做** (违反本 change 的核心命题), 但需 review 阶段确认
- [ ] OQ-7 · 触发率怎么测? 是否要做一个 atomsyn-cli 的 "skill-test" 子命令模拟外部 Agent 调用 SKILL.md 评估描述匹配度? [TODO 在 design 阶段研究 — 工作量可能很大]

## 8 · 替代方案 (Alternatives Considered)

### 方案 A · "GUI 不动, 加 tool-use 重构" (路径 B)

- 描述: 给 streamChat 加 tool-use 能力, spawn atomsyn-cli 子进程实现 chat 内嵌 bootstrap, 流式进度显示, key 注入
- 利: 用户感知最流畅 (一站式), 不需要切外部 Agent
- 弊: 工程量 2-3 周, 需要 packaged Tauri spawn 子进程包装 (V2.x bootstrap-skill API 501 同根问题); GUI 内置 LLM 即使加上 tool-use 也很难比 Cursor/Claude Code 内置的更先进; 重复造轮子且必输竞争
- 为什么没选: 与 V2.x 北极星 §6 哲学 3 "大厂结构性不会做" 冲突 (我们去做大厂会做的事); 工程优先级配错; 真正的差异化不是"做事", 是"本地认知仓库"

### 方案 B · "什么都不做, 让用户自己探索"

- 描述: bootstrap-tools 已交付, GUI 入口已加, 让用户自己摸索去外部 Agent 还是用 GUI
- 利: 0 工程
- 弊: 用户首跑路径不清晰; PathDetectionBanner / Wizard 多选 等"半成品" 体验拉低 atomsyn 整体感知; H1/H2/H5 真实可用性永远没人验证, L2 通路价值未兑现
- 为什么没选: 主 agent 已经在 bootstrap-tools 收尾时承认有"用户感知割裂", 不解决会 sunk-cost 持续

### 方案 C · "L1 改为 web-only, 移除桌面 app 转 SaaS"

- 描述: 完全放弃 Tauri, 做成 web 应用 + chrome extension, 让用户的 ChatGPT 网页/Claude.ai 直接调用
- 利: 跨平台方便; 不用维护 Tauri / 打包等
- 弊: 违反"100% 本地主权" 哲学 1; 数据上云后 atomsyn 失去差异化; 与项目 V1 起核心承诺反向
- 为什么没选: 本地优先是不可妥协的哲学

### 方案 D · "两手都要, GUI 也做 + 推外部 Agent"

- 描述: 既保留 GUI bootstrap 全套 (PathDetectionBanner / Wizard / agent_trace timeline), 又加美观引导卡片
- 利: 给用户多选择
- 弊: 维护成本翻倍 (两条路径都要测); 用户认知负担更重 ("我应该用 GUI 还是 Cursor?"); 与本 change 的"职能边界澄清" 命题直接冲突
- 为什么没选: "两手都要"是产品的常见错觉, 实际上等于"两边都做不好"; V2.x 北极星 §6 哲学 2 强调"双层缺一不可"是分工而不是叠加

## 9 · 上下游引用

- **战略锚点**: `docs/framing/v2.x-north-star.md` §1 三层架构 + §6 哲学 2 "L1+L2 双层缺一不可" + 哲学 3 "大厂结构性不会做" + 哲学 7 "教练不居高临下"
- **idea 来源**: 2026-04-28 用户与主 agent 在 bootstrap-tools 收尾对话中的战略反思 (本会话末尾段)
- **强依赖 (已归档, 接口复用)**:
  - `openspec/archive/2026/04/2026-04-bootstrap-tools/` (v2 GUI 重流程 + agentic loop 实施完成)
  - `openspec/archive/2026/04/2026-04-bootstrap-skill/` (v1 SKILL.md / dry-run+commit / profile)
  - `openspec/archive/2026/04/2026-04-cognitive-evolution/` (applyProfileEvolution / staleness)
- **影响的 specs**:
  - `openspec/specs/skill-contract.md` — 加 "L1 不实现 skill 重流程" 不变量
  - `openspec/specs/cli-contract.md` — install-skill 列举支持的外部 Agent
  - 不动 data-schema (无 schema 变更)
- **影响的代码** (预估, 详见 design.md):
  - 删: `src/components/chat/PathDetectionBanner.tsx` (or 改用途)
  - 改: `src/components/chat/SkillCommandPalette.tsx` (调 `/bootstrap` 语义) + `ChatInput.tsx` (移除 onPaste 检测)
  - 改: `src/pages/ChatPage.tsx` 移除 atomsyn:open-bootstrap 监听
  - 新: `src/components/chat/ExternalAgentHandoffCard.tsx`
  - 改: `src/components/chat/MarkdownRenderer.tsx` 识别 `[[handoff:...|{...}]]`
  - 改: `~/Library/Application Support/atomsyn/chat/AGENTS.md` (用户私有, 也提供默认 seed)
  - 留: `BootstrapWizard` 走 A1(ii) 保留为高级后门 (聊天页移除入口) 或 A1(i) 完全删除
- **影响的文档**:
  - `docs/framing/v2.x-north-star.md` (如需澄清边界)
  - `docs/plans/v2.4-chat-as-portal.md` (新, 本 change 叙事)
  - `docs/guide/external-agent-integration.md` (新, 用户指南)

---

## 附录 · 启动新会话的指引

> 本 change 处于 **proposed** 状态, design / tasks / decisions 是骨架。新会话压缩上下文后启动该 change 的 review/design 阶段时:
>
> **必读** (~5000 行):
> 1. `.claude/CLAUDE.md`
> 2. `docs/framing/v2.x-north-star.md` (重点 §1 三层架构 + §6 八条哲学)
> 3. `openspec/README.md`
> 4. `openspec/changes/IMPLEMENTATION-HANDOFF.md` (重点 §0.6 + §0.7 v2 完结状态)
> 5. **本 proposal.md (全)**
> 6. 已归档 `openspec/archive/2026/04/2026-04-bootstrap-tools/{proposal,design}.md` (复用接口的全套描述)
> 7. `~/Library/Application Support/atomsyn/chat/AGENTS.md` (当前 GUI LLM 行为规范)
> 8. `src/lib/contextHarness.ts` + `src/lib/chatLlmClient.ts` (当前聊天链路)
>
> **第一步**: 先与用户对齐 OQ-1 ~ OQ-7 (尤其 OQ-1 BootstrapWizard 删/留 + OQ-6 是否要兜底 tool-use); 拍板后再进 design.md 填具体设计。
>
> **不要做的事**:
> - 不要在没拍板 OQ-1 之前真删 BootstrapWizard (避免 sunk-cost 浪费)
> - 不要尝试在 L1 GUI 实现 tool-use (= 路径 B, 与本 change 命题冲突)
> - 不要重新讨论已归档 change 的 decisions (D-001~D-009 of bootstrap-tools 等都是 accepted, 不重新决策)
