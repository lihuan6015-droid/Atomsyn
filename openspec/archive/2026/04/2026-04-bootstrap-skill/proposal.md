***

change\_id: 2026-04-bootstrap-skill
title: 引导式批量冷启动 atomsyn-bootstrap
status: proposed
created: 2026-04-26
owner: 主 agent + 用户
supersedes: ""
--------------

# Proposal · 引导式批量冷启动 atomsyn-bootstrap

## 1 · 摘要 (TL;DR)

新增第 4 个 Skill `atomsyn-bootstrap` + CLI 子命令 `atomsyn-cli bootstrap`, 让用户通过指定本地路径, 由 AI 引导式地把已存在于其他工具 (ChatGPT / Cursor / Claude Code 历史 / 本地笔记目录) 中的存量过程文档, 按"5 层 Agent 工程派记忆架构" (Profile / Preferences / Episodic / Domain / Reflections) 提炼成 1 条 profile atom + N 条 experience/fragment atom, 一次性写进 Atomsyn 知识库。解决新用户面对"空账户"无法立即享受相遇感的冷启动断裂问题。

## 2 · 背景 (Context)

**当前系统状态**:

- V2.1 已交付仓库层 (atomsyn-cli ingest/write/update) + 结构层 (双骨架方法库) + 教练层 (atomsyn-mentor + 认知雷达)。三层都假设用户从"积累过程"开始, 一次记一条。
- 现有 CLI 写入命令均为**单点增量沉淀** (write 一条 / ingest 一条), 没有"批量冷启动"路径。
- atomsyn-write Skill 强调"自然停顿时主动建议沉淀", atomsyn-read Skill 在新会话第一次实质性任务时静默调用 —— 但前提是知识库已经有内容。

**这个想法的来源**:

- 来自 dogfood 暴露: 新用户第一次打开 Atomsyn 时, 知识地图全空, atomsyn-read 永远沉默, atomsyn-mentor 永远说"数据不足"。北极星 Demo 场景里"两个月前的顿悟会安静地出现在回答里"无法兑现 —— 因为根本没有两个月前的数据。
- 用户实际上**已经积累了几年**的认知资产: 散落在 `~/Documents`、`~/Dropbox`、各种 `~/.cursor/sessions`、`~/.claude/projects` 历史里的 markdown / 聊天导出 / PRD / 学习笔记 / 复盘文档。这些是"原始记忆资产", 但从未被提炼。
- 用户和主 agent 在对齐时确认: 这是**仓库层最缺的一块拼图** —— 没有冷启动入口, 整个三层架构对新用户是断裂的。

**强依赖**:

本 change **必须等** **`2026-04-cognitive-evolution`** **先合并**。理由: bootstrap 一次性写入大量 atom, 如果没有 supersede / prune / staleness 机制, 用户后续发现"哎这条不对"就只能手动删, 会污染知识库。bootstrap 产出的 profile/atom 默认应有较低 `confidence` (如 0.5), 让 cognitive-evolution 的衰减计算能给它"低置信度"标签, 让它在常规检索中自然让位于用户后续亲自沉淀的高置信度 atom。

## 3 · 痛点 (Problem)

**谁痛**: 全部新用户 + 部分老用户 (老用户在装机后想"把过去三年的笔记一口气倒进去")。

**痛在哪**:

- **痛点 1 · 冷启动断裂**: 用户安装 Atomsyn 后第一次打开 GUI, 看到的是空 Atlas、空 Growth、空 Skill Map。北极星承诺的"在对的时刻相遇"无法兑现, 用户对"沉淀有用"的信任建立不起来。
- **痛点 2 · 存量素材浪费**: 用户的硬盘里早就有几百个 markdown / 几年的聊天导出, 这些是已经付出的认知成本, 但 Atomsyn 现有的写入路径只接受"一次记一条", 用户不可能手动 ingest 几百次。
- **痛点 3 · 画像缺失链**: atomsyn-mentor 和未来的"个性化 read 注入"都依赖一个用户画像。现有体系里没有任何机制能从"过往痕迹"里反推画像, 只能从用户后续的写入慢慢累积 —— 等画像够用至少要 3 个月。

**不解决会怎么样**:

