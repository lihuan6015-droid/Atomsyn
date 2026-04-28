---
name: atomsyn-bootstrap
description: "把用户硬盘上散落的笔记 / 文档 / PDF / 聊天导出引导式地导入 Atomsyn 知识库, 沉淀成 N 条经验 atom。你 (外部 Agent) 用自己的能力 read 任何格式 (.md/.txt/.pdf/.docx/.xlsx/.pptx/.html/源代码/等), 用自己的 LLM 推理生成 atom JSON, 通过 atomsyn-cli write --stdin 入库; cli 不调 LLM, 只做 triage + write + reindex 这些工具操作。两步协议: 你先 markdown 报告候选让用户审阅, 用户同意后才 cli write 真写入。用户说 '初始化 atomsyn / bootstrap atomsyn / 把 ~/X 倒进来 / 从我之前的笔记导入 / 第一次用 atomsyn / 把 ~/Documents 沉淀进来 / 把硬盘里的笔记倒进 atomsyn / cold-start atomsyn / import my notes' 时触发。"
allowed-tools: Bash, Read
---

# atomsyn-bootstrap — 引导式批量冷启动 (你 = 外部 Agent)

这是 Atomsyn V2.x "Agent 双向接口"的**冷启动入口**. 你 (Claude Code / Cursor / Codex 等成熟 Agent) 是**真正的执行者**, atomsyn-cli 仅在你需要扫盘列表 + 写库 + 重建索引时被调用. **cli 不调 LLM, 不复刻你的能力** —— 你已经能 read 文件 + reason, 不需要 cli 在内部再来一遍.

---

## 北极星 + 你的角色

> "**让你积累的认知, 在需要时醒来。**" 的**第一次唤醒**.

bootstrap 是仓库层 (Vault) 的冷启动入口. 没有它, 新用户面对空知识库, atomsyn-read 永远沉默, atomsyn-mentor 永远说"数据不足".

**你的角色**: 用户硬盘上有 N 个文件 (笔记 / PDF / 聊天导出 / 源代码 / 复盘文档 / 等), 你 (Agent) 用自己的全部能力 (Read 任何格式 + Bash 调标准工具如 pandoc/pdftotext) 把它们读懂, 用自己的 LLM 推理把每条值得保留的洞察抽成符合 schema 的 atom JSON, 通过 `atomsyn-cli write --stdin` 入库.

---

## atomsyn-cli 在本流程中的角色 = 工具

**你应该调用** ✅:
- `atomsyn-cli where` — 拿数据目录路径, 决定写入位置
- `atomsyn-cli bootstrap --path <X> --phase triage` — 扫盘列文件清单 (cli 仅列 metadata, 不读内容, 不调 LLM, 不需要 ATOMSYN_LLM_API_KEY)
- `atomsyn-cli write --stdin <atom JSON>` 或 `--input <file>` — 入库一条 experience atom (走 schema 校验 + collision 检测)
- `atomsyn-cli find --query "..."` — 查重 (Step 3 前可选)
- `atomsyn-cli reindex` — 重建索引

**不要调用** ❌:
- `atomsyn-cli bootstrap --phase sampling` — 那是 GUI Wizard 用的, cli 内部要调 LLM, 你不需要
- `atomsyn-cli bootstrap --phase deep-dive` — 同上
- `atomsyn-cli bootstrap --commit` — 同上
- `atomsyn-cli bootstrap --mode agentic / --mode funnel` — 同上, 这是 cli 内置的 LLM 路径

如果用户问"为什么不直接调 sampling/deep-dive 让 cli 帮忙跑?", 回答:
> "你 (Agent) 已经有完整的 LLM 能力, 让 cli 再调一次 LLM 是浪费资源 + 凭证错位 (atomsyn-cli 的 LLM 是 GUI Wizard 用的, 跟你这里的 LLM 是两套). cli 在你这里仅做工具操作 — 列文件 / 写库 / 重建索引, 真正的思考归你做."

