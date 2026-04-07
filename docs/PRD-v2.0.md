# Atomsyn · PRD V2.0

> **状态**: ✅ v1.0 (2026-04-09 固化)
> **日期**: 2026-04-09
> **前置**:
> - `docs/framing/v2.0-problem-framing.md` (V2.0 战略锚点)
> - `docs/PRD.md` (V1 PRD)
> - `docs/PRD-v1.5-delta.md` (V1.5 增量)
> - `docs/plans/v2.0-handoff.md` (V1→V2 桥接)
> **下游**: `docs/plans/v2.0-implementation-plan.md` (本 PRD 固化后生成)

---

## 0 · 30 秒概览

Atomsyn V2.0 = **改名 + 多模型配置 + 全模态 ingest + 双骨架涌现 + 双向蒸馏相遇**,共 6 个 milestone (M0-M5),**严格顺序依赖**。

### V2.0 终极验收门 (Exit Criteria,高于任何 milestone)

V2.0 只在以下业务闭环成立时才算 ship:

> **在 Claude Code + Cursor 两个 AI 工具里,通过 `atomsyn-cli`,能完整走通"沉淀认知资产 → 唤醒认知资产"的双向闭环。**

具体三条可观测验收:
1. **沉淀方向** · 在 Claude Code 里对 agent 说"帮我记下刚才这段思考",agent 调 `atomsyn-cli ingest`,数据落盘并带上 D5 四维 schema 且挂到相关方法论
2. **唤醒方向** · 在一个全新的 Cursor 会话里问一个和两个月前碎片相关的问题,`atomsyn-cli read` 返回方法论 + 📎 我的相关碎片,agent 在回答里自然融入
3. **GUI 镜像** · 上述两个动作都能在 Memory Garden 的 Agent 活动 Feed 里被看到、被校准、被锁定

**这一条凌驾于 M0-M5 任何单独 milestone 的验收门之上**。所有 milestone 的 SLO / 回归 / 视觉审查都绿了,但如果这三条闭环走不通,V2.0 就不 ship。

| Milestone | 主题 | 核心交付 | 依赖 |
|---|---|---|---|
| **M0** | Atomsyn 改名 | CLI / 数据目录 / skill 名 / GUI 品牌 / 源码目录全替换 + 首次启动迁移弹窗 | — |
| **M1** | 多模型配置升级 | settings 页 provider grid,LLM/VLM/ASR/Embedding 四类模型兼容,≥10 家厂商 logo | M0 |
| **M2** | 统一 ingest 管线 MVP | `atomsyn-cli ingest --text/--md`,LLM 解析四维 schema,语义对齐护栏 | M1 |
| **M3** | 双骨架 GUI · 记忆花园 | 首页改造,权威骨架 + 涌现骨架 tab,"我的经验"并入 | M2 |
| **M4** | 双向蒸馏相遇层 | atomsyn-read 同时返回方法论 + 关联碎片,skill prompt 升级 | M3 |
| **M5** | 触发稳定性固化 | CLI + skill 端到端回归集,CI 跑,SLO 锁 | M4 |

**V2.0 不做**的范围(从 framing doc 搬运):语音 ASR 管线实现 / VLM 图像解析 / 生活心理领域 / 云同步 / 账号 / embedding 检索 / merge 真实合并 / GitHub Releases。

---

## 1 · M0 · Atomsyn 改名 (first-class milestone)

### 1.1 目标

把项目从 `ccl-atlas` / `atlas-cli` 全面迁移到 `atomsyn` / `atomsyn-cli`,**不保留兼容别名**(因为当前用户只有本人一位,MVP 阶段允许 breaking change)。

### 1.2 交付物

- [ ] **源码目录改名**:`/Users/circlelee/develop/ccl_atlas` → `/Users/circlelee/develop/atomsyn`(最后一步,等所有内部改名完成再做)
- [ ] **CLI binary 名**:`atlas-cli` → `atomsyn-cli`
- [ ] **CLI shim 路径**:`~/.ccl-atlas/bin/atlas-cli` → `~/.atomsyn/bin/atomsyn-cli`
- [ ] **skill 目录名**:
  - `~/.claude/skills/atlas-write` → `~/.claude/skills/atomsyn-write`
  - `~/.claude/skills/atlas-read` → `~/.claude/skills/atomsyn-read`
  - Cursor 镜像同步改
- [ ] **数据目录**:
  - macOS: `~/Library/Application Support/ccl-atlas` → `~/Library/Application Support/atomsyn`
  - Windows: `%APPDATA%/ccl-atlas` → `%APPDATA%/atomsyn`
  - Linux: `~/.local/share/ccl-atlas` → `~/.local/share/atomsyn`
