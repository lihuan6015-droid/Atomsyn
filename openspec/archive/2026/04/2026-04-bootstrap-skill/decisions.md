# Decisions · 2026-04-bootstrap-skill

> **怎么用**: 设计阶段把可预见的关键决策写进来。实施阶段如果发现 design 有偏离, 不要直接改 design 文档, 而是: (1) 在这里追加一个新决策 (2) 在 design.md 的 §6 决策矩阵更新 (3) 必要时把旧决策标记为 `superseded`。
>
> **核心原则**: 决策的"理由"和"备选方案"才是这份文档的真正价值。结论谁都看得见, 但 6 个月后回头你会感激当初记下了 "为什么没选 B"。

---

## D-001 · 选择"双层产出" (1 profile + N experience/fragment)

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent + 用户

### 背景

bootstrap 在做 5 层归类后, 究竟应该输出什么？三种候选:

- (A) 只产 1 条 profile atom (摘要骨架, 不存血肉)
- (B) 只产 N 条 fragment/experience atom (血肉, 没骨架)
- (C) 两者都产: 1 profile (骨架) + N fragment/experience (血肉)

用户和主 agent 在对齐时讨论了北极星 Demo 场景能否被兑现, 以及未来教练层的数据需求。

### 决策

**选 (C) 双层产出**:

- 1 条 `kind=profile` atom (新增 kind), 单例存在 `data/atoms/profile/<slug>/atom_profile_<slug>.json`
- N 条 `kind=experience` (具体经历) + N 条 `kind=fragment` (反思/原则提炼) atom, 走现有路径

### 理由

1. **北极星一致性**: V2.x 北极星 Demo 场景里"两个月前的顿悟会安静地出现在回答里" —— 必须有 fragment/experience 才有"顿悟", 单 profile 没法兑现
2. **教练层数据需求**: atomsyn-mentor 未来要做 declared (用户校准的 profile) vs inferred (从行为推断) 的 gap 分析 —— 必须有 profile 这个画像骨架, 单碎片无法聚合稳定画像
3. **与 plan-tune 思想血缘一致**: plan-tune 也是双轨 (declared + inferred + gap), 双层产出是与之兼容的最小架构
4. **结构层数据流通**: profile 喂养结构层 (画像骨架引导 atom 关联), 碎片喂养相遇层 (atomsyn-read 的"碎片在场"), 两者一起喂下游

### 备选方案

- **(A) 只产 profile**: 实施成本低 50%, 但失去血肉, 北极星 Demo 不可兑现, 教练层数据稀疏。**用户在对齐时明确否决**
- **(B) 只产 fragment/experience**: 不引入新 atom kind, schema 冲击最小, 但失去画像骨架, 教练层未来无法做 gap 分析。每次 mentor 都要从 N 条碎片现场聚合, 性能差, 与 plan-tune 不兼容

### 后果

正向:
- 用户首次 bootstrap 后立即享受到"相遇感" (碎片可被 read 找到)
- 教练层 v2 可以直接基于 profile 做 gap 分析 (无需重新设计画像聚合逻辑)
- 与 plan-tune 5 维数值同名同语义, 未来双向 import 成为可能

负向 (我们接受的代价):
- 引入新 atom kind 需要 schema 升级 + 类型系统 + GUI 渲染分支
- profile atom 单例的合并/覆盖语义需要额外约定 (见 D-008)

---

## D-002 · 5 层架构选 Agent 工程派, 不选认知科学派

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent + 用户

### 背景

"5 层记忆架构"在文献和实践中有两种主要流派:

- **流派 ① · 认知科学派**: Working Memory / Episodic / Semantic / Procedural / Meta-memory (源自 Tulving / Baddeley 的人脑模型)
- **流派 ② · Agent 工程派**: Profile / Preferences / Episodic / Domain / Reflections (源自 LangGraph / LlamaIndex 等 Agent memory 实现)

需要选一种作为 bootstrap 归类的标准。

### 决策

**选流派 ② · Agent 工程派**:

- L1 Profile → 输出 profile atom 的 identity / role 字段
- L2 Preferences → 输出 profile atom 的 5 维数值 + N 条 fragment(insight_type=原则提炼)
- L3 Episodic → 输出 N 条 experience(具体踩坑/复盘)
- L4 Domain → 检测覆盖了哪些已有 framework, 关联到 methodology
- L5 Reflections → 输出 N 条 fragment(insight_type=反直觉/方法证伪)

