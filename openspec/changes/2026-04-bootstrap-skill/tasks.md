# Tasks · 2026-04-bootstrap-skill

> **怎么用**: 实施时按分组从上到下推进。每勾掉一个 task 提交一次 commit, commit message 引用本 change-id。
>
> **状态**: draft
>
> **强依赖**: `2026-04-cognitive-evolution` 必须先合并 (见 proposal §2)。本 change 实施前必须确认 cognitive-evolution 已 merged。

---

## A · Schema / 数据迁移

- [ ] A1. 在 `skills/schemas/atom.schema.json` 给 discriminated union 增加 `kind: "profile"` 分支
- [ ] A2. 新建 `skills/schemas/profile-atom.schema.json` (定义 profile 完整字段: identity / preferences / knowledge_domains / recurring_patterns / verified / verifiedAt / inferred_at / source_summary / evidence_atom_ids / **previous_versions** [array of {version, supersededAt, snapshot, trigger, evidence_delta}, D-010])
- [ ] A3. 在所有 atom 的 stats 字段上 additive 增加可选字段 `imported: boolean` 和 `bootstrap_session_id: string|null`
- [ ] A4. 在 `src/types/index.ts` 同步类型定义: 新增 `ProfileAtom`, 把它加进 `Atom = ... | ProfileAtom` 联合类型
- [ ] A5. 在 `data/atoms/profile/.gitkeep` 占位 (确保目录在新装机用户上存在)
- [ ] A6. 编写最小自动化校验: 创建一个 fixture profile atom JSON, `npm run reindex` 通过, 索引文件含 profile bucket
- [ ] A7. 跑一次 `npm run reindex` 验证现有 V2.1 数据全部通过 schema 校验 (additive 字段是兼容的)

## B · CLI 实现

- [ ] B1. 在 `scripts/atomsyn-cli.mjs` 新增 `bootstrap` 子命令 dispatcher (与现有 write / ingest / read 同级)
- [ ] B2. 创建 `scripts/lib/bootstrap/` 目录, 拆分: `triage.mjs` (Phase 1) / `sampling.mjs` (Phase 2) / `deepDive.mjs` (Phase 3 串行) / `parallelDeepDive.mjs` (Phase 3 并行) / `session.mjs` (state) / `privacy.mjs` (隐私扫描) / `ignore.mjs` (.atomsynignore 解析) / `extract.mjs` (5 层归类)
- [ ] B3. 实现 `--path` (可重复) / `--phase` / `--parallel` / `--include-pattern` / `--exclude-pattern` / `--dry-run` / `--resume` / `--user-correction` 参数解析 + 互斥校验
- [ ] B4. 实现 session 状态机 (写 `~/.atomsyn/bootstrap-sessions/<session-id>.json`): triage_completed / sampling_completed / deep-dive_in_progress / completed / failed
- [ ] B5. 实现隐私扫描器 (`privacy.mjs`): 内置 14 条正则 (见 design §7.2), 强敏感整文件跳过, 弱敏感 redact
- [ ] B6. 实现 `.atomsynignore` 解析器 (`ignore.mjs`, gitignore 语法 + 内置 fallback 列表)
- [ ] B7. **新建 `scripts/bootstrap/prompts/` 目录** (D-012): 创建 7 份 hard-code prompt 模板 (`triage.md` 占位 / `sampling.md` / `deep-dive-l1-l2.md` / `deep-dive-l3.md` / `deep-dive-l4.md` / `deep-dive-l5.md` / `commit.md`)
- [ ] B8. 实现 5 层归类提示词加载器 (`extract.mjs`): 启动时从 `scripts/bootstrap/prompts/*.md` 加载, 不读取用户配置文件; **不允许 ENV / 配置文件 override** (D-012)
- [ ] B9. 实现 `--dry-run` 路径 (D-011): 走完三阶段, DEEP DIVE 调 LLM 时只要求输出**人类友好 markdown 表格** (name / 一句话 insight / 5 层归类 / 原文片段 50 字截断 / confidence / 建议 tags), **不**生成完整 atom JSON, 不调 ingest, 持久化到 session 文件 `~/.atomsyn/bootstrap-sessions/<id>.md`
- [ ] B10. 实现 `--commit <session-id>` 路径 (D-011): 读 session 的 markdown (默认从文件, 可通过 stdin / `--markdown-corrected-file` 传入用户已编辑版本), 对每条候选调 LLM 生成完整 atom JSON, 通过 `atomsyn-cli ingest --stdin` 写入磁盘
- [ ] B11. 实现 commit 阶段的 LLM prompt (`scripts/bootstrap/prompts/commit.md`): 输入"用户保留 + 修改后的 markdown 候选条目", 输出"完整 atom JSON 数组" (一次 batch 调用, 减少调用次数)
- [ ] B12. 实现 commit 容错解析: 用户在 markdown 上 inline 修改可能破坏格式, 解析失败时给出明确错误信息 + 保留原 session 不损坏
- [ ] B13. **实现 profile 单例语义** (D-010): bootstrap 在 commit 阶段写入 profile 时, 如果 `<dataDir>/atoms/profile/main/atom_profile_main.json` 已存在, 把现有 profile 当前快照推入 `previous_versions[]` 顶部 (trigger=`bootstrap_rerun`), 然后覆写顶层字段; 不存在时创建新 profile (trigger=`bootstrap_initial`)
- [ ] B14. 实现去重逻辑: ingest 之前先 `find --query` 计算 score, score > 0.8 视为重复, 跳过并记录到报告
- [ ] B15. 实现退出码语义 (0/1/2/3/4) + 对应 stderr 信息
- [ ] B16. 实现 stdout markdown 报告生成器 (3 阶段各自一份模板, dry-run 和 commit 各自一份)
- [ ] B17. 实现 `data/growth/usage-log.jsonl` 5 种事件追加 (started / phase_completed / dry_run_completed / commit_completed / failed)
- [ ] B18. 实现 `--resume` 路径: 从 session 文件恢复状态, 跳过已完成阶段, 续跑剩余文件
- [ ] B19. 同步更新 `~/.atomsyn/bin/atomsyn-cli` shim (确保 bootstrap 子命令可达; 通常是 forward 到 atomsyn-cli.mjs, 不需要改 sh 脚本)
- [ ] B20. CLI 帮助文档: `atomsyn-cli bootstrap --help` 输出含 dry-run / commit 两步示例命令 + 链接到 docs

