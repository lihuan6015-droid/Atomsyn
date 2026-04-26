# Decisions · 2026-04-cognitive-evolution

> **怎么用**: 设计阶段把可预见的关键决策写进来。实施阶段如果发现 design 有偏离, 不要直接改 design 文档, 而是: (1) 在这里追加一个新决策 (2) 在 design.md 的 §6 决策矩阵更新 (3) 必要时把旧决策标记为 `superseded`。
>
> **核心原则**: 决策的"理由"和"备选方案"才是这份文档的真正价值。结论谁都看得见, 但 6 个月后回头你会感激当初记下了 "为什么没选 B"。

---

## D-001 · 选 supersede 必做、fork 列为 future

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 用户 + 主 agent

### 背景

用户在直接对话中提出三选题:"merge only / + supersede / + supersede + fork?"。当前 atomsyn-cli 只有 merge 语义,无法表达"用一条新 atom 取代旧 atom 同时保留旧 atom 作为历史"。fork 则是"让旧 atom 在不同情境下分叉,新旧并存且都仍然有效"。

需要决定本 change 实施的范围,在简单和完整之间找平衡。

### 决策

**本 change 实施 supersede,不实施 fork**。

- 引入 `atom.supersededBy` (单值) 和 `atom.supersedes` (数组) 双向链表字段
- 新增 `atomsyn-cli supersede` 命令,支持单条取代和合并多条取代(通过新 atom 的 supersedes 数组)
- fork 命令不在本 change 范围,留给 V2.y 的后续 change

### 理由

1. **80/20 价值**: dogfood 中"我觉得旧的错了,要用新的取代"远比"我想保留两个版本并存"高频。supersede 一个命令解决了 80% 的演化场景
2. **复杂度阶梯**: supersede 是单向链表,fork 是分支树,数据模型复杂度提升一个数量级。一次性都做容易踩到设计陷阱
3. **风险隔离**: supersede 的语义比较直观(取代 = 旧的归档 + 新的指向旧的),fork 涉及"两个版本同时返不返、谁优先、跨情境怎么消歧"等一系列尚未明朗的子问题。把 fork 隔出来未来单做能更深思熟虑
4. **用户原话直接选定**: 三选题中用户回答 "+ supersede",这是明确的范围信号

### 备选方案

- **方案 A · merge only**:不动现有 CLI,什么都不做 → 没选,因为这是问题本身,不是答案
- **方案 B · + supersede + fork 一起做**:更完整但实施量翻倍,且 fork 设计未成熟 → 没选,因为"小步快跑"优于"一次想清所有事"
- **方案 C · 仅 fork**:只做并存不做取代 → 没选,因为 fork 不能替代 supersede 解决"旧的就是错的"场景

### 后果

正向:
- 实施量可控(~2 周一个人完成)
- 数据模型 additive,不破坏现有 atom
- supersede 链未来可以平滑扩展为 fork 树(supersededBy 字段保留,只需要把单值升级为数组)

负向 (我们接受的代价):
- 用户在"想保留多版本"的场景下只能临时绕开(新建独立 atom + 手动加 tag 区分),直到 V2.y
- fork 推迟可能让一部分用户感到"半成品",需要在文档中明确标注"fork 计划中"

---

## D-002 · 不新增 delete 命令,只新增 archive (软删除)

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent (依据 CLAUDE.md 铁律)

### 背景

用户清理过时 atom 时直觉是"删掉它"。如果不提供软删除,用户可能直接绕过 CLI 用 `rm` 操作 data/ 文件 — 这违反 CLAUDE.md 的铁律 "NEVER delete files under data/ unless the user explicitly asks",而且会破坏索引一致性。

需要决定:提供硬删除命令(直接删文件)还是软删除命令(标记 archivedAt)。

### 决策

**只提供 `atomsyn-cli archive` (软删除),不提供 `atomsyn-cli delete` (硬删除)**。

