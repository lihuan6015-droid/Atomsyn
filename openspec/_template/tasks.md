<!--
========================================================================
TASKS · 任务清单模板
========================================================================
本文件不是项目管理工具, 而是 "把 design 拆解成可独立交付步骤" 的清单。
- 每个 task 用 markdown checkbox `- [ ]`
- 每个 task 一行能看完, 复杂的 task 应该再拆
- owner / 估时 / 依赖 是可选标注, 不强制
- 实施时按顺序勾选; 实施完毕时几乎所有 task 都应是 `- [x]`
========================================================================
-->

# Tasks · {change_id}

> **怎么用**: 实施时按分组从上到下推进。每勾掉一个 task 提交一次 commit, commit message 引用本 change-id。
>
> **状态**: draft / locked / done

---

## A · Schema / 数据迁移

<!-- 如本 change 不动 schema, 写 "无 schema 变更" 并跳过本组 -->

- [ ] A1. 在 `skills/schemas/<file>.schema.json` 增加新字段 / 修改类型
- [ ] A2. 在 `src/types/index.ts` 同步类型定义
- [ ] A3. 已有 atom JSON 的迁移脚本 (`scripts/migrate-...mjs`) 或 lazy 兼容代码
- [ ] A4. 跑一次 `npm run reindex` 验证现有数据全部通过 schema 校验

## B · CLI 实现

<!-- atomsyn-cli 改动 -->

- [ ] B1. 在 `scripts/atomsyn-cli.mjs` 新增/修改子命令处理
- [ ] B2. 输入解析 + 参数校验
- [ ] B3. 输出格式 (JSON / markdown / exit code)
- [ ] B4. 错误处理 + 回退 (--dry-run 路径)
- [ ] B5. 同步更新 `~/.atomsyn/bin/atomsyn-cli` shim (如需要新参数)

## C · GUI 实现

<!-- React + Tauri 的 L1 改动 -->

- [ ] C1. 路由 / 页面新增 (`src/pages/...`)
- [ ] C2. 组件实现 + 渐进披露 4 级
- [ ] C3. Zustand store 字段 / action
- [ ] C4. 视觉对齐 Linear/Raycast 风格 (检查 `docs/mockups/...`)
- [ ] C5. light + dark 双模式自查

## D · 数据 API 双通道

<!-- 必须同时在 vite-plugin-data-api.ts 和 src/lib/tauri-api/routes/*.ts 实现 -->

- [ ] D1. Dev 模式: `vite-plugin-data-api.ts` 增加路由
- [ ] D2. Tauri 模式: `src/lib/tauri-api/routes/<file>.ts` 增加 handler
- [ ] D3. 在 `src/lib/tauri-api/router.ts` 的 handlers 数组注册
- [ ] D4. 写操作后调用 `rebuildIndex()` (如影响索引)
- [ ] D5. `npm run build` + `cargo check` 通过

## E · Skill 契约

<!-- 影响 atomsyn-read / atomsyn-write / atomsyn-mentor 的部分 -->

- [ ] E1. 更新 `skills/<skill>.skill.md` 的触发条件 / 不可变契约
- [ ] E2. 更新 Token 预算估算
- [ ] E3. 在沙箱里 (Claude Code / Cursor) 真实跑通触发场景

## F · 文档

- [ ] F1. 更新 `openspec/specs/cli-contract.md` (如改动 CLI 命令面)
- [ ] F2. 更新 `openspec/specs/skill-contract.md` (如改动 Skill 契约)
- [ ] F3. 更新 `openspec/specs/data-schema.md` 的 changelog 区
- [ ] F4. 更新 `CLAUDE.md` 关键不变量 (如适用)
- [ ] F5. 在 `docs/plans/<milestone>.md` 追加叙事段落

## G · 测试与验证

- [ ] G1. 单元测试 (如适用)
- [ ] G2. 端到端 dogfood 场景 N 个 (从 design.md §11 抄过来)
- [ ] G3. 性能/规模回归 (如 design §8 设了预算)
- [ ] G4. 兼容性回归 (现有 atoms / projects 加载无错)

---

## Verification (跨任务回归项)
<!--
  Verification 不是按组的 task, 而是 "整个 change 完成时的最终验证清单"。
  目的: 即使 A-G 全部勾完, 也要走一遍这个清单确认没有破坏既有不变量。
-->

- [ ] V1. `npm run build` 通过 (含 tsconfig.node.json 检查)
- [ ] V2. `npm run lint` 通过
- [ ] V3. (Tauri 改动) `cargo check` 通过
- [ ] V4. `npm run reindex` 后所有 atom JSON 通过 schema 校验
- [ ] V5. 主流 dogfood 路径 (write → read → update → mentor) 在 Claude Code 内端到端跑通
- [ ] V6. light + dark 主题切换无视觉破损
- [ ] V7. 现有用户的数据加载、显示、编辑完全不破坏 (compatibility 兜底)
- [ ] V8. proposal §6 列出的 success metrics 至少能开始观测 (即使数据还要积累)


---

<!--
========================================================================
全部勾完后:
1. mv openspec/changes/<id> openspec/archive/<year>/<month>/
2. 在 docs/plans/<milestone>.md 写叙事段落
3. 关掉对应的 ideas-backlog 条目
========================================================================
-->