### 理由

1. **可映射到现有 atom kind**: 工程派 5 层每一层都能干净地映射到 Atomsyn 现有的 atom kind (experience / fragment / methodology) 或新增 profile, 无需引入更多新概念
2. **工程友好**: LLM 在做归类提示词时, "把这个文件归到 Profile/Preferences/Episodic/Domain/Reflections 哪一类" 比 "归到 Working/Episodic/Semantic/Procedural/Meta-memory 哪一类" 更具体可执行 (后者对人脑的 Working memory 在静态文档归类中根本不适用)
3. **与外部 Agent 生态一致**: Claude Code / Cursor / OpenAI memory 都用类似工程派分类, 未来 atomsyn 与外部 memory 系统互通时无翻译成本
4. **不忽悠用户**: 工程派分类不假装是脑科学, 不强行类比人脑

### 备选方案

- **流派 ① 认知科学派**: 学术更严谨, 但 Working memory 在静态文档场景没意义 (没有"当前活跃任务"); Procedural memory 在 markdown 笔记里几乎不存在 (那是肌肉记忆)。强行套用会把 80% 文件都归到 Episodic, 失去分类价值

### 后果

正向:
- LLM 归类准确率高 (工程派分类边界清晰)
- 与 Atomsyn 现有 atom kind 一对一映射, 数据模型简洁
- 用户文档化时可读性高 ("Profile" 比 "Procedural memory" 友好)

负向:
- 失去学术严谨性 (但 Atomsyn 不是认知科学论文工具, 这不是诉求)
- 未来如果要跟"真正的认知科学"研究者交付时, 需要做术语映射

---

## D-003 · 3 阶段 funnel 工作流 (TRIAGE → SAMPLING → DEEP DIVE), 每阶段都是关卡

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent + 用户

### 背景

bootstrap 一次性可能要扫 10000 个文件, 跑 N 小时, 调用 N 次 LLM, 用户可能根本没意识到这个量级就启动了。需要一种工作流, 让用户在每个关键决策点都能叫停 / 校准 / 退出。

### 决策

**3 阶段 funnel, 每阶段之间是用户关卡**:

- **Phase 1 · TRIAGE (扫描)**: < 30s, 无 LLM, 输出目录概览, 让用户确认/缩小范围
- **Phase 2 · SAMPLING (采样)**: < 5min, 1 次 LLM, 输出画像假设, 让用户校准
- **Phase 3 · DEEP DIVE (深读)**: < 30min, N 次 LLM, 批量产出 atom

每个 Phase 完成后, Skill 通过 `AskUserQuestion` 让用户确认才进下一阶段。用户可以在任何关卡选"放弃" (退出码 3, session 保留可 resume)。

### 理由

1. **token 预算可见性**: Phase 1 完成后用户能看到"全程预计调用 1000 次 LLM", 决定是否真的要花这个钱
2. **早期止血**: 用户在 Phase 1 看到目录概览发现自己选错路径 (比如指向了 node_modules), 可以立即叫停, 不浪费 LLM 调用
3. **画像准确率**: Phase 2 用户校准画像, 让 Phase 3 的归类有更准的上下文 (LLM 知道"这个用户主要是产品 + 工程角色"会比裸跑准确得多)
4. **用户主权**: 关卡是用户主权的体现, 不是 AI 帮你一口气搞定一切
5. **可恢复**: 阶段化 + session 文件让 `--resume` 自然实现, 关掉终端不用从头跑

### 备选方案

- **一次跑完 (no funnel)**: 用户启动后等 30 分钟看结果。简单, 但任何错误都意味着 30 分钟 + token 浪费, 用户失控感强
- **2 阶段 (TRIAGE + DEEP DIVE)**: 砍掉 SAMPLING。但归类准确率会显著降低 (LLM 缺少画像上下文), 用户没机会在便宜阶段校准画像
- **N 阶段更细**: 比如把 DEEP DIVE 再拆"分批一档/二档/三档"。粒度过细让用户疲劳, 关卡过多变成 ceremony

### 后果