- [ ] **配置文件**:`~/.ccl-atlas-config.json` → `~/.atomsyn-config.json`
- [ ] **Tauri bundle id**:`com.ccl.atlas` → `com.atomsyn.app`
- [ ] **环境变量**:`CCL_DEV_DATA_DIR` → `ATOMSYN_DEV_DATA_DIR`
- [ ] **package.json name** / **Cargo.toml name** / **Tauri productName** 全替换
- [ ] **首次启动迁移弹窗**(D4 · 决策 B)
  - 检测旧路径存在即弹窗:"发现旧 ccl-atlas 数据,是否迁移到 Atomsyn?"
  - 用户确认后复制数据 → 把旧目录重命名为 `.ccl-atlas.deprecated.<timestamp>` 作为备份
  - 文案需要仪式感,设计 code-reviewer 审一版
- [ ] **所有文档 grep 替换**:`CLAUDE.md` / `docs/**/*.md` / `README.md` 里的 "ccl-atlas" / "atlas-cli" 全替换,历史文档保留原名(加一句跳转提示)
- [ ] **更新 `CLAUDE.md`** 指向新名字和新的 framing doc

### 1.3 验收门(S4 稳定性)

- [ ] `npm run lint` ✅
- [ ] `npm run build` ✅
- [ ] `cd src-tauri && cargo check` ✅
- [ ] 手动冒烟:用户本机旧数据被迁移弹窗正确处理,迁移后旧目录改 `.deprecated`
- [ ] `atomsyn-cli where` 显示新数据路径
- [ ] `atomsyn-cli install-skill --target claude,cursor` 可以装新名 skill
- [ ] 在 Claude Code 用"存到 Atomsyn"、"crystallize" 可以触发
- [ ] 旧 `atlas-cli` 已完全不存在(允许打 `command not found`)

---

## 2 · M1 · 多模型配置升级

### 2.1 目标

把 settings 页的 AI 副驾驶配置从"单一 LLM"升级为"**多类型 × 多厂商 × 多模型**"的真正的模型管理页,为 M2 的 ingest 管线和 M4 的语义对齐提供模型资源。

### 2.2 交付物

- [ ] **模型类型维度**(四类):`LLM` / `VLM` / `ASR` / `Embedding`
- [ ] **厂商维度**(冷启动 ≥10 家):
  - 参考 `/Users/circlelee/develop/assess/assess_bot_frontend/src/assets/logos/` 复用:
    - qwen / glm / deepseek / kimi / minimax / doubao / siliconflow / custom
  - 新增必须:
    - **openai**(GPT 系 + embedding + whisper)
    - **anthropic**(Claude 系,logo 需找)
  - logo 资源复制到 `src/assets/logos/` 下
- [ ] **单模型配置卡**(参考 `ModelConfigDialog.vue` 的模态框结构):
  - 模型类型 tag (LLM/VLM/ASR/Embedding)
  - 厂商选择 grid(logo 卡片点击)
  - 自定义厂商支持(provider = custom 时显示名称输入)
  - base_url / model_id / api_key(支持眼睛切换显隐)
  - "测试连接"按钮 + 实时结果 tag
  - 保存/取消
- [ ] **模型列表页**:显示已配置的模型,按类型分组,每个有启用/禁用开关
- [ ] **"默认模型"选择**:每个类型可设置默认模型,M2 管线按类型调默认模型
- [ ] **key 存储**:继续 localStorage(V1.5 已约束,V2.0 不升级为 Tauri 原生存储,延后)
- [ ] **导出/导入配置**:JSON 导出,不含 key;导入时提示"请手动补 key"

### 2.3 验收门

- [ ] ≥10 家厂商 logo 到位 + 点击切换正常
- [ ] openai / anthropic 的"测试连接"真实命中各家 API 返回 200
- [ ] qwen / deepseek / glm 至少 2 家测试连接真实绿
- [ ] ASR / VLM / Embedding 类型可配(即便 M2 只消费 LLM,三类 slot 必须 ready)
- [ ] 默认模型选择持久化
- [ ] 导出/导入 round-trip OK
- [ ] 设计语言 code-reviewer 审查通过

---

## 3 · M2 · 统一 ingest 管线 MVP

### 3.1 目标

ship 一个**单行命令可用**的 `atomsyn-cli ingest` 通道,把文本/md 碎片通过 LLM 解析成符合 D5 四维 schema 的 experience.fragment atom。

### 3.2 交付物

