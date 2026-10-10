import { rgb } from 'pdf-lib'
import type { ExportSnapshot } from '../snapshot'
import { downloadBlob } from '../download'
import { addPdfPage, createPdfDocument, savePdfBlob } from './document'
import { embedChineseFont } from './font'
import { createDefaultPdfLayoutInput, type PdfLayoutInput } from './layout'
import { drawPdfOverviewPage, type PdfOverviewDependencies } from './overview'
import { recommendPdfPagination, type PdfPaginationPlan } from './pagination'
import { createEffectPreviewPngBlob } from '../png/effect-preview'
import { mmToPdfPoints } from './units'

export interface PdfPaginationPreviewDependencies extends PdfOverviewDependencies {
  readonly layoutInput?: PdfLayoutInput
}

function drawPaginationRangePage(
  page: ReturnType<typeof addPdfPage>,
  plan: PdfPaginationPlan,
  range: PdfPaginationPlan['pages'][number],
  font: Awaited<ReturnType<typeof embedChineseFont>>,
): void {
  const margin = mmToPdfPoints(plan.marginsMm)
  const textColor = rgb(0.16, 0.15, 0.13)
  const rowEnd = range.rowEndExclusive - 1
  const columnEnd = range.columnEndExclusive - 1
  let y = page.getHeight() - margin - 24
  page.drawText('分页范围预览（非制作图）', {
    x: margin,
    y,
    size: 17,
    font,
    color: textColor,
  })
  y -= 28
  page.drawText(
    `行 ${range.rowStart}–${rowEnd} · 列 ${range.columnStart}–${columnEnd}（0 起、首尾包含）`,
    {
      x: margin,
      y,
      size: 14,
      font,
      color: textColor,
    },
  )
  y -= 24
  page.drawText(
    `每页推荐 ${plan.columnsPerPage} 列 × ${plan.rowsPerPage} 行 · 单格 ${plan.cellSizeMm.toFixed(2)}mm`,
    { x: margin, y, size: 11, font, color: textColor },
  )
  y -= 18
  page.drawText(`此预览只验证页范围与分页数，不含拼豆制作网格。`, {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.35, 0.34, 0.32),
  })
}

export async function createPdfPaginationPreviewBlob(
  snapshot: ExportSnapshot,
  dependencies: PdfPaginationPreviewDependencies = {},
): Promise<{ blob: Blob; plan: PdfPaginationPlan }> {
  const plan = recommendPdfPagination(
    snapshot.grid,
    dependencies.layoutInput ?? createDefaultPdfLayoutInput(),
  )
  const document = await createPdfDocument(snapshot)
  const font = await embedChineseFont(document, dependencies.loadFontBytes)
  const previewBlob = await (dependencies.renderEffectPreview ?? createEffectPreviewPngBlob)(
    snapshot,
  )
  const previewBytes = new Uint8Array(await previewBlob.arrayBuffer())
  const overviewPage = addPdfPage(document)
  await drawPdfOverviewPage(document, overviewPage, snapshot, font, previewBytes)

  for (const range of plan.pages) {
    const page = addPdfPage(document, {
      width: plan.pageWidthMm,
      height: plan.pageHeightMm,
    })
    drawPaginationRangePage(page, plan, range, font)
  }

  return { blob: await savePdfBlob(document), plan }
}

export async function downloadPdfPaginationPreview(
  snapshot: ExportSnapshot,
  dependencies: PdfPaginationPreviewDependencies = {},
): Promise<void> {
  const { blob } = await createPdfPaginationPreviewBlob(snapshot, dependencies)
  downloadBlob(blob, `${snapshot.fileNameBase}.pdf`)
}
