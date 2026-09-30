# TASK-037 Generation Integration Contract

> 状态：Recovery freeze（实现前冻结）
>
> 适用任务：TASK-037「接入生成结果、模式切换与 Project 提交（P0）」
> 核查基线：`2c58cc699af255b92797992350ae293da9041a04` (`chore: enforce lf line endings`)

本文冻结 TASK-037 的生成请求、Worker、Project 提交、模式切换和路由边界。正式任务范围仍以 `docs/plans/V1-TASKS.md` 为准；本文不实现任何功能，也不把 TASK-040～042 的能力提前纳入 TASK-037。

## 1. Purpose

把现有基础生成流水线接入真实用户流程：以当前 Project 中确认的原图、裁剪和生成尺寸建立请求，在 Worker 返回合法结果后，原子地提交到同一个 Project，并且只在提交成功后进入 Editor。

Project 是当前作品的唯一业务事实来源。生成期间允许存在临时请求和 Worker 结果，但不建立第二份持久 Grid。

## 2. Formal Scope and Dependencies

- 正式标题：TASK-037「接入生成结果、模式切换与 Project 提交（P0）」；优先级 P0。
- 前置依赖：TASK-029、TASK-035、TASK-036、TASK-004。
- 范围：生成中 / 成功 / 失败状态；生成结果提交；模式切换确认后从原图创建新请求；存在手工编辑时提示清除。
- 不在范围：优化算法本身、完整结果页布局、导出。
- 正式验收：默认 optimized；模式切换请求源是原图与 CropState；取消保留编辑，确认后重新生成；失败不覆盖上一个合法 Project。
- 正式自动化测试：Unit 覆盖状态机、失败回滚、请求来源和历史清理；Component 覆盖清除提示取消 / 确认；E2E 至少覆盖一次确认模式切换。

此处“失败不覆盖上一个合法 Project”指失败结果不得以部分 / 错误 Grid 覆写请求开始时的当前 Project。请求开始前已经正式应用的 crop / width / mode 配置 mutation 及其 `grid = null` 状态属于当前 Project，不因 generation failure 回滚。

PRD §2.1、§8、§13.2 要求上传→裁剪→设置→生成→结果页流程，模式仅为 `optimized` / `high-fidelity`，默认 optimized，切换必须从原始裁剪图重新生成。有编辑时必须提供“取消 / 重新生成”提示。TECH §5.2、§8、§10.3、§14.3 规定 Project/Grid 单一事实来源、Worker 不读写 Store、从原图重生成、immutable 替换同一个 Project 的 Grid，以及生成失败保留上一个合法 Project。

## 3. Non-goals

- 不实现 TASK-040 轮廓保护、TASK-041 背景简化或 TASK-042 完整 optimized orchestration。
- 不重写 TASK-038 region detection 或 TASK-039 fragment merge，也不改变其公共输入输出 / 算法规则。
- 不复制 TASK-030 rasterization、TASK-031 alpha、TASK-033 resampling、TASK-034 Palette mapping、TASK-035 Grid generation 或 TASK-036 high-fidelity 的实现。
- 不实现完整三栏编辑器、编辑工具、导出或 TASK-062 History。
- 不新增 Project schema、持久 generation 状态、Grid 编码或 Project 版本字段。

## 4. Existing Implementation Audit