- [ ] **新 CLI 子命令**:
  ```
  atomsyn-cli ingest --text "..."            # 直接文本
  atomsyn-cli ingest --text --stdin          # stdin 输入
  atomsyn-cli ingest --md <path>             # 读取 md 文件(会议总结)
  atomsyn-cli ingest --dry-run               # 只解析不落盘,打印产物
  ```
- [ ] **解析流程**:
  1. 读取输入 → 送 M1 配置的默认 LLM
  2. Prompt 返回四维分类(role/situation/activity/insight_type)+ tags + 摘要标题
  3. 语义对齐:查找现有骨架/atom,如果命中已有 methodology atom,写入 `linked_methodologies` 字段
  4. 写入 `data/atoms/experience/fragment/<slug>/<id>.json`,标记 `subKind: 'fragment'`
  5. 触发索引重建
  6. 写 usage log 事件
- [ ] **语义对齐引导**(核心防重复骨架):
  - **CLI/Skill 端**:在 `skills/atomsyn-write/SKILL.md` 里加一个强约束块——agent 写入前**必须先调 `atomsyn-cli find --query` 查一次**,查到相近骨架就挂到上面而不是新建
  - **GUI 端**:上传时 autocomplete 显示相近已有骨架,用户要新建骨架时弹确认"检测到已有相近骨架 X,是否合并?"
- [ ] **D5 schema 固化**:
  - 新增 `skills/schemas/experience-fragment.schema.json`
  - 新增 `data/taxonomy/seed.json`(四维种子词表 + insight_type 8 值枚举)
  - 新增 `data/taxonomy/user.json`(用户新增词的个人词典,gitignore)
- [ ] **隐私分诊**:`insight_type: '情绪复盘'` 的 atom 自动打 `private: true` 标记,M4 的 atomsyn-read 默认不返回,GUI 里有独立"内省"视图展示
- [ ] **types 更新**:`src/types/index.ts` 的 `experience` kind 增加 `subKind: 'crystallized' | 'fragment'` 判别(D1 决策)
- [ ] **GUI ingest 入口**:Memory Garden 页面加一个"快速沉淀"按钮,弹框接文本/md 粘贴,底层调 CLI

### 3.3 验收门

- [ ] 50 条真实碎片(我本人日常写的)灌入成功率 ≥ 95%
- [ ] 语义对齐后重复骨架率 < 5%(人工抽检 10 条)
- [ ] `--dry-run` 的输出是结构化 JSON 可被 pipe
- [ ] CLI 单行命令延迟 p95 < 8s(LLM 调用主导)
- [ ] "情绪复盘"标记的 atom 不被 atomsyn-read 默认返回
- [ ] schema 验证通过:所有写入的 fragment 符合 `experience-fragment.schema.json`
- [ ] stdin 管道 OK:`echo "..." | atomsyn-cli ingest --text --stdin` 能走通
- [ ] 失败有明确 error code 和 retry 提示

---

## 4 · M3 · 双骨架 GUI · 记忆花园 (D2)

### 4.1 目标

把 V1.5 的"图书馆" + "我的经验"两个页面合并升级为一个**记忆花园 (Memory Garden)** 页,双骨架并存展示。

### 4.2 交付物

- [ ] **首页重命名**:"图书馆" → "**记忆花园**"(nav / breadcrumb / route 全替换)
- [ ] **顶部 nav 清理** — 移除 "我的经验" 入口,所有入口收归 Memory Garden:
  - 顶部 nav 最终顺序:`记忆花园 · 项目演练场 · 成长档案 · Skill 地图 · 设置`(5 项,"我的经验" 彻底消失)
  - 旧路由 `/experiences` → 302 到 `/garden?view=fragments`
- [ ] **双 tab 布局**(**骨架开放式**,种子表仅提示不强制):
  - **📚 权威骨架 Tab** — 展示 methodology atoms(保留 V1.5 的 24 步法 + 125 atoms 视觉)
  - **🌿 涌现骨架 Tab** — 展示 experience.fragment atoms 的**动态聚类视图**
  - **开放式骨架**:用户可以在 GUI 自由新建/重命名/合并任意骨架分类,种子表 (`data/taxonomy/seed.json`) 只作为 **autocomplete 提示词**,不限制用户输入任何新分类名
- [ ] **涌现骨架实现**:
  - 按 `role + situation` 二维动态分组(基于 D5 schema)
  - 组名由 LLM 生成(例:"研究 · 访谈"、"产品 · 复盘"),**生成一次缓存到 `data/taxonomy/clusters.json`**
  - 组内按 `insight_type` 二级分(反直觉/方法验证/...)
  - 用户可**手动重命名分组**、**手动合并分组**
  - GUI 右上角"重新聚类"按钮手动触发重生成(调用 M1 的默认 LLM)
  - 页面加载不调 LLM,读缓存 + 本地增量更新新 fragment
