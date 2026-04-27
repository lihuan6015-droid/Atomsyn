# Design · 2026-04-bootstrap-tools

> **上游**: `proposal.md` (本目录) · `openspec/archive/2026/04/2026-04-bootstrap-skill/` (v1) · `docs/framing/v2.x-north-star.md`
> **状态**: draft
> **最后更新**: 2026-04-27

---

## 1 · 系统视图 (System View)

当前系统 (bootstrap-skill v1 已合并) — 与本 change 相关的部分:

```mermaid
graph LR
  user[用户] -->|点初始化向导| wizard[BootstrapWizard 5 屏]
  user -->|/read /write /mentor| chatInput[ChatInput / 命令]

  wizard -->|dialog.open<br/>directory:true<br/>multiple:false| pickedDir[(单目录)]
  pickedDir -->|CLI 命令拷贝| terminal[终端]
  terminal -->|atomsyn-cli bootstrap --dry-run| cli[atomsyn-cli bootstrap]

  cli -->|TEXT_EXTS<br/>.md/.txt/.json/.py/...<br/>不含 .docx/.pdf| triage[triage.mjs]
  triage --> sampling[sampling.mjs<br/>1 LLM call]
  sampling --> deepDive[deepDive.mjs<br/>硬编码 5 层 funnel<br/>per-file LLM call]
  deepDive --> session[(session.json + .md)]

  subgraph problemArea[当前痛点]
    docxPdf[.docx / .pdf 全跳过]
    mixedDir[10000 文件混合目录<br/>低价值 .pyc 浪费 token<br/>不知道 中文目录 优先级]
    noChatEntry[/bootstrap/ 命令缺失]
    sevenSteps[7 步操作链]
  end

  triage -.miss.-> docxPdf
  deepDive -.dumb scan.-> mixedDir
  chatInput -.no /bootstrap.-> noChatEntry
  wizard -.tedious.-> sevenSteps
```

## 2 · 目标设计 (Target Design)

```mermaid
graph LR
  user[用户] -->|/bootstrap path| chatInput[ChatInput / 命令<br/>新增 /bootstrap]
  user -->|粘贴本地路径| chatInput
  user -->|点初始化向导| wizard[BootstrapWizard<br/>支持文件 + 目录混选]

  wizard -->|dialog<br/>multiple:true<br/>directory or filters| picked[(N 个文件 / 目录)]
  chatInput -->|预填 path| wizard

  picked --> cli[atomsyn-cli bootstrap<br/>--mode agentic 默认]

  cli --> triage[triage.mjs<br/>新 extractor 链]
  triage --> extractors[extractors/<br/>md / docx / pdf / code / text<br/>新增]
  extractors --> sampling[sampling.mjs 不变]
  sampling --> agentic[agentic.mjs<br/>LLM tool-use loop<br/>新增]
  agentic <-.tool calls.-> agentTools[agentTools.mjs<br/>ls / glob / grep / stat / read<br/>新增]
  agentic --> session[(session.json<br/>+ agent_trace[]<br/>+ .md)]

  fallback[deepDive.mjs<br/>v1 funnel 保留<br/>--mode funnel] -.fallback.-> session

  classDef new fill:#dbeafe,stroke:#3b82f6
  class extractors,agentic,agentTools,picked new
```

核心变化 (蓝色高亮):

1. ChatInput / 命令面板加 `/bootstrap [path]`
2. ChatInput 粘贴检测 → 智能识别绝对路径 → 弹出 bootstrap 提示
3. BootstrapWizard dialog 改为多选 + 文件/目录混合 (filters 含 .docx/.pdf)
4. extractors/ 目录拆解 5 个文档处理器 (md/docx/pdf/code/text)
5. agentTools.mjs 提供 5 个原子工具供 LLM tool-use
6. agentic.mjs 替换硬编码 funnel 的 LLM 探索循环 (默认模式)
7. funnel 保留为 `--mode funnel` fallback

## 3 · 关键流程 (Key Flows)

