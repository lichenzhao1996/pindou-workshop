# 拼豆工坊 V1 技术方案

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 项目 | 拼豆工坊 |
| 版本 | V1 |
| 平台 | PC Web |
| 产品需求依据 | [`docs/product/PRD-V1.md`](../product/PRD-V1.md) |
| 拼豆色卡范围 | MARD 291 色完整色卡（MARD 色号体系） |
| 文档状态 | 已同步产品正式规则，待技术实现 |
| 本文职责 | 定义 V1 技术上怎么实现，不改变产品需求 |

> 本文只设计技术方案，不初始化项目、不安装依赖、不创建页面、不编写业务代码，也不拆解 V1 开发任务。
>
> 本文中所有“291 色”均指 MARD 291 色完整色卡；除表示数量或索引范围外，不得解释为其他色卡。V1 的 RGB/HEX/Lab 是版本锁定的公开数字参考数据或其派生数据，不默认等同于 MARD 制造商官方标准数字色值。

## 1. 方案结论

V1 采用以下总体方向：

1. **纯前端架构**：图片处理、拼豆生成、编辑、统计、PNG 和 PDF 全部在浏览器完成。
2. **Vue 3 + TypeScript + Vite**：使用成熟、直观、适合单人和 Codex 持续维护的前端基础。
3. **单一事实来源**：一个 `Project` 持有作品输入、生成设置和 `Grid`；画布、工具、统计、导航图、PNG、PDF 都从它读取。
4. **算法与 UI 解耦**：生成和统计使用不依赖 Vue 或 Pinia 的纯 TypeScript 模块，并放入 Web Worker 执行耗时图片处理。
5. **原生 Canvas 2D**：自行控制网格、缩放、拖动和编辑，不引入 Fabric、Konva 或 WebGL 等更重的画布抽象。
6. **会话级本地恢复**：使用 IndexedDB 保存当前工作会话和原始图片，不做账号、云端作品库或永久作品管理。
7. **静态部署**：构建为静态资源，部署到 Cloudflare Pages 一类的静态托管，不部署 V1 后端。

这套方案的核心取舍是：为 V1 选择少量职责清晰的库，把最重要的作品数据、算法和渲染代码保持在项目内部，避免引入未来暂时用不到的服务端、跨端层、AI 模型或复杂状态框架。

## 2. V1 技术原则与边界

### 2.1 技术原则

- 简单优先：能用浏览器原生能力完成的工作，不额外引入服务。
- 稳定优先：优先选择成熟、文档清楚、能在浏览器直接运行的方案。
- 单一数据源：不得让 UI、统计、导出各自复制一份拼豆矩阵。
- 纯函数优先：颜色匹配、尺寸计算、统计、编辑操作尽量做成可单测的纯函数。
- Vue 组件优先使用 Composition API 和 `<script setup lang="ts">`；组件样式优先使用 `<style scoped>`，公共设计变量使用 CSS Variables。
- 可替换边界：裁剪器、生成器、渲染器、导出器通过明确输入输出连接，避免互相依赖内部实现。
- 先可用后优化：V1 不使用 AI 模型、图像分类、复杂视觉识别、微服务或分布式系统。
- 任务可拆分：目录和模块边界要让 Codex 可以一次只修改一个明确模块并立即运行对应测试。

### 2.2 明确不在本方案中的能力

本方案不为以下能力预留实现，也不因架构考虑而加入它们：

- 微信小程序或跨端运行时
- 登录、注册、账号、会员和收费
- 社区、作品广场、商城
- 云端作品管理
- 拼豆商家订单系统
- AI 文生图或 AI 生成拼豆图
- 图层、Photoshop 式复杂编辑
- 5mm 或其他拼豆规格
- 任意 RGB / HEX 作为最终拼豆颜色
- 针对人像、宠物、动漫、风景的专属复杂算法
- 高级智能去背景

## 3. 推荐技术栈

### 3.1 技术栈总览

| 领域 | V1 推荐 | 选择理由 | 不选择的复杂方案 |
| --- | --- | --- | --- |
| 前端框架 | Vue 3 + TypeScript | 组件模型成熟，Composition API 和类型系统有助于约束 `Project`、工具和导出输入；适合单人维护和 Codex 分模块修改 | 不使用 Nuxt 等全栈框架，因为 V1 没有服务端数据、SSR 或服务端 API 需求 |
| 构建工具 | Vite | 开发启动快，静态构建直接，配置量少，适合纯前端部署 | 不使用自定义 Webpack 配置，避免构建层维护成本 |
| 路由 | Vue Router 的最小用法 | 用户流程天然有首页、裁剪和编辑结果等页面状态，URL 路由便于刷新和浏览器返回 | 不使用复杂数据路由、服务端路由或全栈路由 |
| UI / CSS | Vue Scoped CSS + CSS Variables | `<style scoped>` 保持组件样式局部可控，颜色、间距和断点由 CSS Variables 集中管理，Codex 容易定位 | 不引入大型 UI 组件库或 Tailwind 约定，避免组件样式覆盖和大量类名配置 |
| 状态管理 | Pinia；按 `projectStore`、`editorStore` 分工 | Vue 官方生态中的轻量状态方案，跨页面和核心组件共享清晰；组件临时状态仍留在组件内部 | 不使用更重的状态抽象，也不把每个弹窗、Hover 和输入草稿都塞入 Pinia |
| 图片裁剪 | Cropper.js + 薄 Vue 适配层 | 支持自由裁剪比例、移动、缩放和旋转；适配层只负责把裁剪结果转换为统一 `CropState` | 不自己从零实现裁剪手势，也不选择固定比例优先的裁剪组件 |
| 图片处理 | 浏览器 Canvas 2D、`createImageBitmap`、Web Worker | 不需要原生依赖；能完成解码、旋转、重采样和 RGBA 读取；耗时流程可移出主线程 | 不使用 OpenCV、WASM 图像套件或 AI 模型，避免包体和调试成本 |
| 拼豆主画布 | 原生 Canvas 2D + 自定义 viewport / renderer | 对网格、坐标、色号、Hover、迷你导航图和编辑命中测试有直接控制 | 不使用 Fabric / Konva / WebGL；V1 作品规模不值得引入更重的场景图或 GPU 管线 |
| PNG | Canvas `toBlob()` | 渲染和下载链路简单，效果图与制作参考图都可复用同一个 renderer | 不另建图片渲染服务，也不复制一套导出绘图逻辑 |
| PDF | `pdf-lib`；中文文本需要配合可授权的嵌入字体 | 可在浏览器创建页面、绘制文字、线条和图片；适合总览页、分页制作图和材料清单 | 不使用服务端 PDF 服务，也不引入复杂排版引擎；V1 文档结构固定 |
| 单元测试 | Vitest | 与 TypeScript / Vite 配合自然，适合纯函数和数据模型测试 | 不为少量核心函数引入重量级测试运行环境 |
| 组件测试 | Vitest + Vue Test Utils | 从用户行为验证工具、面板和 Pinia 状态联动，而不是测试实现细节 | 不依赖快照测试作为主要质量保障 |
| 端到端测试 | Playwright | 能覆盖上传、裁剪、生成、编辑和下载等真实浏览器流程 | 不用手工验收代替自动化主流程测试 |
| 本地数据 | 原生 IndexedDB 薄封装 | 能保存图片 Blob、TypedArray 和会话数据；适合“当前会话恢复”，不等同于作品云存储 | 不用 `localStorage` 保存大图和 Grid，也不引入数据库 ORM |
| 部署 | GitHub 连接的 Cloudflare Pages 静态站点 | 构建产物直接发布，适合单人项目和预览环境；不需要维护服务器 | 不使用容器集群、微服务、Serverless API 或自建后端 |

