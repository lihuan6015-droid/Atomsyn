# Tasks · 2026-04-cognitive-evolution

> **怎么用**: 实施时按分组从上到下推进。每勾掉一个 task 提交一次 commit, commit message 引用本 change-id。
>
> **状态**: draft

---

## A · Schema / 数据迁移

- [x] A1. 在 `skills/schemas/atom.schema.json` 增加 4 个可选字段(`lastAccessedAt` / `supersededBy` / `supersedes` / `archivedAt` / `archivedReason`),全部 additive
- [x] A2. 同步更新 `skills/schemas/experience-atom.schema.json` 和 `skills/schemas/methodology-atom.schema.json`(如果它们是独立 schema 文件) — 实际只有 atom.schema.json (即 methodology atom),A1 已处理;此处同步 experience-atom + experience-fragment;skill-inventory 演化语义不同 (依赖 fileMtime),design.md §4.1 未列,不动
- [x] A3. 在 `src/types/index.ts` 同步 TS 类型定义(`Atom` 类型加 4 个 optional 属性) — 抽出共享 mixin `AtomEvolutionFields`,Methodology/Experience/Fragment 三个 interface 分别 extends
- [x] A4. 跑一次 `npm run reindex` 验证现有 ~200 atom 全部通过新 schema 校验,记录任何拒绝并修正 — 282/282 atom 通过 ajv 严格校验 (methodology 182 + experienceCrystallized 2 + skillInventory 98)
- [x] A5. lazy 兼容代码:`scripts/lib/atom-io.mjs` 等 IO 路径在读 atom 时若缺新字段不报错,只在写时才补全(零 migration 脚本) — 现有代码 0 处引用新字段,5 字段全 optional,无需写代码

## B · CLI 实现

- [x] B1. 新增 `scripts/lib/evolution.mjs` 模块,封装 `computeStaleness` / `updateAccessTime` / `detectCollision` / `applySupersede` / `applyArchive` / `detectPruneCandidates` / **`applyProfileEvolution`** (D-008, profile 单例覆写 + previous_versions 入栈) 7 个函数。`applyProfileEvolution(newSnapshot, trigger)` 签名在 design §4.2.1 定义, 由 bootstrap-skill change 在其实施 PR 中调用 — 实现要点: 副作用类函数 (apply* / updateAccessTime) 通过 deps 注入 (`findAtomFileById` / `writeAtom` / `rebuildIndex` / `readProfile` / `writeProfile`), 与 CLI 内部解耦; 纯函数 (computeStaleness / detectCollision / detectPruneCandidates) 不做 IO; profile_factor 已合并到 computeStaleness 中 (B12 公式扩展, smoke 验证通过)
- [ ] B2. 在 `scripts/atomsyn-cli.mjs` 修改 `read` / `find` 命令:命中后调用 `computeStaleness` + `updateAccessTime`(节流),输出 JSON / markdown 中追加 staleness 字段;实现 `--show-history` flag; **profile 特殊处理** (D-008): read 默认不返回 profile, 仅更新 lastAccessedAt; 仅 `--include-profile` 时返回 (debug 用, 不暴露给 Skill)
- [ ] B3. 在 `scripts/atomsyn-cli.mjs` 修改 `write` / `update` 命令:加 `--check-collision` / `--no-check-collision` 参数,默认开,触发 `detectCollision`,在 stdout 加 `collision_candidates`,stderr 警告
- [ ] B4. 新增 `supersede` 子命令处理(参数 `--id` / `--input` / `--no-archive-old`),实现 design.md §5.1.3 步骤
- [ ] B5. 新增 `archive` 子命令处理(参数 `--id` / `--reason` / `--restore`)
- [ ] B6. 新增 `prune` 子命令处理(参数 `--auto-detect` / `--limit` / `--dry-run`),只 dry-run,输出候选 JSON
- [ ] B7. 输入解析 + 参数校验:每个命令的 `--id` 必须存在于索引,`--input` 必须可读,`--reason` 长度 ≤ 500 字符
- [ ] B8. 输出格式定义:read/find 命中 JSON/Markdown 双格式都加 staleness 字段;新命令统一输出 `{ok, ...}` JSON
- [ ] B9. 退出码统一:0 成功 / 2 not found / 3 locked / 4 校验失败 / 1 其他
- [ ] B10. 错误处理:lastAccessedAt 写失败、collision check 异常、reindex 失败都不应阻塞主流程;每种情况 stderr 一行 warning
- [ ] B11. 同步更新 `~/.atomsyn/bin/atomsyn-cli` shim 测试:确认 Tauri 打包后新命令可调用(在 packaged 模式下 dogfood 一次 supersede)
- [ ] B12. **`computeStaleness` 公式扩展** (D-008): 当 atom.kind=profile 时, 公式额外加入"距 verifiedAt 天数"因子, 让"画像 N 天未校准"在 staleness 信号中可观测; 配套写一份 `evolution.profileStaleness.test.mjs` 单元测试覆盖 4 case (verified=false / 30 天 / 90 天 / 180 天)
- [ ] B13. **bootstrap-skill 接口前置确认** (D-008): 在 evolution.mjs 中确保 `imported atom 默认 confidence=0.5 + lastAccessedAt=null` 在 staleness 公式里 fallback 到 createdAt, 不会让"刚 import 的 atom 立即被标 stale"

## C · GUI 实现

> 本 change 的 GUI 改动是**最小化**的(Open Questions 标记 GUI 完整改造为后续 change)。仅打通必要的视觉信号。