- archive 设置 `atom.archivedAt = ISO 8601 时间戳`,read / find 默认不返
- archive 支持 `--restore` 反向操作,清空 archivedAt
- 用户如果真要物理删除,需要在 GUI 解锁后用 OS 工具自行删除 — 系统不主动提供入口

### 理由

1. **符合铁律**: CLAUDE.md 第一条铁律明确禁止 CLI 主动删 data/ 下的文件。提供 delete 命令直接违反
2. **保留学习轨迹**: 即便是错误的认知也是学习路径的一部分。"我曾经这么想"是有价值的元数据,删除等于销毁这部分历史
3. **可逆**: archive 永远可以 restore,delete 不可逆。在不确定的场景下,可逆操作显然更安全
4. **磁盘成本可忽略**: 单条 atom JSON ≤ 10KB,5000 条 archived atom 总占用 ~50MB,远小于现代磁盘容量

### 备选方案

- **方案 A · 同时提供 delete 和 archive**:用户可选硬/软 → 没选,delete 命令的存在本身就是诱惑用户做不可逆操作
- **方案 B · 完全不做 archive,让用户在 GUI 锁定 + 隐藏**:不动 CLI 面 → 没选,Agent 在新会话里没法主动 archive 旧 atom,失去"主动清理"能力
- **方案 C · archive 实际是磁盘移到 `data/archive/`**:逻辑上软删除,物理上分目录 → 没选,增加索引复杂度,且备份/同步工具误删的风险更高(原地标记字段更稳)

### 后果

正向:
- 100% 可逆,用户错操作可以撤销
- 索引可继续追踪 archived atom(GUI 后续可提供"已归档"视图)
- supersede 链不会因为某节点被 archive 而断裂

负向 (我们接受的代价):
- 磁盘上"已归档"的 atom 仍占空间,长期可能让用户疑惑"这些为什么还在"
- 用户需要学习"软删除"概念,可能不直观;需要在 archive 命令的输出中明确解释

---

## D-003 · 三种机制全做 (read staleness + write collision + 显式 supersede/prune),按 P1/P2/P3 优先级

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 用户 + 主 agent

### 背景

实现"认知能演化"有多种切入点:
- (a) 在 read 时给信号让 Agent 知道"这条可能过时了"
- (b) 在 write 时检测"是不是和旧的矛盾了"
- (c) 提供显式命令让用户/Agent 主动触发演化

可以选择只做其中 1-2 种,或者全做。

### 决策

**全做,但按优先级分层**:

- **P1 (最便宜,最高 ROI)**: read 输出 staleness 信号 — 自动、被动、零用户成本
- **P2 (防低质量沉淀)**: write 触发 collision check — 自动、主动告警、用户可关闭
- **P3 (真正的"打破→重建")**: supersede / archive / prune 命令 — 用户/Agent 显式调用

### 理由

1. **三层互相喂养**: 没有 P1 的 staleness 信号,Agent 不知道何时该调 P3 的 supersede;没有 P2 的 collision 检测,用户每次 write 都可能制造新的"矛盾对";没有 P3 的命令面,P1/P2 的信号产生后无处落地。三者只做一两种都是半成品
2. **P1 优先级最高的工程理由**: read 频率远高于 write,P1 的 staleness 字段能立即为现有所有 atom 带来增量价值,实施成本只是计算公式 + 输出字段,< 1 天工作量
3. **P3 是用户表达"决定要演化"的唯一出口**: 即使 P1 P2 都触发,如果没有 P3 的命令,用户/Agent 想"动手"时无招可用
4. **用户原话直接确认**: 用户在对话中明确说"三种机制全做"

### 备选方案

- **方案 A · 只做 P3**:仅命令面 → 没选,见 proposal §8 替代方案 A,等于有锤子但用户不知道敲哪
- **方案 B · 只做 P1 + P3**:跳过 collision check → 没选,write 流程仍然可以盲目堆"半正确"的 atom,prune 时挖出来太晚
- **方案 C · 分两个 change**:本次只做 P3,下个 change 做 P1+P2 → 没选,P3 单独做没法验证(没有 staleness 数据驱动 supersede)