Vue 3、Vite、Vue Router、Pinia、Cropper.js、pdf-lib 和 IndexedDB 的具体版本应在真正初始化项目时锁定，并以当时官方文档和兼容性测试为准；本方案不提前锁死版本号。

### 3.2 Vue 组件约定

- 页面和业务组件统一使用 Composition API。
- 组件脚本优先使用 `<script setup lang="ts">`，通过 `ref`、`computed`、`watch` 和明确的 props / emits 表达局部交互。
- 纯业务规则、Grid 操作、统计、颜色匹配和生成算法不得写进 Vue 组件；组件只负责展示、事件转换和调用 Store / domain 函数。
- 组件样式优先写在 `<style scoped>` 中。
- 跨组件的颜色、间距、字体、边框和断点写入全局 CSS Variables；不在组件中复制同一组设计常量。
- 不使用 Options API 作为新组件的默认写法，也不以全局可变变量代替 Pinia 或组件状态。

## 4. 整体架构

### 4.1 架构形态

V1 是纯前端单页应用，静态资源由 CDN 托管：

```text
用户浏览器
  ├─ Vue 页面与交互
  ├─ Pinia Project/Editor 状态
  ├─ Cropper.js 裁剪适配层
  ├─ Web Worker：图片采样、颜色映射、拼豆优化
  ├─ Canvas 2D：主画布、迷你导航图、PNG 渲染
  ├─ pdf-lib：PDF 生成
  └─ IndexedDB：当前工作会话与原始图片

静态托管/CDN
  └─ HTML、JS、CSS、MARD 291 色色卡数据、字体等静态资源
```

没有应用服务器、数据库、上传接口、用户认证和远程图片处理服务。

### 4.2 浏览器职责

| 能力 | 运行位置 | 说明 |
| --- | --- | --- |
| 图片上传 | 浏览器 | 读取本地 File / Blob；不上传到服务端 |
| 图片裁剪 | 浏览器 | 裁剪器保存裁剪状态，生成阶段读取原始图片重新处理 |
| 图片采样 | Web Worker 优先 | 将裁剪结果重采样到目标 Grid 尺寸 |
| MARD 291 色映射 | Web Worker | 读取唯一 Palette，输出合法 palette index |
| 拼豆优化 | Web Worker | 使用确定性的基础规则，不依赖 AI 或分类服务 |
| 编辑器 | 浏览器主线程 | Vue 管理工具和面板，Canvas 管理绘制与命中测试 |
| 材料统计 | 浏览器 | 从同一 Grid 通过共享纯函数派生 |
| PNG 导出 | 浏览器 | 复用 renderer，通过 Canvas 生成 Blob |
| PDF 导出 | 浏览器 | 从同一个 Export Snapshot 生成 PDF |
| 会话恢复 | 浏览器 | IndexedDB 保存当前会话，不形成云端作品库 |

### 4.3 不需要服务端的原因

V1 没有登录、云端作品、协作、付费或需要保护的服务端算法。图片和作品可以在本地完成闭环，服务端只会增加：

- 文件上传和隐私处理责任
- 服务器运行成本
- 图片处理任务队列和失败重试
- API、鉴权、数据库及部署复杂度

这些能力不为 V1 用户价值增加必要收益，因此不加入后端。

## 5. 核心数据模型

### 5.1 数据分层

系统将数据分为四层，避免把输入、结果、UI 和缓存混在一起：

| 层 | 内容 | 是否事实来源 | 生命周期 |
| --- | --- | --- | --- |
| 原始输入 | 原始图片 Blob、原始尺寸、已确认裁剪信息、用户输入宽度、生成模式 | 是 | 当前会话；可写入 IndexedDB |
| 生成结果 | 作品尺寸、2.6mm、色卡版本、Grid | 是 | 当前 Project；重新生成时替换 |
| 派生数据 | 每色用量、总豆数、实际使用颜色数、成品尺寸 | 否，是可重算缓存 | 由 Grid 派生；不由 UI 独立维护 |
| 编辑状态 | 当前工具、当前活动颜色、缩放、平移、显示开关、颜色高亮 | 否 | 内存；刷新后可恢复部分会话，但不是作品数据 |

### 5.2 Project 结构

以下是逻辑数据结构，不是本次要创建的业务代码：

```text
Project
├─ schemaVersion: number
├─ projectId: string                 // 当前会话 ID，不代表用户账号
├─ projectName: string               // 结果页可编辑；用于导出文件名
├─ source
│  ├─ originalImage: Blob            // 原始上传图片，唯一原图来源
│  ├─ originalFileName: string | null
│  ├─ mimeType: string
│  ├─ originalWidth: number
│  └─ originalHeight: number
├─ crop
│  ├─ x: number                      // 原图坐标系
│  ├─ y: number
│  ├─ width: number
│  ├─ height: number
│  ├─ rotation: 0 | 90 | 180 | 270
│  └─ aspectRatio: number            // 由确认后的 crop width / height 得到
├─ generation
│  ├─ widthBeads: number             // 用户输入
│  ├─ heightBeads: number            // 根据宽度和裁剪比例派生
│  ├─ beadSizeMm: 2.6
│  ├─ mode: 'optimized' | 'high-fidelity'
│  ├─ paletteVersion: string
│  └─ algorithmVersion: string
├─ grid
│  ├─ width: number
│  ├─ height: number
│  └─ cells: Uint16Array              // 0 = EMPTY，1..291 = palette index
└─ revision: number
```

`heightBeads` 允许作为快照字段保存，但它不是用户独立输入。唯一计算来源必须是：

> `heightBeads = max(1, round(widthBeads / visualAspectRatio))`

其中 `visualAspectRatio` 在旋转 0° / 180° 时等于确认裁剪区域的宽高比，在旋转 90° / 270° 时交换为其倒数。最低 1 颗是 Grid 尺寸合法性保护，不是产品性能上限。

成品尺寸也不应手工保存为可编辑值：

> 成品宽度 = `grid.width × 2.6mm`；成品高度 = `grid.height × 2.6mm`

### 5.3 派生数据结构

统一使用一个 `deriveProjectStats(project)` 入口从当前 Grid 计算：

```text
ProjectStats
├─ usageByPaletteIndex: Uint32Array  // 长度 292，0 号保留给 EMPTY
├─ usedColorCount: number
├─ totalBeads: number                // 不含 EMPTY
├─ productWidthMm: number
├─ productHeightMm: number
└─ usedPaletteIndices: number[]
```

统计结果可以在 Store 中按 `project.revision` 缓存，但缓存失效后必须由同一个纯函数重建。右侧颜色列表、材料清单、PNG 图例和 PDF 材料清单只能读取这份派生结果。

### 5.4 编辑状态结构

编辑状态不放进 Grid：