- [ ] **"我的经验"(`/experiences`)路由废弃**:
  - 所有已有 experience atom 迁移到 fragment 视图
  - 迁移脚本同时给旧 crystallized atom 补四维 schema(调 LLM 生成)
  - 路由 302 → `/garden?view=fragments`,保留一个 release 周期后移除
- [ ] **快速沉淀入口**:Memory Garden 右上角"+" 按钮打开 ingest 弹框(M2 的 GUI 入口)
- [ ] **D5 schema 的视觉落地**(Fragment Card,严格对照 `CLAUDE.md` 视觉语言 + `docs/mockups/atom-card.html`):
  - **L1 瞥一眼层** — 只显示标题 + `insight_type` chip (色码引用 `src/index.css` stage vars) + 1 个最重要的 tag
  - **L2 扫描层** — 加 `role · situation` 面包屑(例:"研究 · 访谈") + 摘要一句话
  - **L3 细节层** — 加 `activity` 动词 chip + `context.domain_hint` + 所有 tags + `linked_methodologies` 缩略 chip(可点击跳方法论)
  - **L4 全展开层** — 原始 ingest 内容 + 创建时间 + 来源(CLI/GUI)+ 校准历史
  - **chip 色码映射**(固定,写进 `src/lib/insightColors.ts` 单一来源):
    - 反直觉 → amber · 方法验证 → emerald · 方法证伪 → pink · 情绪复盘 → violet(+ 私密 icon)
    - 关系观察 → sky · 时机判断 → orange · 原则提炼 → emerald(深) · 纯好奇 → 灰
  - **动画**:卡片 hover / 展开走 `cubic-bezier(0.16, 1, 0.3, 1)` spring,光泽态边框(玻璃态)
  - **字体**:标题 Inter Medium,schema chip JetBrains Mono(小字号),正文 Inter Regular
- [ ] **涌现骨架分组的视觉**:每组头部用 stage 色做顶部 2px underline,组标题 Inter Semibold,组可折叠(spring 动画),空组自动隐藏
- [ ] **内省视图**:独立 `/garden?view=introspect`,展示 `insight_type = 情绪复盘` 的 atoms(默认需要点击进入,首页不直接展示,violet 色主题区分)
- [ ] **设计门**:本 milestone 任何视觉改动提交前**必须派 code-reviewer agent 对照 `docs/mockups/atlas.html` + `docs/mockups/atom-card.html` + `CLAUDE.md` §视觉语言 审一版**,审查报告落盘 `docs/plans/v2.0-m3-design-review.md`

### 4.3 验收门

- [ ] "我的经验"旧数据 100% 无损迁移
- [ ] 涌现骨架首次打开(50 条数据)渲染 < 600ms
- [ ] 手动合并分组后持久化生效
- [ ] 暗色模式视觉对照完整
- [ ] 设计 code-reviewer 审查通过(对标 `docs/mockups/atlas.html` 风格一致)
- [ ] 内省视图默认隐藏,只在 nav 里有入口

---

## 5 · M4 · 双向蒸馏相遇层 · V2.0 北极星

### 5.1 目标

实现 framing doc 里"**方法论与经验在同一次 AI 调用里相遇**"的核心体验。

### 5.2 交付物

- [ ] **`atomsyn-cli read` 增强**:
  - 输入: `--query "..."`
  - 输出(markdown):
    1. 命中的 methodology atom 摘要(权威骨架)
    2. **📎 你的相关碎片**:通过 `linked_methodologies` 反查 + 语义相似度,挑 top 3 展示(按 `insight_type` 打标签)
  - 尊重 `private: true`,情绪复盘默认不返回
- [ ] **`skills/atomsyn-read/SKILL.md` 升级**:
  - Prompt 里加一段:"当返回内容包含📎用户碎片时,agent 在回答中必须以'你之前记过'的口吻自然融入,**不要粘贴原 JSON**,要像一个懂你的朋友递给你一句话"
  - 触发词扩展(中英文 + 各种习惯表达)
- [ ] **GUI Copilot 视图**:
  - 搜索 methodology atom 时,右侧抽屉显示关联的 fragment atoms(可视化双向边)
  - 每条 fragment 有"解除关联" / "锁定此关联"按钮(校准机制,继承 V1.5 的 Agent 活动 Feed 设计)