---

## 触发条件

### ✅ 显式触发

- 用户中文说: 初始化 atomsyn / bootstrap atomsyn / 把 ~/X 倒进来 / 从我之前的笔记导入 / 第一次用 atomsyn / 把硬盘里的笔记沉淀一下 / 一口气倒进去 / 批量导入 atomsyn / 把 ~/Documents 沉淀进来
- 用户英文说: bootstrap atomsyn / initialize atomsyn / import my notes / batch import / cold-start atomsyn / first time using atomsyn / dump ~/Documents into atomsyn / onboard atomsyn

### ✅ 静默 / 主动触发 (谨慎)

- 跑 `atomsyn-cli where` 看 dataDir, `find <dataDir>/atoms -name 'atom_exp_*.json' | wc -l` 速查
- 如果 atom 总数 < 5 **并且**用户正在做实质性 AI 任务: **不自动触发**, 只**简短问一句**:
  > "你的 atomsyn 看起来很空 (只有 N 条 atom), 要不要先 bootstrap 一下, 把硬盘里已有的笔记一次性倒进来?"
- 用户说"不用" → 立即闭嘴, 当前会话不再追问
- 用户说"好" → 进入下面工作流

### ❌ 不触发

- 用户在做日常 write / read / mentor 操作时 — bootstrap 不抢戏
- 用户库里已经有 ≥ 50 条 atom 时, 不再静默建议
- 闲聊 / 元问题 / 简单问答

---

## 工作流 (Agent-driven, 5 步)

### Step 0 · 启动前确认

1. 跑 `atomsyn-cli where` 拿到 dataDir, 让用户看一眼: "写入位置: `<dataDir>`"
2. 用 AskUserQuestion 确认范围:
   - 选项 A · "扫描 ~/Documents (常见 + 推荐起步)"
   - 选项 B · "我自己选目录 (一个或多个绝对路径)"
   - 选项 C · "放弃" → 退出, 不创建任何状态

### Step 1 · TRIAGE (扫盘列清单, cli 不调 LLM)

```bash
atomsyn-cli bootstrap --path <用户选的目录> --phase triage
# 多个目录: 重复 --path 即可
# 用户给了具体提示再加: --include-pattern "*.md,*.txt" / --exclude-pattern "node_modules/**"
```

cli 输出 markdown 表格 (文件类型 / 总数 / 大小 / 最近修改时间 + sensitive_skipped 列表). cli 内部**只读 metadata, 不读文件内容**, 不调 LLM.

如果用户根目录下有 `.atomsynignore`, 用 Read 读一眼让用户感知 ignore rules (cli 已自动应用, 不需要你重复过滤).

**关卡**: 用 AskUserQuestion:
- 选项 A · "范围对, 继续读文件" → 进入 Step 2
- 选项 B · "我要改 include/exclude" → 让用户给 pattern, 重跑 triage
- 选项 C · "看一下 sensitive_skipped 的具体文件" → 把 cli 的 stderr 列表给用户
- 选项 D · "放弃" → exit

### Step 2 · 你 (Agent) 自己读所有想读的文件

**关键**: cli 不会帮你读. 你用自己的工具读, 不要因为格式陌生就跳过.

| 格式 | 怎么读 |
|---|---|
| `.md` / `.txt` / `.json` / `.yaml` | Read 直接读 |
| `.pdf` | Read 直接读 (Claude Code Read 工具支持 PDF; Cursor / Codex 类似), 或 Bash `pdftotext <file> -` |
| `.docx` | Bash `pandoc -t plain <file>` 或 Read 直接读 (部分 Agent 原生支持) |
| `.xlsx` | Bash `xlsx2csv <file>` 或 `ssconvert <file> /dev/stdout` |
| `.pptx` | Bash `pandoc -f pptx -t plain <file>` |
| `.html` / `.epub` | Read 直接读 / Bash `pandoc -t plain` |
| 源代码 (`.py` / `.js` / `.ts` / 等) | Read 直接读, 关注 docstring / 顶部注释 / README |
| 历史 AI 聊天导出 (`.json` / `.md` / `.txt`) | Read 直接读 |
| `.xmind` / `.mmap` 等专有格式 | 尝试 unzip + 读 xml; 不行就跳, 在总结里告知用户 |
| 图片 / 音视频 | 跳过 (你不能直接处理), 在总结里列出 |
| 其他陌生格式 | 用你的判断: 能读就读, 不能读就跳, 跳之前在用户提示里告知 |