## C · GUI 实现

### C.1 聊天页面"初始化向导"入口 (D-009)

- [ ] C1. 在聊天页面 (`src/pages/Chat/...`) 增加"初始化向导"按钮 (使用 Linear/Raycast 风格的 Spring 动画)
- [ ] C2. 创建 `src/pages/Chat/BootstrapWizard/` 组件: 5 屏向导面板 (路径选择 / Phase 1 概览 / Phase 2 画像 / **Phase 3 dry-run 报告 + 用户校对** / **commit 进度 + 完成**)
- [ ] C3. 实现路径选择屏: 文件夹选择对话框 (Tauri `dialog` plugin), 多 path 支持, 默认建议 (~/Documents / ~/Downloads)
- [ ] C4. 实现 token/cost 估算预览组件: 在路径确认后展示预估 token 数 + LLM provider 名 + 估算成本; **明确标注 dry-run + commit 两阶段各自的 token 消耗** (D-011)
- [ ] C5. 实现 Phase 2 校准面板: 让用户编辑 5 维数值滑块 + identity 文本框 + knowledge_domains 标签
- [ ] C6. 实现 Phase 3 dry-run 报告屏 (D-011): 展示 markdown 候选列表, 每条带"保留/删除"toggle + 可编辑 name/insight 字段; 顶部"全部保留/全部删除"快捷; 底部"确认写入"按钮
- [ ] C7. 实现 commit 进度面板: 实时进度条 + 已 ingest atom 数 + 当前操作 + 中止按钮 (调 `POST /bootstrap/sessions/:id/commit` 并轮询 / SSE 拿进度)
- [ ] C8. 实现完成报告面板: 产出统计 + "打开 Atlas 查看" + "校准 profile" 两个 CTA

### C.2 认知画像模块 (D-013, 新增)