- 北极星指标"bootstrap 后 mentor 报告引用碎片数 ≥ 5"永远是 0 (因为根本没 bootstrap 机制)
- 仓库层有沉淀路径但没有"导入路径", 仓库永远只能装新东西不能装老东西, 等于一个只接受新书的图书馆
- 用户的留存窗口期 (前 7 天) 内体验不到"相遇感", 流失率不可避免

**具体场景**:

> 用户 A 是一名前端工程师, 过去 3 年在 `~/Documents/notes/` 累计了 800 个 markdown 文件 (包括 PRD、技术调研、踩坑日志、跟同事撕逼的复盘)。装上 Atomsyn 后他打开 GUI 看了一圈, 觉得"哦看上去挺好但是空的"。他写了 3 条笔记后再也没打开过。两个月后从 dock 删除。

## 4 · 提案 (Proposal)

### 一句话解

新增 `atomsyn-bootstrap` Skill + `atomsyn-cli bootstrap` 命令, 通过 3 阶段 funnel 工作流 (TRIAGE → SAMPLING → DEEP DIVE) 把用户指定的本地目录, 按 5 层记忆架构提炼成 1 条 profile atom + N 条 experience/fragment atom, 默认串行 + 用户校准 + 隐私边界扫描。

### In-scope (本 change 必交付)

- [ ] CLI 新子命令 `atomsyn-cli bootstrap` (含 `--path` / `--phase` / `--parallel` / `--include-pattern` / `--exclude-pattern` / `--dry-run` / `--resume`)
- [ ] 新 atom kind: `profile`, schema 与 plan-tune 的 5 维数值兼容 + Atomsyn 扩展字段 (identity / knowledge\_domains / recurring\_patterns / verified / evidence\_atom\_ids 等)
- [ ] **Profile 单例语义** (D-010): 每个用户仅有 1 条活跃 profile atom, 跨多次 bootstrap 时新版本通过 `previous_versions[]` 数组追溯历史, 不产生多条独立 profile
- [ ] Profile atom 文件位置约定: `<dataDir>/atoms/profile/<slug>/atom_profile_<slug>.json`
- [ ] 第 4 个 Skill: `skills/atomsyn-bootstrap.skill.md` + 安装到 Claude Code / Cursor (复用现有 install-skill 命令)
- [ ] GUI 入口 (双通道): (a) 聊天页面"初始化向导"按钮 (启动 bootstrap session); (b) **新增"认知画像"模块** —— 一级页面或 Growth 子 tab, 用于查看 / 校准 / 编辑 profile atom (D-013)
- [ ] **GUI 校准模块** (新, D-013): profile 详情页含 5 个数值维度滑块 + identity/domains/patterns 文本编辑器 + verified toggle + evidence_atom_ids 反查链接 + previous_versions 时间线
- [ ] 隐私边界: 默认敏感关键字扫描 (API key / token / password / secret / email / phone) + `.atomsynignore` 文件支持
- [ ] Bootstrap session 状态文件 (`~/.atomsyn/bootstrap-sessions/<session-id>.json`) 用于断点续传
- [ ] **两阶段产出协议** (D-011): `--dry-run` 仅输出**用户友好 markdown 报告**, 不调用 LLM 生成 atom JSON; 用户在 markdown 上人工纠错 / 补充 / 删减后, 真正写入阶段 (`--commit` 或 GUI "确认写入") 时 Agent 才组装 atom JSON 并通过 `atomsyn-cli ingest/write` 入库
- [ ] **LLM Prompt 模板 hard-code 在 CLI v1** (D-012): 5 层归类 + 5 维数值推断的 prompt 模板写死在 `scripts/atomsyn-cli.mjs` 同目录的 `scripts/bootstrap/prompts/*.md` 文件, 不放 `config/llm.config.json` 让用户改; v2 视用户反馈再开放
- [ ] V1 纪律: profile atom 默认 `verified=false`, atomsyn-read **不自动注入**, mentor **不消费**, 完全是"观察期"
- [ ] 双通道适配: profile atom 的读写在 vite-plugin-data-api.ts + tauri-api/routes/atoms.ts 同步实现; GUI 校准模块的 PUT/PATCH 路由同样双通道
- [ ] reindex 把 profile kind 纳入索引 (但单独 bucket, 不混入 experience/methodology 主搜索)