### 3.1 流程 A · `/bootstrap` 命令触发 + 路径预填

```mermaid
sequenceDiagram
  participant user as 用户
  participant input as ChatInput
  participant palette as SkillCommandPalette
  participant wizard as BootstrapWizard
  participant store as useBootstrapStore

  user->>input: 输入 "/"
  input->>palette: setShowPalette(true)
  palette-->>user: 显示 4 个命令<br/>/read /write /mentor /bootstrap
  user->>palette: 选 /bootstrap
  palette->>store: open()
  palette->>wizard: setWizardOpen(true)
  Note over wizard: 直接打开向导, 不填入文本

  alt 用户输入 "/bootstrap ~/Documents/X"
    user->>input: 完整命令 + 回车
    input->>store: open() + addPath('~/Documents/X')
    input->>wizard: setWizardOpen(true)
    Note over wizard: 预填 paths, 跳到 triage 屏
  end
```

### 3.2 流程 B · 路径粘贴智能识别

```mermaid
sequenceDiagram
  participant user as 用户
  participant input as ChatInput
  participant detector as 路径检测器
  participant banner as PathDetectionBanner
  participant wizard as BootstrapWizard

  user->>input: paste "/Users/circlelee/Documents/开发过程资料"
  input->>detector: 检测 absolutePath?
  detector-->>input: true (匹配 /^[/~]/)
  input->>banner: 弹出小提示<br/>"检测到本地路径, 是否启动 bootstrap?"
  alt 用户接受
    user->>banner: 点 "导入"
    banner->>wizard: open + 预填 path
  else 用户 dismiss
    user->>banner: 点 X
    banner-->>banner: 隐藏 + 持久化 dismiss 标记<br/>(避免反复弹)
  end
```

### 3.3 流程 C · agentic mode 的 LLM tool-use loop

```mermaid
sequenceDiagram
  participant cli as atomsyn-cli bootstrap --mode agentic
  participant agentic as agentic.mjs
  participant llm as LLM (Anthropic / OpenAI)
  participant tools as agentTools.mjs
  participant session as session.json

  cli->>agentic: runAgenticDeepDive(paths, hypothesis)
  agentic->>llm: chatWithTools(<br/>system: '你是文档探索 agent',<br/>user: paths + hypothesis,<br/>tools: [ls, glob, grep, stat, read])

  loop 直到 LLM 输出 final markdown 或达到上限
    llm-->>agentic: tool_use(ls, '/Users/.../资料')
    agentic->>tools: ls('/Users/.../资料')
    tools-->>agentic: ['10月材料/', 'Langgraph调试日志/', 'UI设计/', ...]
    agentic->>session: trace.push({tool:'ls', args, result_summary})
    agentic->>llm: tool_result(ls 输出)

    llm-->>agentic: tool_use(glob, '**/*.{md,docx,pdf}', 'Langgraph调试日志/')
    agentic->>tools: glob(pattern, root)
    tools-->>agentic: 12 个文件路径
    agentic->>llm: tool_result(file list)

    llm-->>agentic: tool_use(read, 'Langgraph调试日志/2024-12-bug-trace.md')
    agentic->>tools: read(file) [extractor 链]
    tools-->>agentic: extracted text (privacy redacted)
    agentic->>llm: tool_result(text)

    Note over llm: LLM 决定: 这个文件值得进 markdown 候选
    llm-->>agentic: 部分 markdown 输出 + 继续 tool_use
  end

  llm-->>agentic: 完成: 全量 dry-run markdown<br/>(沿用 v1 commit.md 兼容格式)
  agentic->>session: 写 markdown + agent_trace
  agentic-->>cli: 返回, 进入 dry-run 完成态
```

### 3.4 流程 D · extractor 链统一调度