- [ ] C9. **创建 `src/pages/ProfilePage.tsx`** (一级页面) 或 `src/components/growth/ProfileCalibration.tsx` (Growth 子 tab) —— **OQ-7 待用户拍板**, 实施前确认
- [ ] C10. 实现 profile 详情头部: profile 名称 + verified 徽章 + verifiedAt 时间 + "校准并标记 verified" 主操作按钮
- [ ] C11. 实现 Identity 编辑区: role / working_style 文本框, primary_languages / primary_tools 标签输入器
- [ ] C12. **实现 Preferences 5 维滑块** (D-013): 5 个数值滑块 (scope_appetite / risk_tolerance / detail_preference / autonomy / architecture_care), 0-1 范围, 步长 0.05, blur 时本地暂存; 滑块两端的语义标签 (e.g. scope_appetite: "小步" ↔ "完整") 文档化在 design §5.4
- [ ] C13. 实现 Knowledge Domains / Recurring Patterns 编辑器 (标签输入 + 自由文本)
- [ ] C14. 实现 evidence_atom_ids 反查: 每个字段后面"基于 N 条 atom"小标, 点开列出对应 atom (调 GET /atoms/:id 各取一遍, 或前端从已加载索引筛)
- [ ] C15. **实现 Previous Versions 时间线** (D-010 + D-013): 调 GET /atoms/profile/versions, 展示前 10 条, 每条带 trigger 标签 + 时间 + diff summary + restore 按钮; restore 按钮调 POST /atoms/profile/restore
- [ ] C16. 实现 verified toggle: 用户必须**至少校准一次**才能切到 true; 切到 true 时调 POST /atoms/:id/calibrate-profile (verified=true 字段透传); 切到 false 不调用 API (本地状态)
- [ ] C17. 实现"保存为草稿"流程: 修改但不点 verified, 数据本地暂存 (zustand store), 用户离开页面提示"未保存"
- [ ] C18. 实现"画像 90+ 天未校准"提示 (D-013 + cognitive-evolution 联动): 顶部黄色 banner 显示, 点击直接跳到滑块
- [ ] C19. 在 Atlas 页面 (`src/pages/Atlas/...`) 给 profile atom 单独 bucket 显示 (单条 hero 卡片, 链接到 ProfilePage)

### C.3 Store + 视觉验收

- [ ] C20. 接 Zustand store: 新增 `bootstrapStore` (sessionId / phase / progress / paths / dryRunMarkdown / corrections), `profileStore` (current profile / verified state / versions list)
- [ ] C21. 视觉对齐 Linear/Raycast 风格, 滑块组件可复用 RadarChart 同款技术栈 (纯 SVG + Framer Motion)
- [ ] C22. light + dark 双模式自查: 校准面板的 5 维滑块 / 时间线 / dry-run markdown 渲染都在 dark 模式下颜色仍区分清楚

## D · 数据 API 双通道

### D.1 Profile atom CRUD + 校准

- [ ] D1. Dev 模式: `vite-plugin-data-api.ts` 增加路由 `GET /atoms/profile` (单例返回, 无则 null)
- [ ] D2. Dev 模式: `vite-plugin-data-api.ts` 增加路由 `POST /atoms/:id/calibrate-profile` (D-013)
- [ ] D3. Dev 模式: `vite-plugin-data-api.ts` 增加路由 `GET /atoms/profile/versions` (D-010)
- [ ] D4. Dev 模式: `vite-plugin-data-api.ts` 增加路由 `POST /atoms/profile/restore` (D-010)
- [ ] D5. Tauri 模式: `src/lib/tauri-api/routes/atoms.ts` 增加 4 个 handler 同名同语义
- [ ] D6. handler 实现: 校验 kind=profile, **执行单例语义** (推现有快照入 previous_versions, 然后覆写), merge 用户校准字段 (identity / preferences / knowledge_domains / recurring_patterns), 设置 verified=true 和 verifiedAt=now, 调用 rebuildIndex()
- [ ] D7. handler 实现 restore: 校验 version 存在, 把当前快照推入 previous_versions, 把指定 version 恢复为顶层字段

### D.2 Bootstrap session 管理 (D-011)

- [ ] D8. 新建 `src/lib/tauri-api/routes/bootstrap.ts` 文件
- [ ] D9. Dev + Tauri 双通道: `GET /bootstrap/sessions` (列出 ~/.atomsyn/bootstrap-sessions/ 下所有)
- [ ] D10. Dev + Tauri 双通道: `GET /bootstrap/sessions/:id` (返回 BootstrapSession 含 markdown 报告原文 + 状态)
- [ ] D11. Dev + Tauri 双通道: `POST /bootstrap/sessions/:id/commit` (调用 CLI bootstrap --commit, 接受可选 markdown_corrected, 返回 atoms_created 数 + 更新后的 session 状态; 流式输出进度可选)
- [ ] D12. Dev + Tauri 双通道: `DELETE /bootstrap/sessions/:id` (删除 session 文件)