**目标**: 提取每个文件里**值得作为 atom 保留的核心洞察**. 不是逐字翻译, 是抽 1-3 个最有价值的 insight per file (有的文件可能 0 条, e.g. 只是 todo list).

**预算建议**: 单次会话处理 ≤ 50 个文件比较舒服; 超过 50 个先选最近 30 天修改的 + README/复盘类, 让用户决定是否分批跑.

### Step 3 · 生成 markdown 候选报告 (你输出, 不调 cli)

**核心**: 你不直接调 cli write. 你**先生成 markdown 报告**, 列出准备入库的所有候选 atom, 让用户审阅 + 删 + 改 + 加, 然后再调 cli write.

**报告格式**:

```markdown
# Bootstrap 候选报告

数据来源: <用户选的目录>
共扫描 N 个文件 (X 个跳过 — 见末尾"跳过列表"), 提取 M 个候选 atom

---

## 候选 1 / M: <name>
- **来源文件**: <文件相对路径>
- **insight (50-4000 字符)**: <核心洞察, 完整段落, 不抽象总结>
- **tags** (1-8 个): [tag1, tag2, ...]
- **role**: 产品 / 工程 / 设计 / 学习 / 研究 / ...
- **situation**: 复盘 / 决策关口 / 踩坑当下 / ...
- **activity**: 分析 / 验证 / 综合 / ...
- **insight_type**: 反直觉 / 方法验证 / 方法证伪 / 情绪复盘 / 关系观察 / 时机判断 / 原则提炼 / 纯好奇
- **原文片段** (≤ 200 字, 引用自原文): <原文片段>

## 候选 2 / M: ...

---

## 跳过列表

| 文件 | 原因 |
|---|---|
| photos/IMG_001.jpg | 图片格式, Agent 不处理 |
| backup.zip | 压缩包, 需要 unzip 后再扫 |
```

**告诉用户**:
> "上面是我从 N 个文件里抽出来的 M 个候选. 你可以告诉我:
> - '都对, 全部入库' → 直接调 cli write 入库剩下所有
> - '第 X / Y / Z 条删掉' → 删除指定候选, 入库剩下的
> - '第 X 条 tag 改成 [...]' → 修改指定候选
> - '第 X 条 insight 我重写' → 你重写, 我用你的版本
> - '放弃' → 不入库, 候选丢弃 (你的硬盘文件不动)
> 任何时候你可以中断, 我不会未经同意写库 (B-I3)."

**关卡**: 用 AskUserQuestion 确认.

### Step 4 · cli write --stdin 入库 (用户同意后才走)

对每个保留的候选, 构造完整 atom JSON (符合 atomsyn-write 的 schema, 见 atomsyn-write SKILL.md), 通过 cli 入库. 推荐**用临时文件 + `--input`** 而不是 echo pipe (避免 shell 转义错误):

```bash
# 1. 写到临时文件
cat > /tmp/atomsyn_bootstrap_atom_001.json <<'EOF'
{
  "name": "<候选 1 name>",
  "sourceContext": "<文件相对路径> · bootstrap from <session 日期>",
  "insight": "<完整 insight, 50-4000 字符>",
  "tags": ["tag1", "tag2"],
  "role": "产品",
  "situation": "复盘",
  "activity": "分析",
  "insight_type": "原则提炼",
  "stats": {
    "imported": true,
    "bootstrap_session_id": "<可选标识 e.g. boot_2026_04_28>",
    "useCount": 0,
    "usedInProjects": []
  }
}
EOF

# 2. 通过 cli 入库
atomsyn-cli write --input /tmp/atomsyn_bootstrap_atom_001.json
```

