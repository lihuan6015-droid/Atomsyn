# Tasks · 2026-04-bootstrap-tools

> **怎么用**: 实施时按分组从上到下推进。每勾掉一个 task 提交一次 commit, commit message 引用本 change-id。可按 cognitive-evolution 模式 bundled 紧耦合任务。
>
> **状态**: draft
>
> **强依赖**:
> - `openspec/archive/2026/04/2026-04-cognitive-evolution/` (已合并)
> - `openspec/archive/2026/04/2026-04-bootstrap-skill/` (将在本 change 完成后归档)

---

> **状态总览** (2026-04-28 更新):
> - 自动化任务 A/B/C/D/E/F/G6 + V1/V2/V3/V4/V5/V6/V7/V8 全部勾掉, 主 agent 完成
> - 用户实机验证残留: H1/H2/H5 (Skill 真实触发) + H3/H4 + V11/V12 (UI 视觉) + G4/G5/G7/G8 (真实 LLM dogfood) — 等用户跑

## A · 文档解析层 (extractors/)

- [x] A1. 新建 `scripts/lib/bootstrap/extractors/` 目录 + `index.mjs` 调度器骨架 (按扩展名分发, 默认 fallback 到 text)
- [x] A2. `extractors/markdown.mjs` — 现有 .md / .markdown 处理逻辑迁移过来 (含 frontmatter 解析), 输出 `{text, meta}`
- [x] A3. `extractors/code.mjs` — `.ts/.tsx/.js/.jsx/.mjs/.cjs/.py/.rs/.go/.java/.kt/.swift` 等源代码处理, 头部 + 尾部 + 重要 export 截断逻辑
- [x] A4. `extractors/text.mjs` — `.txt/.json/.jsonl/.yaml/.yml/.toml/.ini/.cfg/.conf/.sh/.bash/.zsh/.fish/.sql/.html/.css/.scss/.less` 通用文本
- [x] A5. **新增** `extractors/docx.mjs` — 引入 `mammoth` (lazy import), `extractRawText({path})`
- [x] A6. **新增** `extractors/pdf.mjs` — 引入 `pdfjs-dist` legacy ESM build, 前 5 页文本 + 文档元信息; 加密/损坏 → skipped
- [x] A7. `package.json` 加 `mammoth` + `pdfjs-dist`, npm install 通过 (29 packages added)
- [x] A8. 修改 `triage.mjs`: 注释澄清 .docx/.pdf 为 extractor-only (容器二进制, byte peek 无意义)
- [x] A9. extractor 输出统一 schema: `{ text, meta, skipped?, reason? }`
- [x] A10. v1 已支持扩展名输出与 v1 一致 (`npm run test:bootstrap-skill` 全过保护回归)

## B · ChatInput 入口扩展

- [x] B1. SkillCommandPalette 加 `/bootstrap` (Sparkles + "导入硬盘文档")
- [x] B2. ChatInput.handlePaletteSelect 选 `/bootstrap` 直接 dispatch `atomsyn:open-bootstrap` (ChatPage 监听 → 开向导)
- [x] B3. ChatInput.handleSend 拦截 `/bootstrap [path]` 短路 → 派发事件携带 path
- [x] B4. PathDetectionBanner.tsx — dismiss + "不再提示" 30 天 localStorage 持久 (D-002)
- [x] B5. ChatInput.onPaste 检测绝对路径 regex (macOS / Windows / `~/`) → banner 触发
- [x] B6. BootstrapWizard PathsScreen `dialog.open()`: 多选目录 + "选具体文件" filters (md/markdown/txt/docx/pdf/json/yaml)
- [x] B7. store.paths 接受混合 (目录 + 文件), CLI triage 已是 path-list 兼容
- [x] B8. 视觉 light/dark 双模式 — PathDetectionBanner 用 `dark:` Tailwind 双套色; 用户实机最终验收见 V12

## C · Agent 工具集 (核心)

- [x] C1. agentTools.mjs `createAgentTools({sandboxRoots, onTrace})` 工厂
- [x] C2. `ls(path)` ≤ 200 entries, NFC 中文目录 normalize
- [x] C3. `stat(path)` 大小 / mtime / type
- [x] C4. `glob(pattern, root)` 自实现 ≤ 500 matches; 支持 `*` `**` `?` `{a,b,c}`
- [x] C5. `grep(pattern, file)` 单文件 regex ≤ 50 hits, ≤ 16 KB scan
- [x] C6. `read(file, opts)` 走 `extractors/index.mjs` + privacy 链
- [x] C7. 沙箱 path-prefix (D-006): startsWith(sandboxRoots) 否则抛 `SANDBOX_VIOLATION`; .. 越界拒绝
- [x] C8. 单测 G2 (12 assertion): 沙箱越界 / 中文 NFC / brace expansion / 跨目录 glob / read 走 extractor

## D · agentic loop

- [x] D1. llmClient.chatWithTools 双分支 (Anthropic content blocks + OpenAI tool_calls), 归一化 `{stop_reason, text, toolCalls, usage}`
- [x] D2. agentic.mjs runAgenticDeepDive: tool-use loop + 5 工具 dispatch + tool_result 截断 (8 KB)
- [x] D3. prompts/agentic-deepdive.md (8.3 KB): 5 工具用法 + 探索策略 + v1 commit.md 兼容输出格式
- [x] D4. 双重上限 maxLoops=30 + maxTokens=100k (D-009), 任一触发即终止
- [x] D5. cmdBootstrap agentic 失败自动 fallback funnel + WARN (D-008); session.options.mode_fallback_from 记录
- [x] D6. agent_trace[] 通过 onTrace 回调写入 session.agent_trace
- [x] D7. CLI `--mode agentic|funnel` (default agentic, D-001), parser + dispatch + resume 路径都 honor
- [x] D8. session.mjs createSession 加 agent_trace=[] (additive)