### D.3 双通道铁律收尾

- [ ] D13. 在 `src/lib/tauri-api/router.ts` 的 handlers 数组注册所有新路由 (4 atoms + 4 bootstrap = 8 个)
- [ ] D14. 写操作后调用 `rebuildIndex()` (calibrate-profile / restore / commit 三处)
- [ ] D15. `npm run build` + `cargo check` 通过

## E · Skill 契约

- [ ] E1. 新建 `skills/atomsyn-bootstrap/SKILL.md` (frontmatter + 触发条件 + 不可变承诺 B-I1~B-I5 + Token 预算 + 3 阶段 funnel 详细执行步骤 + 错误处理)
- [ ] E2. 在 `scripts/atomsyn-cli.mjs install-skill` 命令中加入第 4 个 skill 的安装路径; Tauri `install_agent_skills` Rust command 同步加入
- [ ] E3. 安装第 4 个 skill 到 `~/.claude/skills/atomsyn-bootstrap/` (Claude Code) + Cursor 同样位置, 验证 frontmatter 被正确识别
- [ ] E4. 在 Claude Code 中真实跑通触发场景: 用户说"初始化我的 atomsyn", 验证 Skill 被触发并按 design §3 的 3 阶段 funnel 执行
- [ ] E5. 在 Cursor 中真实跑通同样场景, 验证跨工具一致性
- [ ] E6. 更新 `skills/atomsyn-read/SKILL.md` 加一行注释 "v2 计划: 用户校准 profile 后, 新会话首次注入 profile 作为 system prompt" (本 change 不实施 v2 注入)
- [ ] E7. 更新 `skills/atomsyn-mentor/SKILL.md` 加一行注释 "v2 计划: 报告里加入 profile.preferences (declared) vs 行为推断 (inferred) 的 gap 分析" (本 change 不实施 v2 gap 分析)

## F · 文档

- [ ] F1. 更新 `openspec/specs/cli-contract.md`: §1 命令面总览表加 `bootstrap` 一行; §3 详细契约新增 §3.11 `atomsyn-cli bootstrap` 完整规范 (复制本 design §5.1, 含 dry-run/commit 两阶段)
- [ ] F2. 更新 `openspec/specs/skill-contract.md`: §1 角色总览表加 `atomsyn-bootstrap` 一行; 新增 §5 atomsyn-bootstrap 契约 (从 design §5.3.1 拷, 含 B-I1~B-I8 不可变承诺)
- [ ] F3. 更新 `openspec/specs/data-schema.md`: §1 顶层数据形态加 `atoms/profile/main/` 目录 (单例); §2 核心实体一览加 ProfileAtom 行 (注明单例 + previous_versions[]); §8 Schema Changelog 追加 `2026-04-26 · 2026-04-bootstrap-skill · profile-atom.schema.json · additive · 新增 profile kind (单例 + previous_versions[])`
- [ ] F4. 更新 `.claude/CLAUDE.md` 数据布局段加 `atoms/profile/main/atom_profile_main.json` 单例; "Iron rules" 段加新条目 "profile atom 默认 verified=false, 不被 read 自动注入直到用户在 GUI 校准"; "Quick reference" 段加 "用户说 '初始化 atomsyn / bootstrap' → 引导用户走 dry-run + commit 两步, 别一步到位"
- [ ] F5. 在 `docs/plans/v2.x-vision-handoff.md` 追加 bootstrap 叙事段落 (或新建 `docs/plans/v2.2-bootstrap.md`): 北极星对齐 + 用户故事 + 实施时序 + 与 cognitive-evolution 联动
- [ ] F6. 更新 `openspec/specs/cli-contract.md` 加 GUI 走 API 的端点章节 (calibrate-profile / versions / restore / bootstrap session 系列)

## G · 测试与验证