### Out-of-scope (本 change 不做, 留给后续 change)

- atomsyn-read 在新会话第一次注入 profile atom 作为系统提示 (等 v2 + 用户校准流程跑通后)
- atomsyn-mentor 用 profile 数据做 declared vs inferred 的 gap 分析 (等 v2)
- bootstrap 增量更新 (重新跑一次扫描新增文档进行 merge) (v2)
- bootstrap 处理图片 / PDF / EPUB / 音视频 (本 change 只支持 .md / .txt / .json / 源代码)
- 多用户 profile 切换 (Atomsyn 是单用户产品, 永久 out-of-scope)
- LLM prompt 模板放配置文件让用户自定义 (v2; v1 hard-code, D-012)
- 认知画像模块的高级可视化 (如 5 维雷达图历史动画 / 跨 profile 对比) —— v1 用滑块 + 时间线足够
- profile 多版本之间的 diff 视图 (用户能看到 previous_versions 列表即可, diff 详情等 v2)

## 5 · 北极星对齐 (North Star Alignment)

| 维度      | 回答                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 主层      | **仓库层** (Vault) —— 批量冷启动建档, 把存量素材**第一次装进**仓库                                                                                                                                                                                                                             |
| 喂养下游    | **结构层**: profile atom 把碎片串成画像骨架, 让结构层不用从零开始; 同时 N 条 fragment/experience 直接进入双骨架的相遇池。**教练层**: 未来 atomsyn-mentor 可读取 profile 做 declared vs inferred 的 gap 分析, 输出"你声明 risk\_tolerance=0.3 但实际行为是 0.65"的复盘洞察 (v2)                                                            |
| 来自上游    | **atomsyn-cli ingest/write** (bootstrap 不直接写磁盘, 而是组装 JSON 走 ingest); **5 层记忆架构** (流派 ② Agent 工程派); **plan-tune 的 5 维数值** (scope\_appetite / risk\_tolerance / detail\_preference / autonomy / architecture\_care); **cognitive-evolution 的 confidence 衰减机制** (依赖, 必须先合并) |
| 北极星主句关联 | "**让你积累的认知, 在需要时醒来**" 的**第一次唤醒**: 让用户已经积累但散落、沉睡在硬盘各处的认知, **第一次进入 Atomsyn**。bootstrap 是"沉睡 → 醒来"那一句话里"沉睡之所"到"醒来"的桥。没有 bootstrap, 用户的存量认知永远只是文件系统里的 dead weight                                                                                                            |

## 6 · 成功指标 (Success Metrics)

- **指标 1 · 产出充分性**: 1 次 dogfood bootstrap (主 agent + 用户在 `~/Documents` 上跑一次) 能产出 ≥ 1 条 profile atom + ≥ 20 条 experience/fragment atom。验证方式: bootstrap 完成后 `atomsyn-cli where` 找到数据目录, `find <dataDir>/atoms -name 'atom_*' -newer <bootstrap-start-marker> | wc -l` ≥ 21。
- **指标 2 · 性能可接受**: bootstrap 在 1000 个 markdown 文件的目录上, Phase 3 并行模式 (`--parallel`) 端到端耗时 < 30 分钟。验证方式: 在测试目录跑一次, 记录 wall-clock 时间到 bootstrap session 状态文件的 `endedAt - startedAt`。
- **指标 3 · 数据流通**: bootstrap 完成后立即调用 atomsyn-mentor (`atomsyn-cli mentor --range all --format report`), 报告中能引用 ≥ 5 条来自 bootstrap 的 atom (atom 的 source 字段标记 `bootstrap_session=<session-id>`, mentor 报告中 atom 引用的 id 与之交集 ≥ 5)。说明 bootstrap 产出真的进入了三层互相喂养的回路。
- **指标 4 · 隐私零泄漏**: 在测试目录中故意放 3 个含敏感字串的文件 (假 API key / 假 email / 假 phone), bootstrap 必须 100% 在 Phase 2 报告中明确列出这些文件并询问用户是否跳过, 不得静默 ingest 含敏感字段的内容。验证方式: 在 `data/growth/usage-log.jsonl` 的 bootstrap 事件中能看到 `sensitive_skipped: [<file>]` 字段。

