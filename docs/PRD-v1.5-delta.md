> 📦 **Archived · V1.5 history**: 项目 V2.0 起更名为 **Atomsyn**。当前版本规划见 [`PRD-v2.0.md`](PRD-v2.0.md) 与 [`framing/v2.0-problem-framing.md`](framing/v2.0-problem-framing.md)。本文档保持原 `ccl-atlas` 命名以保留历史上下文。

# CCL Atlas · V1.5 PRD Delta

> **这份文档是对 `docs/PRD.md` 的增量说明**,不替换原 PRD。原 PRD 是 V1 alpha 的完整产品规格,这份 delta 把 V1.5 的 12 条核心洞察、L1/L2 v2 双层架构、北极星四幕、CLI-first 契约等增量内容正式纳入产品需求。
> **依据档案**: `docs/framing/v1.5-problem-framing.md` (战略层,已封印)
> **执行档案**: `docs/plans/v1.5-implementation-plan.md`
> **版本**: 2026-04-08

---

## § 0 · 为什么需要这份 delta

V1 PRD 把问题定义为"学过即忘的方法论焦虑",只覆盖了根问题的第 1 切面。V1.5 framing session 发现真问题更深:

> **个人记忆资产无法被自己和 AI 共同高效检索调用** —— 学过即忘只是症状,根问题是 FOMO 驱动的囤积循环让所有积累变成"加剧焦虑的死库存",并在 AI 时代进一步把用户的元认知主权外包给中心化平台和 token 经济。

因此 V1.5 不是"给 V1 加功能",而是**把产品定位从 L1 单层升级为 L1+L2 双层主权架构**。

---

## § 1 · 12 条核心洞察 (正式纳入 PRD)

见 `docs/framing/v1.5-problem-framing.md` § "8 条核心洞察清单"(后续 Step 2+3 又补了 4 条,共 12 条)。简要:

1. **I** · 问题是 L1 + L2 双层架构,缺一不可
2. **J** · 大厂结构性不会做这个方向 → 小生境是安全的,不是窗口期
3. **K** · 使用即维护 = 飞轮的唯一可能机制
4. **L** · 数据主权 100% 本地不是营销话术,是产品 DNA 的一部分
5. ...(其余见 framing 档案)

---

## § 2 · L1 / L2 v2 架构(替换 V1 PRD § 5)

### L1 · 主动复盘层 (人类视角)

原 V1 § 5 的"知识图书馆 + 项目演练场 + 成长档案"保留不变。V1.5 新增:

- **Skill 地图** Tab: 本地所有 AI skill 的可视化卡片库(Gap-4)
- **Agent 活动 Feed**: 知识图书馆右侧抽屉,展示 L2 读写历史(Gap-6.1)
- **Atom 校准**: 调用历史 + 降权/锁定/合并(Gap-6.2)
- **Agent 权限**: Settings 侧的 agent 读写/确认开关(Gap-6.3)

### L2 · 被动接口层 (AI 视角)

**全新引入**。核心产品契约:

> 一份统一的、可被任意 AI 编码工具(Claude Code / Cursor)挂载的 **CLI + Skill** 组合,让 AI 在对话/编码中自动调用用户的元认知,并在使用过程中协助维护。

构成:

1. **`atlas-cli`**: 零依赖 Node CLI,提供 write / read / reindex / where / install-skill 子命令
2. **`atlas-write` skill**: 用户说"帮我记下来"时触发,agent 调 CLI 把经验沉进来
3. **`atlas-read` skill**: 新会话开始或用户问"我之前是不是踩过这个坑"时触发,agent 调 CLI 把相关经验读出来并作为上下文注入回答
4. **CLI 安装器**: `atlas-cli install-skill` 一键把上述 skill 装到 `~/.claude/skills` + `~/.cursor/skills`,并在 `~/.ccl-atlas/bin/` 安装 CLI shim

**L2 的核心设计决策**(记录在 `atom_exp_claude-skill-over-mcp-for-local-sovereignty`): 选 Claude Skill 原生格式而不是 MCP Server,原因见该 atom。

---

## § 3 · CLI-first 契约 (V1.5 架构收紧)

**原则**: Agent 从来不直接写磁盘,不构造 schema 内部字段。Agent 只负责**从对话里提炼用户视角的内容字段**,通过 stdin 送进 `atlas-cli write --stdin`。

### 输入契约 (loose · agent 只需传这些)

```json
{
  "name": "中文/英文标题 (必填)",
  "sourceContext": "1-2 句情境 (必填)",
  "insight": "核心学习,含推理过程 (必填, 50-4000 字符)",
  "tags": ["1-8 个 kebab-case 标签 (必填)"],
  "keySteps": ["可选"],
  "sourceAgent": "可选,默认 claude-code",
  "codeArtifacts": [...],
  "relatedFrameworks": [...],
  "relatedAtoms": [...]
}
```

### CLI 自动补齐

