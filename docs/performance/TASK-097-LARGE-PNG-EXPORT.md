# TASK-097 大型作品 PNG 导出性能记录

日期：2026-10-12

## 可复现条件

- 执行：`npm run test:e2e -- tests/e2e/task097-099.large-exports.spec.ts --workers=1 --reporter=json`。
- 应用使用本地 production preview；真实 Chromium、真实 generation Worker、正式 Export Snapshot 和正式下载流程。
- 环境：Windows 10 x64，Headless Chromium 151.0.7922.34，`navigator.hardwareConcurrency=12`。
- 输入为浏览器 Canvas 生成的确定性 256×192 PNG；最终 Grid 为 256×192（49,152 格）。样本包含透明 EMPTY、真实白色和多种正式 MARD 颜色。
- 每种 PNG 连续导出两次。耗时从点击导出按钮到浏览器下载事件，包含应用导出和下载准备，不是纯编码函数耗时。
- 下载文件校验 PNG 签名、IHDR 尺寸，并在 Chromium 解码后抽样检查 EMPTY、白色及 MARD RGB；同时比较导出前后 Project、Grid hash、revision、updatedAt 和 History。

## 实测结果

| 产物 | 像素尺寸 | Canvas RGBA backing store 估算 | 文件大小（两次相同） | 点击至下载（两次） |
| --- | ---: | ---: | ---: | ---: |
| 效果预览 PNG | 4,584×3,489 | 63,974,304 B（约 61.01 MiB） | 13,286,874 B（约 12.67 MiB） | 2,120.76 ms / 2,097.96 ms |
| 制作参考 PNG | 4,559×3,509 | 63,990,124 B（约 61.03 MiB） | 4,088,922 B（约 3.90 MiB） | 1,594.12 ms / 1,588.91 ms |

生成 Grid 从点击生成到 Editor 可用为 312.58 ms。导出期间没有页面运行时错误；两类产物均符合布局的实际尺寸，抽样颜色正确，EMPTY 与真实白色区分正确。每次下载对象 URL 均创建并撤销，临时下载锚点移除；导出前后 Project/Grid/History 摘要完全一致。

## 资源与错误处理

- 相关 Canvas 布局仍受单边 8,192 px、总像素 16,000,000 的既有 renderer 边界约束；没有增加 Grid 总格数产品上限。
- PNG 编码成功后立即将临时 Canvas 的 width/height 设为 0；编码返回 null、抛错或 Canvas context 不可用时也释放 backing store 并按既有错误路径失败。定向单测覆盖成功、null 和同步抛错；Chromium 重复导出验证实际 Blob 可用。
- 估算 backing store 只按像素×4 计算，不是操作系统内存采样，亦不包含编码器临时 buffer、Blob、解码位图或浏览器/GPU 开销。
- 测试环境未提供可靠进程峰值 RSS 采集。没有用 JS heap 指标代替进程或原生图形内存。

## 工程结论

本机在 256×192 Grid 上两种真实 PNG 均成功连续生成、下载和解码。该单环境、每种两次的观测说明当前路径可工作，但不足以推断低端设备性能、并发导出峰值或其他浏览器表现。约 64 MB 的单 Canvas RGBA backing store 估算是需要在目标设备继续关注的资源成本；它不是实测 RSS，也不应转化为新的产品警告或硬限制。