```mermaid
sequenceDiagram
  participant tools as agentTools.read(file)
  participant index as extractors/index.mjs
  participant md as extractors/markdown.mjs
  participant docx as extractors/docx.mjs
  participant pdf as extractors/pdf.mjs
  participant code as extractors/code.mjs
  participant priv as privacy.mjs

  tools->>index: extract(filePath)
  index->>index: 看扩展名分发
  alt .md / .markdown
    index->>md: 读 + frontmatter 解析
    md-->>index: {text, meta}
  else .docx
    index->>docx: mammoth.convertToText
    docx-->>index: {text, meta}
  else .pdf
    index->>pdf: pdfjs.getDocument + extractText (前 N 页)
    pdf-->>index: {text, meta}
  else .py / .ts / 其他源代码
    index->>code: 直接 readFile + 截断
    code-->>index: {text, meta}
  else 未支持扩展名
    index-->>tools: { skipped: true, reason: 'unsupported' }
  end

  index->>priv: redactWeakInText(text)
  alt isStrongSensitive
    priv-->>tools: { skipped: true, reason: 'strong-sensitive' }
  else
    priv-->>tools: { text: redacted, meta }
  end
```

## 4 · 数据模型变更 (Data Model Changes)

### 4.1 受影响的 schema (additive)

| 文件 | 变更类型 | 摘要 |
|---|---|---|
| `~/.atomsyn/bootstrap-sessions/<id>.json` (session schema) | additive | 新增 `agent_trace[]` (可选) + `mode: 'agentic'\|'funnel'` |
| `scripts/lib/bootstrap/session.mjs::createSession` | additive | init session 时设置 mode + 空 agent_trace |
| extractor 输出 schema | new | `{ text, meta, skipped?, reason? }` 统一返回 |
| BootstrapWizard 路径状态 | additive | useBootstrapStore.paths 接受 file 路径 (不只是 dir) |

### 4.2 字段 diff

```diff
// session.json
{
  "id": "boot_xxx",
  "status": "...",
  "paths": [...],
  "options": {
+    "mode": "agentic",  // 默认 'agentic', 兜底 'funnel'
    ...
  },
+ "agent_trace": [
+   {
+     "ts": "ISO",
+     "tool": "ls" | "glob" | "grep" | "stat" | "read",
+     "args": { ... },
+     "result_summary": "12 entries; 3 dirs",
+     "duration_ms": 23
+   }
+ ],
  ...
}
```

`agent_trace` 是 sessionId 级 (每次 bootstrap run 都重置), 不汇入 `data/growth/usage-log.jsonl`。

### 4.3 旧数据兼容

- v1 session JSON: `mode` / `agent_trace` 缺失 → loader 默认 `mode='funnel'`, `agent_trace=[]`, GUI 不报错
- v1 ProfileAtom / ExperienceAtom 等: 无任何变更
- BootstrapWizard 在打开 v1 session 时显式标 "v1 funnel session"

## 5 · 接口契约 (Interface Contracts)

### 5.1 atomsyn-cli (CLI)

新增 1 个 flag, 不破坏现有签名:

```
atomsyn-cli bootstrap --path <p> [...其他 v1 flag]
                     [--mode agentic|funnel]   # 新增, default agentic
```

stdout/stderr/退出码与 v1 一致。dry-run / commit / resume 协议不变。

### 5.2 数据 API (Vite + Tauri 双通道)

无新端点。`GET /bootstrap/sessions/:id` 返回 body 自动包含新增 `agent_trace[]` 字段 (additive)。

### 5.3 ChatInput

新组件:
- `<PathDetectionBanner>` (浮于 ChatInput 上方, 检测到路径时触发)
- 修改 `<SkillCommandPalette>` COMMANDS 加 `/bootstrap`
- 修改 `<ChatInput>::handleChange + onPaste` 实现路径检测

新事件:
- `window.dispatchEvent(new CustomEvent('atomsyn:open-bootstrap', { detail: { paths: [...] } }))` — ChatPage 监听后打开 Wizard

### 5.4 agentTools.mjs (新模块)