- [ ] C1. 在 `src/components/AtomCard.tsx`(或等效组件)的渐进披露第 2 级,如果 atom 的 `is_stale` 为 true,显示一个温度计图标 🌡 + tooltip "本条经验沉淀已 N 天,confidence 衰减 X%"
- [ ] C2. 在 `src/components/AtomCard.tsx` 第 3 级,如果 atom 有 `supersededBy`,显示"已被 [新 atom 名] 取代",点击跳转
- [ ] C3. 在 `src/components/AtomCard.tsx` 第 3 级,如果 atom 有 `archivedAt`,顶部加灰色条 "已归档于 YYYY-MM-DD" + reason(如有)
- [ ] C4. 在 atom 列表/Spotlight 中,默认过滤已归档 atom(参与 read,但 GUI 默认不显示);Settings 加 toggle "显示已归档 atom"
- [ ] C5. Zustand store(`src/stores/atomStore.ts` 等)新增 `archivedAtomIds` Set 用于过滤;light + dark 模式下温度计图标都视觉清晰

## D · 数据 API 双通道

- [ ] D1. Dev 模式:`vite-plugin-data-api.ts` 增加 5 个路由(`POST /atoms/:id/supersede` / `POST /atoms/:id/archive` / `POST /atoms/:id/restore` / `GET /atoms/prune-candidates` / `GET /atoms/:id/staleness`)
- [ ] D2. Tauri 模式:`src/lib/tauri-api/routes/atoms.ts` 增加对应 5 个 handler,复用 `evolution.mjs` 的逻辑(注意:Tauri 路由用 TS,需要把 evolution 逻辑做成纯函数 module 共享,或在 `src/lib/tauri-api/evolutionAdapter.ts` 包一层)
- [ ] D3. 在 `src/lib/tauri-api/router.ts` 的 handlers 数组注册新路由
- [ ] D4. 写操作后调用 `rebuildIndex()`(supersede / archive / restore 都会改 atom)
- [ ] D5. `npm run build` + `cargo check` 通过(参考 CLAUDE.md 的检查清单)

## E · Skill 契约

- [ ] E1. 更新 `skills/atomsyn-read/SKILL.md`:新增 Step 2c "检查 staleness 信号",定义"温度计句"约定 + Token 预算 30/句
- [ ] E2. 更新 `skills/atomsyn-write/SKILL.md`:新增 Step 3.5 "处理 collision_candidates",定义三选一(保留 / supersede / fork-暂未支持)流程 + AskUserQuestion 用法
- [ ] E3. 更新 `skills/atomsyn-mentor/SKILL.md`:新增 Phase 3 "主动 prune 建议",在复盘报告末尾追加 🧹 段;Token 预算从 3000 升到 5000
- [ ] E4. 在 Claude Code / Cursor 沙箱里真实跑通三个 skill 的新触发场景:read 命中旧 atom → 温度计句、write 触发冲突 → AskUserQuestion、mentor 调用 prune → 候选裁决

## F · 文档

- [ ] F1. 更新 `openspec/specs/cli-contract.md`:新增 supersede / archive / prune 命令面;修改 read/find/write/update 的输出契约部分(staleness 字段、collision_candidates 字段)
- [ ] F2. 更新 `openspec/specs/skill-contract.md`:三个 skill 的不可变契约 + 新增 Token 预算
- [ ] F3. 更新 `openspec/specs/data-schema.md` 的 changelog 区:atom schema 新增 4 字段,additive,版本号 → 1.5.1(或 v2.x 的对应小版本)
- [ ] F4. 更新 `CLAUDE.md` § L2 atomsyn-cli command surface 表:加 supersede / archive / prune 三行
- [ ] F5. 在 `docs/plans/v2.x-vision-handoff.md`(或当前 milestone 计划)追加叙事段落:本 change 在仓库层补足"演化能力",喂养结构层和教练层

## G · 测试与验证

- [ ] G1. 单元测试 5 个文件(见 design.md §11):staleness 公式、collision 检测、supersede 链、archive/restore、prune 三维度
- [ ] G2. 端到端 dogfood 5 个场景:read 温度计、write 冲突警告、prune 全流程、archive + restore、3 级 supersede 链
- [ ] G3. 性能回归:在 200 atom 数据集上运行 `atomsyn-cli prune --auto-detect` 计时 < 500ms,write collision check < 100ms
- [ ] G4. 兼容性回归:`npm run reindex` 后所有现有 atom JSON 通过校验;旧 GUI 读取新 atom JSON 不报错(忽略未知字段)
- [ ] G5. Tauri 打包回归:`npm run tauri:build` 后,在 packaged app 内执行一次 write → read → supersede → archive → prune 全链路

---

## Verification (跨任务回归项)

- [ ] V1. `npm run build` 通过 (含 tsconfig.node.json 检查)
- [ ] V2. `npm run lint` 通过
- [ ] V3. `cargo check` 通过(本 change 不动 Rust 但 routing 链路连带影响 ts → cargo 校验完整)
- [ ] V4. `npm run reindex` 后所有 atom JSON 通过 schema 校验,且索引中 `archived` / `supersededBy` 字段正确填充
- [ ] V5. 主流 dogfood 路径(read → staleness 提示 → write 冲突 → supersede → archive → mentor prune)在 Claude Code + Cursor 内端到端跑通
- [ ] V6. light + dark 主题下温度计图标 / 已归档灰条 / supersede 跳转链接视觉无破损
- [ ] V7. 现有用户的 ~200 atom 数据加载、显示、编辑完全不破坏(2026-04-26 git tag 之前的所有 atom JSON 100% 兼容)
- [ ] V8. proposal §6 列出的 success metrics 至少能开始观测:
  - 索引中能看到 `lastAccessedAt` 被填写
  - prune 在 dogfood 数据集上跑出候选数(无论候选数是否 ≥ 3)
  - usage-log.jsonl 含新事件类型