正向:
- 用户对整个流程有控制感 + 知情权
- 即使 Phase 3 跑到一半失败, 已经有 Phase 1/2 的产出可参考

负向:
- 端到端时延比 no-funnel 略长 (但用户感知反而更好, 因为不在等待中)
- Skill 实现复杂度: 必须正确处理 AskUserQuestion 的 3 次往返

---

## D-004 · DEEP DIVE 默认串行, --parallel opt-in

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent + 用户

### 背景

Phase 3 deep-dive 处理 1000 文件, 串行 LLM 调用预计 30 分钟, 4 路并行 sub-agent 预计 8 分钟。要不要默认开并行?

### 决策

**默认串行**, 用户加 `--parallel` 才启用 4 路 sub-agent。

### 理由

1. **新用户失控风险**: 并行同时启动 4 个 LLM 进程, 任何一个出错都可能让整体 session 状态混乱, 新用户不知道怎么 resume
2. **token 成本**: 并行 token cost 是串行的 4x, 用户应该明确知情后才启用
3. **可观测性**: 串行模式下用户能看到"现在处理第 N/M 文件", 并行模式下进度条会跳跃, 心理体验差
4. **失败模式好处理**: 串行单文件失败重试 1 次, 并行需要在 4 个 sub-agent 之间协调失败传播

### 备选方案

- **默认并行**: 30 分钟太久, 默认 8 分钟更友好。但失控风险 + token cost 4x 不能 surprise 用户
- **只串行 (无 --parallel)**: 失去性能优化路径, 老练用户不爽

### 后果

正向:
- 新用户路径稳定可恢复
- 老练用户可 opt-in 并行
- token 预算用户主权

负向:
- 默认体验慢, 用户可能放弃等待 (但 Phase 1 概览已经告知 30 分钟预期, 不算 surprise)

---

## D-005 · 隐私边界 = B+C 组合 (敏感关键字扫描 + .atomsynignore)

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent + 用户

### 背景

bootstrap 是 Atomsyn 第一个会向 LLM 发送大量用户原始文本的功能。隐私边界设计直接决定用户敢不敢用。三种主要策略:

- (A) 黑名单路径 (只看 ~/Documents 不看 ~/.ssh)
- (B) 敏感关键字扫描 (检测 sk-xxxx / api_key / password 等 14 条正则)
- (C) `.atomsynignore` 文件 (用户主权, gitignore 语法)

### 决策

**B + C 组合**:

- 默认启用 14 条敏感关键字扫描 (强敏感跳整个文件, 弱敏感 redact 字段)
- 支持 `.atomsynignore` 文件, gitignore 语法, 用户可主权指定排除规则
- 没有 `.atomsynignore` 时使用内置 fallback (含 .git / node_modules / .ssh / .aws / *.env / *.pem 等)

### 理由

1. **机器可读 secrets 必须有兜底**: 用户不可能手动每天检查自己的笔记里有没有不小心粘贴的 sk-xxxx, B 是机器兜底
2. **用户主权不可缺**: 我家里成员名字虽不是 secret, 但我不想入库, B 不可能感知, 必须有 C
3. **gitignore 语法零学习成本**: 任何用过 git 的用户都立刻理解 `.atomsynignore`
4. **默认 fallback 减少配置**: 大多数用户开箱即用, .ssh / *.env 就被自动排除, 不需要先写 .atomsynignore

### 备选方案

- **只 (A) 黑名单路径**: 静态硬编码不灵活, 用户的"文档"目录可能在任意位置 (Dropbox / iCloud / 项目内 docs/)
- **只 (B) 关键字扫描**: 漏掉非 secret 但不想入库的 (家庭信息 / 朋友姓名)
- **只 (C) .atomsynignore**: 缺机器兜底, 用户疏漏 sk-xxxx 就会泄漏到 LLM

### 后果

正向:
- 机器兜底 + 用户主权双保险
- gitignore 语法零学习成本
- 内置 fallback 让默认体验安全

负向:
- 14 条正则可能误杀 (例: 一段教程文本里讨论"假设 API key 是 sk-xxx" 也会被强敏感跳过)。缓解: phase1 报告把 sensitive_skipped 列表展示, 用户可手动放行
- `.atomsynignore` 文件如果跟 `.gitignore` 不同步, 用户会困惑。缓解: 文档明确"不复用 .gitignore", 让 atomsyn 隐私边界独立控制

