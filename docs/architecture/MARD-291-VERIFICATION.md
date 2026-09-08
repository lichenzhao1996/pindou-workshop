# MARD 291 色数据核验记录

| 项目         | 结论                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| 对应任务     | TASK-014：核验 MARD 291 色数据来源与完整性                                                                      |
| 核验日期     | 2026-09-08                                                                                                      |
| 产品口径     | MARD 291 色号体系 + 版本锁定的公开数字参考色值                                                                  |
| 本次产出     | TASK-014 核验记录、方案 B 决策记录及 TASK-015 正式 Palette 导入溯源                                              |
| 正式 Palette | 已生成并落库：`src/domain/palette/mard291.ts`                                                                   |
| 当前结论     | 产品已选择方案 B；TASK-015 已按固定公开参考数据完成导入，但 RGB/HEX 仍不得描述为 MARD 官方标准数字色值          |
| 历史核验结论 | TASK-014 完成时，候选公开数据尚未获得产品批准，正式导入曾因官方来源、授权边界及色号 / 色值冲突而阻塞          |

## 1. 核验范围与判定原则

本记录只处理正式导入前的来源、版本、色号清单、数量、唯一性和字段映射核验，不创建 `PaletteEntry` 数据文件，不为缺失字段猜测数据，也不改变 TASK-013 已确认的 Palette contract。

“291 条”在本记录中分为两个层次：

1. 候选数据文件内部是否有 291 条记录，以及记录自身是否结构完整。
2. 这 291 条是否已经被 MARD 官方资料证明为 V1 应采用的完整 MARD 291 色。

第 1 项可以对候选文件做机器可复现的结构检查；第 2 项在原 TASK-014 核验阶段必须有可追溯的 MARD 官方一级来源或经产品负责人确认的充分交叉证据，不能由“网上有 291 条”推导得到。产品已通过方案 B 明确批准固定公开参考数据用于 V1 数字计算，但这不改变其非官方属性。

## 2. 来源核查

### 2.1 一级来源

在本次核查范围内，未找到能够验证为 MARD 品牌方 / 制造方发布的完整 291 色官方色卡文件、官方色号清单、官方 RGB/HEX 资料或明确授权说明。因此目前没有可登记为“唯一官方来源”的一级来源。

这不是对 MARD 是否存在官方资料的绝对否定，而是本次没有找到足以支持正式落库的可验证资料。没有一级来源时，不把第三方页面自称“官方”当作官方证明。

### 2.2 候选来源与交叉来源

