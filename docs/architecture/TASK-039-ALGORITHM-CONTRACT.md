# TASK-039 Conservative Fragment Merge Algorithm Contract

> 状态：Accepted
>
> 适用范围：拼豆工坊 V1 optimized algorithm v1

本文是 TASK-039「实现保守碎色合并」的正式算法 contract。实现入口为 `mergeFragmentsConservatively()`；TASK-038 的四邻域分析、production Palette Lab 和现有 ΔE76 是该能力的唯一分析与颜色距离来源。

## 1. Algorithm Goal

TASK-039 用于减少 optimized 结果中与周围颜色足够相近的 1～3 颗孤立碎色，使作品更适合实际制作。

它位于基础 Grid 和 TASK-038 region analysis 之后：

```text
base Grid
→ TASK-038 four-neighbor region analysis
→ TASK-039 conservative fragment merge
→ later optimized passes
```

`high-fidelity` 直接返回基础 Grid，不执行 TASK-038/039 优化 pass。TASK-039 完成后只表示 optimized pipeline 已具备部分基础优化能力，不表示整个 optimized 模式已经完成。

## 2. Input / Output Contract

输入：

- 合法 `Grid`；
- 从同一个输入 Grid 得到的 TASK-038 `GridFragmentAnalysis[]`；
- 只读 Palette，默认使用 production MARD 291 Palette。

输出是新的合法 `Grid`：

- 不修改输入 Grid 或输入 `Uint16Array`；
- `width`、`height` 和 row-major cell 顺序不变；
- cells 使用新的 `Uint16Array`；
- 每个 cell 仍只能是 `0～291`；
- `0 = EMPTY`；
- `1～291 = MARD paletteIndex`；
- 不输出 RGB、HEX、Lab、`colorId` 或 `displayCode` 作为 Grid cell；
- 不修改 Project、revision、schemaVersion 或 projectVersion。

当前 no-op 行为：即使没有 region 实际发生 merge，也返回新的 Grid 和新的 cells 引用；调用方不得通过结果与输入的引用相等判断是否发生过替换。

## 3. Candidate Region Contract

TASK-038 使用上、下、左、右四邻域识别同一 `paletteIndex` 的连续 region。

TASK-039 的 region 资格固定如下：

| Region | TASK-039 行为 |
| --- | --- |
| EMPTY region | 跳过 |
| 非 EMPTY，size 1 | merge candidate |
| 非 EMPTY，size 2 | merge candidate |
| 非 EMPTY，size 3 | merge candidate |
| 非 EMPTY，size ≥ 4 | 一律保留 |
| 任意接触 Grid 外边界的 region | 一律保留 |

进入 candidate 不代表必然替换。region 还必须存在至少一个满足颜色距离规则的直接四邻域合法非 EMPTY target；没有合格 target 时保留原颜色。

## 4. EMPTY Contract

EMPTY 完全排除在 TASK-039 merge 之外：

- EMPTY region 不作为 merge candidate；
- EMPTY 不参与 target 候选排序；
- EMPTY 不作为 merge target；
- 不执行普通颜色 → EMPTY；
- 不执行 EMPTY → 普通颜色；
- 白色 MARD 色珠始终是普通 Palette 颜色，不是 EMPTY。

TASK-038 analysis 可以保留 EMPTY region 和 EMPTY 邻接接触信息，但 TASK-039 在构建候选集合时必须显式跳过 `paletteIndex = 0`。

## 5. Color Similarity Contract

颜色距离只使用：

- production Palette Entry 的 Lab；
- 现有 `deltaE76()`。

最大允许距离固定为：

```text
ΔE76 <= 8
```

边界 8 包含在允许范围内；大于 8 的候选不得用于合并。TASK-039 不得建立 RGB 欧氏距离、HEX 距离、第二套 Lab 转换或其它 ΔE 算法。

实现中的 region size 上限和 ΔE76 上限必须集中定义，不在分支或测试中散落另一套运行时阈值。

## 6. Candidate Color Selection

候选 target 只能来自 candidate region 的直接四邻域，并且必须是合法非 EMPTY MARD `paletteIndex`。

所有满足 `ΔE76 <= 8` 的候选按以下完整顺序排序：

1. `contactCount` 降序；
2. ΔE76 升序；
3. `paletteIndex` 升序。

排序第一项成为 merge target。最终平局固定由较小 `paletteIndex` 胜出，不依赖 Map、Object、Palette entries 或 UI 的偶然顺序。

## 7. Edge Protection

若 region 中任一 cell 位于 Grid 外边界，即 TASK-038 `touchesGridEdge === true`，TASK-039 必须保留整个 region，不执行 merge。

Grid 外边界定义为：

- `row === 0`；
- `row === height - 1`；
- `column === 0`；
- `column === width - 1`。

TASK-039 不自行推断其它视觉轮廓、结构边缘或规律图案；这些保护能力属于 TASK-040 及后续 optimized passes。

## 8. Update Strategy

TASK-039 固定使用 single snapshot pass：

- region detection 来自同一个原始输入 Grid；
- 所有 merge decision 读取同一份 TASK-038 analysis；
- decision 不读取本 pass 已写入的结果 cells；
- 将决定写入输入 cells 的独立副本；
- 不重新分析输出；
- 不迭代；
- 不产生 chain reaction。

有效 TASK-038 analysis 中的 regions 互不重叠，因此 region 遍历顺序不得改变最终 Grid 内容。

## 9. Determinism

相同 Grid、TASK-038 analysis、Palette 和 algorithmVersion 必须产生相同 Grid 内容。

实现不得依赖：

- random；
- 当前时间或运行耗时；
- Map/Object 的偶然顺序；
- Palette entries 或 UI 排序；
- Vue、Pinia、DOM、Worker 调度、viewport 或 devicePixelRatio；
- 本 pass 已写入的中间结果。

确定性由固定候选集合、`contactCount DESC → ΔE76 ASC → paletteIndex ASC` 和 single snapshot pass 共同保证。

## 10. Versioning Impact

TASK-039 的 size 上限、ΔE76 上限、候选排序、Grid edge 保护和 single snapshot 策略属于现有 optimized algorithm v1。

- 继续使用 Project / GenerationRequest 现有 `algorithmVersion`；
- 不新增 `generationAlgorithmVersion` 或其它 Project 版本字段；
- TASK-039 不修改 `paletteVersion`；
- `paletteVersion` 继续只追溯 Palette 数据身份；
- 将来改变上述 TASK-039 生成语义时，必须显式演进 `algorithmVersion`，不得在同一算法版本下静默改变输出。

## 11. Accepted Rules Summary

- candidate size 仅为 1、2、3；size ≥ 4 一律保留。
- EMPTY 完全不参与 merge。
- Grid edge region 一律保留。
- target 只来自直接四邻域的合法非 EMPTY Palette 颜色。
- 使用 Palette Lab 和现有 ΔE76，阈值为 `<= 8`。
- 候选排序为接触数降序、ΔE76 升序、paletteIndex 升序。
- 最终 tie-break 为 paletteIndex 升序。
- 使用 single snapshot pass，无迭代、无 chain reaction。
- 输入 immutable，输出 dimensions 和 Grid 编码不变。
- 不修改 Project 或任何版本 / revision 字段。
- high-fidelity 完全不执行 TASK-039。