---

## D-006 · Skill 命名 = atomsyn-bootstrap

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 用户

### 背景

新 Skill 的命名需要 (a) 描述清楚行为 (b) 与现有三个 skill 在命名空间上一致 (atomsyn-*) (c) 在 description 里能高准确率被 Claude Code / Cursor 触发。

候选:
- `atomsyn-bootstrap`
- `atomsyn-ingest-corpus`
- `atomsyn-import`
- `atomsyn-cold-start`
- `atomsyn-onboard`

### 决策

**`atomsyn-bootstrap`** (用户最终拍板).

### 理由

1. **行为清晰**: "bootstrap" 在工程语境里就是"从零启动"的意思, 一看就懂
2. **与现有命名一致**: atomsyn-write / atomsyn-read / atomsyn-mentor 都是 verb-form, bootstrap 也是 verb-form
3. **触发关键字明确**: 用户说"bootstrap atomsyn / 初始化 atomsyn / 第一次用 atomsyn" 都能命中
4. **不与 ingest 冲突**: bootstrap 是"批量 + 一次性 + 引导式", ingest 是"单点 + 增量"; 命名上避免混淆

### 备选方案

- `atomsyn-ingest-corpus`: 太技术化, 用户不懂"corpus"这词。中文用户更不懂
- `atomsyn-import`: 太宽泛, 跟"import 一条 atom"等场景重叠
- `atomsyn-cold-start`: 工程味重, 用户视角不友好
- `atomsyn-onboard`: 偏向"用户引导", 但本质是数据导入, 命名错位

### 后果

正向:
- 命名零歧义, 触发准确
- 与现有命名空间一致

负向:
- "bootstrap" 对纯中文用户略陌生 (但 description 用中文解释, 触发关键字含中文"初始化")

---

## D-007 · profile atom v1 仅观察, 不让 read 自动注入

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 用户

### 背景

profile atom 是用户的"摘要骨架", 直觉上 atomsyn-read 应该在新会话第一次注入它作为系统提示, 让 AI 立即懂用户。但 bootstrap 是 LLM 推断的, 误判风险高。如果一次错误的 profile 注入到 read, 会污染用户后续所有对话。

### 决策

**v1 不让 read 自动注入 profile**:

- profile atom 默认 `verified=false`
- atomsyn-read SKILL.md 不读 profile (本 change v1 完全不动 read 的代码路径)
- 用户必须在 GUI 走完一次校准流程, profile.verified=true 后, 才考虑 v2 启用 read 注入

### 理由

1. **继承 plan-tune 的 v1 哲学**: plan-tune 也是 v1 仅观察, 让用户先信任系统, 再开放控制权
2. **错误画像污染代价高**: 一个错的 profile 会让所有未来对话被错误画像影响 (例如把用户判断成"风险偏好低"导致 AI 总建议保守方案), 这种污染难以被用户感知和纠正
3. **校准流程是契约**: 让用户必须走一次 GUI 校准 = 用户主动认领画像 = 减少"AI 揣测我"的体感
4. **不阻塞核心价值**: 即使不注入 profile, fragment/experience 已经能在 read 里相遇, 北极星 Demo 仍能兑现

### 备选方案

- **立即注入 (v=true 默认)**: 用户立即获益。但任何 LLM 推断错误会污染整库, 用户难以察觉/纠正
- **半注入 (verified=false 也注入但 confidence 低)**: 妥协方案, 但 LLM 不擅长理解 confidence 数值, 实际效果是仍会被低 confidence profile 误导

### 后果

正向:
- 用户对 profile 的信任建立在主动校准之上, 不是被动接受
- 错误画像不会无声扩散

负向:
- v1 用户校准前, profile atom 看上去像"产出但不被用"的死数据。需要 GUI 文案明确告知"v1 仅观察, 校准后 v2 启用注入"

---

## D-008 · profile schema 与 plan-tune 5 维兼容 (同名同语义)

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent + 用户

### 背景

plan-tune 已经定义了一套 5 维数值 (scope_appetite / risk_tolerance / detail_preference / autonomy / architecture_care), 是 v1 仅观察阶段的成熟参考实现。Atomsyn 的 profile atom 该怎么处理这 5 维?

