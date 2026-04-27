# Tasks · 2026-04-bootstrap-tools

> **怎么用**: 实施时按分组从上到下推进。每勾掉一个 task 提交一次 commit, commit message 引用本 change-id。可按 cognitive-evolution 模式 bundled 紧耦合任务。
>
> **状态**: draft
>
> **强依赖**:
> - `openspec/archive/2026/04/2026-04-cognitive-evolution/` (已合并)
> - `openspec/archive/2026/04/2026-04-bootstrap-skill/` (将在本 change 完成后归档)

---

## A · 文档解析层 (extractors/)

- [ ] A1. 新建 `scripts/lib/bootstrap/extractors/` 目录 + `index.mjs` 调度器骨架 (按扩展名分发, 默认 fallback 到 text)
- [ ] A2. `extractors/markdown.mjs` — 现有 .md / .markdown 处理逻辑迁移过来 (含 frontmatter 解析), 输出 `{text, meta}`
- [ ] A3. `extractors/code.mjs` — `.ts/.tsx/.js/.jsx/.mjs/.cjs/.py/.rs/.go/.java/.kt/.swift` 等源代码处理, 头部 + 尾部 + 重要 export 截断逻辑
- [ ] A4. `extractors/text.mjs` — `.txt/.json/.jsonl/.yaml/.yml/.toml/.ini/.cfg/.conf/.sh/.bash/.zsh/.fish/.sql/.html/.css/.scss/.less` 通用文本
- [ ] A5. **新增** `extractors/docx.mjs` — 引入 `mammoth`, 调 `convertToHtml` + 转纯文本 (or `extractRawText`); 含图片 alt 文本
- [ ] A6. **新增** `extractors/pdf.mjs` — 引入 `pdfjs-dist`, 提前 5 页文本 + 文档元数据 (作者 / 标题); 加密 PDF 跳过
- [ ] A7. `package.json` 加 `mammoth` + `pdfjs-dist` 依赖, 跑 `npm install`, 提交 `package-lock.json`
- [ ] A8. 修改 `triage.mjs` TEXT_EXTS 集合: 加 `.docx / .pdf`; 替换内联 readFile 为 `extractors.extract(filePath)` 调用
- [ ] A9. extractor 输出统一 schema: `{ text: string, meta: object, skipped?: boolean, reason?: string }`
- [ ] A10. extractor 链对 v1 已支持扩展名输出与 v1 一致 (回归)

## B · ChatInput 入口扩展

- [ ] B1. 修改 `src/components/chat/SkillCommandPalette.tsx` COMMANDS 数组加第 4 项 `/bootstrap` (icon: Sparkles, label: "导入硬盘文档", description: "把存量笔记 / 文档 / 历史聊天导入 Atomsyn")
- [ ] B2. ChatPage 监听 `/bootstrap` 选择: 导入 useBootstrapStore + 直接 setWizardOpen(true), 不只填入文本
- [ ] B3. 实现 `/bootstrap <path>` 语法解析 (在 ChatInput.handleSend 中拦截以 `/bootstrap ` 起始的消息): 提取 path → store.addPath → setWizardOpen(true) + 跳到 paths screen
- [ ] B4. 新建 `src/components/chat/PathDetectionBanner.tsx` — 浮于 ChatInput 上方的小提示, 检测到本地路径时弹出 + dismiss 按钮 + "记住选择" toggle (持久到 localStorage `atomsyn:bootstrap-paste-dismissed`)
- [ ] B5. 修改 `src/components/chat/ChatInput.tsx` 加 `onPaste` handler: 识别绝对路径 regex (`^[/~]/[^\s]+$` macOS, `^[A-Z]:\\` Windows), 触发 PathDetectionBanner
- [ ] B6. `BootstrapWizard PathsScreen` 修改 `dialog.open()`: `multiple: true` (允许多选目录) + 新增第 2 个按钮 "选具体文件" 用 `directory: false, multiple: true, filters: [{name: '文档', extensions: ['md', 'markdown', 'txt', 'docx', 'pdf', 'json', 'yaml']}]`
- [ ] B7. 接受用户混选: store.paths 既可含目录也可含文件 (CLI 端 triage 兼容已是 path-list)
- [ ] B8. 视觉验收 light + dark 双模式 (新组件 PathDetectionBanner)

## C · Agent 工具集 (核心)