## 7 · 风险与未知 (Risks & Unknowns)

### 已知风险

- **R1 · 误判风险高**: 5 层架构对单个文档的归类是 LLM 推断, 容易把"老板找我聊薪资"误归到 L4 Domain (薪酬管理领域), 实际应该是 L3 Episodic (一次具体经历)。缓解: profile.verified 默认 false, GUI 强制校准; 每条 atom 的 confidence 初始值 ≤ 0.6, 让 cognitive-evolution 的衰减机制兜底。
- **R2 · LLM 一次跑死**: 1000 个文件全部塞进 deep-dive 会爆 context 窗口或费用爆炸。缓解: 强制 3 阶段 funnel + Phase 2 抽样 + Phase 3 默认串行; `--parallel` 才开 sub-agent; 单个 sub-agent 处理批量文件时按 token budget 切分。
- **R3 · 隐私误开**: 用户指定 `--path ~/` 一刀切, bootstrap 把 `.ssh/` `.aws/credentials` 等扫进来。缓解: 默认 `.atomsynignore` 内置含 `.ssh`, `.aws`, `.gnupg`, `node_modules`, `.git`, `*.env`, `*.pem`, `id_rsa*` 等高风险路径; 启动前必须确认。
- **R4 · profile 误读放大**: v1 不让 read 自动注入 profile, 但用户校准后 v2 启用注入时, 一个错误的 profile 会让所有未来对话都被错误画像污染。缓解: profile.verified 必须用户在 GUI 强制走完一次校准流程才置 true; 校准 UI 必须把每个数值维度的"证据来源 atom 列表"展示给用户。
- **R5 · cognitive-evolution 未合并**: 如果先合并 bootstrap 而 cognitive-evolution 滞后, 用户发现"哎这条不对"将无路径清理。缓解: proposal 明确强依赖, 实施排期上 bootstrap 不开工直到 cognitive-evolution 合并。
- **R6 · 阶段间状态丢失**: 用户在 Phase 2 校准后关掉终端, 重新打开发现要从头扫。缓解: bootstrap session 持久化 + `--resume <session-id>`。
- **R7 · 用户体感像监控**: bootstrap 听起来像"AI 帮你扫硬盘", 用户怕被监视。缓解: 默认 dry-run 模式优先 (输出预期产物但不写入); 命令名暴露明显, 不偷偷做; profile 不存原始内容只存 source\_summary。

### 待澄清

- [x] ~~Q1 · profile atom 跨多次 bootstrap 合并 vs 独立~~ → **已决 (D-010)**: 单例 + `previous_versions[]` 数组追溯历史
- [x] ~~Q3 · `--dry-run` 是否调用 LLM 产出预期 atom JSON~~ → **已决 (D-011)**: dry-run 仅 markdown, 写入时才生成 JSON
- [x] ~~Q5 · LLM 推断 prompt 是 hard-code 在 CLI 还是放 `config/llm.config.json`~~ → **已决 (D-012)**: v1 hard-code 在 `scripts/bootstrap/prompts/*.md`
- [ ] Q2 · `--parallel` 的 sub-agent 实现细节 —— 是 fork 4 个 Claude Code 进程, 还是 ingest 任务队列由单 agent 多轮处理? 实施前 1 周 spike 决策
- [ ] Q4 · bootstrap 写入的 atom 在 stats 字段上要不要标记 `imported: true` 区分于用户后续手动沉淀的? **倾向**: 加, 让 mentor 报告可以"过滤掉/只看 imported"
- [ ] Q6 · profile schema 与 plan-tune 的 5 维数值在解释上完全对齐, 但 plan-tune 是基于"开发者画像", Atomsyn 的用户也可能是产品/设计/学习者 —— 5 维语义是否需要 Atomsyn 自己重新文档化? **倾向**: 在 design §7 / §10 写一节专门说明语义边界

## 8 · 替代方案 (Alternatives Considered)

### 方案 A · "纯 profile-only" (放弃产出 fragment/experience)