### 后果

正向:
- 三层闭环完整:信号(P1)→ 决策(P2)→ 执行(P3)
- 任何阶段的失败都有兜底:P1 的 staleness 计算失败 → read 还能正常返;P2 的 collision check 失败 → write 还能写入

负向 (我们接受的代价):
- 实施量较单一机制大约 3 倍,需要 ~2 周
- 三种机制的协调出现 bug 的可能性更高(例如 P1 输出 is_stale=true 但 P3 的 supersede 失败的回退)

---

## D-004 · lastAccessedAt 由 CLI 在 read/find 命中时被动更新

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent

### 背景

confidence_decay 计算需要"距上次访问的时间"。这个时间从哪里来?有两条路:
- (a) Agent 在 read 后主动调一个 "track-access" API 上报访问
- (b) CLI 自己在 read/find 命中时被动更新 atom 的 lastAccessedAt

### 决策

**采用方案 (b),被动更新**:

- `atomsyn-cli read` / `find` 在每条命中 atom 上调用 `evolution.updateAccessTime(atomId, now)`
- 节流:距 atom 上次 lastAccessedAt 不足 1 小时 → 只更新内存索引,不落盘;超过 1 小时才写文件
- Agent 完全无需主动调用,新 SKILL 里也不增加 access tracking 的步骤

### 理由

1. **主动哲学一致性**: Atomsyn 的核心哲学是"使用即维护"。被动更新就是字面兑现 — 用户/Agent 用了,系统自己就记下了
2. **Agent 不会调主动 API**: 经验上,如果让 Agent 主动调一个"我刚 read 了这条"的 API,会有大量 Agent 实现忘记调或调错。被动更新零依赖,100% 触达
3. **节流避免抖动**: 见 D-007,每次 read 都立即落盘会造成磁盘抖动和 git diff 噪声;节流到 1 小时既保证精度又减小副作用
4. **可观测性**: usage-log.jsonl 仍记录每次 read.access 事件,即使没落盘 atom JSON,行为仍可追溯

### 备选方案

- **方案 A · Agent 主动 track-access API**:精确,Agent 知道每次访问 → 没选,见上文理由 2,实施可靠性差
- **方案 B · 不记录 lastAccessedAt,只用 createdAt 计算 staleness**:简单 → 没选,无法区分"刚创建但被频繁 read 的 atom"和"刚创建后再没人理的 atom"
- **方案 C · 只在内存索引记录,永不落盘**:最低开销 → 没选,CLI 重启或 Tauri app 关闭后丢失,新会话又得从 createdAt fallback,价值缺失

### 后果

正向:
- 用户体验完全无感,Agent 实现零负担
- usage-log + atom 文件双份记录,debug 时能交叉验证

负向 (我们接受的代价):
- atom 文件的 mtime 会因为 read 操作发生变化,可能影响某些备份/同步工具的"只看 mtime"启发式
- 节流策略增加一点 evolution.mjs 的逻辑复杂度

---

## D-005 · prune 永远 dry-run + 用户裁决,绝不 LLM 自动改库

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 用户 + 主 agent

### 背景

prune 候选检测可以做到很激进 — 例如让 LLM 读每条 atom 判断"是否过时",自动 archive 评分 > X 的所有 atom。这能极大降低用户负担,但也存在严重风险。

需要决定 prune 命令的自动化程度。

### 决策

**prune 永远 dry-run**:

- `atomsyn-cli prune` 命令本身**不接受非 dry-run 模式**,只输出候选 JSON
- 任何 supersede / archive 必须由 Agent 用 AskUserQuestion 让用户逐条裁决,然后调具体的 supersede / archive 命令
- LLM 可以**生成自然语气的建议文案**(在 mentor 报告里),但绝不直接 mutate 任何 atom

### 理由