```js
// scripts/lib/bootstrap/agentTools.mjs
export function createAgentTools({ sandboxRoots, onTrace }) {
  return {
    ls:   async (path)             => { ... },     // ≤ 200 entries
    stat: async (path)             => { ... },
    glob: async (pattern, root)    => { ... },     // ≤ 500 matches
    grep: async (pattern, file)    => { ... },     // ≤ 50 lines, ≤ 16KB scan
    read: async (file, opts={})    => { ... },     // ≤ 16KB, extractor 链
  }
}
```

约束 (硬上限):
- 所有路径必须落在 `sandboxRoots` (用户在 paths 里给的根) 之内, 否则抛 `SANDBOX_VIOLATION`
- `read` 走 extractors/ + privacy 链, 不绕过敏感扫描
- 每次工具调用通过 `onTrace` 回调记录到 `agent_trace[]`
- 全部工具同步串行, 不并发 (避免 race)

### 5.5 agentic.mjs (新模块)

```js
// scripts/lib/bootstrap/agentic.mjs
export async function runAgenticDeepDive({
  paths,
  hypothesis,
  llmConfig,
  fetchImpl,
  session,         // 用于 trace 写入
  maxLoops = 30,
  maxTokens = 100_000,
}) {
  // 1. 构造工具集 (sandbox = paths)
  // 2. 构造 system prompt (引用 prompts/agentic-deepdive.md)
  // 3. tool-use loop:
  //    - chatWithTools(system, user, tools, currentMessages)
  //    - while resp.stop_reason === 'tool_use':
  //         executeTool + push tool_result + 累计 token
  //         if loops >= max OR tokens >= max: break
  //    - 解析最终 assistant text 为 dry-run markdown
  // 4. 返回 { markdown, profile_snapshot, atomCandidatesCount }
}
```

### 5.6 llmClient.mjs 扩展

```js
// scripts/lib/bootstrap/llmClient.mjs
export async function chatWithTools({ system, messages, tools, config, fetchImpl, maxTokens }) {
  // 双分支: Anthropic /v1/messages with tools, OR OpenAI /chat/completions function_call
  // 返回归一化结构: { stop_reason: 'end'|'tool_use', content: [...], toolCalls: [{id, name, input}] }
}
```

## 6 · 决策矩阵 (Decision Matrix)