- 描述: bootstrap 只产 1 条 profile atom, 不批量产 fragment/experience。让用户后续慢慢手动沉淀。
- 利: 实施成本低 50%; 隐私风险小 (profile 不存原始内容)
- 弊: 北极星 Demo 场景仍无法兑现 (没有"两个月前的顿悟"); 教练层数据稀疏问题没解决; 用户的存量素材依然只是 dead weight; 失去了"批量冷启动"的核心价值
- 为什么没选: 用户在对齐时明确否决了。Atomsyn 的差异化卖点之一就是"血肉相遇", 没有 fragment/experience 进库就没有血肉。

### 方案 B · "纯碎片化" (放弃产出 profile)

- 描述: bootstrap 只产 N 条 fragment/experience, 不产 profile atom。让 mentor 自己从碎片聚合画像。
- 利: 不引入新 atom kind, schema 冲击最小; 不用纠结 plan-tune 兼容
- 弊: 失去画像骨架, 教练层未来无法做 declared vs inferred gap 分析; 每次 mentor 都要从 N 条碎片现场聚合, 性能差; 与 plan-tune 的"双轨画像"机制不兼容
- 为什么没选: 用户在对齐时确认要"双层产出"。profile 是骨架, fragment 是血肉, 两者都要。这也是与 plan-tune 思想血缘最一致的方案。

### 方案 C · "什么都不做, 让用户自己 cli ingest"

- 描述: 不新增 bootstrap, 让用户用 shell 脚本批量 `cat <file> | atomsyn-cli ingest --stdin`。
- 利: 零代码改动
- 弊: 用户不会写脚本; 即便写了脚本也没有 5 层归类、没有隐私边界、没有 funnel 校准、没有 profile; 用户体感是"DIY 批量倒入", 不是"AI 引导式建档"
- 为什么没选: 这是字面意义上的"什么都不做", 完全不解决冷启动断裂这个北极星级问题。

### 方案 D · "GUI 内置一键导入, 不通过 Skill"

- 描述: 在 GUI 里做一个"批量导入向导", 用户点几下、选个目录, GUI 直接调用本地 LLM 完成所有工作。不暴露 Skill 给 Claude Code / Cursor。
- 利: 用户操作直觉; 不用维护 Skill 安装路径
- 弊: 违反 V1.5 起的 L1+L2 双层架构 —— 任何核心能力都必须同时在 GUI 和 Agent 里可用; 在 Claude Code / Cursor 里跑代码任务时, 用户不能让那个会话直接帮自己 bootstrap; 失去了 Agent 闭环
- 为什么没选: 双层主权是不可动摇的哲学。GUI 的"初始化向导"按钮只是入口之一, 底层必须走 Skill + CLI, 让用户在任何 AI 工具里都能调用。

## 9 · 上下游引用

- **战略锚点**: `docs/framing/v2.x-north-star.md` §1 三层架构 + §6 哲学 7 (教练不居高临下) + §6 哲学 8 (相遇不炫技)
- **idea 来源**: 用户与主 agent 的对齐对话 (2026-04-26 当日), 已在 system prompt 中沉淀核心要点
- **强依赖**: `openspec/changes/2026-04-cognitive-evolution/` —— 必须先合并。理由见 §2 背景。
- **设计参考**: `~/.claude/skills/gstack/plan-tune/SKILL.md` 的"双轨画像" (declared / inferred / gap) 是 profile schema 5 维数值的直接来源
- **影响的 specs**:
  - `openspec/specs/cli-contract.md` — 新增 `atomsyn-cli bootstrap` 子命令
  - `openspec/specs/skill-contract.md` — 新增第 4 个 Skill `atomsyn-bootstrap`
  - `openspec/specs/data-schema.md` — 新增 atom kind: `profile`, 新增目录 `data/atoms/profile/<slug>/`
- **Skill 文件**:
  - 现有: `skills/atomsyn-write/SKILL.md` (write 半边契约, 新 skill 复用其 ingest 路径)
  - 现有: `skills/atomsyn-read/SKILL.md` (read 半边契约, 本 change 不修改 read 但记录"v2 时此处加 profile 注入")
  - 现有: `skills/atomsyn-mentor/SKILL.md` (mentor 半边契约, 本 change 不修改 mentor 但记录"v2 时此处加 gap 分析")
  - 新增: `skills/atomsyn-bootstrap/SKILL.md`