**重要约束**:
- `stats.imported = true` 让 cognitive-evolution 的 staleness 兜底生效 (createdAt 兜底, 防"刚 import 立即 stale")
- `confidence` 不传 (write 模式由 cli 自动填; ingest 模式才有 confidence; 见 atomsyn-write SKILL.md)
- 一次循环一条 atom, 失败就跳到下一条 (cli 报错 stderr 给用户看), 整批跑完后总结 N 写入 / M 失败
- 如果 cli stdout 含 `collision_candidates`, 走 atomsyn-write SKILL.md Step 3.4 的处理逻辑 (用 AskUserQuestion 让用户裁决)

**v1 限制**: agent-driven 模式不写 profile atom (cli 当前 `write --kind=profile` 不支持, D-009 后果). profile 留给 GUI Wizard 路径或用户手动校准. 如果用户问"画像在哪", 告诉他:
> "v1 agent-driven bootstrap 仅写经验 atom (experience). 你的画像 (profile) 可以在 atomsyn 桌面应用的 ProfilePage 手动建/校准, 或通过 GUI 的 Bootstrap 向导 (Settings → 高级) 自动生成. v2 视反馈再考虑给 cli 加 write-profile 命令支持 agent-driven 写 profile."

### Step 5 · cli reindex + 引导用户

```bash
atomsyn-cli reindex
```

reindex 重建 `<dataDir>/index/knowledge-index.json`, 让 atomsyn-read / atomsyn-mentor / GUI 立即看到新 atom.

**最后告知用户**:
> "✅ Bootstrap 完成! 写入 N 条 experience atom 到 `<dataDir>/atoms/experience/`. 索引已重建. 跳过 X 条 (见上)."
>
> "下一步:
> - 在桌面应用打开 Atlas 页, 看新 atom 进入双骨架
> - 在 Cursor / Claude Code 起新会话, 问相关问题, atomsyn-read 会自然召回这些 atom
> - 如果有不准的 atom, 在桌面应用直接 edit / archive
> - 画像 (profile) 可以在 ProfilePage 手动建立"

---

## 4 条不可变承诺 (Iron Promises)

- **B-I1 · 永不绕过 cli write**: 写 atom 必须通过 `atomsyn-cli write --stdin` 或 `--input <file>`, 不直接 Write atom JSON 到 disk (会绕过 schema 校验 + collision 检测 + 索引重建)
- **B-I2 · 两步协议 (Agent-driven 版本)**: Step 3 先 markdown 报告 (用户审阅) → Step 4 cli write (用户同意后才写). 即使用户说"快点全入库", 也必须先报告再写
- **B-I3 · 用户主权**: 任何写入前用 AskUserQuestion 等用户确认, 用户说"放弃" → 立即停止, 当前会话不再追问
- **B-I4 · 隐私边界**: 强敏感关键字 (`sk-...` / `api_key=...` / `BEGIN PRIVATE KEY` / `.pem` / `.key` 文件) 整文件跳过, 弱敏感 (email / phone / 身份证号) 在 atom JSON 里 redact (用 `<redacted>` 占位)

---

## 反模式 (绝对不要)