1. **继承 /learn 哲学**: gstack 的 /learn skill 严格保持"LLM 给候选,用户决定"的边界。Atomsyn 作为认知主权工具应保持同样标准
2. **错误成本高**: LLM 自动 archive 一条它"以为过时"但其实是用户核心信念的 atom → 用户可能很久后才发现。这种错误的修复成本远高于"让用户多裁决几次"的体验成本
3. **用户主权**: 知识库是用户的,只有用户有权决定"这条认知是不是过时了"。LLM 是助手不是决策者
4. **可审计**: 用户每次裁决都通过具体 CLI 调用产生 usage-log 记录,过去 30 天的"我 archive 了什么"可以完整重放;LLM 自动操作则是黑盒

### 备选方案

- **方案 A · prune 默认 dry-run,但加 --apply flag 让 LLM 自动执行**:看起来是"用户选择" → 没选,有了开关用户就会用,事故只是时间问题
- **方案 B · prune 自动 archive 候选超过 X 条的 atom**:极端激进 → 没选,违反铁律
- **方案 C · prune 完全不存在,让用户自己用 read/find 找过时的**:最保守 → 没选,用户没有动力主动找,旧 atom 永远不会被清理

### 后果

正向:
- 100% 用户主权,不会出现"系统替我做了我不知道的事"
- usage-log 可完整审计
- mentor skill 在生成 prune 建议时可以"放飞自我"用 LLM 文案,因为它最终还是用户决定

负向 (我们接受的代价):
- 用户裁决候选时需要花时间(每条 ~30 秒)。如果有 20 条候选,需要 10 分钟
- 缓解:limit 默认 10,且 mentor 复盘是用户主动触发的整段时间,不是中断式打扰

---

## D-006 · confidence_decay 计算公式 v1 用指数衰减,半衰期 180 天

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent

### 背景

需要一个公式把 atom 的 (age, last_access, locked) 等信号转换成一个 0-1 的 confidence_decay 数值。这个数值决定 is_stale 标记和 prune 候选权重。

### 决策

**采用指数衰减,半衰期 180 天**:

```
base_decay = 1 - exp(-ln(2) * age_days / 180)
locked_factor = stats.locked ? 0 : 1
access_factor = last_access_days > 90 ? 1.5 : 1.0
confidence_decay = clamp(base_decay * locked_factor * access_factor, 0, 1)
is_stale = confidence_decay >= 0.5
```

参数说明:
- 半衰期 180 天:atom 创建后 180 天 base_decay = 0.5
- locked atom 直接置 0:用户已校准过的 atom 不衰减(尊重 lock 语义)
- 长期未访问加成 1.5x:90 天没 read 命中过的 atom 衰减加速
- is_stale 阈值 0.5:大约对应 180 天的纯衰减点

### 理由

1. **指数衰减符合人类记忆心理学**: 艾宾浩斯遗忘曲线、间隔重复算法都是指数模型,半衰期是常用参数化方式
2. **180 天的工程依据**: dogfood 经验中,3-6 个月是"我开始怀疑这条 atom 是不是过时"的典型时间窗口。180 天位于这个范围中央
3. **locked 抗衰减是必要的**: 如果不把 locked atom 的 decay 置 0,用户校准过的权威 atom 仍会被标 stale,等于校准白做
4. **公式简单可解释**: 用户在 GUI 看到"是 73% 衰减"时,能反推"大约是 200 天创建未访问"。比黑盒 ML 模型更可信

### 备选方案

- **方案 A · 线性衰减 (decay = age_days / 365)**:最简单 → 没选,线性不符合记忆模型,180 天的 atom 才衰减 50% 但 90 天的 atom 已经 25% 偏高
- **方案 B · 学习自动调参 (用户校准历史训练 decay 公式)**:个性化 → 没选,V1 数据量不够训练且工程复杂度高
- **方案 C · 分段函数 (90 天前 0, 90-180 线性, > 180 突变到 1)**:阶梯式 → 没选,边界突变会让 is_stale 标记忽闪忽现,不平滑

### 后果

正向:
- 公式可写在 design 文档里,开发者一眼看懂
- 半衰期参数可在 dogfood 后调整(从 180 调到 270 不影响公式结构)
- 与 stats.locked 既有语义自然兼容

