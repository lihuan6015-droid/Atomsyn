# Atomsyn × 外部 Agent 集成指南

> 让你的 Cursor / Claude Code / Codex 在新会话第一句话就懂你的 atomsyn 知识库 — 沉淀 / 检索 / 复盘 / 冷启动全部走外部 Agent, atomsyn 桌面应用专注做"看见你的认知地图".

**版本**: V2.x chat-as-portal (2026-04-28)
**适用读者**: 已安装 atomsyn 桌面应用并希望与外部 Agent 联动的用户

---

## 0 · 总览 — 一张图看懂

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  L1 · atomsyn 桌面应用        │         │  L2 · 外部成熟 Agent          │
│                              │         │                              │
│  · 看见你的认知地图           │         │  · Claude Code (CLI)         │
│  · 与库内 atom 对话           │         │  · Codex (CLI)               │
│  · 复盘 / 教练模式            │ ←─引导─→│  · Cursor (IDE)              │
│  · 引导卡片 (复制 prompt)     │         │  · Claude Desktop (App)      │
│                              │         │                              │
│  [不实际执行重数据流]          │         │  [SKILL 装好, 拿到 prompt    │
│  bootstrap / 批量解析         │         │   就能跑 atomsyn-cli 工具]    │
└──────────────────────────────┘         └──────────────────────────────┘
                  ↓                                       ↓
         ┌────────────────────────────────────────────────────┐
         │  共享: ~/Library/Application Support/atomsyn       │
         │   atoms/ (experience + profile + frameworks)        │
         │   index/  growth/  notes/  projects/                │
         └────────────────────────────────────────────────────┘
```

**核心命题** (atomsyn V2.x 北极星): L1 和 L2 互补不竞争. L1 不复刻 Cursor / Codex 的 tool-use 能力, L2 通过 skill 让外部 Agent 读懂你的本地知识库.

---

## 1 · 安装 (3 步, ≤ 5 分钟)

### 1.1 装 atomsyn 桌面应用

从 GitHub releases 或本地 `npm run tauri:dev` 安装. 首次启动会创建数据目录:
- macOS: `~/Library/Application Support/atomsyn`
- Linux: `~/.local/share/atomsyn`
- Windows: `%APPDATA%/atomsyn`

### 1.2 装 SKILL 到外部 Agent

```bash
# 装到所有支持的 Agent (推荐, Anthropic + OpenAI 双覆盖)
atomsyn-cli install-skill --target all