## E · Tauri scope + GUI 显示

- [x] E1. capabilities/default.json fs:scope 加 `$HOME/Documents/{,**}` + `Downloads/{,**}` + `Desktop/{,**}` (D-007)
- [x] E2. cargo check 通过
- [x] E3. BootstrapWizard DryrunScreen `<AgentTraceTimeline>` 折叠面板 (default 折叠, mode=agentic 才显示)
- [x] E4. agentic.mjs `appendTraceSection` 在 dry-run markdown 末尾加"Agent 探索轨迹"章节 (loops/tokens/finalReason + per-tool 计数 + ≤200 trace 行)

## F · 文档与契约

- [x] F1. specs/cli-contract.md: bootstrap 加 `--mode` + extractor 列表 + changelog `2026-04-27 · bootstrap-tools`
- [x] F2. specs/skill-contract.md: atomsyn-bootstrap description + GUI 入口 + B-I9/B-I10 + Token 预算表 + Phase 3 + changelog
- [x] F3. specs/data-schema.md: changelog 追加 `options.mode + agent_trace[] + phase3.mode`
- [x] F4. .claude/CLAUDE.md: cli surface + Quick reference + V2.x bootstrap-tools 章节 + 铁律
- [x] F5. skills/atomsyn-bootstrap/SKILL.md: description + B-I9/B-I10 + GUI 入口 + Token 预算 agentic 行 + Phase 3a `--mode`
- [x] F6. docs/plans/v2.3-bootstrap-tools.md (new, ~170 行): 一句话叙事 + 痛点 + 三层升级 + 7 决策 + 不变量 + 兼容性 + dogfood + V2.4 后续

## G · 测试与验证

- [x] G1. 单测 extractors (md frontmatter + text binary detection + code 大文件 trim + index 强敏感 skip + 弱敏感 redact + SUPPORTED_EXTS + pickExtractor)
- [x] G2. agentTools 沙箱单测 (12 assertion: 中文 NFC / brace / 跨目录 / read 走 extractor / 越界拒绝 / direct API)
- [x] G3. agentic loop mock (Anthropic 3 轮 + OpenAI 2 轮 + loop_limit + token_limit + chatWithTools direct sanity, 18 assertion)
- [ ] G4. e2e dry-run real LLM dogfood (`/Users/circlelee/Documents/开发过程资料/`) — **用户实机** (需 ATOMSYN_LLM_API_KEY)
- [ ] G5. e2e commit + resume real LLM — **用户实机** (G4 后续)
- [x] G6. v1 → v2 兼容: 旧 session JSON 加载 (无 mode/agent_trace 默认值) + createSession v2 shape 验证
- [ ] G7. dogfood `~/Documents/开发过程资料/` 4437 文件 `--mode agentic` dry-run, ≥80% 高语义命中, ≤45 min — **用户实机**
- [ ] G8. dogfood 6 场景 (串行 / 性能 / 数据流通 / 隐私 / resume / 去重) — **用户实机**

## H · v1 残留 12 项收尾 (本 change 范围内)

- [ ] H1. **E4** Claude Code 真实触发 atomsyn-bootstrap — **用户实机**
- [ ] H2. **E5** Cursor 真实触发 — **用户实机**
- [ ] H3. **V5** write→read→update→mentor→bootstrap 端到端 — **用户实机**
- [ ] H4. **V6** light + dark 主题验收 — **用户实机** (新组件 PathDetectionBanner + AgentTraceTimeline 已用 dark: Tailwind)
- [ ] H5. **V10** Cursor + Claude Code 双工具识别 — **用户实机**
- [ ] H6. **V11** GUI 校准模块端到端 (commit → 改滑块 → verified toggle → restore) — **用户实机**
- [ ] H7. **V12** dry-run + commit 两阶段端到端 (GUI 删候选 → 落盘只含保留) — **用户实机** (G4 完成后)
- [x] H8. **V13** profile 单例不变量自动测试 (test:bootstrap-skill 含 5 trigger × applyProfileEvolution 全套, 已过)
- [x] H9. v1 G2/G2b/G3 (e2e dry-run / commit / resume) 已并入 G3 mock + G6 兼容性
- [x] H10. v1 G4 (1000 文件性能) 等价于 G7 dogfood

## V · Verification (跨任务回归)

- [x] V1. `npm run build` 通过 (✓ built in 3.51s, 主 bundle 警告 size>500KB 是已知项, 与本 change 无关)
- [x] V2. `npm run lint` 通过
- [x] V3. `cargo check` 通过 (capabilities 扩展了)
- [x] V4. `npm run reindex` 通过 (4 frameworks · 182 atoms · ...)
- [x] V5. `npm run test:bootstrap-skill` 全过 (52 assertion)
- [x] V6. `npm run test:bootstrap-tools` 全过 (61 assertion)
- [x] V7. `npm run test:evolution` 全过 (34 assertion)
- [x] V8. v1 session JSON 加载零异常 (G6 自动验证)
- [x] V9. success metrics 埋点就绪: usage-log mode 字段 + agent_trace + phase3.mode (proposal §6 指标 1-5 数据点齐全)
- [x] V10. archived bootstrap-skill change 引用整理 — IMPLEMENTATION-HANDOFF 已不动 (本 change 完成后 mv 一并归档)
- [ ] V11. ChatInput 4 命令 UI 走通 (含 /bootstrap) — **用户实机**
- [ ] V12. light + dark 主题切换 — **用户实机**
- [ ] V13. dogfood `~/Documents/开发过程资料/` — **用户实机** (= G7)

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