- `id` (`atom_exp_<slug>_<unix_ts>`)
- `schemaVersion` / `kind` / `createdAt` / `updatedAt`
- `stats` (`{usedInProjects:[], useCount:0}`)
- slug 派生 / 目录组织
- schema 合规校验(严格)
- 锁冲突检测(尊重 `stats.locked`)
- usage-log 追加
- 索引重建钩子

**收益**: schema 以后怎么演进、数据目录搬家、字段增删 —— agent 侧的 skill 契约零改动,只需更新 CLI。

---

## § 4 · 北极星 Demo 四幕 (V1.5 唯一验收标准)

| 幕 | 场景 | 主语 | 通过条件 |
|---|---|---|---|
| 一 | 在 Claude Code 里说"帮我记下来" → atom 自动入库 | AI | experience atom 真实落盘 + schema 合规 |
| 二 | 换上下文开 Claude Code 新会话 → read skill 自动注入 | AI | 上下文注入后 Claude 表现"懂我"(盲测 7/10) |
| 三 | 周日打开 Atlas 桌面 app → 看过去一周 agent 活动 → 校准 1-2 张 | 人 | Feed 有真实数据;校准操作可写回 |
| 四 | 打开"Skill 地图"Tab → 卡片化看见本地 40+ skill | 人 | 扫描结果真实;AI 摘要按需生成 |

**任何一幕跑不通 = V1.5 未发布。**

---

## § 5 · 数据主权硬承诺

V1.5 正式把以下承诺写进产品 DNA,**不可以因为"商业化压力"被推翻**:

1. **100% 本地**: 所有用户数据(experience / methodology / skill-inventory / practices / usage-log)存在用户自己选择的目录,默认 `~/Library/Application Support/ccl-atlas/`,可用 `~/.ccl-atlas-config.json` 重定向
2. **零云端同步 (V1.x)**: V1 / V1.5 不做云同步、不做账号、不做团队功能。V2 才考虑 end-to-end 加密的可选同步
3. **无遥测**: 不采集任何 usage / crash / analytics 数据。所有"用户活动"日志只存在本地 `growth/usage-log.jsonl`,供本机 GUI 渲染
4. **LLM 可选**: Copilot + AI 摘要功能完全可选。不开 LLM 配置的用户仍然能用 L1 全部功能。L2 的写入 / 读取由 agent 在自己的会话里调 LLM,不走 Atlas 本地 LLM 配置
5. **API key 本地存**: 用户的 Anthropic / OpenAI API key 存在 localStorage + `~/.ccl-atlas-config.json`,**永远不进 git-tracked 文件**(CLAUDE.md 铁规之一)

---

## § 6 · 与 V1 PRD 的兼容关系

- V1 § 1 (愿景 / 用户画像 / 身份焦虑) → **保留**,只是把范围从"AI PM 转型者"泛化到"AI 时代中段知识工作者"
- V1 § 2 (问题陈述) → **替换**为 framing 文档 § 3.1 的 v2 版本
- V1 § 3 (核心 Jobs) → **扩展**为 15 条子 Job(见 framing 文档 Step 2)
- V1 § 4 (竞争定位) → **新增** § 2.4 "vs 大厂 Cowork 类工具"的结构性差异化洞察
- V1 § 5 (方案概览) → **替换**为 L1/L2 v2 架构(本文档 § 2)
- V1 § 6+ (详细功能规格) → **保留**,V1.5 只在其上追加 Gap-1 ~ Gap-6 的增量
- V1 § "设计语言硬约束" → **保留且强化**: 本 delta 强调每个 UI 任务 subagent 结束后必须派 `code-reviewer` agent 做一致性专项审查

---

## § 7 · V1.5 相对 V1 新增的 Gap(复述)

| Gap | 内容 | V1.5 交付 |
|---|---|---|
| Gap-1 | Atom `kind` 判别联合 + 新 schema | ✅ T-1.1 |
| Gap-2 | Agent 双向接口(write / read skill) | ✅ T-2.1 ~ T-2.5 |
| Gap-3 | Tauri 桌面壳 + 数据目录策略 | ✅ T-3.1 ~ T-3.3 |
| Gap-4 | Skill 扫描器 + Skill 地图 Tab + AI 摘要 | ✅ T-4.1 ~ T-4.3 |
| Gap-5 | CLI (atlas-cli) | ✅ T-5.1 |
| Gap-6 | Sovereignty GUI (Feed + 校准 + 权限) | ✅ T-6.1 ~ T-6.3 |
| N-增量 | CLI-first 收紧 + 中文化 skill + 首次运行 seeding + 启动 Splash + 跨 OS 审计 | ✅ N-1 ~ N-6 (session 2 范围扩展) |

---

## § 8 · V1.6 Backlog(不进 V1.5)

- Codex / Trae skill 分发
- Merge atom 真实实现(V1.5 是 stub)
- Agent 写入 pending queue + GUI 审批
- Embedding 语义检索(替换当前 keyword)
- 中文原子 slug 从 id 派生
- LLM config Tauri 原生存储(替换 localStorage)
- 统一 agent 色码 / icon 体系(design review 的 should-fix)
- 云端可选 E2E 加密同步(远期)