# 或单独装某一家
atomsyn-cli install-skill --target claude    # ~/.claude/skills/
atomsyn-cli install-skill --target cursor    # ~/.cursor/skills/
atomsyn-cli install-skill --target codex     # ~/.agents/skills/  (注意是 ~/.agents 不是 ~/.codex)
```

各 Agent 的实际安装路径:

| Target | 路径 | 文件 |
|---|---|---|
| `claude` | `~/.claude/skills/atomsyn-{bootstrap,write,read,mentor}/SKILL.md` | Claude Code 内置 skill loader |
| `cursor` | `~/.cursor/skills/atomsyn-{bootstrap,write,read,mentor}/SKILL.md` | Cursor IDE 0.x+ |
| `codex` | `~/.agents/skills/atomsyn-{bootstrap,write,read,mentor}/SKILL.md` | OpenAI Codex CLI 全局 skills (来源: developers.openai.com/codex/skills) |

> **注**: 装好后**重启** Agent 才能加载新 SKILL. Claude Code: 起新 session 即可; Cursor: 重启进程; Codex: 重启 CLI.

### 1.3 验证

```bash
atomsyn-cli where
```

输出示例 (节选):
```json
{
  "path": "/Users/<you>/Library/Application Support/atomsyn",
  "cliShim": { "installed": true },
  "skills": [
    { "target": "claude", "dirExists": true,
      "installed": [
        { "name": "atomsyn-bootstrap", "installed": true },
        { "name": "atomsyn-write", "installed": true },
        { "name": "atomsyn-read", "installed": true },
        { "name": "atomsyn-mentor", "installed": true }
      ] },
    { "target": "cursor", "dirExists": true, "installed": [...] },
    { "target": "codex", "dirExists": true, "installed": [...] }
  ]
}
```

每个 target 的 4 个 skill 都 `installed: true` = 装好了.

---

## 2 · 四个 SKILL 的最佳触发话术

每个 skill 给 5+ 触发话术 (中英). 直接在外部 Agent 里发, 它会加载对应 SKILL.md 走流程.

### 2.1 atomsyn-bootstrap (冷启动批量入库)

**用途**: 第一次用 atomsyn / 把硬盘上散落的笔记 / 历史 PRD / 复盘文档批量导入

**触发话术** (中):
- 初始化 atomsyn, 把 ~/Documents/X 倒进来
- 第一次用 atomsyn, 把我硬盘里的笔记导入一下
- 把 ~/Documents/项目X 沉淀进 atomsyn
- 一口气导入 ~/Documents/混沌 + ~/Documents/学习笔记
- bootstrap atomsyn 把这几个目录的内容倒进来

**触发话术** (英):
- bootstrap atomsyn from ~/Documents/X
- import my notes from ~/Documents into atomsyn
- cold-start atomsyn with my project files
- onboard atomsyn — load my history docs

**预期行为** (Agent 走 D-009/D-011/D-012 后的 agent-driven 流程):
1. 跑 `atomsyn-cli where` 拿数据目录 + 探测现有 profile (rerun 判断)
2. 跑 `atomsyn-cli bootstrap --phase triage` 列文件元数据
3. **自己** Read 任何格式 (.md/.txt/.pdf/.docx/.xlsx/.pptx 都试)
4. 渐进式或批量 markdown 与你对齐: "我看到了 X, 这值得作为 atom 吗?"
5. 你认可的 → `atomsyn-cli write --stdin` 入 experience atoms
6. 有证据时抽象 profile (preferences 5 维 / identity / domains / patterns), 调 `atomsyn-cli write-profile --stdin`
7. `atomsyn-cli reindex` 重建索引

**rerun (再跑一次)**: Agent 会先 `atomsyn-cli get --id atom_profile_main` 拿现有 profile, 与新数据**字段级 diff** 让你校准, 不会单方面覆写.

**v1 限制**: profile 默认 `verified=false`, 你需要去桌面应用 ProfilePage 校准 `verified=true`, v2 才会让 atomsyn-read 在新会话注入 profile.

### 2.2 atomsyn-write (单点沉淀)

**用途**: 对话中产生有价值的洞察, 记下来供未来召回

**触发话术** (中):
- 把这个洞察记下来 / 沉淀到 atomsyn
- 这个值得记一下, 加到我的 atomsyn
- 别让我忘了这个 — 存到 atomsyn
- 这个踩坑要保留, atomsyn 记一下

**触发话术** (英):
- save this to my atomsyn
- remember this for me / crystallize this
- sink this into atomsyn

**预期行为**:
1. Agent 从对话提取**最近一段值得保留的学习**
2. 构造 atom JSON (含 name / insight / role / situation / activity / insight_type / tags)
3. 通过 `atomsyn-cli write --input /tmp/atomsyn_*.json` 写入
4. 给你确认回执 (atom id + 路径)

**关键**: Agent **不会**总结整段对话, 只挑你明确表达过兴趣的内容. 所以触发话术要明确 ("把这个洞察记下来" 而不是 "总结一下我们刚才聊的").

### 2.3 atomsyn-read (检索召回)

**用途**: 让 AI 在回答时**自然带上**你过去沉淀的相关洞察

**触发话术** (中):
- 我之前做过 X 吗? 翻一下我的 atomsyn
- 查一下我的知识库, 有没有关于 X 的经验
- 我的 atomsyn 里有没有 X 相关的方法论
- 看看我之前怎么想的关于 X

**触发话术** (英):
- check my atomsyn for X
- did I solve this before?
- recall my notes on X / what did I learn about X

**预期行为**:
1. Agent 跑 `atomsyn-cli read --query "<关键词>"` 拿认知地图
2. 按需钻取 (`atomsyn-cli get --id <atom_id>`)
3. 在回答里**自然引用**你过去的原话, 不改写, 不二次创作
4. 露出 atom id 让你能在桌面应用打开校准

**静默触发**: Agent 在新会话开始一个实质性任务时 (e.g. "帮我设计 Y") 会**默默调一次** atomsyn-read, 不告诉你"我搜了". 这是设计原则 — atomsyn-read 应该让你觉得"AI 这么懂我", 而不是"又在查什么".

### 2.4 atomsyn-mentor (复盘教练)

**用途**: 月度 / 季度看盲区 / 看成长 / 主动整理认知

**触发话术** (中):
- 帮我复盘最近一个月
- 我的盲区在哪 / 看看我的成长轨迹
- 进入 mentor 模式 / 导师模式
- 我最近学了什么

**触发话术** (英):
- review my growth this month
- analyze my knowledge gaps
- enter mentor mode

**预期行为**:
1. `atomsyn-cli mentor --range month --format data` 拿数据 (维度分布 + 时间线 + 盲区)
2. **Agent 自己分析**(不调外部 LLM), 生成结构化复盘报告 (优势 / 盲区 / 行动建议)
3. 末尾**额外**调 `atomsyn-cli prune --limit 5` 给"认知整理建议", 让你裁决保留 / 取代 / 归档
4. 闭环: 复盘 → 发现盲区 → 深入对话 → 产生新洞察 → 触发 atomsyn-write 沉淀回去

---

## 3 · 三个外部 Agent 的差异 + Tips

### 3.1 Claude Code (Anthropic CLI)

**优点**:
- SKILL selector 命中率最稳定 (Anthropic 自家 skill loader)
- Read 工具直接支持 PDF, 不需要 pdftotext
- AskUserQuestion 关卡体验流畅

**已知 quirk**:
- skill 触发后**默认会显示** "Skill(atomsyn-bootstrap) loaded" 行, 用户能看到, 是好事

**调试**: 起新 session 后第一句直接发触发话术. 如果 skill 没命中, 显式说"加载 ~/.claude/skills/atomsyn-bootstrap/SKILL.md, 然后..."

### 3.2 Cursor (IDE 内置 Agent)

**优点**:
- 在写代码时同时触发 atomsyn-write 沉淀洞察很自然 (e.g. "记下这个 Tauri 打包坑")
- atomsyn-read 在新项目首次会话静默触发, 拉相关方法论

**已知 quirk**:
- Cursor skill loader 行为闭源, 触发率比 Claude Code 略低
- 需要重启 Cursor 进程才能加载新装的 SKILL

**调试**: 如果 SKILL 没命中, 在 Cursor chat 显式 @ skill (或在 Settings 启用所有 skill)

### 3.3 Codex (OpenAI CLI)

**优点**:
- 命令行原生, 与 atomsyn-cli 工具链协同最自然
- skill 加载路径 `~/.agents/skills/` 是 OpenAI 的开放标准

**已知 quirk**:
- skill 触发率取决于 description 关键词匹配, 中文触发命中率比英文略低
- 注意安装路径**不是** `~/.codex/skills/` (那是 Codex 内置目录)

**调试**: 直接发完整 prompt 即可, 不依赖 selector 自动命中

---

## 4 · 典型工作流

### 4.1 第一次用 atomsyn (冷启动)

```
1. 装 atomsyn 桌面应用
2. atomsyn-cli install-skill --target all
3. 在 Claude Code / Cursor / Codex 任一处发:
   "初始化 atomsyn, 把 ~/Documents/X 倒进来"