负向 (我们接受的代价):
- 半衰期 180 天是猜测值,可能在 dogfood 30 天后发现误标率高需要调
- 长期未访问加成的 1.5x 是直觉数,没有理论依据,需要实施后观察

---

## D-007 · collision check v1 用关键词重叠 + 反义短语库,不上 embedding

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent

### 背景

write 时 collision check 需要回答"这条新 atom 是否和某条旧 atom 矛盾"。可选算法:
- (a) 关键词重叠 + 反义短语库(启发式)
- (b) 本地 embedding 模型(语义相似度)
- (c) 远程 LLM 直接判断

### 决策

**v1 采用 (a) 关键词重叠 + 反义短语库**:

- 用现有 `atomsyn-cli find` 的引擎拿 top-3 候选(基于 tags + role + situation 重叠)
- 对每个候选计算两层信号:
  - keyword overlap > 0.5(insight 字段的关键词集合 Jaccard 系数)
  - 反义短语库命中:`["反而", "错了", "推翻", "不再", "改正", "其实不是", "我以为", "现在看来"]` 等(可在配置中扩展)
- 任一层命中即标 collision_candidate,score = 两层加权和

### 理由

1. **零依赖**: 不引入任何 ML 模型或远程 API,纯字符串处理。Tauri 打包包大小不增,启动延迟不变
2. **可解释**: 每个 collision_candidate 都附 reason 字符串("tags 70% 重叠 + insight 含反义短语 '推翻'"),用户和 Agent 一眼能看出为什么报警
3. **可控的误报**: 启发式的特点是误报多漏报少。这正好符合 collision check 的目标 — 宁可多警告几次,不要漏掉真正的冲突
4. **未来可平滑升级**: v1 的 detectCollision 函数签名是 `(newAtom, allAtoms) => candidates[]`,内部可以未来替换为 embedding 实现,接口不变

### 备选方案

- **方案 A · 本地 embedding 模型 (e.g., text-embedding-ada local clone)**:语义准 → 没选,模型文件 100MB+,Tauri 包膨胀不可接受;启动延迟增加 1-2s
- **方案 B · 远程 LLM 判断 (Claude / GPT-4)**:最准 → 没选,违反"100% 本地"哲学,且每次 write 调远程 API 是隐私和成本灾难
- **方案 C · 不做 collision check,只在 prune 时检测**:最简单 → 没选,等到 prune 才发现的冲突已经堆积在库里几个月了

### 后果

正向:
- 实施量小(< 200 行 JS)
- 调试容易,反义短语库可热配置(`config/collision-phrases.json`)
- 用户能预测"什么样的 insight 会触发警告"

负向 (我们接受的代价):
- 误报率会比较高(预估 dogfood 第一周 20-30%),需要持续调优反义短语库和阈值
- 漏检"语义换皮"的真冲突(例如旧 atom 用"必须",新 atom 用"建议",意思相反但没有反义短语命中)— 接受,等 v2 升级

---

## D-008 · profile atom 享受演化协议但用 previous_versions[] 替代 supersede 链

**状态**: accepted
**日期**: 2026-04-26
**决策人**: 主 agent + 用户

### 背景

bootstrap-skill change (2026-04-bootstrap-skill) 引入了 profile atom (kind=profile, 单例, id=`atom_profile_main`)。但本 change (cognitive-evolution) 的 supersede / staleness 协议是为多实例 atom 设计的 (新 atom 取代旧 atom, 各自有独立 id)。两者交集时出现概念冲突:

- profile 是单例 → 不存在"新 id 取代旧 id"
- profile 演化频率高 (用户每次校准都是一次演化) → 把每次演化都建一条新 atom 会让数据库膨胀
- 但 profile 也需要"打破 → 重建"的语义 → 不能简单 update

用户反馈中也明确希望"CLI 端也提供 Agent 可以根据工作认知进行不断的进化调整", 这意味着 profile 必须能演化。

### 决策

**统一认知演化协议, 但 profile 用 `previous_versions[]` 数组替代 supersede 链**:

1. **schema 统一**: profile atom 同样具有 `lastAccessedAt` / `archivedAt` / `archivedReason` (与普通 atom 共享), 但**不使用** `supersededBy` / `supersedes`
2. **演化通过单例覆写 + 历史快照入栈**: 当 profile 演化时, 把现有顶层快照推入 `previous_versions[]` (这个数组字段由 bootstrap-skill D-010 引入), 然后用新数据覆写顶层
3. **触发演化的 4 种场景统一接口**: bootstrap 重跑 / GUI 校准 / Agent 建议 / 用户 restore 都走同一段代码 (推快照 + 覆写); CLI handler 是 `applyProfileEvolution(newSnapshot, trigger)`
4. **staleness 计算扩展**: profile 的 `confidence_decay` 公式增加"距 verifiedAt 天数"因子 — verifiedAt 越久远, decay 越大; 用户可在 GUI 看到"画像 90+ 天未校准"的提示
5. **read 不消费 profile**: 与 bootstrap-skill D-007 (v1 仅观察) 协调一致, read 即便命中 profile 也不返回, 仅更新 lastAccessedAt
6. **Agent 主动触发**: mentor 在 v2 报告里如果检测到 declared vs inferred gap > 0.3, 输出主动建议"画像可能需要更新", 用户点击后跳 GUI 校准 (本 change 提供数据接口, mentor v2 消费)

### 理由

1. **保留单例语义**: 用户对"我的画像"的心智是单例, 多 id 会让 GUI 难做、用户困惑
2. **历史不丢**: previous_versions 数组保留学习轨迹, 与 supersede 链表达力等价
3. **协议一致**: 普通 atom 和 profile atom 在用户视角都是"会演化的认知", 只是底层实现不同
4. **Agent 可以演化 profile**: 通过 GUI POST /atoms/:id/calibrate-profile, agent 也能写入 (前提是 verified=true 由用户手动确认), 实现"Agent 根据工作认知进化"的用户期待
5. **不破坏 cognitive-evolution 主流程**: 普通 atom 的 supersede 链不变, profile 是特例

### 备选方案

- **A: profile 不参与演化协议** → 失去 staleness 提醒, 用户不知道"画像该校准了"
- **B: profile 也走 supersede, 每次校准创建新 id (atom_profile_main_v2)** → 多 id 让 GUI 难做, 违反单例语义
- **C: profile 用独立的 schema, 不与本 change 协议混合** → 两份代码维护, 重复劳动

### 后果

正向:
- profile + 普通 atom 在用户视角统一了"演化"语义
- staleness 提醒在 profile 上自然生效, 推动用户定期校准
- Agent 演化路径打通: bootstrap / GUI 校准 / mentor 建议都走同一接口
- 不污染 supersede 链表 (profile 不进 supersede 关系网)

负向:
- 有 2 套演化机制 (普通 atom 用 supersede 链, profile 用 previous_versions 数组), 实施时要明确区分
- 两个 change 之间产生强耦合 (cognitive-evolution 的 staleness 公式必须感知 profile.previous_versions 字段, 不能在 bootstrap-skill 合并前合并)

### 实施次序协议 (重要)

由于本决策涉及两个 change 的耦合, 实施次序约定:

1. **cognitive-evolution 先合并**: schema 字段 + 普通 atom 演化协议 + staleness 公式
2. **bootstrap-skill 后合并**: profile schema (含 previous_versions[]) + bootstrap 流程
3. **联调阶段**: bootstrap-skill 实施时, 在 cognitive-evolution 的 staleness 公式上"扩展" profile 特殊因子 (D-006 公式上+verifiedAt 距今天数), 这部分代码在 bootstrap-skill PR 内, 但需要 cognitive-evolution PR 的 D-006 公式先在
4. **协议接口**: cognitive-evolution 的 `applyProfileEvolution()` 函数签名在本 change 设计阶段就敲定 (见 design §4.2.1), bootstrap-skill 实施时按此签名调用