- [ ] G1. 单元测试: `tests/bootstrap/privacy.test.mjs` (14 条正则各覆盖正例反例) / `tests/bootstrap/ignore.test.mjs` (gitignore 语法 + 内置 fallback) / `tests/bootstrap/extract.test.mjs` (5 层归类映射, 用 mock LLM 响应)
- [ ] G2. 集成测试: `tests/bootstrap/e2e-dry-run.test.mjs` 在 `fixtures/bootstrap-sample/` 目录上跑 `--dry-run`, 验证产物 markdown 包含预期候选数 + 不调 ingest + session 文件持久化 (D-011)
- [ ] G2b. 集成测试: `tests/bootstrap/e2e-commit.test.mjs` 在 dry-run session 基础上跑 `--commit`, 验证 LLM 把 markdown 转为 atom JSON + 通过 ingest 写入 + previous_versions 单例语义 (D-010 / D-011)
- [ ] G3. 集成测试: `tests/bootstrap/resume.test.mjs` 模拟 Phase 2 中断后 `--resume` 续跑
- [ ] G4. 性能回归: 在 `fixtures/bootstrap-1000/` 上手动跑一次 `--parallel`, 记录 wall-clock 必须 < 30 分钟; 写到 docs/plans 当前里程碑
- [ ] G5. dogfood 场景 1-6 (从 design §11 抄过来) 全部走通, 每个场景的输出截图或日志贴进 docs/plans
- [ ] G6. 兼容性回归: 现有 V2.1 数据目录 (≥ 200 atom) 在本 change 落地后 `npm run reindex` 零错误, GUI Atlas / Growth / Skill Map 全部正常加载
- [ ] G7. 隐私验证: 故意在 fixture 中放含 `sk-proj-xxxxxx` 的 markdown, 确认 phase1 报告把它列入 sensitive_skipped, 整个流程结束后 atom 内容 / usage-log / session 文件**任何一处都不含**该字串

---

## Verification (跨任务回归项)

- [ ] V1. `npm run build` 通过 (含 tsconfig.node.json 检查)
- [ ] V2. `npm run lint` 通过
- [ ] V3. (Tauri 改动) `cargo check` 通过 (本 change 不动 Rust 代码, 但 install_agent_skills 的 bundled resource list 要含第 4 个 skill)
- [ ] V4. `npm run reindex` 后所有 atom JSON (含新 profile + 旧 V2.1 atom) 通过 schema 校验
- [ ] V5. 主流 dogfood 路径 (write → read → update → mentor → bootstrap) 在 Claude Code 内端到端跑通
- [ ] V6. light + dark 主题切换无视觉破损 (校准面板 + 向导 4 屏)
- [ ] V7. 现有 V2.1 用户的数据加载、显示、编辑完全不破坏 (compatibility 兜底)
- [ ] V8. proposal §6 列出的 4 条 success metrics 全部能开始观测 (即使数据还要积累, 至少埋点已就绪): 指标 1 (产出充分性, find atoms 计数) / 指标 2 (性能, session 文件 endedAt-startedAt) / 指标 3 (数据流通, mentor 报告引用) / 指标 4 (隐私零泄漏, usage-log 中 sensitive_skipped 字段)
- [ ] V9. cognitive-evolution change 的合并已确认 (实施前置条件)
- [ ] V10. 在 Cursor + Claude Code 双工具上, atomsyn-bootstrap Skill 都被正确识别 (frontmatter description 解析无误, 触发关键字命中)
- [ ] V11. **GUI 校准模块端到端走通** (D-013): bootstrap commit 完成 → 用户进 ProfilePage → 改滑块 → 切 verified=true → 切回 false → 调出 previous_versions 时间线 → restore 任意历史版本 → 当前版本被推入 previous_versions, 全程零数据丢失
- [ ] V12. **dry-run + commit 两阶段端到端走通** (D-011): 用户在 GUI 跑 dry-run → 看 markdown 报告 → 删除部分候选 → 点 commit → atom 落盘且只含用户保留的条目, 删除的不入库
- [ ] V13. **profile 单例不变量** (D-010): 全库永远只有 1 条活跃 profile (id=`atom_profile_main`); 多次 bootstrap / 校准 / restore 后 `find <dataDir>/atoms/profile -name 'atom_profile_*.json' | wc -l` = 1

---

<!--
========================================================================
全部勾完后:
1. mv openspec/changes/2026-04-bootstrap-skill openspec/archive/2026/04/
2. 在 docs/plans/v2.2-bootstrap.md 写叙事段落
3. 关掉对应的 ideas-backlog 条目 (如有)
========================================================================
-->