4. Agent 走 agent-driven bootstrap (read 文件 → markdown 候选 → 你确认 → cli write)
5. 完成后回到 atomsyn 桌面应用 → Atlas 看新 atom 进入双骨架
6. 去 ProfilePage 校准 verified=true
```

### 4.2 日常沉淀

```
在 Cursor 写代码时遇到一个坑解决了
→ 跟 Cursor 说 "把这个 Tauri 公证流程的坑记下来"
→ Cursor 走 atomsyn-write 流程, 提炼洞察, cli write 入库
→ 几秒钟完成, 不打断你的工作流
```

### 4.3 月度复盘

```
月初:
→ 跟 Claude Code 说 "帮我复盘上个月的认知积累"
→ Claude Code 走 atomsyn-mentor 流程
→ 生成结构化报告 + prune 整理建议
→ 你决定哪些 archive / supersede / 保留
```

### 4.4 项目结束写复盘

```
项目交付后:
→ 跟 Cursor 说 "我们刚交付了 X 项目, 帮我从这次的 git 提交 + 我的笔记里
  一次性沉淀 5-10 条值得保留的洞察"
→ Cursor 走 bootstrap 局部 (--path ~/projects/X) 或 atomsyn-write 多次调用
→ 灵活, 看 Agent 判断
```

---

## 5 · FAQ

### Q1: ATOMSYN_LLM_API_KEY 是必须的吗?

**A**: agent-driven 模式下**不需要**. 在外部 Agent 里跑时, Agent 自己有 LLM 能力 (你的 Cursor / Claude Code 已经有 API key), atomsyn-cli 仅做工具操作 (扫盘 / 写库 / 索引).

ATOMSYN_LLM_API_KEY 仅在 GUI 桌面应用的 Bootstrap 向导**高级模式** (Settings → 高级) 用, 那是 cli 内部 LLM 路径. 95% 用户走 agent-driven 路径**永远不需要**这个 env var.

### Q2: profile 与 Cursor / Claude Code 自带的"记忆"功能有什么区别?

**A**: 三个关键差异:
1. **本地主权**: atomsyn profile 100% 本地存储 (`~/Library/Application Support/atomsyn/atoms/profile/`), 永远不上传到 Anthropic / OpenAI 云端. 大厂记忆功能数据在他们服务器.
2. **跨工具召回**: atomsyn profile 装到 Claude Code + Cursor + Codex 三家, 一份画像跨工具用. 大厂记忆是单工具内的.
3. **可控演化**: atomsyn profile 有完整 `previous_versions[]` 历史 + 字段级校准协议 (D-011), 你能看每次画像变化 + 一键 restore. 大厂记忆是黑盒.

### Q3: 跑 bootstrap 会上传我的文件到云端吗?

**A**: **取决于你用哪个外部 Agent**.
- atomsyn-cli 本身**永不上传** (扫文件 + 写本地 atom JSON 全本地)
- 但你在 Cursor / Claude Code / Codex 里跑 bootstrap 时, **Agent 内置 LLM** 会读到 atomsyn-cli stdout (含路径 + 文件内容片段) 并上传到对应厂商云端做推理. 这是用外部 Agent 的固有 trade-off.

如果你在意, 用桌面应用的 Bootstrap 向导 (高级模式) + 本地 LLM (Ollama / etc.) 配合 ATOMSYN_LLM_BASE_URL 可以做到 100% 本地, 但这是 power user 路径.

### Q4: SKILL 没自动触发怎么办?

**A**: 三步排查:
1. **跑 `atomsyn-cli where`** 看 skills 段, 确认目标 Agent 的 4 个 skill 都 `installed: true`
2. **重启 Agent** (Cursor 退出重开, Claude Code 起新 session, Codex 重启 CLI)
3. **改用显式 prompt**: 不靠 selector 自动命中, 直接发 "请加载 ~/.claude/skills/atomsyn-bootstrap/SKILL.md, 然后帮我..."

如果重启 + 显式 prompt 都不工作, 这是 description 关键词不匹配, 可以提 issue 反馈具体场景, 我们调 description.

### Q5: 多设备如何同步 atomsyn 数据?

**A**: V2.x v1 阶段**单设备**, 没有云同步. 推荐方案:
- 把 `~/Library/Application Support/atomsyn/` 整个目录放到 iCloud / Dropbox / Syncthing 同步 (atomsyn 数据是纯 JSON 文件, 易同步)
- 注意冲突: 多设备同时改可能产生 git-style merge conflict, 当前 atomsyn 没自动 resolution

V2.x 后续版本可能加 P2P 或可选云同步, 但**永远以本地优先**为前提.

### Q6: 我能改 SKILL.md 吗?

**A**: 可以, SKILL.md 装到你 home 后是你自己的文件 (e.g. `~/.claude/skills/atomsyn-bootstrap/SKILL.md`). 改动会在下次 Agent session 加载.

但跑 `atomsyn-cli install-skill --target all` 会**覆盖**你的改动 (用项目 seed 重新分发). 如果要持久化你的改动, 不要再跑 install-skill, 或者把改动 PR 回项目 (`skills/atomsyn-bootstrap/SKILL.md`).

### Q7: profile 的 5 维 (preferences) 是哪 5 维?

**A**: 5 维 plan-tune 兼容字段, 0-1 数值:
- `scope_appetite`: 小步迭代 (0) ↔ 完整方案 (1)
- `risk_tolerance`: 谨慎 (0) ↔ 激进 (1)
- `detail_preference`: 简洁 (0) ↔ 详尽 (1)
- `autonomy`: 咨询模式 (0) ↔ 委托模式 (1)
- `architecture_care`: 重速度 (0) ↔ 重设计 (1)

完整 schema 见 `skills/schemas/profile-atom.schema.json`.

---

## 6 · 故障排查

| 现象 | 排查 |
|---|---|
| `atomsyn-cli: command not found` | 先跑 `atomsyn-cli install-skill` 装 shim 到 `~/.atomsyn/bin/`. 然后 `source ~/.zshrc` 或新开终端 |
| Agent 跑 bootstrap 卡在 SAMPLING 报 "No LLM credentials" | 你装的是旧 SKILL.md (cli 自带 LLM 路径). 跑 `atomsyn-cli install-skill --target all` 重装 v2 SKILL (D-008 后 cli 不调 LLM) |
| `cli get --id atom_profile_main` 输出极简, 没有 5 维 / identity | 旧 cli 版本. 跑 `git pull && atomsyn-cli install-skill --target all` 升级 |
| Bootstrap 跑完只有 experience 没有 profile | 检查文档里有没有"画像证据" (e.g. 自述 role / 反复出现的工作模式). 如果完全没有, profile 整段跳过是正确的 (D-011 evidence-driven). 你可以去 ProfilePage 手动建立 |
| profile.verified 一直是 false | 这是 v1 设计 (D-007 仅观察). 去 atomsyn 桌面应用 ProfilePage 切 verified=true. v2 才放开 read 自动注入 |
| 多次 bootstrap 后 profile 字段被覆盖, 旧版本丢失 | 不会丢. 旧版本自动入 `previous_versions[]` 历史栈. 跑 `cli get --id atom_profile_main --json` 看 previous_versions 数组 |

---

## 7 · 已知限制 (V2.x v1)

- **SKILL 触发率非 100%**: 取决于 selector 关键词匹配 + Agent 内置 loader 行为. 失败时显式 prompt 是 fallback
- **profile 不自动注入**: D-007 v1 仅观察. 用户在 ProfilePage 校准 `verified=true` 后未来 v2 才考虑放开
- **profile 默认抽象 5 维**: 后续版本会细化扩展更多维度 (待用户实测反馈)
- **更新机制是全量 rerun**: 当前 bootstrap rerun 重新抽象整个 profile + 字段级校准. 后续版本可能加增量 / 单点更新
- **不处理图片 / 音视频**: Agent 能力边界, 文档里这些媒体被跳过
- **多设备同步**: 单设备本地, 云同步交给用户 (Dropbox / iCloud / Syncthing)
- **Wizard 高级后门**: 桌面应用 Settings → 高级 → Bootstrap 向导仍可用 (cli 自带 LLM 模式), 适合离线 / 调试场景

---

## 8 · 进一步阅读

- **战略锚点**: `docs/framing/v2.x-north-star.md` (V2.x 北极星 + 三层架构)
- **本 change 完整设计**: `openspec/changes/2026-04-chat-as-portal/` (proposal / design / tasks / decisions)
- **CLI 完整命令面**: `atomsyn-cli --help`
- **SKILL 源码**: `skills/atomsyn-{bootstrap,write,read,mentor}/SKILL.md`
- **Profile schema**: `skills/schemas/profile-atom.schema.json`

---

**反馈**: 实测中发现 SKILL 描述不准 / 触发不到位 / 工作流不顺畅, 在 atomsyn 仓库提 issue, 或直接编辑 `skills/atomsyn-*/SKILL.md` 提 PR.

> *Atomsyn — it remembers, so you can grow.*