```text
EditorState
├─ activeTool: 'select' | 'paint' | 'fill' | 'eyedropper' | 'eraser'
├─ activePaletteIndex: number | null
├─ highlightedPaletteIndex: number | null
├─ zoom: number                      // 0.1 .. 8.0
├─ panX: number
├─ panY: number
├─ showGrid: boolean
├─ showLabels: boolean
├─ showOriginal: boolean
└─ minimapCollapsed: boolean
```

整个编辑器只保留一个 `activePaletteIndex`。UI 可以显示对应的 `colorId`，但最终写入 Grid 的仍然是 Palette 中的合法索引。

### 5.5 图片输入检查

图片输入通过统一的纯函数检查格式、解码结果和尺寸。尺寸判断只产生可继续的 warning，不作为上传硬限制：

- 低分辨率：`width < 128 || height < 128`。
- 超大图片：`width × height > 24,000,000` 或 `max(width, height) > 8192`。
- 极端宽高比：`max(width / height, height / width) > 4`。

多个条件可以同时产生 warning。V1 不增加文件字节数、总像素数或宽高的额外产品硬上限；图片解码失败或无法取得有效正整数尺寸时返回错误并停止正常流程。TASK-023 只负责提示，不在此阶段进行缩放、压缩或其他大图预处理。

## 6. Grid 数据结构

### 6.1 方案比较

| 方案 | 优点 | 问题 | V1 结论 |
| --- | --- | --- | --- |
| 二维 JavaScript 数组 | 直观，调试容易 | 嵌套结构、复制成本更高，渲染和导出需要更多循环层次 | 不选 |
| 一维普通数组 | 比二维数组简单，序列化直观 | 每个元素仍是 JS number，内存和复制不如 TypedArray | 可作为测试输入适配格式 |
| 一维 `Uint16Array` | 0..291 的值域匹配，复制快，内存稳定，适合 Canvas 和 Worker | 调试时需要通过 Palette 反查索引 | **V1 采用** |
| 稀疏结构 / 位图 / 压缩格式 | 可能节省特定作品的空间 | 编辑、撤销、导出和调试复杂，无法保证不同作品都受益 | 不选 |

### 6.2 选定结构

Grid 使用行优先的一维 `Uint16Array`：

```text
index = row × width + column
cellValue = 0                         => EMPTY
cellValue = 1..291                    => Palette.paletteIndex
```

`row`、`column`、`isEmpty` 不需要在每颗豆上重复存储：

- `row = floor(index / width)`
- `column = index % width`
- `isEmpty = cellValue === 0`
- `colorId = palette.getColorId(cellValue)`

因此对外的 Cell 读取接口仍然能够表达 PRD 要求的 `row`、`column`、`colorId` 和 `isEmpty`，内部不会保存两套可能不一致的状态。

### 6.3 编辑操作要求

所有修改 Grid 的入口都通过统一操作层：

```text
applyGridOperation(project, operation) -> nextProject
```

操作至少包括：

- `setCell(index, paletteIndex | EMPTY)`：单颗改色、橡皮擦
- `paintCells(indices, paletteIndex)`：一次画笔手势
- `fillRegion(startIndex, paletteIndex | EMPTY)`：四邻域连续填充
- `replacePaletteIndex(from, to)`：全局颜色替换

操作层负责：

1. 校验索引、宽高和 palette index。
2. 克隆原 `Uint16Array`，不原地修改当前快照。
3. 只对有变化的格子写入。
4. 增加 `project.revision`。
5. 把一次用户意图作为一个 Undo 单元。

Canvas、右侧颜色列表和导出模块都不能直接写 `cells`。

### 6.4 序列化

IndexedDB 可以直接保存 `Uint16Array`，但导出调试 JSON 时应转换为可读的 `colorId` 或普通数组。项目正式快照至少包含 `paletteVersion`，不能只保存裸索引而丢失索引含义。

## 7. MARD 291 色 Palette 模块

### 7.1 统一数据结构

```text
Palette
├─ source: 'MARD'
├─ paletteVersion: string
├─ entries: PaletteEntry[291]          // MARD 291 色完整色卡
└─ byColorId: Map<string, PaletteEntry>

PaletteEntry
├─ paletteIndex: number               // 1..291，仅运行时索引
├─ colorId: string                    // 稳定唯一领域标识，与 displayCode 概念分离
├─ displayCode: string                // 采用的 MARD 色号体系中的展示代码
├─ name: string
├─ rgb: { r: 0..255, g: 0..255, b: 0..255 } // 版本锁定的公开数字参考
├─ hex: string                        // RGB 的屏幕显示表示
├─ lab: { l: number, a: number, b: number } // 可由 RGB 派生
└─ family: string                     // 产品派生的 MARD 系列分类
```

`Palette.source = 'MARD'` 表示该 Palette 采用 MARD 291 色号体系，不表示其中的 RGB/HEX 是 MARD 制造商官方标准数字色值。

`colorId` 是最终业务标识，`paletteIndex` 是 Grid 内部编码，`displayCode` 是采用的 MARD 色号体系代码；三者必须保持概念分离。RGB、HEX、Lab 都只是匹配和展示数据，不能写入 Grid 作为最终颜色。除非来源明确提供并经过核验，RGB/HEX 不得描述为 MARD 官方标准数字色值；由 RGB 计算的 Lab 必须标记为系统派生数据。

### 7.2 单一色卡数据源

- 只允许存在一份版本化的 MARD 291 色 Palette 数据文件。
- 生成、选色组件、颜色搜索、颜色高亮、统计、PNG 和 PDF 都从同一 Palette 实例读取。
- 不允许在组件中硬编码色号、RGB 或颜色名称。
- 应在正式落库前和构建 / 测试阶段校验：来源和固定版本可追溯、恰好 291 条、`colorId` 唯一、采用的 MARD 色号完整、`paletteIndex` 连续、RGB 合法、Lab 可复现、每个色系有效。
- 每个 Project 保存 `paletteVersion`，防止将来色卡数据变化后误读旧 Grid。

MARD 291 色的数字参考数据属于高风险基础数据。正式落库前必须进行数据来源、固定版本和色号完整性核验。V1 采用版本锁定的公开参考数据时，必须明确其不是 MARD 官方 RGB/HEX 标准；正式数据由 TASK-015 导入本地资源，本次实现不运行时联网读取。

### 7.2.1 版本锁定与数据溯源

production Palette 必须拥有稳定的 `paletteVersion`，并能够追溯到：

- 数据来源；
- 固定 commit 或等价的数据版本；
- 拼豆工坊自身的处理版本。

生产构建不得直接读取 GitHub `main` / `master` 的最新数据，也不得在每次构建时自动拉取上游色卡。上游数据变化不能无版本地改变已有作品中颜色的含义。任何数据升级都必须显式升级 `paletteVersion`，重新执行来源、完整性和冲突核验，并记录变更。

当前 production Palette 的 `paletteVersion` 为：

`MARD-291-community-maxcleme-beadcolors-29229889daab404fb30531d4bb785fd73f7f58e3-import-v1`

它由上游仓库、固定 commit 和拼豆工坊导入处理版本组成。具体来源、原始文件路径、许可证、`paletteIndex`、`colorId`、`Z/ZG` 和派生字段规则记录在 [`MARD-291-VERIFICATION.md`](./MARD-291-VERIFICATION.md) 中。