| 来源                                                                                                                   | 版本 / 页面状态                                                    | 可核对内容                                                  | 来源等级与限制                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`maxcleme/beadcolors` 的 `raw/mard.csv`](https://raw.githubusercontent.com/maxcleme/beadcolors/29229889/raw/mard.csv) | Git commit `29229889daab404fb30531d4bb785fd73f7f58e3`；文件 291 行 | `reference_code`、`name`、RGB、`contributor`                | 方案 B 选定的版本锁定公开参考数据；仍是非官方社区数据，没有 MARD 品牌方授权或官方来源证明 |
| [`maxcleme/beadcolors` 仓库说明](https://github.com/maxcleme/beadcolors/tree/29229889)                                 | 固定到同一 commit                                                  | 说明该项目用于集中维护拼豆颜色参考，并说明 raw 文件字段格式 | 仓库本身是公开社区项目；仓库 MIT 文件未证明 MARD 数据获得品牌方授权                           |
| [`Mard Beads Color Chart`](https://mardbeads.com/mard-beads-color-chart)                                               | 页面声称有 291 色代码清单                                          | 系列和代码数量的公开页面交叉参考                            | 页面明确称为独立信息，并声明 `Mard Beads is this website's brand`；不能作为 MARD 品牌官方证明 |
| [`Pixel Beads MARD 色号大全`](https://www.pixel-beads.com/zh-tw/mard-bead-color-chart)                                 | 页面标注 2026 修订版，显示 291 / 291                               | 系列、代码和屏幕 HEX 参考                                   | 第三方工具 / 信息页面；页面没有可验证的 MARD 品牌授权，不能单独作为正式真值                   |
| [`Pindou Online Mard Color Chart`](https://www.pindou.online/en/colors)                                                | 页面显示 221 基础色和 291 完整版                                   | 系列、代码和屏幕 HEX 参考                                   | 第三方工具页面；没有可验证的 MARD 品牌授权，不能单独作为正式真值                              |

本次没有使用其他品牌色卡替代 MARD，也没有把用户整理表、商品照片、网页截图或视觉取色结果当作正式真值。TASK-014 核验时，`maxcleme/beadcolors` 属于未获产品批准的三级候选来源；产品现已选择方案 B，批准其固定版本作为公开数字参考基准，但不改变其非官方属性。

### 2.3 候选来源的可复现指纹

TASK-014 阶段对固定 commit 的公开 `raw/mard.csv` 只在内存中进行了读取和结构检查；TASK-015 随后按本记录第 7 节规则将其导入本地资源。检查结果如下：

| 检查项                                    | 结果                                                               |
| ----------------------------------------- | ------------------------------------------------------------------ |
| 数据行数                                  | 291                                                                |
| 唯一 `reference_code` 数                  | 291                                                                |
| 重复 `reference_code`                     | 无                                                                 |
| UTF-8 内容 SHA-256                        | `623d229ace064a7ace700489ed98fa35e512300a574d9df2d94c7d01d5114dfa` |
| 候选文件贡献者字段                        | `Asher`                                                            |
| 缺失候选字段（code/name/RGB/contributor） | 无                                                                 |
| RGB 越界                                  | 无；候选数据中的 R/G/B 均在 0～255                                 |
| `name` 与 `reference_code` 不一致         | 无；两列在候选文件中相同                                           |

候选文件按代码前缀和编号检查得到：

| 系列 | 数量 | 编号覆盖           |
| ---- | ---: | ------------------ |
| A    |   26 | 1～26              |
| B    |   32 | 1～32              |
| C    |   29 | 1～29              |
| D    |   26 | 1～26              |
| E    |   24 | 1～24              |
| F    |   25 | 1～25              |
| G    |   21 | 1～21              |
| H    |   23 | 1～23              |
| M    |   15 | 1～15              |
| P    |   23 | 1～23              |
| Q    |    5 | 1～5               |
| R    |   28 | 1～28              |
| T    |    1 | 1～1               |
| Y    |    5 | 1～5               |
| ZG   |    8 | 1～8               |
| 合计 |  291 | 无缺失、无额外编号 |

以上结果证明该固定来源文件自身是一个结构上完整的 291 行数据集，但不能证明其内容就是 MARD 官方数字色值或制造商发布的完整色卡。

## 3. 字段来源与映射结论

| 目标字段       | 候选来源 / 当前情况                                                           | 核验结论                                                              |
| -------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `displayCode`  | 候选文件的 `reference_code`；第三方页面也展示代码                             | 候选值可读取，但官方 MARD 色号尚未确认；尤其存在 `Z` 与 `ZG` 命名冲突 |
| `name`         | 候选文件的 `name`，当前逐条等于代码                                           | 不是已确认的官方颜色名称；没有确认的中文 / 英文官方名称清单           |
| `rgb`          | 候选文件的三个 RGB 数值                                                       | 仅为非官方候选参考值，未确认是 MARD 官方发布的标准 RGB                |
| `hex`          | 候选 raw 文件没有 HEX 列；可由 RGB 格式化得到屏幕表示；第三方页面提供近似 HEX | 没有确认的官方 HEX；不同第三方页面对同一代码存在差异                  |
| `lab`          | 候选 raw 文件没有 Lab                                                         | 本 Task 不生成 Lab，也不把任何派生 Lab 标为官方原始数据               |
| `family`       | 候选 raw 文件没有色系字段                                                     | 本 Task 不人工分类；尚未确认是官方属性还是产品派生数据                |
| `paletteIndex` | 候选文件没有该字段                                                            | 未建立内部索引映射；不得以数组位置隐式生成 `paletteIndex`             |
| `colorId`      | 候选文件没有该字段                                                            | 本 Task 不生成 `colorId`，不提前决定其稳定生成规则                    |
| 291 色完整清单 | 候选文件有 291 条；第三方页面也声称有 291 条                                  | 候选清单结构完整，但“官方完整 MARD 291 色”仍未验证                    |

候选 raw 文件的字段格式由仓库说明定义为 `[reference_code, name, rgb_r, rgb_g, rgb_b, contributor]`。它没有直接提供 TASK-013 contract 所需的 `paletteIndex`、`colorId`、`displayCode`、Lab 或 family，因此 TASK-015 通过显式、可复现的导入规则补齐这些字段，而不是直接把数组位置当作身份。

## 4. 冲突记录

### 4.1 扩展色号 `Z` 与 `ZG`

公开页面对最后 8 个扩展代码的命名不一致：

- `mardbeads.com` 的页面列为 `Z1`～`Z8`。
- `maxcleme/beadcolors` 固定 commit、Pixel Beads 和 Pindou Online 的公开口径列为 `ZG1`～`ZG8`。

在 TASK-014 核验时，不能因为某一种口径出现次数更多就静默选择为官方唯一写法。TASK-015 为保持固定生产来源内部一致，采用固定 commit 中的 `ZG1`～`ZG8` 作为当前 production `displayCode`，不增加 aliases 字段、不保留 `Z` 别名；该选择是基于当前版本参考数据的一致性规范化，不是对 MARD 官方包装口径的确认。官方口径冲突仍记录为 **unresolved**。

### 4.2 同一代码的 RGB / HEX 不一致

例如 `A1`：

- 固定的 `maxcleme` raw 数据和 Pindou Online 页面显示 `#FAF4C8`（RGB `250,244,200`）。
- Pixel Beads 页面显示 `#F9F0CD`（RGB `249,240,205`）。

这些页面都属于非官方公开参考，且屏幕 HEX 只可能是近似显示值；当前没有足够证据判断哪一个是 MARD 官方标准。该冲突仍为 **unresolved**。TASK-015 按产品已批准的固定来源采用 `#FAF4C8`，但不将其描述为官方标准。

### 4.3 名称、Lab 和 family 缺口

候选 raw 文件的 `name` 只是与代码相同的占位式名称，没有官方名称证明；Lab 和 family 没有来源字段。它们不是本 Task 可以猜测或补齐的内容。

## 5. 完整性判定

以下表格记录 TASK-014 完成时、产品方案 B 决策前的核验状态；它保留历史核验结果，不代表产品已经批准将候选数据描述为官方数字色值。当前生产导入状态见第 7 节。

| 判定项                                  | 当前结果                                                   |
| --------------------------------------- | ---------------------------------------------------------- |
| 候选文件是否恰好 291 条                 | 是，候选文件内部为 291 行                                  |
| 候选 `displayCode` 是否唯一             | 是，候选 `reference_code` 291 个且无重复；官方身份仍未确认 |
| 官方 MARD 291 条是否已确认              | 否                                                         |
| 官方 `displayCode` 是否全部确认         | 否，`Z` / `ZG` 冲突未解决                                  |
| `paletteIndex` 是否已完整覆盖 1～291    | 不适用 / 未验证；候选来源没有内部索引字段，也未创建映射    |
| 是否存在候选 `paletteIndex` 重复 / 缺失 | 没有可检查的候选 `paletteIndex`；未进行数组位置推导        |
| `colorId` 是否已正式生成                | 否                                                         |
| RGB / HEX 是否已确认官方准确性          | 否                                                         |
| Lab 是否已确认                          | 否；未生成派生值                                           |
| family 是否已确认                       | 否；未生成产品派生分类                                     |
| 是否达到正式落库条件                    | 否                                                         |

## 6. 最终结论与后续门槛

TASK-014 的历史产出是本核验记录，不是正式数据导入。候选公开数据集已通过文件自身的数量、代码唯一性、系列编号覆盖和 RGB 基础范围检查，但不能据此宣称已核验 MARD 官方 291 色或官方 RGB/HEX。

产品负责人随后选择方案 B，允许在明确的公开参考数据规则下进入 TASK-015；这不等于候选数据获得 MARD 官方认证。

进入 TASK-015 前仍必须明确记录：

1. 产品批准的公开数据来源和固定 commit。
2. `Z` / `ZG` 的具体采用口径及其 unresolved 历史记录。
3. RGB / HEX 的采用来源及其“屏幕参考值”属性。
4. `name`、Lab 和 family 的来源或后续派生规则。
5. TASK-015 已按不依赖数组顺序的显式规则建立 `paletteIndex` 映射和稳定 `colorId`。

正式导入后也不得把候选 RGB / HEX 标记为 MARD 官方标准数字值。`paletteVersion` 已记录来源、固定版本和拼豆工坊处理版本；上游更新不得自动改变作品含义。

## 7. 产品决策：方案 B（Versioned Community Reference）

产品负责人已正式选择方案 B，作为对 TASK-014 核验结果的产品决策补充：

1. V1 保持 **MARD 全 291 色** 产品范围，采用 MARD 291 色号体系。
2. 当前计划采用 [`maxcleme/beadcolors` 的 `raw/mard.csv`](https://raw.githubusercontent.com/maxcleme/beadcolors/29229889/raw/mard.csv) 作为 V1 数字颜色匹配参考，固定 commit 为 `29229889daab404fb30531d4bb785fd73f7f58e3`。
3. 该数据是版本锁定的公开社区参考数据，不是 MARD 制造商发布的 RGB 标准；不得将其 RGB/HEX 描述为“MARD 官方 RGB/HEX”。
4. 参考 RGB/HEX 用于屏幕显示、颜色匹配和数字计算，实体制作效果仍以真实 MARD 色珠或实体色卡为准。
5. production Palette 必须拥有稳定的 `paletteVersion`，能够追溯到数据来源、固定 commit / 数据版本和拼豆工坊自身处理版本。具体字符串格式由 TASK-015 按正式导入范围确定。
6. 生产构建不得读取上游 `main` / `master` 最新数据，也不得自动跟随上游更新。任何升级都必须显式升级 `paletteVersion`，重新核验并记录变更。
7. `Z` / `ZG`、RGB/HEX、名称、Lab 和 family 等未解决或派生属性，不得静默处理；正式导入时必须记录具体采用方案和来源属性。

### 7.1 TASK-015 导入规则

本次正式导入建立以下稳定规则：

- `paletteIndex` 按 `A、B、C、D、E、F、G、H、M、P、Q、R、T、Y、ZG` 的固定系列顺序、系列内数字升序显式分配 1～291。数组排序变化不会改变既有索引；未来版本不得因上游排序变化重编号，若身份变化必须显式升级版本并记录迁移决定。
- `colorId` 使用 `mard:<displayCode 小写规范化值>`，例如 `ZG1` 对应 `mard:zg1`。规范化仅处理大小写和外部空白；它不依赖数组位置、RGB 或 Lab，也不使用随机 UUID。若未来将 `ZG` 改为 `Z`，必须作为显式身份/版本决定处理，不得静默改写。
- 当前 production `displayCode` 采用固定 commit 提供的 `ZG1`～`ZG8`。不增加 aliases 字段，用户界面和后续导出显示 `ZG` 口径；这只是固定参考数据的一致性选择，不是官方包装口径确认。
- `name` 直接采用固定 raw 文件的 `name` 字段。当前值与代码相同，不描述为 MARD 官方颜色名称。
- RGB 直接采用固定 raw 文件的 RGB 字段；HEX 由 RGB 确定性派生为大写 `#RRGGBB`，不另行采用其他网站的 HEX。
- Lab 由 RGB 派生，采用确定性的 sRGB → CIELAB D65 转换：标准 sRGB 分段线性化、D65 XYZ 矩阵、D65 白点 `Xn=0.95047`、`Yn=1`、`Zn=1.08883`，以及 CIELAB epsilon/kappa 分段函数。Lab 是拼豆工坊派生数据，不是 MARD 官方原始测色值。
- `family` 是产品派生字段，按固定 MARD 系列生成 `series:A`、`series:B`、`series:C`、`series:D`、`series:E`、`series:F`、`series:G`、`series:H`、`series:M`、`series:P`、`series:Q`、`series:R`、`series:T`、`series:Y`、`series:ZG`，不是 MARD 官方分类。

### 7.1.1 非阻塞技术遗留

- 未来若实现 Palette importer，不得根据 CSV 行号分配 `paletteIndex`；必须继续使用上述固定系列/编号映射。索引映射变化必须显式升级 `paletteVersion`。
- 当前 production Lab 是静态导入值。未来重新生成 Lab 时，必须把完整的 sRGB linearization、RGB→XYZ 矩阵、D65 white point、epsilon/kappa、XYZ→Lab 公式和已知 RGB→Lab 参考点测试固化到代码/测试中。本遗留不阻塞当前静态 Palette 提交。

当前 production `paletteVersion` 为：

`MARD-291-community-maxcleme-beadcolors-29229889daab404fb30531d4bb785fd73f7f58e3-import-v1`

对应本地资源为 `src/domain/palette/mard291.ts`，来源为 `maxcleme/beadcolors` 的 `raw/mard.csv`。仓库 LICENSE 为 MIT；导入资源保留来源、commit、路径、贡献者和许可证元数据，项目发布时应继续保留 MIT copyright / permission notice 和来源归属说明。

### 7.2 上游许可证与归属

`maxcleme/beadcolors` 仓库的[许可证文件](https://raw.githubusercontent.com/maxcleme/beadcolors/29229889/LICENSE)为 MIT，版权声明为 `Copyright (c) 2020 maxcleme`。本项目若继续分发复制或实质性包含该数据，应随分发保留原版权声明和 MIT permission notice，并保留仓库地址、固定 commit、原始文件路径及贡献者信息。该许可证事实不代表 MARD 品牌方对数据的授权或背书；本记录不作法律结论。

为保留上游归属信息，项目应至少随数据保留以下 notice：

> MIT License
>
> Copyright (c) 2020 maxcleme
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

因此，产品决策已解除 TASK-015 的“是否允许采用公开参考数据”阻塞，但没有消除数字色值真实性和 Z/ZG 等未解决风险。

## 8. TASK-014 阶段未执行的内容

- TASK-014 阶段未创建 `public/palette/` 或其他 Palette 数据文件；正式资源由 TASK-015 创建于 `src/domain/palette/mard291.ts`。
- TASK-014 阶段未抓取后落盘、录入或生成 291 条正式数据；正式导入由 TASK-015 完成。
- 未实现 Palette loader、validator、最近颜色匹配、UI 或生成算法；完整 validator 仍属于 TASK-016，最近颜色匹配仍属于 TASK-017。
- 未修改 TASK-013 contract 或 Grid 编码规则；本次仅更新默认 Palette 版本引用以指向正式 production 版本。
- 未静默声称 `Z` / `ZG` 已获得官方解决；当前生产选择已按第 7.1 节显式记录。