### 决策

**完全同名同语义**:

- 5 个字段名一字不差: `scope_appetite`, `risk_tolerance`, `detail_preference`, `autonomy`, `architecture_care`
- 数值范围 0-1, 语义对齐 plan-tune 文档
- 在 profile atom 之外保留 Atomsyn 自己的扩展字段 (identity / knowledge_domains / recurring_patterns 等), 不与 plan-tune 冲突

### 理由

1. **未来双向 import**: plan-tune 持久化的状态文件如果未来导出, 可以 1:1 ingest 到 Atomsyn profile, 反之亦然
2. **统一画像生态**: 用户在不同工具间累积的画像是同一份, 不要让用户为同一概念学两套词汇
3. **plan-tune 是成熟参考**: plan-tune 在 v1 仅观察阶段已经经过实战, 它的 5 维选取和数值语义是可信的
4. **零迁移成本**: 同名同语义, 未来不需要写 plan-tune ↔ atomsyn 的字段映射表

### 备选方案

- **完全独立命名**: 避免 atomsyn 和 plan-tune 耦合, 各自演化。但失去未来双向 ingest 的可能, 用户认知负担加倍
- **同名但 atomsyn 本地化解释**: 字段名相同但语义文档化时再阐释一遍 atomsyn 角度。但这等于偏离, 会逐步漂移

### 后果

正向:
- 双轨画像生态成立
- 用户认知负担降低
- 实施成本低 (不用造词)

负向:
- 与 plan-tune 形成软依赖, 未来 plan-tune 更名 5 维需要协调 (但 plan-tune 是 gstack 内部工具, 我们对它有可见性)

---

## D-009 · GUI 入口 = 聊天页面专属"初始化向导"按钮

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 用户

### 背景

bootstrap 是仪式性 + 一次性的动作, 不像日常聊天。GUI 入口该放哪?

候选:
- (A) 聊天页面专属"初始化向导"按钮
- (B) 聊天里说 `/bootstrap` 命令触发
- (C) Settings 页面"高级 → 数据导入"
- (D) 首次启动应用时自动弹窗
- (E) 多入口 (上述任意组合)

### 决策

**(A) 聊天页面专属"初始化向导"按钮**, 不开放 (B/C/D)。

具体: 在 `src/pages/Chat/` 顶部 / 侧栏 / 输入框附近 (具体由 GUI 设计决定) 加一个明显的"初始化向导"按钮, 点击后展开 4 屏向导面板。

### 理由

1. **仪式感对**: bootstrap 是一次性大动作, 应该有明显入口让用户专门来干这件事, 不混入日常聊天流
2. **聊天页就是 Skill 的家**: bootstrap Skill 主要在 Claude Code / Cursor 里跑, 聊天页是 Atomsyn GUI 内最接近"对话式 AI 工作"的页面, 入口上下文一致
3. **不污染 Settings**: Settings 是"配置"语义, bootstrap 是"动作"语义, 放 Settings 会让 Settings 越来越复杂
4. **不自动弹窗**: 用户需要主动决定"我要导入"是关键。自动弹窗会让用户尚未理解工具就被催促, 心理负担

### 备选方案

- **(B) 聊天里 /bootstrap**: 太隐藏, 新用户不可能发现; 而且聊天里"说"启动一个 30 分钟过程感觉不严肃
- **(C) Settings**: 错位, 见上
- **(D) 首次启动弹窗**: surprise 用户, 心理负担
- **(E) 多入口**: 太多入口反而让用户困惑"哪个才是对的"; 只在最对的位置开一个入口

### 后果

正向:
- 入口位置自然, 用户能找到
- 不污染其他页面语义
- 首次启动不催促

负向:
- 聊天页本身已经是 V2.x 的复杂页面, 增加这个按钮要小心 layout 不混乱
- 用户如果一开始没用聊天页就发现不了入口 (缓解: 在 Atlas 空状态页面展示"看上去你还没数据, 去聊天页跑 bootstrap")

---

## D-010 · profile atom 单例 + previous_versions[] 数组追溯

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 用户

### 背景