本次导入的 Lab 使用确定性的 sRGB → CIELAB D65 规则：sRGB 通道按标准 gamma 分段线性化，使用 D65 XYZ 矩阵与 D65 白点 `Xn=0.95047`、`Yn=1`、`Zn=1.08883`，再按 CIELAB epsilon/kappa 分段函数计算。该 Lab 是拼豆工坊基于公开 RGB 参考值的派生数据，不是 MARD 官方原始测色值。

`family` 使用产品派生的稳定系列分组 `series:A`、`series:B`、`series:C`、`series:D`、`series:E`、`series:F`、`series:G`、`series:H`、`series:M`、`series:P`、`series:Q`、`series:R`、`series:T`、`series:Y`、`series:ZG`，不是 MARD 官方分类。

当前 production Lab 已静态写入 Palette。未来如果新增 Palette importer 或重新生成 Lab，必须继续使用固定系列/编号映射，禁止根据 CSV 行号分配 `paletteIndex`；任何索引映射变化都必须显式升级 `paletteVersion`。重新生成 Lab 前，还必须将完整的 sRGB linearization、RGB→XYZ 矩阵、D65 white point、epsilon/kappa、XYZ→Lab 公式以及已知 RGB→Lab 参考点测试固化到代码和测试中。上述属于后续可复现性工作，不影响当前静态 production Palette。

### 7.3 最近颜色匹配

V1 采用确定性的 CIELAB D65 + ΔE76：

1. Palette 文件预先保存每个颜色的 Lab 值；若 Lab 由公开 RGB 参考值计算，必须记录为系统派生数据，而非 MARD 官方原始测色值。
2. 输入像素从 sRGB 转换为 Lab。
3. 遍历 291 个 Palette entry，计算 Lab 欧氏距离平方。
4. 选择距离最小的 `paletteIndex`。
5. 距离相同按稳定的 `paletteIndex` 打破平局。

MARD 291 个颜色规模很小，V1 不需要 KD-tree、向量数据库或复杂近似索引。若后续测试证明逐像素遍历成为瓶颈，再单独优化，不在初版引入抽象。

V1 不使用 CIEDE2000、机器学习或用户自定义颜色。若产品后续认为视觉匹配质量不足，可替换 `findNearestPaletteColor`，不影响 Grid、编辑器和导出器接口。

### 7.4 搜索、分类和相近颜色推荐

- 色号搜索：对 `colorId` 和 `displayCode` 做规范化字符串包含匹配。
- 名称搜索：对 `name` 做规范化字符串包含匹配。
- 按色系：按 `family` 分组后排序展示。
- 按色号：按稳定色号排序。
- 当前作品已使用：读取 `ProjectStats.usedPaletteIndices`。
- 最近使用：只保存 UI 层的 palette index 列表，不改变 Project。
- 相近颜色：使用同一个 Lab 距离函数返回距离升序的候选，不允许推荐结果变成任意 RGB。

## 8. 图片生成流水线

### 8.0 统一尺寸配置

宽度规则集中定义在生成配置模块，不在页面、校验器、生成器和测试中分别硬编码：

```text
MIN_GRID_WIDTH = 8
MAX_GRID_WIDTH = 256
DEFAULT_GRID_WIDTH = 64
QUICK_GRID_WIDTHS = [32, 48, 64, 96]
BEAD_SIZE_MM = 2.6
```

用户输入必须通过统一配置校验。高度只能由最终确认的裁剪区域最终视觉宽高比计算：

> `heightBeads = max(1, round(widthBeads / visualAspectRatio))`

最终视觉比例异常时优先提示风险。V1 不定义总格数 warning、error、reject 或产品硬上限，具体性能安全边界通过后续测试确定。

### 8.1 统一输入输出

生成器不依赖 Vue 或 Pinia，也不读 Store。它接收一个不可变的 `GenerationRequest`：

```text
GenerationRequest
├─ originalImage: Blob / ImageBitmap
├─ crop: CropState
├─ widthBeads: number
├─ mode: 'optimized' | 'high-fidelity'
├─ paletteVersion: string
└─ algorithmVersion: string
```

输出：

```text
GenerationResult
├─ grid: Grid
├─ heightBeads: number
├─ paletteVersion: string
├─ algorithmVersion: string
└─ diagnostics
   ├─ sourceSize
   ├─ cropSize
   └─ elapsedMs
```

生成器只输出合法 Grid，不输出“接近某个颜色但尚未决定”的中间颜色。

### 8.2 流程

```text
原始图片
  → 读取已确认裁剪状态
  → 计算裁剪区域宽高比
  → 依据宽度计算高度
  → 旋转 / 裁剪到源图区域
  → 重采样到 widthBeads × heightBeads
  → 处理 RGBA 与透明区域
  → 映射至 MARD 291 色
  → 按生成模式执行基础规则
  → 输出 Grid + 版本信息
```

所有生成模式都从 `originalImage + crop` 开始。模式切换不得把现有 Grid 当作下一次生成的输入。

### 8.3 重采样

V1 使用浏览器 Canvas 2D 的高质量 `drawImage` 重采样：

- 目标尺寸严格等于 `widthBeads × heightBeads`。
- 每个目标像素对应一个 Grid 格子。
- 保留 RGBA，不能把所有输入先强制铺成白色背景。
- 生成任务在 Web Worker 中优先执行，避免大图片处理阻塞编辑器。

若浏览器 Worker 无法直接解码某种图片格式，使用主线程解码后把 `ImageBitmap` 或像素数据传入 Worker；这属于适配层，不改变生成算法。

### 8.4 高清还原模式

V1 基础方案：

1. 对目标尺寸进行一次重采样。
2. 对每个非透明目标像素执行一次最近 Palette 匹配。
3. 不做碎色合并。
4. 不做主动轮廓强化。
5. 不做背景删除或分类。

该模式的目标是相对于拼豆优化模式保留更多颜色、明暗和局部变化，同时最终值仍只能是 MARD 291 色中的 `colorId`。

### 8.5 拼豆优化模式

V1 不做图像分类，采用统一的、可测试的基础规则。推荐分成三个独立纯函数阶段：

#### A. 碎色优化

先得到一个合法的高还原 Grid，再识别同色的四邻域连续区域，计算：

- 区域大小
- 与周围颜色的 Lab 距离
- 与周围主色的接触数量
- 是否位于明显边缘
- 是否属于孤立杂点

按照 PRD 的倾向处理：

- 1 颗：强合并候选
- 2 颗：合并候选
- 3 颗：结合邻域判断
- 4～6 颗：通常保留
- 7 颗以上：默认保留

候选只有在相近、孤立且不承担关键结构时才允许合并。目标颜色从相邻主色中选择，不允许跳到任意 RGB。具体距离阈值和保护阈值作为带版本号的内部算法参数，并通过样例测试和人工验收调节，不做用户设置项。

#### B. 基础轮廓强化

不绘制统一黑色描边。使用重采样前的亮度 / 颜色梯度计算边缘候选，保护：

- 主要外轮廓
- 大型内部结构边界
- 明显形状转折

边缘保护主要用于阻止碎色合并；只有在目标 Palette 中存在色差足够、色调相近的合法候选时，才允许做保守的颜色映射调整。没有合适候选时保留原映射结果，不强行加轮廓。

#### C. 基础背景简化

只对大面积背景中的相近碎色做保守合并，保留主要背景色块。不能根据“看起来像背景”自动删除区域，也不能把普通白色转成透明。

三个阶段必须分别有输入输出测试，算法参数和版本写入 `GenerationResult`，这样后续优化算法时不会重写编辑器。