- [ ] C1. 新建 `scripts/lib/bootstrap/agentTools.mjs` 骨架 + `createAgentTools({ sandboxRoots, onTrace })` 工厂
- [ ] C2. 实现 `ls(path)` — 列子目录 + 文件名 (≤ 200 entries), 中文路径 normalize NFC
- [ ] C3. 实现 `stat(path)` — 大小 / 修改时间 / 类型
- [ ] C4. 实现 `glob(pattern, root)` — 用 [picomatch](https://github.com/micromatch/picomatch) 或自实现 (≤ 500 matches)
- [ ] C5. 实现 `grep(pattern, file)` — 文件内 regex 匹配 (≤ 50 lines, ≤ 16KB scan)
- [ ] C6. 实现 `read(file, opts)` — 走 `extractors/index.mjs` + privacy.scanText 链 (≤ 16KB, 含 redact)
- [ ] C7. 实现沙箱保护: 所有路径必须 startsWith(sandboxRoots[i]); 拒绝 `..` 越界, 抛 `SANDBOX_VIOLATION`
- [ ] C8. 单元测试 `tests/agentTools.test.mjs`: 沙箱越界 / 中文路径 / 大文件截断 / read 走 extractor

## D · agentic loop

- [ ] D1. 扩展 `scripts/lib/bootstrap/llmClient.mjs` 加 `chatWithTools({ system, messages, tools, config, fetchImpl, maxTokens })` (Anthropic + OpenAI 双分支, 归一化 stop_reason / toolCalls)
- [ ] D2. 新建 `scripts/lib/bootstrap/agentic.mjs::runAgenticDeepDive` — tool-use loop 主体
- [ ] D3. 新建 `scripts/bootstrap/prompts/agentic-deepdive.md` — system prompt: 解释 5 工具用法 / 探索策略提示 / 输出 markdown 要求 (兼容 v1 commit.md schema)
- [ ] D4. loop 控制: `maxLoops=30` + `maxTokens=100000` + 每轮检查 token 累计
- [ ] D5. 失败回退: tool 协议错误 / 卡死 → fallback 自动重试 1 次 funnel mode + WARN
- [ ] D6. 统一 `agent_trace[]` 字段写入 (per tool call: `{ ts, tool, args, result_summary, duration_ms }`)
- [ ] D7. 修改 CLI `atomsyn-cli.mjs::cmdBootstrap` 加 `--mode agentic|funnel` (default agentic)
- [ ] D8. 修改 session.mjs `createSession` 接受 mode + agent_trace 字段

## E · Tauri scope + GUI 显示

- [ ] E1. 修改 `src-tauri/capabilities/default.json` fs:scope 加 `$HOME/Documents/**` + `$HOME/Downloads/**` + `$HOME/Desktop/**`
- [ ] E2. 跑 `cargo check` 通过
- [ ] E3. BootstrapWizard `DryrunScreen` 新增折叠 "查看 Agent 探索 timeline" (default 折叠), 渲染 `agent_trace[]` 为时间序列
- [ ] E4. dry-run markdown 报告生成器 (commit.mjs::renderDryRunMarkdown 或新增 agentic 等价函数) 加 "Agent 探索轨迹" 章节: tool 调用计数 + 选取的高价值文件 vs 跳过文件统计

## F · 文档与契约

- [ ] F1. 更新 `openspec/specs/cli-contract.md`: bootstrap 子命令章节加 `--mode agentic|funnel`, changelog 追加
- [ ] F2. 更新 `openspec/specs/skill-contract.md`: atomsyn-bootstrap SKILL.md 加 v2 触发关键字 `/bootstrap` + 工具集说明
- [ ] F3. 更新 `openspec/specs/data-schema.md`: bootstrap session schema 加 `agent_trace[]` + `options.mode` (additive)
- [ ] F4. 更新 `.claude/CLAUDE.md`: atomsyn-cli command surface 加 `--mode` flag; Iron rules 加 "agentic 模式默认, funnel 是 fallback"
- [ ] F5. 更新 `skills/atomsyn-bootstrap/SKILL.md` (E sub-agent 已建): 加 v2 工具集说明 + `/bootstrap` GUI 入口提示 + `--mode` flag 介绍
- [ ] F6. 在 `docs/plans/v2.2-bootstrap.md` 追加 v2 段落 (或新建 `docs/plans/v2.3-bootstrap-tools.md`): 北极星对齐 + agentic 架构 + dogfood 结果

## G · 测试与验证

- [ ] G1. 单元测试 `scripts/test/bootstrap-tools-test.mjs` (新): extractors 各自一个 fixture (md/docx/pdf/中文路径 NFC normalize)
- [ ] G2. agentTools 沙箱单元测试: 跨界 path 拒绝 / 中文路径 / 大文件截断 / read 走 extractor 链 / glob 上限触发
- [ ] G3. agentic loop mock 测试: mock LLM 返回 tool_use 序列, 验证 loop 终止 / token 计数 / fallback
- [ ] G4. e2e dry-run (LLM 真调, 主 agent dogfood): `tests/fixtures/bootstrap-mixed/` 跑 `--mode agentic`, 验证 markdown 含预期候选 + agent_trace 非空
- [ ] G5. e2e commit + resume: v2 markdown → v1 commit prompt 兼容
- [ ] G6. v1 → v2 兼容性: 旧 session JSON load + `--mode funnel` 走通 (取自 v1 v6 残留)
- [ ] G7. dogfood `~/Documents/开发过程资料/` (4437 文件) `--mode agentic` dry-run: ≥ 80% 候选来自 `.md/.txt/.docx/.pdf`, agent_trace 中 LLM 优先选高语义子目录, 总耗时 ≤ 45 min
- [ ] G8. dogfood 6 场景 (v1 G5 残留, 复用 v1 design §11 表): 串行 / 性能 / 数据流通 / 隐私 / 中断 resume / 去重

## H · v1 残留 12 项收尾 (本 change 范围内)

- [ ] H1. **E4** (Claude Code 真实触发 atomsyn-bootstrap) — 在主 agent 真实环境跑 `/bootstrap` 触发 + 验证 5 阶段 funnel + dogfood 一遍
- [ ] H2. **E5** (Cursor 同上) — 用户实机
- [ ] H3. **V5** (write→read→update→mentor→bootstrap→/bootstrap 端到端) — 主 agent 一次, 用户实机一次
- [ ] H4. **V6** (light + dark 主题验收) — 校准面板 + Wizard + PathDetectionBanner + agent_trace timeline 都自查
- [ ] H5. **V10** (Cursor + Claude Code 双工具识别) — 用户实机
- [ ] H6. **V11** (GUI 校准模块端到端: bootstrap commit → 改滑块 → verified toggle → restore 任意版本) — 主 agent + 用户
- [ ] H7. **V12** (dry-run + commit 两阶段端到端: GUI 删候选 → atom 落盘只含保留) — G4/G5 自动 + 用户实机
- [ ] H8. **V13 重测** (profile 单例不变量, v2 多次 bootstrap 后) — 主 agent 自动
- [ ] H9. v1 G2/G2b/G3 残留 (e2e dry-run / commit / resume 集成) — 已并入 G3/G4/G5
- [ ] H10. v1 G4 (1000 文件性能) — 已并入 G7

## V · Verification (跨任务回归)

- [ ] V1. `npm run build` 通过
- [ ] V2. `npm run lint` 通过
- [ ] V3. `cargo check` 通过 (capabilities 扩展了)
- [ ] V4. `npm run reindex` 后所有 atom JSON (含 v1 已 import 的 + v2 新加) 通过 schema 校验
- [ ] V5. `npm run test:bootstrap-skill` (v1 既有) 全过 (回归保护)
- [ ] V6. `npm run test:bootstrap-tools` (本 change 新加) 全过
- [ ] V7. `npm run test:evolution` 全过 (回归)
- [ ] V8. v1 用户的 session JSON 在 v2 加载零异常 (兼容性兜底)
- [ ] V9. proposal §6 列出的 5 条 success metrics 全部能开始观测 (即使数据要积累, 至少埋点已就绪)
- [ ] V10. archived bootstrap-skill change 引用整理 (IMPLEMENTATION-HANDOFF 不动)
- [ ] V11. ChatInput / 命令面板 4 个命令 UI 走通 (含 /bootstrap)
- [ ] V12. light + dark 主题切换无视觉破损 (新组件 PathDetectionBanner / agent_trace timeline)
- [ ] V13. dogfood `~/Documents/开发过程资料/` 跑通 (proposal §6 指标 1 + 4)

---

<!--
========================================================================
全部勾完后:
1. mv openspec/changes/2026-04-bootstrap-tools openspec/archive/2026/04/
2. mv openspec/changes/2026-04-bootstrap-skill openspec/archive/2026/04/   # 同时归档 v1
3. 在 docs/plans/v2.3-bootstrap-tools.md (或追加 v2.2-bootstrap.md) 写叙事
4. 关掉对应的 ideas-backlog 条目 (如有)
========================================================================
-->