OQ-1 在第一版 design 中悬而未决: profile atom 跨多次 bootstrap (用户先扫 ~/Documents 再扫 ~/Cursor 历史, 或半年后跑第二次) 是合并为单例覆盖, 还是各自独立成多条 profile? 用户在反馈中明确选定单例模式。

### 决策

**单例**: 全库永远只有 1 条活跃 profile atom, id 固定为 `atom_profile_main`, 文件路径 `<dataDir>/atoms/profile/main/atom_profile_main.json`。每次 bootstrap 重跑 / 用户在 GUI 校准 / Agent 主动触发演化时:

1. 现有 profile 的当前快照 (preferences + identity + knowledge_domains + recurring_patterns + evidence_atom_ids) 被推入 `previous_versions[]` 数组**顶部** (新→旧顺序)
2. 顶层字段被新数据覆写
3. 每条 previous_versions 必带 `trigger` 字段 (`bootstrap_initial` / `bootstrap_rerun` / `user_calibration` / `agent_evolution`)
4. v1 不限 previous_versions 数组长度, GUI 显示前 10 条, 用户可手动 prune

### 理由

1. **语义对**: 用户对"我的画像"的心智是单例 ("这就是我"), 多条 profile 容易让用户困惑"哪个才是真我"
2. **向 plan-tune 兼容**: plan-tune 的 `~/.gstack/developer-profile.json` 也是单例 + 历史日志, 同构便于未来双向 ingest
3. **previous_versions 不丢轨迹**: 单例不等于丢失历史, 历史快照在数组里, 与 cognitive-evolution 的 supersede 哲学一致 (打破→重建但保留链)
4. **mentor v2 漂移分析便利**: previous_versions 的时间序列直接可作为 mentor "你的画像在演化" 报告的数据源
5. **GUI 简单**: 单例避免 GUI 设计"多 profile 切换"的复杂度

### 备选方案

- **多条独立**: 每次 bootstrap 创建新 profile atom, 用 createdAt 区分 → 用户无法回答"这是我的画像吗", 心智成本高
- **单例无历史**: profile 字段直接覆盖, 不留 previous_versions → 丢失学习轨迹, 违反 Atomsyn 哲学
- **混合 (用户在 GUI 选保留多条 / 单例)**: 给用户配置入口 → 选项过多反而困惑

### 后果

正向:
- profile 语义清晰: "我的画像 = atom_profile_main"
- 历史不丢: previous_versions 让"画像演化轨迹"成为一类可视化资产
- GUI 时间线交互简单
- 与 cognitive-evolution 联动: 单例 + supersede 是天然组合

负向:
- previous_versions 数组无限增长可能超 8KB JSON 单文件软上限 (缓解: GUI 提示 v3 之后建议 prune)
- 用户多设备同步 (未来) 时单例需要 conflict resolution (本 change v1 单设备, 暂不处理)

---

## D-011 · dry-run 仅输出用户友好 markdown, 不调用 LLM 生成 atom JSON

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 用户

### 背景

OQ-3 在第一版 design 中悬而未决: `--dry-run` 模式是 (A) 调用 LLM 完整生成 atom JSON 但不写入磁盘, 还是 (B) 跳过 LLM 直接输出预期产物列表? 用户在反馈中明确: dry-run 仅产出用户易于观看的 markdown, 真正写入时再由 Agent 生成 atom JSON 进行写入, 因为在写入前用户可能会纠正一些错误。

### 决策

**两阶段产出协议**:

**阶段 1 · `--dry-run` 输出 (cheap pass)**:
- CLI 走完 TRIAGE + SAMPLING + (轻量) DEEP DIVE
- DEEP DIVE 中调用 LLM 时**只要求输出每个候选 atom 的人类友好摘要** (markdown 表格): name / 一句话 insight / 5 层归类 / 原文片段 (50 字截断) / confidence / 建议 tags
- **不**生成完整 atom JSON (省一半 token)
- 输出到 stdout + 持久化到 session 文件 `~/.atomsyn/bootstrap-sessions/<id>.md`
- 用户可在 markdown 上**直接编辑**: 删行 / 改 name / 改归类 / 加 tags / 加用户备注