## 9. EMPTY 与透明区域

### 9.1 语义定义

| 输入 / 操作 | Grid 结果 |
| --- | --- |
| PNG 中 alpha 为 0 的真实透明像素 | `EMPTY`，内部值 0 |
| 普通白色且 alpha 大于 0 | MARD 291 色中的真实白色 palette index |
| 任意非透明像素 | 某个合法 palette index |
| 橡皮擦 | `EMPTY` |
| 填充为白色 | 白色 palette index，不是 `EMPTY` |

`EMPTY` 不能通过颜色相似度产生，不能为了减少豆数产生，也不能在渲染时用白色替代其数据语义。

### 9.2 处理规则

- 内部只保留一个 `EMPTY = 0` 常量。
- 所有统计都跳过 0；白色正常计数。
- Canvas 对 `EMPTY` 使用明确的空格视觉，不从白色色卡渲染。
- PNG 和 PDF 导出必须继续区分空格与白色拼豆。
- 单元测试必须覆盖透明 PNG、白色 PNG、白色擦除和重新填白四种情况。

### 9.3 Alpha 合成纯函数

Alpha 处理独立于 Vue、Pinia、Canvas 和生成模式，作为可单元测试的纯函数：

```text
compositeAlphaOverWhite({ r, g, b, alpha })

if alpha === 0:
  return EMPTY

a = alpha / 255
return {
  r: round(r × a + 255 × (1 - a)),
  g: round(g × a + 255 × (1 - a)),
  b: round(b × a + 255 × (1 - a))
}
```

处理顺序固定为：

1. `alpha === 0` 时输出 `EMPTY`，不得进行颜色匹配。
2. `alpha > 0` 时先与白色背景合成，半透明像素不得视为空白。
3. 将合成后的 RGB 映射到 MARD 291 色中的唯一 `colorId`。

因此完全透明、半透明和普通白色在 Grid 中始终分别表现为 `EMPTY`、映射后的 MARD 颜色和真实白色 MARD 颜色。

## 10. 编辑器架构

### 10.1 Store 分工

#### `projectStore`（Pinia）

唯一持有：

- 当前 `Project`
- 当前 Grid
- 当前派生统计缓存
- 生成状态和错误状态
- 统一 Grid 操作
- Undo / Redo

#### `editorStore`（Pinia）

只持有跨页面、跨核心组件共享的编辑器状态：

- 当前活动工具
- 当前活动颜色
- 颜色高亮
- Canvas viewport
- 网格 / 色号 / 原图显示开关
- 迷你导航图折叠状态

`editorStore.activePaletteIndex` 是整个编辑器唯一的当前活动颜色。右侧颜色管理和左侧画笔通过同一个 Pinia store 读写，不各自保存一份。

Grid 在 Pinia 中不做深度原地响应式修改：使用不可变的 Project / Grid 快照，或使用等价的浅层引用保存 `Uint16Array`；每次操作都通过 action 替换新的 `cells` 并增加 `project.revision`。Canvas renderer 订阅 revision 和必要的派生数据，不直接依赖 TypedArray 的深层代理。这是 Vue 响应式层与高频画布数据之间的边界。

#### 组件本地临时 UI 状态

以下状态不进入 Pinia，直接保留在对应 Vue 组件的 `ref` / `reactive` 中：

- 颜色搜索框的临时输入文本和下拉面板开关
- Cropper.js 内部的拖拽、缩放和手势过渡状态
- Tooltip、Popover、菜单和临时确认弹窗的打开状态
- 尚未确认的 PDF 设置草稿
- 当前 pointer 手势中的临时路径和局部预览
- 组件内部的加载动画、焦点和 Hover 状态

组件本地状态只影响自身临时 UI；一旦成为跨组件或跨页面的正式 Project / 编辑器状态，才通过 Pinia action 提交。这样既保持单一事实来源，又避免把所有短暂交互塞进全局 Store。

### 10.2 工具到数据的关系

| 工具 | 读取 | 写入 | 是否产生历史 |
| --- | --- | --- | --- |
| 选择 | Grid、viewport | 当前选中位置 | 否 |
| 单颗改色 | 当前活动颜色、Grid | 一个或多个 Grid cell | 是 |
| 画笔 | 当前活动颜色、指针路径 | 一次手势涉及的 cells | 是，一次手势一条 |
| 填充 | 起点、Grid、当前活动颜色 | 连通区域 cells | 是，一次填充一条 |
| 吸管 | Hover cell 的 palette index | `editorStore.activePaletteIndex` | 否 |
| 橡皮擦 | Grid | 目标 cell 变为 EMPTY | 是 |
| 撤销 / 重做 | History、Project | 恢复 Grid 快照 | 不再新增历史 |
| 全局替换 | Grid、目标 palette index | 全部匹配 cell | 是，一次替换一条 |

右侧颜色列表不拥有颜色数量；它通过 `projectStore` 的 Grid 和共享统计函数派生。迷你导航图不拥有缩略 Grid，而是把同一个 Grid 以更小比例绘制。

### 10.3 生成与切换模式

- 进入结果页后，Canvas 和面板都读取当前 Project。
- 返回裁剪页只改变当前路由和 Cropper UI，不清除原始图片、上次裁剪、上次宽度和上次模式。
- 确认新的裁剪或宽度后，从 `source.originalImage` 重新生成。
- 切换模式前，如果有编辑历史，先显示 PRD 要求的清除提示；确认后重新生成并清空 Undo / Redo。
- 生成期间禁用会改变同一 Project 的冲突操作，取消或失败时保留上一次合法 Project。

## 11. Undo / Redo

### 11.1 方案比较

| 方案 | 优点 | 问题 | 结论 |
| --- | --- | --- | --- |
| 完整 Grid 快照 | 实现简单，恢复可靠，所有操作统一处理，容易测试 | 大 Grid 多次快照占内存 | **V1 采用** |
| Command / Patch | 节省空间，理论上适合长历史 | 每种操作都要写反向逻辑，填充、全局替换和版本变化容易出错 | V1 不采用 |
| Immer / 结构共享树 | 写操作直观 | 为 TypedArray 和 Canvas Grid 增加不可见复杂度，调试边界更多 | V1 不采用 |

### 11.2 选定实现

使用内存中的完整 `Uint16Array` 快照：

```text
HistoryState
├─ past: GridSnapshot[]
├─ future: GridSnapshot[]
└─ maxEntries: implementation limit
```

一次编辑提交时：

1. 把编辑前的 `cells.slice()` 推入 `past`。
2. 应用新的 Grid。
3. 清空 `future`。

撤销时把当前 Grid 快照推入 `future`，从 `past` 恢复；重做时反向执行。只要 Grid 宽高没有变化，就不需要在每个快照中重复保存宽高。

### 11.3 操作边界

- 单颗改色：一条历史。
- 画笔连续拖动：按一次 pointer down / up 视为一条历史，不按每颗豆记录。
- 填充：一条历史。
- 橡皮擦：单颗擦除一条历史；连续擦除按一次手势合并。
- 全局颜色替换：一条历史。
- 模式切换、重新裁剪后重新生成：确认后替换 Grid，并清空旧历史，不允许跨生成撤销。
- 吸管、缩放、平移、颜色高亮：不产生历史。

