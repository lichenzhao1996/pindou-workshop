# TASK-094 Worker / Canvas 交互性能记录

日期：2026-10-12

## 可重复条件

- 执行：`npm run test:e2e -- tests/e2e/task094-096.resilience.spec.ts --workers=1 --reporter=line`
- 应用运行于本地 production preview，使用真实 Chromium、真实 generation Worker 和正式 Canvas renderer。
- 输入：确定性 40×30 双色 PNG；最终 Grid：256×192（49,152 格，`Uint16Array` 98,304 bytes）。
- 生成后开启色号和高亮，执行 100% 视口、色号/高亮绘制及中键平移。
- 浏览器：HeadlessChrome 151.0.7922.34；`hardwareConcurrency=12`。

## 一次观测结果

| 指标                          |           观测值 |
| ----------------------------- | ---------------: |
| 从点击生成到 Editor/Grid 可用 |         355.2 ms |
| 显示色号按钮交互              |         32.27 ms |
| 100% 视口重置交互             |         37.52 ms |
| 切换颜色高亮交互              |         41.35 ms |
| 中键拖动画布操作              |        133.35 ms |
| 采样 RAF 帧数                 |               38 |
| 最大帧间隔                    |          83.3 ms |
| Long Task                     | 1 次，最长 54 ms |
| 最终视口渲染豆数 / 标签数     |        864 / 864 |
| 其中被弱化的非目标颜色        |              432 |
| 页面运行时错误                |                0 |

这是单次 headless Chromium 工程观测，不是低端硬件性能承诺，也不应把不同交互样本合并成统计意义上的 P95。Canvas 可见区域仅处理当前视口中的 864 格，而不是 49,152 格的完整 Grid；观察到短暂帧间隔与一个长任务，但没有持续卡死或丢失交互响应。

本环境没有可靠的浏览器进程峰值 RSS 采集能力。记录不使用 `performance.memory.usedJSHeapSize` 代替进程/原生图形内存。当前 Grid 的正式 backing store 为 98,304 bytes；源图片解码器、Canvas/GPU 和 Worker 临时数据峰值仍需在目标设备工具中测量。

## Worker 取消行为

旧行为只丢弃取消请求的 Promise，Worker 会继续执行旧计算。TASK-094 将取消调整为：立即拒绝当前请求、移除监听并终止该 Worker；下次生成按需创建新 Worker。Worker 协议和 Project/Grid 数据结构未改变。定向 unit 测试验证取消、终止及后续请求重建 Worker；既有 Project generation / late-result 测试继续回归。

## 结论与建议

- Worker 生成不占用主线程；在最大宽度常见 4:3 Grid 上，交互仍可完成，未见持续阻塞。
- 标签/高亮按可见 Grid 范围绘制，没有第二份 Grid。
- 可见 54 ms 长任务和 83.3 ms 最大 RAF 间隔应作为后续性能比较基准；若在低配目标机复现持续抖动，再对 Canvas 文本和颜色绘制分阶段分析，不引入 WebGL 等复杂引擎。
- 极端高宽比的总格数边界由后续 TASK-098 另行验证；本记录没有新增产品格数限制。