**阶段 2 · `--commit <session-id>` (write pass)**:
- CLI 读 session 的 markdown (默认从文件, 也可通过 `markdown_corrected` 字段在 GUI 提交时 inline 传入)
- 对 markdown 中保留的每条候选, 调用 LLM 生成完整 atom JSON (这次有完整 schema 字段)
- LLM prompt 中必须把"用户保留 + 用户修改的 markdown"作为输入, 让 LLM 在生成时已知用户偏好
- 通过 `atomsyn-cli ingest --stdin` 写入磁盘
- profile atom 此阶段同样生成 + 落盘

### 理由

1. **markdown 是用户最容易编辑的格式**: JSON 改起来需要 IDE + schema 知识, markdown 任何文本编辑器都行, 普通用户能用
2. **省 token**: dry-run 单条输出 ~200 token vs 完整 JSON ~500 token, 节约 60%
3. **写入阶段二次确认**: LLM 在 commit 时看到的是"用户已认可的 markdown", 比从原始文档直接生成 JSON 更准
4. **可回放**: session 的 markdown 文件人类可读, 用户半年后回看也知道"当时我同意了什么"
5. **不破坏现有 ingest 协议**: ingest 仍然是 stdin atom JSON, bootstrap 只是上游变了

### 备选方案

- **A: dry-run 直接出 atom JSON** → 用户改 JSON 太难, 用户主权打折
- **C: 跳过 dry-run 直接写, 用户事后 prune** → 写入污染发生在前, 后悔成本高 (符合 cognitive-evolution 的 prune 哲学但不预防)
- **D: dry-run 出 yaml** → yaml 没比 markdown 更好, 还多一种格式

### 后果

正向:
- 用户主权最强 (写入前可逐条干预)
- token 成本可预测, dry-run 总是便宜
- session markdown 可作为审计日志
- GUI 实现简单: 直接渲染 markdown + 编辑器即可

负向:
- 实施工作量翻倍 (CLI 要支持 dry-run 和 commit 两套路径)
- 写入阶段需要二次 LLM 调用, 成功率必须达到 99% (LLM 把"已经被认可的 markdown 转 JSON" 失败率应该极低, 但需要测)
- markdown 格式约定要严格 (改格式可能让 commit 解析失败, 缓解: commit 时容错解析 + GUI 编辑器走 schema 校验)

---

## D-012 · LLM prompt 模板 v1 hard-code 在 CLI, 不放配置文件

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 用户

### 背景

OQ-5 在第一版 design 中悬而未决: 5 层归类 + 5 维数值推断的 LLM prompt 模板 (A) hard-code 在 CLI 源码 / (B) 放 `config/llm.config.json` 让用户改 / (C) 混合。用户反馈: "你来决定就行, 但是要确保我们后续的实施能够端到端的实现。"

主 agent 选 A (v1 hard-code), 理由如下。

### 决策

**v1 hard-code**: prompt 模板存放在仓库内 `scripts/bootstrap/prompts/` 目录:

```
scripts/bootstrap/prompts/
├── triage.md           # Phase 1 不需要 LLM, 占位
├── sampling.md         # Phase 2 SAMPLING 用的 prompt
├── deep-dive-l1-l2.md  # Profile + Preferences 提炼
├── deep-dive-l3.md     # Episodic 经验提取
├── deep-dive-l4.md     # Domain 领域归类
├── deep-dive-l5.md     # Reflections 反思提取
└── commit.md           # markdown → atom JSON 转换
```

CLI 启动时硬加载这些 prompt, 不暴露给用户配置, 不允许通过环境变量 / 配置文件 override。

v2 视用户反馈再考虑开放 override (例如改成 `config/bootstrap-prompts/*.md` 用户可放在 dataDir 覆盖, 找不到再 fallback 到内置)。

### 理由

1. **端到端可控**: 实施时主 agent 调试 prompt 是循环最频繁的事, 文件路径稳定不变让调试快
2. **避免用户挖坑**: prompt 是"暗黑艺术", 用户随手改可能让整个 bootstrap 输出质量崩溃 → 用户体感差归咎于 Atomsyn
3. **跨设备一致**: 用户在不同机器上运行 Atomsyn 时, hard-code 保证行为一致 (配置文件容易漏同步)
4. **测试覆盖容易**: 测试只需覆盖固定 prompt 集合, 不需要"用户自定义 prompt 后是否仍然能 ingest"
5. **v2 渐进开放**: hard-code 是先行约束, 随时可以放宽; 反过来 (开放 → 收紧) 是 breaking change