| 模块                                                                       | 当前已有                                                                                                                                         | TASK-037 缺失 / 风险                                                                                 | 是否可直接复用                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/features/crop/CropView.vue`                                           | 图片输入、Cropper、确认裁剪、宽度和双模式选择；确认切换时会更新 Project mode、清空 Grid 并调用 `prepareGenerationRequest()`                      | 没有 Generate 按钮、Worker 调用、真实 loading/error UI 或 Editor 导航；width 当前更新后仍保留旧 Grid | 复用 Crop / width / mode UI；把真正的生成入口接入这里，并在 width 改变时也立即失效旧 Grid  |
| `src/app/stores/projectStore.ts`                                           | `idle / generating / error`、错误信息、pending request、单调递增 request token；begin / commit / fail / cancel；新 Project 替换会使旧 token 失效 | 未与真实 Worker 调用连接；Store token 尚未显式绑定捕获的 `projectId`                                 | 复用为跨页面请求生命周期和最终 Project 提交所有者；补齐 Project identity 校验              |
| `src/domain/generation/request.ts`                                         | 从 Project 构建含原图 Blob、CropState、宽度、mode、Palette / algorithm 版本的不可变请求                                                          | 没有显式 `projectId`；高度不在 request 中，需继续由正式尺寸 helper 从 width + crop 派生              | 复用请求构造；请求 snapshot 补充 Project identity 与派生尺寸，不新增持久 Project 字段      |
| `src/domain/generation/worker-client.ts`                                   | 结构化消息、独立 Worker requestId、最新请求 supersede、cancel、错误解析                                                                          | 产品运行链路没有调用点；Worker client ID 不能替代 Store 的当前 Project 身份校验                      | 复用，不让 Worker 接收 Store                                                               |
| `src/workers/generation.worker.ts`                                         | 处理 `generate-grid`，返回 `GenerationResult` 或结构化错误；不引用 Pinia                                                                         | 需要由应用协调器真正调用；当前 `generate-grid` 输入是已 rasterize 的 RGBA crop                       | 复用 Worker 协议和纯计算边界                                                               |
| `src/domain/generation/rasterize.ts`、`resample.ts`、`pipeline.ts`         | `rasterizeCrop()` 从 request 的原图 Blob + CropState 得到 RGBA；后续按正式自动高度重采样、映射 Palette 并生成 Grid                               | 页面没有把这些函数串进 Worker 请求                                                                   | 复用 TASK-030～035 能力，不从 DOM / preview canvas 读取像素                                |
| `src/domain/generation/high-fidelity.ts`                                   | high-fidelity 包装器校验 mode 并调用基础流水线                                                                                                   | 当前 Worker handler 默认直接调通用 pipeline，未按 mode 明确分派                                      | high-fidelity 使用既有 TASK-036 基础路径                                                   |
| `src/domain/generation/commit.ts`、Project domain                          | 校验原图 Blob、crop、width、mode、Palette / algorithm 版本和 Grid 尺寸；immutable 克隆 Grid cells；成功时时间更新、revision=0                    | request 当前未显式携带 Project identity；width setter 尚未使旧 Grid 失效                             | 复用校验和 immutable commit；只提交与请求开始时正式设置一致的结果                          |
| `src/domain/generation/mode.ts` / `project.ts` / `crop.ts`                 | mode 同值返回原 Project；实际 mode / crop / width 变化均更新设置与 `updatedAt`；mode 和 crop 会清 Grid，width 目前保留旧 Grid                    | width 变化后旧 Grid 可能与当前宽度不匹配；必须补齐 width invalidation，并保持 revision               | 复用 Project setter、派生尺寸、Crop 和同值判断；三类设置变化统一立即失效旧 Grid            |
| History / revision                                                         | revision 表示 Grid 手工编辑计数；有 Grid 且 revision>0 可表示手工编辑；目前仅有快照 helper，没有 Undo/Redo History Store                         | 不能创建 HistoryEntry；不能声称已有可清理的 Undo/Redo 队列                                           | 复用 `grid !== null && revision > 0` 判断提示；本任务只建立新 Grid baseline                |
| `src/app/routes/index.ts`、`EditorView.vue`、`tests/e2e/app-shell.spec.ts` | `/editor` route 已注册                                                                                                                           | Editor 是占位页；没有结果页 guard、Grid Canvas、生成后的导航；现有 E2E 只测静态路由 / 上传 / crop    | 复用 route；只有提交成功后允许导航；接入真实 Grid 的最小可观察结果面，不实现完整编辑器布局 |
| TASK-038 / 039                                                             | `optimize/fragments.ts`、`fragment-merge.ts`、对应测试与 `TASK-039-ALGORITHM-CONTRACT.md` 均独立存在                                             | 当前通用生成 pipeline 不调用它们；不可把存在的算法误报为完整 optimized 流水线                        | 保持纯算法公共 contract；由后续正式 orchestration 选择接入                                 |

**审计结论：** 当前确实“有 Store 和测试，但 Crop 页面没有实际调用生成 Worker 并展示、提交真实生成结果”：`CropView.vue` 中只有 `prepareGenerationRequest()`，全体 `src/` 没有 `createGenerationWorkerClient()` / `generateGrid()` 应用调用点，也没有从 Crop 路由到 Editor 的生成导航；`EditorView.vue` 仍显示占位标题。TASK-037 unit 测了纯提交和 Store token，component 测了模式提示 / request 准备，现有 E2E 没有执行生成。

## 5. Generate Entry and Request Lifecycle

1. 首次生成的正式 UI 入口是 Crop 页面在裁剪确认、宽度合法后显示的 Generate 主操作。用户正式确认 crop、width 或 mode 的实际变化时，当前 Project 已立即保存正式配置并使旧 Grid 失效；Generate 按钮只读取该 Project，不从 UI draft、DOM、Cropper preview 或临时 Canvas 临时拼装业务参数。
2. 结果页的 mode switch（在结果页 UI 可用时）调用同一生成协调流程，不建立第二条 Worker→Store 提交链。
3. `projectStore` 拥有跨页面 lifecycle：当前活动 token、pending request、`generationStatus` 和 `generationError`。页面只发起动作、显示状态和在成功提交后请求导航。
4. 协调流程从当前正式 Project 创建不可变 request snapshot，包含 `projectId` / Project identity、source、crop、width、自动派生 dimensions、generation mode 及其它生成参数。高度继续使用 `deriveGenerationDimensions(widthBeads, crop)`，不新增尺寸算法。
5. 不存在 request-local 的 crop / width / mode candidate。设置正式改变由既有 Project mutation 立即写入 Project 并使 Grid 失效；随后 Generate 对当前正式配置建立 snapshot。PRD 的手工编辑确认弹窗在用户取消时不应用 mode 改变；用户确认“重新生成”后，先正式应用 mode mutation（Grid 失效），再启动新请求。
6. 使用 `rasterizeCrop(request)` 复用原图解码与 CropState 栅格化，再把 request + RGBA crop 交给 `GenerationWorkerClient.generateGrid()`。Worker 完成已有 resampling、alpha / Palette mapping 与 Grid 生成后只返回 `GenerationResult`，不触碰 Project。
7. 只接受含实际 `generationResult` 的 Worker success；结构错误、Worker error、同步启动异常均进入 Store error 状态，不构造占位 Grid。
8. Store 只对仍然活动且属于当前 Project 的 token 调用 Project commit。只有 commit 返回成功后，协调流程才能导航到 `/editor`。

### Request identity and stale protection

- Store token 是应用级权威 identity；Worker client 的自增 `requestId` 只关联 Worker 消息，不可单独作为 Project commit 授权。
- 每次启动生成都创建新的 Store token。重复点击应禁用 Generate；若新请求仍启动，则新 token 取代旧 token，旧请求无论 success / error 都不得改变 Project、错误状态或 route。
- 活动请求捕获 request-start `projectId` / Project identity 与完整 generation parameter identity。commit 前必须同时确认：token 仍活动、`currentProject` 存在且 `projectId` 相同、当前 source / crop / width / derived dimensions / mode / Palette / algorithm 参数仍与 snapshot 一致，并且结果尺寸 / 编码合法。request 只读取正式配置，不授权任何设置 mutation。
- `setCurrentProject()`、clear/new Project、确认 crop / width / mode setting change 必须使原请求 token 失效；允许取消 Worker Promise 或忽略迟到响应，但不能提交迟到结果。不得只比较 revision：新 Project、未编辑 Project 或相同 revision 也必须防 stale。
- 请求期间 UI 应禁用冲突设置操作；如设置仍发生变化，则按正式 Project mutation 更新配置、立即令 Grid=null 并使请求 token 失效。width 改变后 Grid 必须立即失效，不能让 Project 同时声称新 width 与旧尺寸 Grid 是同一生成结果。

## 6. Worker Boundary and Mode Pipeline

- Worker 输入只包含结构化可克隆的 GenerationRequest / RGBA crop；不传 Pinia、Vue ref、路由或 Project Store。
- Worker 只执行纯生成并返回结果 / 错误。`GenerationWorkerClient` 负责消息 requestId、supersede、cancel 和错误解析；Store 负责应用 token、Project identity 与 commit。
- TASK-037 复用 TASK-030 rasterization、TASK-031 alpha、TASK-033 resampling、TASK-034 MARD mapping、TASK-035 base Grid 和 TASK-036 high-fidelity。不得复制 alpha、重采样、颜色匹配或 Grid 构造逻辑。
- mode 只允许 `optimized` 与 `high-fidelity`，默认 `optimized`。high-fidelity 使用 TASK-036 基础路径，不经过 TASK-039 优化。
- TASK-037 阶段 optimized 的可调用能力是 TASK-035 的基础合法 Grid pipeline；该结果是接线阶段的 provisional base Grid，不能宣称已满足 PRD 完整 optimized 产品规则。不得静默制造优化占位逻辑，也不得提前调用不存在的 TASK-040 / 041 阶段。完整 optimized 编排与模式差异由 TASK-042 验收。

## 7. Project Commit, Revision, and updatedAt

- 成功结果提交是 immutable replacement 到**同一个** `currentProject`：保持 `projectId`、`createdAt`、`source`、已确认 `crop`、`schemaVersion`、`projectVersion`、作品名和其它非生成字段；保留当前已确认的 generation settings，并将新的 `grid` 写入 Project。
- 结果必须与请求目标 width × 自动 height、paletteVersion、algorithmVersion 匹配；cells 只允许 `EMPTY=0` 或合法 MARD palette index。Project.grid 是唯一正式业务 Grid；Worker result 只在 commit 前是瞬时值。
- commit 必须复制/隔离返回 Grid 的 TypedArray，不能让 Worker result 与 Project.grid 共享可变 buffer。
- 成功 commit 建立新的生成 baseline，`revision = 0`。revision 仅统计该 baseline 后的手工 Grid 编辑；重新生成不是手工操作，也不递增 revision。
- 配置 mutation 与 generation commit 是两个独立的 Project mutation。crop / width / mode 实际变化时沿用现有 Project setter 的 metadata 语义：当前 `confirmProjectCrop()`、`updateProjectGenerationSize()`、`updateProjectGenerationMode()` 都在值实际变化时更新 `updatedAt`；same-value no-op 不更新。TASK-037 补齐 width Grid invalidation 时必须保持该时间语义。begin / pending 不更新 `updatedAt`；failure / cancel / stale 本身不得进一步修改 Project 或 `updatedAt`；最新有效结果成功 commit 时再次将 `updatedAt` 更新为 commit time。
- generation 不新增 `HistoryEntry`。当前仓库尚无 TASK-062 History；未来接入 History 后，成功生成应丢弃旧 Grid 的 Undo / Redo 可达性并开始新 baseline，而不是伪装成普通手工 Grid operation。

## 8. Mode and Grid Invalidation

- crop / width / mode 是同一类 generation-driving formal Project settings。每项实际变化都 immutable 更新相应 Project 配置、立即设置 `grid = null`、保持当前 `revision` 历史值，并按现有 setter 语义更新 `updatedAt`；TASK-037 必须修复当前 width setter 未清 Grid 的不一致。crop 重新确认但 canonical CropState 相同、width 相同、mode 相同均 safe no-op：不替换 Project、不清 Grid、不改 revision / `updatedAt`，也不因 setter 产生 request side effect。
- 实际 mode change 立即更新 `Project.generation.mode` 并使 Grid 失效；仍只有 `optimized` 与 `high-fidelity`，无第三种。若当前 Grid 有手工修改（`grid !== null && revision > 0`，TECH §5.2），先显示 PRD 文案；取消弹窗则不应用 mode mutation，确认重新生成后执行正式 mode mutation 并从原图发起 request。
- setting mutation（配置更新、Grid invalidation）与 generation result commit 是两个独立 mutation，不合并成一个事务。Grid invalidation 不把 revision 重置为 0；只有真实的新 generation result 成功 commit 才建立新 baseline 并令 revision=0。
- crop / width / mode 任一实际变化都使在途旧请求失效。旧 Grid 已为 null；新的合法 Project 配置不因后续 generation failure / cancel / stale 而回滚。

## 9. Failure, Cancellation, and Pending

- pending、token、错误文本都属于 Pinia runtime/UI 状态，不写入 Project schema 或持久快照；pending 不替换 Grid、不清零 revision、不生成历史、不更新时间。
- Worker / decode / validation failure 只设置当前请求的 runtime error；不因失败结果提交部分 Grid，也不额外修改 Project / Grid / revision / `updatedAt`，不导航。请求开始前已正式确认的 crop / width / mode mutation 保持不回滚（例如 width=96、grid=null 即使生成失败仍保持该状态）。UI 显示正式错误信息并允许重试。
- 取消尚未确认的模式切换弹窗不应用 setting mutation、不启动请求。正式配置变更后的活动生成取消只结束 runtime lifecycle；迟到 Worker 消息被忽略，不回滚已确认设置或已失效 Grid。
- stale success / failure 都不得 commit Grid、修改 revision 或把 Project 配置恢复为 request-start 的旧值；stale 本身不更新时间、不覆盖较新错误、不导航。不得生成空白 / 假数据作为 fallback。
- double-click 时 UI 禁用按钮；Store / token 仍须保证多个请求同时或先后完成时仅最新活动请求可提交。

## 10. Routing and Result Visibility

- 生成开始、pending、失败、取消、stale 都不能进入 Editor。
- 只有 `commitGenerationResult(activeToken, result) === true` 且最新 `currentProject.grid !== null` 后，才导航到 `/editor`。route 必须读取 `projectStore.currentProject.grid`，不可由 Editor 自己假造或另存一份 Grid。
- 直接进入 `/editor` 但没有已提交 Grid 时不得展示虚假完成页；应按现有路由流程回到可恢复生成的页面。
- TASK-037 E2E 必须真实上传、确认 crop、设置 width/mode、触发浏览器 Worker、等待有效 result 和 Store commit，再进入 Editor；断言 Project Grid 尺寸 / 合法值，并验证 Editor 的 Canvas 显示来自该 `currentProject.grid` 的实际结果。此处只要求最小可观察结果面，不实现 TASK-043 的完整三栏布局或 TASK-044 的完整 renderer 功能。

## 11. TASK-038 / 039 Reuse; TASK-040–042 Boundary

- TASK-038 `analyzeGridFragments()` 是只读四邻域分析；TASK-039 `mergeFragmentsConservatively()` 使用 TASK-038 analysis、Palette Lab / 现有 ΔE76 和既定 single-snapshot 规则。两者是独立纯算法，不由 TASK-037 重写、不修改其公共 contract。
- 当前 `pipeline.ts` / Worker 没有调用 TASK-038 / 039；仓库存在算法和测试不等于 optimized orchestration 已接入。TASK-037 不应顺手串接 038 / 039。
- TASK-040 负责轮廓保护，TASK-041 负责背景简化，TASK-042 负责完整 optimized orchestration、算法版本和双模式固定样例验收。TASK-037 仅建立请求与 commit 连接，不抢占这些边界。

## 12. Testing Contract

### Unit

- 成功 commit：同 Project identity、immutable Grid、generation settings 更新、result 尺寸 / Palette / algorithm 合法性。
- baseline：成功后 revision=0；仅真实成功 commit 更新 `updatedAt`。
- 同值 setting 不重建 / 不失效；首次生成同值 mode 仍可执行。
- request token / Project identity / source、crop、width、mode 变化的 stale request 均不提交。
- decode / Worker / commit validation failure、取消、superseded request 不产生 request-result Project mutation，不额外更改配置、Grid、revision 或 `updatedAt`；请求开始前已正式确认的设置与 Grid invalidation 保持。
- crop / width / mode 实际变更时 immutable 更新 Project 并立即令 Grid=null，revision 保持；same-value 变更为 no-op；配置 mutation 的 `updatedAt` 与现有 setter 一致。
- Project switch（含相同 revision）后旧请求不能提交；Grid/settings 变化时旧请求不能提交，也不能回滚配置。
- request 从当前 Project snapshot 的 project identity、原图、正式 CropState、width、自动派生 dimensions 和 mode 构造；不读取旧 Grid 或 UI draft。
- History 不新增条目；有编辑提示用当前 Grid + revision 判定。

### Component

- Generate 真正发起 rasterize + Worker generation，而不是只 `prepareGenerationRequest()`。
- 显示 pending 状态并阻止重复提交；latest-request 规则覆盖双击 / 取代。
- 成功且真实 `currentProject.grid` 已提交后才 route；失败 / cancel / stale 不 route。
- mode-change dialog 尚未确认时取消保持 Project / Grid；确认后 mode mutation 立即使 Grid=null 且 revision 保持，再按原始图片生成；后续失败不回滚已确认的 mode mutation。
- 在 Editor route 前断言 `currentProject.grid` 已存在，Editor 消费的就是该 Grid。

### E2E

至少跑一条真实浏览器主流程：上传 → crop → width / mode → Generate → 实际 Worker pipeline → Project.grid commit → Editor → Canvas 显示真实 Grid。不得 mock Worker success、通过直接 URL 导航伪造完成，或仅验证“按钮可点击”。另至少有一次确认 mode switch，证明请求基于原始图片 + CropState。

## 13. Acceptance Checklist

- [ ] Crop 页面有真实 Generate 入口；应用代码实际调用 Worker client。
- [ ] Project 是唯一结果 truth；Worker 不访问 Store。
- [ ] 最新 token + 当前 Project identity / settings 才可提交。
- [ ] 成功以 immutable update 替换同一 Project Grid，并提交 generation mode。
- [ ] setting mutation 与 generation commit 分开；crop / width / mode 实际变化立即更新配置并令 Grid=null，revision 保持；same-value no-op。
- [ ] 配置 mutation 的 `updatedAt` 沿用既有 setter 语义；generation success 另在 commit time 更新，fail / cancel / stale 不额外更新时间。
- [ ] 同 mode no-op；mode 切换提示、原图重生成和 Grid 替换符合 PRD。
- [ ] 失败、取消、stale 不产生 request-result Project mutation，不回滚已确认设置，不生成部分 / 假 Grid，不导航。
- [ ] Editor route 仅在真实 Project.grid commit 后发生；E2E 能观察到真实 Grid Canvas。
- [ ] 不改 Project schema / 持久 runtime 状态 / Grid encoding / Project version；不产生 HistoryEntry。
- [ ] TASK-030～036 复用；TASK-038 / 039 contract 不变；TASK-040～042 不提前实现。