初版建议最多保留 50 条历史；若 Grid 超出安全内存预算，按实际可用内存降低上限。该上限是技术保护，不是向用户承诺的产品数量，具体值应通过真实浏览器测试调整。

## 12. Canvas 渲染

### 12.1 渲染职责

Canvas renderer 只接收不可变的：

- Grid 快照
- Palette
- ProjectStats
- `EditorState`
- Canvas 尺寸和 device pixel ratio

它不直接读 Vue 组件 state，也不修改 Project。

### 12.2 坐标和视口

使用世界坐标和屏幕坐标分离：

- 世界坐标：`column`、`row` 和单元格尺寸。
- 屏幕坐标：Canvas CSS 像素。
- `zoom`：0.1～8.0，对应 PRD 建议的 10%～800%。
- `panX / panY`：世界坐标到屏幕坐标的平移。

鼠标缩放时，以鼠标所在世界坐标为锚点调整 pan，使缩放尽量围绕鼠标位置。空格 + 左键和中键都进入拖动模式。

### 12.3 分层绘制

一次渲染按以下顺序执行：

1. 清空背景。
2. 根据 viewport 只遍历可见 Grid 范围。
3. 绘制非 EMPTY 单元格颜色。
4. 绘制颜色高亮和其他颜色降权效果。
5. 按缩放等级绘制单颗网格。
6. 每 10 格绘制更明显的辅助线。
7. 达到文字可读倍率后绘制色号。
8. 绘制 Hover、选中和编辑预览。
9. 绘制顶部列号和左侧行号。

低倍率下隐藏或弱化细网格和文字；高倍率下才绘制每颗色号，避免低倍率文本挤在一起。

### 12.4 交互与性能

- 使用 `requestAnimationFrame` 合并连续 viewport 和 pointer 更新。
- 画布尺寸使用 device pixel ratio 适配，但限制内部像素尺寸，避免超大 Canvas。
- 通过世界坐标反算 Hover 的 row / column，命中测试不读取 DOM 网格。
- 颜色高亮只改变绘制权重，不创建一份高亮 Grid。
- 编辑后只标记 renderer 需要重绘，不让无关的 Vue 响应式更新触发整棵页面树重渲染。
- 迷你导航图可以使用独立 Canvas，但必须读取同一个 Grid 和 viewport 映射。

### 12.5 原图对比

按住“原图”按钮时，renderer 切换到裁剪后的原始图片预览；松开后恢复 Grid 绘制。裁剪后的原图是从同一个原始图片和 CropState 生成的显示缓存，不是另一份用户可编辑作品数据。

## 13. PNG 与 PDF 导出

### 13.1 统一 Export Snapshot

导出开始前创建一次不可变 `ExportSnapshot`：

```text
ExportSnapshot
├─ project metadata（含 projectName）
├─ grid: copied Grid
├─ palette: exact paletteVersion
├─ stats: deriveProjectStats(grid)
└─ exportOptions
```

PNG 和 PDF 只接受这个快照，不直接订阅 UI Store。导出过程中用户继续编辑不会改变正在生成的文件。

导出模块可以调用同一个共享 `deriveProjectStats` 做快照构建，但不得再实现第二套计数、颜色过滤或 EMPTY 判断逻辑。

PNG 和 PDF 共同使用文件名生成函数。文件名基于作品名称和最终尺寸：

```text
fileNameBase = sanitizeFileName(`${projectName}_${width}x${height}`)
```

清理逻辑移除 Windows / macOS 等常见文件系统不允许的特殊字符（包括控制字符），并去除末尾空格和句点；清理后为空时回退为“未命名作品”。因此同一作品的导出文件名分别为 `{作品名称}_{width}x{height}.png` 和 `{作品名称}_{width}x{height}.pdf`，两种格式共用同一命名函数。

### 13.2 效果预览 PNG

使用 renderer 的效果模式：

- 绘制拼豆成品效果。
- 包含作品尺寸和 2.6mm 规格。
- 不包含制作参考图所需的完整坐标、色号和材料清单布局。

输出通过 Canvas `toBlob()` 生成 PNG Blob，再触发浏览器下载。

### 13.3 制作参考 PNG

使用同一 Grid 的制作模式 renderer，包含：

- 彩色拼豆图
- 网格
- 色号
- 行列编号
- 每 10 格辅助线
- 实际使用的每种色号
- 每种色号的数量
- 使用颜色总数
- 拼豆总数

图例和数量直接读取 `ExportSnapshot.stats`，不从渲染结果反推。

### 13.4 PDF 结构

使用 `pdf-lib` 在浏览器中生成：

1. 总览页：作品名称、完整效果图、尺寸、2.6mm、实际成品尺寸、使用颜色数量和总豆数。
2. 分页制作图：每颗豆颜色和色号、网格、行列编号、每 10 格粗线、页码、当前分页在整幅作品中的位置缩略图。
3. 材料清单页：色号、名称、使用数量、建议准备数量；建议准备数量按默认 5% 损耗计算。

PDF 需要嵌入可授权的中文字体，不能依赖 PDF 标准字体显示中文色名或作品名。彩色模式直接使用 Palette RGB；黑白模式保留清晰色号，不引入颜色图形符号系统。

### 13.5 PDF 分页

分页器接收：

```text
PaginationInput
├─ paper: A4
├─ orientation: auto | portrait | landscape
├─ marginsMm: 10
├─ targetCellMm: 6
├─ readableCellMmRange: { min: 5, max: 7 }
├─ showGrid: true
├─ showLabels: true
├─ showCoordinates: true
├─ showTenCellGuides: true
├─ includeMaterials: true
├─ colorMode: color | monochrome（默认 color）
├─ wasteRate: 0.05
└─ manualCells: { columns, rows } | null
```

自动分页不固定 40 × 40，按以下优先级推荐每页格数：色号清晰可读、单格达到足够打印尺寸（目标约 6mm，合理范围约 5～7mm）、在可读性允许的前提下尽量减少分页数量。页面方向根据 A4 有效打印区域自动选择，页边距默认 10mm，色号字号根据实际单格尺寸自动计算。

用户手动提高横向 / 纵向格数后，重新计算预计页数；如果预计单格小于合理范围或色号可读性下降，设置页显示警告，但仍允许用户继续导出。

分页器只决定“哪些 row / column 范围属于当前页”，不重新生成颜色或统计。每页使用同一个 Grid 的切片视图和同一个 Palette。

## 14. 本地状态和数据保存

### 14.1 存储选择

| 数据 | 内存 | IndexedDB | localStorage |
| --- | --- | --- | --- |
| 当前 Project | 主来源 | 保存当前会话副本 | 不保存 |
| 原始图片 Blob | 当前生成期间使用 | **保存** | 不保存 |
| CropState / 生成设置 | 保存 | **保存** | 不保存 |
| Grid | 主来源 | 保存当前结果副本 | 不保存 |
| Undo / Redo | **只保存在内存** | 不保存 | 不保存 |
| viewport、工具和显示开关 | **只保存在内存** | 可选保存少量 UI 偏好 | 不要求 |

IndexedDB 适合保存较大的结构化数据和 Blob；localStorage 只适合很小的字符串，不用于图片或 Grid。

### 14.2 会话记录

V1 只维护一个“当前工作会话”记录，不做作品列表：

