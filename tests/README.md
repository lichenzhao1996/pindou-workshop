# 测试目录约定

- `tests/unit/`：纯函数、工具函数、领域模型和其他不依赖 DOM 的单元测试。
- `tests/components/`：使用 Vue Test Utils 的 Vue 组件测试；`fixtures/` 只放测试专用的非业务组件。
- `tests/setup.ts`：所有 Vitest 测试共用的环境初始化。
- E2E 测试将在 TASK-007 中单独建立，不在当前目录预先创建。

测试统一使用 Vitest，Vue 组件使用 Vue Test Utils 挂载，运行环境使用 `happy-dom`。