### 备选方案

- **B: 放 config/llm.config.json 用户可改** → 用户主权强但风险高, v1 不必要
- **C: 默认 hard-code + 用户 override** → 实施复杂度高 (要管两套路径), v1 不必要
- **D: 不写 prompt 模板, 让 CLI 现场拼字符串** → 不可维护

### 后果

正向:
- 实施可控, prompt 调优可以是 git PR 流程
- 用户体感稳定 (不同机器一致)
- 端到端可测

负向:
- 高级用户 (想自定义 prompt 跑特殊领域) 暂时只能 fork 仓库 → 已知缺憾, v2 再考虑
- 修 prompt 需要 release Atomsyn 版本 → 接受这个代价 (prompt 不该频繁改)

---

## D-013 · v1 必交付 GUI 认知画像模块 (校准入口)

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 用户

### 背景

用户在反馈中提出: "在我们的 GUI 端我们是否也要增加一个模块供用户查看, 甚至编辑修改 (矫正)。" 经讨论确认: 没有 GUI 校准入口, profile.verified 永远为 false, "v1 仅观察"哲学走不通 (verified 永不变 true 等于 read 永远不能用 profile, 等于功能死掉)。

主 agent 提议作为 v1 必交付, 用户认同。

### 决策

**v1 必交付** GUI "认知画像 (Profile)" 模块, 详细 UI 设计在 design.md §5.4。核心组件:

1. **位置**: 一级页面 (与 Atlas / Growth / Skill Map 同级) 或 Growth 子 tab —— 最终位置由设计师定 (open question OQ-7), 但**必须有显眼入口**
2. **功能**:
   - profile 当前版本展示 (identity / preferences 5 维滑块 / knowledge_domains / recurring_patterns)
   - 编辑 + 校准 (verified toggle, 必须至少校准一次才能切 true)
   - evidence_atom_ids 反查链接 (每个字段后面"基于 N 条 atom"小标, 点开查证据)
   - previous_versions 时间线 (前 10 条, 每条带 trigger 标签 + restore 操作)
3. **API 端点** (双通道):
   - `POST /atoms/:id/calibrate-profile` 提交校准
   - `GET /atoms/profile/versions` 拉历史
   - `POST /atoms/profile/restore` 恢复历史版本

### 理由

1. **没有校准入口 v1 仅观察哲学走不通**: read 在 v2 启用注入的前提是 verified=true, 没 GUI 用户没法切 true, 等于设计死锁
2. **用户主权完整**: profile 是关于"我"的 atom, 必须有给用户审视和修改的入口, 否则违反 Atomsyn 哲学 §1 "本地 100%, 主权第一"
3. **与 cognitive-evolution 联动需要**: cognitive-evolution 的 supersede / staleness 机制要在 profile 上生效, 必须有 GUI 让用户响应"你的画像 90 天没校准了"提示
4. **教练层未来需要**: mentor v2 报告里"你声明 X 但行为是 Y" → 一键跳转到画像页校准 → 完整闭环
5. **Linear/Raycast 风格易实现**: 滑块 + 时间线 + 编辑器都是常见组件, 复用现有视觉语言成本低

### 备选方案

- **A 不做 GUI**: 见"理由 1", 死锁
- **C v1 占位页, v2 实现**: 占位等于画饼, 不解决死锁问题
- **D CLI-only 校准 (`atomsyn-cli calibrate-profile --verified`)**: 用户大多数时间在 GUI 里, CLI-only 入口违反 GUI/CLI 平等原则
- **E 一键自动 verified=true 在 bootstrap 完成后**: 违反 v1 仅观察哲学, 错误画像直接生效风险大

### 后果

正向:
- profile 闭环完整, v1 仅观察哲学可执行
- 用户有"我的画像我可以改"的清晰主权感
- 时间线 + restore 让"画像演化"成为可见资产
- 与 cognitive-evolution 协同自然

负向:
- 实施工作量增加 ~3-5 天 (1 个新页面 + 3 个 API 端点 + 双通道实现)
- 一级页面位置占用导航空间 (OQ-7 待决)
- 测试矩阵扩大 (要测 verified false / true 状态切换 + restore + supersede)