```text
active-session
├─ schemaVersion
├─ updatedAt
├─ originalImage: Blob
├─ originalFileName: string | null
├─ crop
├─ widthBeads
├─ heightBeads
├─ generation mode
├─ paletteVersion
├─ current Grid
└─ projectName
```

保存策略：

- 上传原图后立即保存原图和输入信息。
- 裁剪确认、宽度确认和生成完成后保存快照。
- 保存自动计算后的高度、当前 MARD Palette 版本和作品名称。
- 编辑操作保存 Grid 的最新副本时做节流或合并，避免每个 pointer 事件都写 IndexedDB。
- Undo / Redo 不持久化；刷新后恢复当前 Grid，但从空历史开始。
- 用户开始新的图片流程时替换当前会话，不保留旧作品库。

### 14.3 刷新、返回和生成中的状态

- 刷新页面：启动时读取 active-session；若存在合法快照，恢复原图、裁剪、宽度、高度、模式、MARD Palette 版本、作品名称和当前 Grid。
- 返回裁剪页：保留原始上传图片、上次裁剪范围、上次宽度和上次生成模式；不要求重新上传。
- 重新确认裁剪或宽度：从原始图片重新生成，替换 Grid 并清空历史。
- 生成中刷新：不保存半成品；恢复后从原始图片和已保存输入重新开始生成。
- 生成失败：保留上一个合法 Project，不用失败的半成品覆盖它。
- 新建流程：清除 active-session 或覆盖为新原图；这不是云端删除，因为 V1 不提供云端作品管理。
- 不恢复 Hover、鼠标位置、临时弹窗、临时预览或其他瞬时 UI 状态。

## 15. 测试架构

### 15.1 单元测试

使用 Vitest 测试不依赖 DOM 的核心模块：

- 宽高计算：裁剪比例 4:3 + 宽度 64 得到高度 48。
- 2.6mm 成品尺寸计算。
- Grid index 与 row / column 转换。
- `EMPTY = 0` 与白色 palette index 不相等。
- `setCell`、画笔、四邻域填充、橡皮擦和全局替换。
- Undo / Redo 的每种操作及新操作清空 Redo。
- MARD 291 色恰好 291 条、`colorId` 唯一、索引合法。
- 最近颜色匹配只返回 MARD 291 色中的 palette index。
- alpha 为 0 时输出 EMPTY，半透明像素先合成白色背景，普通白色输出 MARD 白色 palette index。
- 高清还原和优化模式的基本规则。
- 统计中总豆数不含 EMPTY，每种颜色数量正确。
- 5% 损耗的材料准备数量。
- PDF 分页推荐与手动分页的页数计算。

### 15.2 组件测试

使用 Vitest + Vue Test Utils 从用户行为验证：

- 右侧选择颜色后画笔使用同一个活动颜色。
- 吸管后右侧颜色管理自动定位同一颜色。
- 填充只影响连续同色区域。
- 橡皮擦白色后变成 EMPTY，而不是另一个白色。
- 模式切换在有编辑历史时显示清除提示。
- 颜色列表、总豆数和高亮状态随 Grid 编辑同步。
- 网格、色号、原图对比和导航图开关与 renderer 状态一致。
- PDF 分页设置改变后预计页数更新。

### 15.3 端到端测试

使用 Playwright 覆盖一条真实主流程：


1. 打开首页并上传固定测试图片。
2. 完成裁剪并设置宽度 64。
3. 验证 4:3 测试图生成 64 × 48。
4. 生成默认拼豆优化模式。
5. 验证所有 Grid 颜色来自 MARD 291 色。
6. 修改单颗、画笔、填充、橡皮擦并撤销 / 重做。
7. 替换一种颜色并验证统计同步。
8. 导出两类 PNG 和 PDF。
9. 验证导出材料数量与右侧统计一致。
10. 刷新页面，验证当前会话能够恢复。

下载文件的内容测试应至少解析 PNG 尺寸、PDF 页数和材料清单中的关键数字；不能只测试按钮点击后没有报错。

### 15.4 测试夹具

建立少量固定图片夹具：

- 4:3 普通彩色图
- 含真实透明区域的 PNG
- 白色背景图
- 大面积纯色图
- 少量孤立杂点图
- 高对比轮廓图

夹具应小而可读，避免测试依赖随机图片和肉眼无法复现的结果。

## 16. 性能边界与建议

以下是工程测试建议，不是对 PRD 的擅自产品限制。

### 16.1 作品宽度

- 产品允许的宽度范围为 8～256 颗，默认 64 颗，快捷值为 32、48、64、96；实现使用统一配置常量，不在组件和算法中散落硬编码。
- 高度继续由最终裁剪区域宽高比自动计算；应覆盖最小宽度、最大宽度和极端裁剪比例的测试。
- 本方案不新增总格数 warning、error、reject 或硬性上限；总格数性能安全边界通过后续压力测试确定，并单独报告，不擅自改变产品范围。

### 16.2 图片尺寸

- 常规测试建议覆盖最长边 4096px 的图片。
- 更大的图片应在解码后预处理到生成所需范围，避免把原始超大像素全部复制到多个中间 Canvas。
- 不能因为技术方便而拒绝 PRD 允许的 JPG、PNG、WEBP；格式错误应明确提示。
- 图片分辨率低时按 PRD 提示风险但允许继续。

### 16.3 内存风险

Grid 每格使用 2 字节；512 × 512 约 0.5MB，1024 × 1024 约 2MB，尚未计算 Canvas、图片和 Undo 快照。50 个完整快照在 1024 × 1024 时可能达到约 100MB，因此必须：

- 画笔按手势合并历史。
- 不复制不必要的原始像素。
- 生成和导出完成后释放中间 ImageData / ImageBitmap。
- 对大作品使用技术保护和可观测错误，不静默崩溃。

### 16.4 Canvas 与 PDF

- 主画布使用可见区域绘制，避免每次把所有文字都绘制到屏幕。
- 低倍率不绘制色号文字。
- 迷你导航图使用低分辨率绘制，不创建第二份 Grid。
- 大量 PDF 分页可能占用较多内存，导出应显示进行中状态；必要时分阶段释放页面临时对象。

### 16.5 浏览器基线

建议先以当前主流 Chromium 为主验收环境，并对 Firefox 和 Safari 做关键流程冒烟测试。`createImageBitmap`、Web Worker、Canvas、IndexedDB 和下载行为都要有兼容适配；不应把某一个浏览器的私有 API 作为 V1 必需条件。

## 17. 推荐项目目录

目录保持浅层，按职责而不是按未来业务域无限拆分：

```text
src/
├─ app/
│  ├─ routes/
│  └─ providers/
├─ components/                  # 少量跨页面通用 UI
├─ features/
│  ├─ home/
│  ├─ upload/
│  ├─ crop/
│  ├─ editor/
│  └─ export/
├─ domain/
│  ├─ project/                   # Project、Grid、统计、历史操作
│  ├─ palette/                   # Palette 数据、校验、搜索、匹配
│  └─ generation/                # 生成流水线和优化规则
├─ rendering/
│  ├─ bead-canvas-renderer.ts
│  └─ minimap-renderer.ts
├─ storage/
│  └─ active-session-store.ts
├─ workers/
│  └─ generation.worker.ts
├─ styles/
│  ├─ tokens.css
│  └─ globals.css
└─ test-utils/

public/
├─ palette/
└─ fonts/

tests/
├─ e2e/
└─ fixtures/
```