- [ ] **关联相关性评分**(简易版):
  - `linked_methodologies` 存储时带 confidence 分(0-1),由 M2 的 LLM prompt 返回
  - 低于 0.5 的关联在 atomsyn-read 里不展示,但 GUI 里仍可手动锁定
- [ ] **北极星 Demo 可复现**:framing doc §3.2 的场景必须能在本机完整演示一遍

### 5.3 验收门

- [ ] 北极星 Demo 完整可复现
- [ ] 关联准确率人工评分 ≥ 4/5 (20 条样本)
- [ ] 情绪复盘 atom 在 atomsyn-read 里 0 泄露
- [ ] GUI 校准动作(锁定/解除)持久化 + 写 usage log
- [ ] skill prompt 升级后,Claude Code 的回答不再粘贴原 JSON

---

## 6 · M5 · 触发稳定性固化 (S4)

### 6.1 目标

把 V2.0 所有新 CLI + skill + GUI 入口做端到端回归测试,形成可重复、可 CI 的稳定性基线。

### 6.2 交付物

- [ ] **CLI 回归集**(scripts/test/cli-regression.mjs):
  - ingest --text / --md / --stdin
  - write / update / get / find / read / reindex / where
  - install-skill
  - 并发写入
  - 错词/空输入/非法 JSON 边界
- [ ] **Skill 触发回归**(scripts/test/skill-triggers.md):
  - 中英文触发词列表(20+)
  - 人工跑一遍记录命中率
- [ ] **GUI 冒烟**(Playwright 或手动脚本):
  - Memory Garden 加载
  - 快速沉淀流程
  - 模型配置 CRUD
  - 迁移弹窗流程
- [ ] **SLO 锁定**:
  - ingest CLI p95 < 8s
  - atomsyn-read CLI p95 < 3s
  - GUI 首屏 < 1.2s
  - 50 条 fragment 下 Memory Garden 渲染 < 600ms
- [ ] **CI 集成**:GitHub Actions 跑 lint + build + cargo check + CLI 回归
- [ ] **docs/releases/v2.0.md** 完整 ship list + 元教训文档

### 6.3 验收门

- [ ] CLI 回归 100% 绿
- [ ] skill 触发命中率 ≥ 95%
- [ ] SLO 全部达标
- [ ] CI 工作流正常
- [ ] 发布文档完整

---

## 7 · 跨 milestone 的硬约束

适用于 V2.0 全流程,**不是任何一个 milestone 独有**:

1. **每个 milestone ship 前必须跑三路验证**:`npm run lint` + `npm run build` + `cargo check`
2. **每个 UI 改动必须先读 mockups + 派 code-reviewer 审查**
3. **所有新写入必须通过 `atomsyn-cli`**,不允许 agent / GUI 直接写磁盘
4. **schema 更新必须同步到 `skills/schemas/*.schema.json`**
5. **索引必须在任何写入后重建**(CLI 自动做)
6. **API key 永远不进 git**,配置文件里只存模型元信息
7. **V1.5 的 12 条核心洞察 + V2.0 新增的 5 条 (13-17)** 在任何设计选择上都是裁决者

---

## 8 · 已决策(2026-04-09 锁定)

- [x] **M0 迁移弹窗文案** · 交给 designer agent 起草(含仪式感、简短有力、中英文对照),产物落 `docs/plans/v2.0-m0-migration-copy.md`
- [x] **M1 anthropic logo** · 复用一个已有的 logo 作为占位(文件名 `anthropic.svg`),后期用户自行替换;代码里按 `anthropic` 注册,不需要改引用
- [x] **M3 涌现骨架分组命名** · **缓存策略**:生成一次写入 `data/taxonomy/clusters.json`,GUI 提供"重新聚类"按钮手动触发重生成;每次加载不调 LLM
- [x] **M4 关联 confidence 阈值** · 默认 **0.7**,低于 0.7 不在 atomsyn-read 里展示,但 GUI 可手动锁定提升
- [x] **M5 Playwright** · **不引入**。用手动脚本 + CLI 回归集覆盖,保持依赖轻量,符合本地优先哲学

---

## 9 · 下一步

- [ ] 用户审阅本 PRD draft,在 §8 的开放问题上拍板
- [ ] 签字后固化为 v1.0
- [ ] 生成 `docs/plans/v2.0-implementation-plan.md`(任务级拆解,对标 `v1.5-implementation-plan.md`)
- [ ] **M0 开工**:改名是第一件事,预计 1 个工作日完成(含三路验证 + 迁移脚本 + 冒烟)