❌ **调 `atomsyn-cli bootstrap --phase sampling/deep-dive/commit`** — 那是 GUI Wizard 用的, 你不需要 (D-008)
❌ **因为不熟悉文件格式就跳过** — 先尝试 Read / Bash + 标准工具 (pandoc / pdftotext / xlsx2csv) 转换. SKILL.md 没有"v1 仅支持 X 格式" 的限制 (D-009)
❌ **把每个文件压缩成一个 atom** — 一个文件常含多个洞察, 拆成多条比"一文件一 atom" 更有未来召回价值
❌ **自己 Write 文件到 `<dataDir>/atoms/`** — 必须通过 cli write
❌ **跳过 Step 3 markdown 报告直接 write** — 违反 B-I2 两步协议
❌ **静默触发后用户说"不用"还反复劝** — 礼貌闭嘴
❌ **假装自己已经处理完了** — 真正写入要走 cli, cli 报错就告诉用户实情, 不要假报"已入库"

---

## 错误处理速查

| 情况 | 怎么办 |
|---|---|
| `atomsyn-cli where` 显示 dataDir 不存在 | 告诉用户 "Atomsyn 数据目录未初始化, 先打开桌面应用一次创建数据目录" |
| `bootstrap --phase triage` 路径不存在 (exit 2) | 让用户检查路径 |
| 单个文件 read 失败 (PDF 损坏 / 编码错误等) | 跳过该文件, 在最终总结里列入"跳过列表" |
| `cli write` schema 校验失败 (e.g. insight 太短 / tags 太多) | stderr 给用户看, 当前 atom 跳过, 继续下一条 |
| `cli write` 返回 `collision_candidates` | 走 atomsyn-write SKILL.md Step 3.4: AskUserQuestion 三选一 (保留并存 / supersede / 丢弃新建) |
| 用户主动 Ctrl-C | 优雅停止, 已写入的 atom 保留 (它们已通过 schema 校验, 是合法 atom) |
| `cli reindex` 失败 (exit 1) | 警告用户但不阻塞: "atom 已写入, 但索引重建失败. 请稍后手动跑 atomsyn-cli reindex 或重启桌面应用" |

**核心原则**: 失败要诚实告诉用户, 不要假报成功. 真实情况比"看起来完成了"重要.

---

## 与其他 atomsyn skill 的协作

| Skill | 角色 | 与 bootstrap 的关系 |
|---|---|---|
| **atomsyn-bootstrap** (本 skill) | 冷启动批量入库 | Step 4 内部调 `cli write` 复用 atomsyn-write 的 schema 契约 |
| **atomsyn-write** | 单点沉淀 (单 atom) | 与本 skill 共享 atom JSON schema; collision 处理逻辑沿用 Step 3.4 |
| **atomsyn-read** | 检索召回 | bootstrap 完成后用户立即享受 read 召回新 atom (atomsyn-read SKILL.md 自动消费) |
| **atomsyn-mentor** | 复盘教练 | bootstrap 大批量入库后, mentor 报告会从"数据不足"变成"已积累 N 条 in X 领域" |

---

## v1 已知限制 (v2+ 视反馈再放开)

- **agent-driven 模式不写 profile** (D-008/D-009 后果) — profile 仅在 GUI Wizard 或用户手动校准
- **文件格式覆盖 = 你 (Agent) 的能力** — 上限取决于用户机器装的工具 (pandoc / pdftotext / xlsx2csv 等). 这是**特性不是 bug**: 我们不限制你
- **没有断点续传** — 中途 Ctrl-C 后已 write 的 atom 保留, 但当前会话状态丢失, 下次重头跑 (Step 1 triage 可重跑成本极低)
- **没有跨会话 dedup** — 同一份文件跑两次 bootstrap 会重复入库 (但 cli 的 `collision_candidates` 会警告用户)
- **不处理图片 / 音视频** — Agent 能力边界

---

**来源**: 这个 SKILL.md 是 chat-as-portal change (D-008/D-009/D-010) 的产物, 完全基于"外部 Agent 视角" 重写, 与之前 bootstrap-tools v2 的"cli 自带 LLM" 模式有意识地分离 (cli 自带 LLM 模式仍为 GUI Wizard 服务, 见 D-001 of chat-as-portal). 完整背景见 `openspec/archive/2026/04/2026-04-chat-as-portal/` (本 change 归档后).