职责边界：

- UI 在 `features/` 和 `components/`。
- `Project`、`Grid`、统计和 Undo / Redo 在 `domain/project/`。
- MARD 291 色色卡和匹配在 `domain/palette/`。
- 图片生成、碎色、轮廓和背景规则在 `domain/generation/`。
- 主画布和迷你导航图只负责渲染与交互转换，在 `rendering/`。
- PNG / PDF 编排在 `features/export/`，但只能消费统一 Export Snapshot。
- 测试夹具和 E2E 在 `tests/`；纯函数单测可以与 domain 文件相邻。

不创建 `services/`、`repositories/`、`use-cases/` 等空抽象层。只有当真实代码出现跨模块职责时才增加文件或边界。

## 18. 部署方案

### 18.1 生产形态

- GitHub 仓库作为源代码和版本记录。
- Cloudflare Pages 连接仓库，执行前端构建并发布 `dist/`。
- 配置 SPA fallback，保证刷新裁剪页和编辑页不会返回 404。
- 不配置 API、数据库、对象存储或服务端密钥。
- 用户图片只在浏览器本地处理，不进入部署平台。

### 18.2 CI 建议

每次推送至少执行：

1. TypeScript 类型检查。
2. 单元测试。
3. 生产构建。
4. 可选的 Chromium E2E 主流程。

部署只发布通过构建和核心测试的静态产物。V1 不为部署引入容器、编排、预发布集群或服务端监控系统。

## 19. 技术风险分析

### 高风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| MARD 291 色号或数字参考数据不准确、来源不清或版本不明确 | 所有生成、编辑、统计和图纸都可能失去实际制作价值 | 正式落库前核验采用的 MARD 色号体系、固定公开数据来源、commit、完整性和冲突；构建时做恰好 291 条、唯一性和字段合法性校验；Project 固定 `paletteVersion`，并明确 RGB/HEX 不是官方标准数字色值 |
| 拼豆优化算法质量不足 | 可能出现大量杂色、轮廓丢失或结果与高清模式无明显差异 | 先用纯规则和固定夹具；每个阶段单测；用 PRD 验收样例持续调参，不引入不可解释的 AI |
| 浏览器图片处理和内存压力 | 大图或大 Grid 可能卡顿、崩溃或导致标签页被系统回收 | Worker 处理、目标尺寸重采样、释放中间对象、历史上限、压力测试和明确错误状态 |
| Canvas 大作品交互性能 | 缩放、拖动、色号和高亮同时开启时可能掉帧 | 可见区域绘制、requestAnimationFrame、低倍率隐藏文字、renderer 与 Vue 响应式层解耦；必要时再局部优化 |
| PDF 分页和中文字体 | 大作品页数多、文字不可读或中文缺字会使导出图纸不可用 | 使用固定的分页输入模型、嵌入可授权中文字体、做页数和关键文本解析测试 |

### 中风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Undo / Redo 快照占用内存 | 长时间编辑大作品可能增加内存压力 | 以手势为历史单元，限制历史条数，监控大 Grid；暂不实现复杂 Patch |
| Cropper 坐标、旋转和源图坐标转换错误 | 裁剪结果与生成结果不一致 | 统一 CropState 坐标系，使用旋转和透明 PNG 夹具测试 |
| 半透明 PNG 的 Alpha 合成边界错误 | 半透明区域可能被误判为 EMPTY 或映射到错误颜色 | 将 Alpha 合成白色背景实现为独立纯函数，覆盖 alpha=0、alpha=255 和中间值测试 |
| 浏览器 API 差异 | 某些浏览器的图片解码、Worker 或下载行为不同 | 主流 Chromium 验收，Firefox / Safari 冒烟，提供解码和 Worker fallback |
| IndexedDB 配额或隐私模式不可用 | 刷新恢复失败，但不应影响当前内存编辑 | 存储失败时继续内存运行并明确提示，不把 IndexedDB 当作唯一实时来源 |

### 低风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| MARD 291 色搜索和分类实现偏差 | 选色体验异常但不影响 Grid 合法性 | 直接基于唯一 Palette 做搜索和分组测试 |
| 静态部署配置错误 | 路由刷新或构建产物访问失败 | 在 CI 验证构建产物，并配置 SPA fallback 和生产冒烟测试 |
| 局部 UI 状态不同步 | 工具或显示开关表现异常 | 跨组件 UI 状态集中在 editorStore，核心数据集中在 projectStore，组件测试覆盖联动 |

## 20. 已确认产品规则与实现前置校验

以下正式产品规则已同步到 PRD，技术实现必须以此为准：

1. **MARD 291 色**：Palette 是全系统唯一的 MARD 291 色号体系和数字参考数据事实来源。V1 采用版本锁定的公开数字参考值；该数字数据不是 MARD 制造商官方 RGB/HEX 标准。正式 Palette 已由 TASK-015 导入本地资源，必须继续核验来源、固定版本、色号完整性和字段准确性。
2. **半透明 PNG**：alpha=0 转为 EMPTY；alpha>0 不视为空白，其中半透明像素先与白色背景合成，再映射到 MARD 291 色。Alpha 合成必须是独立可测试纯函数。
3. **作品宽度**：统一配置为最小 8、最大 256、默认 64，快捷值 32、48、64、96；高度按最终裁剪比例计算，不新增总格数产品上限。
4. **当前会话恢复**：IndexedDB 只保存当前作品状态，包括可恢复原图、裁剪信息、尺寸、模式、Palette 版本、Grid、作品名称和必要数据，不保存瞬时 UI 状态，也不形成作品库。
5. **作品名称与导出文件名**：文件上传默认取去扩展名的原文件名，粘贴图片无文件名时使用“未命名作品”；结果页可编辑，PNG/PDF 共用清理后的 `{作品名称}_{width}x{height}` 文件名基底。
6. **PDF 默认可读性**：A4、10mm 页边距、自动方向、单格目标约 6mm（合理范围 5～7mm），默认开启网格、坐标、10 格粗线、色号和材料清单，默认彩色、5% 损耗；分页优先保证可读性，手动调大每页格数导致可读性下降时警告但允许导出。

### 20.1 尚未确认的产品问题

产品负责人已确认采用“版本锁定的公开数字参考”方案，TASK-015 已按该方案完成本地导入。导入记录仍必须保留数据来源和固定 commit、`paletteVersion`、`Z` / `ZG` 等未解决的色号口径，以及 RGB/HEX、Lab 和 family 的来源属性；不得静默选择或把公开参考值描述为 MARD 官方标准。总格数性能安全上限明确不作为当前产品固定限制，待压力测试后作为工程建议和风险报告处理。

## 21. 审核结论

在不增加后端、不引入 AI、不做跨端架构的前提下，本方案可以覆盖 PRD V1 的图片上传、裁剪、两种生成模式、MARD 291 色编辑、Grid 编辑、统计、PNG、PDF 和会话恢复要求。

最重要的实现约束只有三条：

1. 所有模块只围绕同一个 `Project/Grid` 工作。
2. 所有最终颜色都通过唯一 Palette 映射为合法 `colorId`。
3. 所有耗时生成都从原始图片和确认后的裁剪信息重新开始，不能从当前成品图二次生成。

本文件是技术方案，不替代 `docs/product/PRD-V1.md`，也不包含 `V1-TASKS.md` 或任何开发任务拆解。