| # | 决策点 | 选项 | 选哪个 | 为什么 |
|---|---|---|---|---|
| D1 | agentic 默认 vs opt-in | A 默认 / B opt-in | **A 默认** (D-001) | v1 funnel 在真实混合目录效果差是已知 bug; agentic 是真正解决方案 |
| D2 | 路径粘贴智能识别 | A 全自动弹 / B 右键菜单 | **A 全自动 + dismiss 持久化** (D-002) | 半自动用户发现率低, 全自动加 dismiss 兜底心理阻力 |
| D3 | agent_trace 落地 | A 入 usage-log / B 仅 session | **B 仅 session** (D-003) | trace 是 session 级, usage-log 是用户级, 不应混 |
| D4 | docx/pdf 解析库 | mammoth + pdfjs-dist / 全自研 / Python 子进程 | **mammoth + pdfjs-dist** (D-004) | 纯 JS, 无外部依赖, 在 Tauri 打包内可用 |
| D5 | LLM tool-use 协议 | 仅 Anthropic / 仅 OpenAI / 双分支 | **双分支** (D-005) | 现有 llmClient 已双分支, 沿用 |
| D6 | 工具沙箱粒度 | path-prefix / glob 白名单 / 无沙箱 | **path-prefix (sandboxRoots)** (D-006) | 简单可控; 用户 paths 即沙箱 |
| D7 | Tauri scope 扩展范围 | $HOME/** / Documents+Downloads+Desktop / 用户配置 | **Documents+Downloads+Desktop** (D-007) | 平衡: 覆盖 90% 场景, 不开 ~/** 隐私缺口 |
| D8 | v1 funnel 是否删除 | 删 / 留 fallback | **留 `--mode funnel`** (D-008) | v2 dogfood 期为安全; 6 个月后视情况删 |
| D9 | tool-use loop 上限 | 仅轮数 / 仅 token / 双重 | **双重 (30 轮 + 100k token)** (D-009) | 单一上限要么太松要么太紧 |

## 7 · 安全与隐私

### 7.1 数据流向

```
用户硬盘 (~/Documents 等)
   ↓ agentTools.read 走 extractor 链
extractors/ → privacy.scanText → redactWeakInText
   ↓ 内容片段 (≤ 16KB / 文件)
LLM API (用户配置的)
   ↓ tool_use → 主程序 → 下一轮 LLM
最终: dry-run markdown (人类可读)
```

### 7.2 敏感字段处理 (复用 v1)

- 强敏感 (sk-* / password= / -----BEGIN PRIVATE KEY-----): extractor 输出后 privacy.scanText 命中 → `read` 返回 `{ skipped: true, reason: 'strong-sensitive' }`, LLM 看不到该文件
- 弱敏感 (email / phone): redactWeakInText 替换为 `[REDACTED-XXX]`
- agentTools.glob / ls 返回的路径名仍可能含敏感字 (e.g. `~/AAPL Q4-财报-secret.pdf`), 这部分**不脱敏** (路径名是 LLM 探索的必要信息); 文档化告诉用户敏感命名要进 .atomsynignore

### 7.3 沙箱隔离

- 所有工具调用 normalize path → 检查 startsWith(sandboxRoots[i])
- 拒绝 `..` 跨界 (e.g. `read('~/.ssh/id_rsa')` 即使 sandboxRoots 含 ~/Documents 也拒)
- LLM 在 system prompt 里被告知沙箱边界, 减少误调

### 7.4 LLM tool-use 隐私边界

- 给 LLM 的 system prompt 不含用户绝对路径完整字符串 (替换为相对 sandbox root)
- 给 LLM 的 tool_result 是已 redact 的内容 + 路径相对化
- agent_trace 落地时也是相对路径 + result_summary (不存全部 read 内容, 否则 session.json 会爆)

## 8 · 性能与规模

| 维度 | v1 baseline | v2 目标 | 备注 |
|---|---|---|---|
| 1000 文件目录 dry-run 耗时 | 30 min (串行) | ≤ 20 min | LLM 主动跳过低价值 |
| 4437 文件 (开发过程资料 fixture) | 估 130 min | ≤ 45 min | LLM 跳过 .pyc / .jpg / 重复 |
| LLM 调用次数 | 1 + N (N=文件数) | 1 + 5~30 (loop 次数) | tool-use 大幅减少调用 |
| LLM 总 token | ~10M (1000 文件) | ≤ 100k (硬上限) | 用户预算可控 |
| session.agent_trace 大小 | n/a | ≤ 200 entries × ~500 bytes = 100KB | 单 session 文件控制 |
| extractor 单文件解析时延 | n/a | .docx ≤ 200ms / .pdf ≤ 1s (前 5 页) / .md ≤ 10ms | mammoth + pdfjs 实测 |
| Tauri scope 扩展 fs 调用开销 | n/a | 0 (仅是权限边界) | scope 是静态配置 |

## 9 · 可观测性

- **session.agent_trace**: 完整 LLM 决策回放
- **dry-run markdown 报告**新增章节: "Agent 探索轨迹 (X 次工具调用 / Y 个文件被读 / Z 个被跳过)"
- **GUI Wizard dryrun 屏**新增折叠 "查看 Agent 探索 timeline" 控件 (默认折叠, 节省视觉)
- **usage-log 事件** (复用 v1):
  - `bootstrap.started` (含 mode)
  - `bootstrap.phase_completed` (含 mode + agent_trace 长度)
  - `bootstrap.commit_completed`
- **失败回退**:
  - LLM tool_use 协议错误 → fallback 到 funnel mode 自动重试一次, 保留双 session
  - LLM 反复 tool 调用不进 markdown (loop 卡死) → 30 轮强制退出, dry-run markdown 标记 "agent loop exhausted, partial result"

## 10 · 兼容性与迁移

| 场景 | 处理方式 |
|---|---|
| v1 用户已有 session JSON | 自动 lazy 补 mode='funnel' + agent_trace=[]; GUI 显示 "v1 session" tag |
| v1 用户重新跑 bootstrap | 默认走 v2 agentic; 想用旧行为 `--mode funnel` |
| v1 装 v2 后 schema 校验 | additive 字段全部 optional, 旧 session 全过 |
| extractor 解析失败 (损坏文件) | 进 phase3_skipped[], 不阻塞 |
| LLM tool-use 不支持 (老模型) | 自动 fallback funnel + WARN 提示用户升级模型 |

## 11 · 验证策略

### 自动化测试 (G 组)

- **G1**. extractors 单元测试 (`tests/bootstrap/extractors.test.mjs`):
  - md fixture / docx fixture (sample 含表格 + 图片 alt) / pdf fixture (sample 含中文 + 多页) / 中文文件名 NFC normalize
- **G2**. agentTools 沙箱单元测试: 跨界 path 拒绝 / 中文路径 / 大文件截断 / read 走 extractor 链
- **G3**. agentic loop mock 测试: 用 mock LLM 模拟 tool_use 序列, 验证 loop 终止条件 / token 计数 / fallback
- **G4**. e2e dry-run (LLM 真调): 在 fixture `tests/fixtures/bootstrap-mixed/` 跑 `--mode agentic`, 验证 markdown 含预期候选 + agent_trace 非空 + 无沙箱越界
- **G5**. e2e commit + resume: 复用 bootstrap-skill v1 commit 路径, 验证 v2 markdown → v1 commit prompt 兼容
- **G6**. v1 → v2 兼容性: v1 session JSON load + `--mode funnel` 走通

### Dogfood (主 agent 一次, 用户实机一次)

- **G7**. `~/Documents/开发过程资料/` (4437 文件) 跑 `--mode agentic` dry-run, 测目标:
  - ≥ 80% 候选来自 `.md/.txt/.docx/.pdf`, 不含 .pyc / .jpg
  - agent_trace 中 LLM 优先选了 "我的研究" / "Langgraph调试日志" 等高语义子目录
  - 总耗时 ≤ 45 min (proposal §6 指标 4)
- **G8**. 6 个 dogfood 场景 (v1 G5 残留, 复用 v1 design §11):
  1. 串行模式产出充分性
  2. 性能基准
  3. 数据流通到 mentor
  4. 隐私零泄漏 (sk-* fixture)
  5. Phase 中断 + resume
  6. 重复 bootstrap 去重

### V 组 (跨任务回归)

- V1. `npm run build` ✓
- V2. `npm run lint` ✓
- V3. `cargo check` ✓ (capabilities 改了)
- V4. `npm run reindex` ✓
- V5. v1 12 项手动验证 (E4/E5/V5/V10) — 用户实机
- V6. ChatInput / 命令面板 4 个命令 (含 /bootstrap) UI 走通
- V7. light + dark 主题 (PathDetectionBanner / agent_trace timeline 新增)

## 12 · Open Questions

- [ ] OQ-1 · agentic 默认 vs opt-in (主 agent 倾向默认, 待用户拍板) → **见 D-001, 已决**
- [ ] OQ-2 · 路径粘贴检测全自动 vs 半自动 (主 agent 倾向全自动 + dismiss) → **见 D-002, 已决**
- [ ] OQ-3 · agent_trace 是否对接 usage-log (主 agent 倾向不对接) → **见 D-003, 已决**
- [ ] OQ-4 · 12 项 v1 残留分配 → **本 change § 10 proposal 表已分配, 8 自动 + 4 手动**
- [ ] OQ-5 · agentic system prompt 风格 (Cursor 式探索 vs 强结构化指令) → 实施前 1 周 spike, 由主 agent 决
- [ ] OQ-6 · 中文目录名是否需要 LLM-side 翻译辅助 (e.g. tell LLM "Langgraph调试日志 means Langgraph debug log") → 实施时 dogfood 看效果再定
