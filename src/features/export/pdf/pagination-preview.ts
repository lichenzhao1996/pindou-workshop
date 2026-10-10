import { rgb, StandardFonts, type PDFImage, type PDFFont } from 'pdf-lib'
import type { ExportSnapshot } from '../snapshot'
import { downloadBlob } from '../download'
import { addPdfPage, createPdfDocument, savePdfBlob } from './document'
import { embedChineseFont } from './font'
import { createPdfLayoutInputFromSnapshot } from './layout'
import { drawPdfMaterialsPages } from './materials'
import { drawPdfOverviewPage, type PdfOverviewDependencies } from './overview'
import { recommendPdfPagination, type PdfPaginationPlan } from './pagination'
import { createPdfGridThumbnailPng, derivePdfThumbnailRangeRect } from './thumbnail'
import { createEffectPreviewPngBlob } from '../png/effect-preview'
import { mmToPdfPoints } from './units'

export interface PdfPaginationPreviewDependencies extends PdfOverviewDependencies {
  readonly renderGridThumbnail?: (snapshot: ExportSnapshot) => Promise<Uint8Array>
}

function drawPaginationRangePage(
  page: ReturnType<typeof addPdfPage>,
  plan: PdfPaginationPlan,
  range: PdfPaginationPlan['pages'][number],
  font: Awaited<ReturnType<typeof embedChineseFont>>,
  numericFont: PDFFont,
  thumbnail: PDFImage,
  grid: Pick<ExportSnapshot['grid'], 'width' | 'height'>,
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
    `第 ${range.pageNumber} 页 · 第 ${range.pageRow + 1} 行页 / 第 ${range.pageColumn + 1} 列页`,
    {
      x: margin,
      y,
      size: 12,
      font,
      color: textColor,
    },
  )
  y -= 24
  page.drawText('Grid 行列范围：', { x: margin, y, size: 11, font, color: textColor })
  page.drawText(
    `Rows ${range.rowStart}-${rowEnd}; columns ${range.columnStart}-${columnEnd} (0-based)`,
    {
      x: margin + 68,
      y,
      size: 10,
      font: numericFont,
      color: textColor,
    },
  )
  y -= 22
  page.drawText(
    `每页推荐 ${plan.columnsPerPage} 列 × ${plan.rowsPerPage} 行 · 单格 ${plan.cellSizeMm.toFixed(2)}mm`,
    { x: margin, y, size: 10, font, color: textColor },
  )
  y -= 22
  page.drawText(`此预览只验证页范围与分页数，不含拼豆制作网格。`, {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.35, 0.34, 0.32),
  })

  const thumbnailBoxWidth = mmToPdfPoints(60)
  const thumbnailBoxHeight = mmToPdfPoints(60)
  const thumbnailScale = Math.min(
    thumbnailBoxWidth / thumbnail.width,
    thumbnailBoxHeight / thumbnail.height,
  )
  const thumbnailWidth = thumbnail.width * thumbnailScale
  const thumbnailHeight = thumbnail.height * thumbnailScale
  const thumbnailX = page.getWidth() - margin - thumbnailBoxWidth
  const thumbnailTop = page.getHeight() - margin - 18
  const thumbnailY = thumbnailTop - thumbnailHeight
  page.drawText('整幅作品位置', {
    x: thumbnailX,
    y: thumbnailTop,
    size: 9,
    font,
    color: textColor,
  })
  page.drawImage(thumbnail, {
    x: thumbnailX,
    y: thumbnailY - 4,
    width: thumbnailWidth,
    height: thumbnailHeight,
  })
  page.drawRectangle({
    x: thumbnailX,
    y: thumbnailY - 4,
    width: thumbnailWidth,
    height: thumbnailHeight,
    borderColor: rgb(0.45, 0.43, 0.39),
    borderWidth: 0.6,
  })

  const normalizedRange = derivePdfThumbnailRangeRect(grid, range)
  page.drawRectangle({
    x: thumbnailX + normalizedRange.x * thumbnailWidth,
    y: thumbnailY - 4 + (1 - normalizedRange.y - normalizedRange.height) * thumbnailHeight,
    width: normalizedRange.width * thumbnailWidth,
    height: normalizedRange.height * thumbnailHeight,
    color: rgb(0.95, 0.18, 0.08),
    opacity: 0.2,
    borderColor: rgb(0.72, 0.08, 0.04),
    borderWidth: 1.5,
  })
}

export async function createPdfPaginationPreviewBlob(
  snapshot: ExportSnapshot,
  dependencies: PdfPaginationPreviewDependencies = {},
): Promise<{ blob: Blob; plan: PdfPaginationPlan }> {
  const grid = snapshot.grid
  const plan = recommendPdfPagination(grid, createPdfLayoutInputFromSnapshot(snapshot))
  const document = await createPdfDocument(snapshot)
  const font = await embedChineseFont(document, dependencies.loadFontBytes)
  const numericFont = await document.embedFont(StandardFonts.Helvetica)
  const previewBlob = await (dependencies.renderEffectPreview ?? createEffectPreviewPngBlob)(
    snapshot,
  )
  const previewBytes = new Uint8Array(await previewBlob.arrayBuffer())
  const overviewPage = addPdfPage(document)
  await drawPdfOverviewPage(document, overviewPage, snapshot, font, previewBytes)
  const thumbnailBytes = await (dependencies.renderGridThumbnail ?? createPdfGridThumbnailPng)(
    snapshot,
  )
  const thumbnail = await document.embedPng(thumbnailBytes)

  for (const range of plan.pages) {
    const page = addPdfPage(document, {
      width: plan.pageWidthMm,
      height: plan.pageHeightMm,
    })
    drawPaginationRangePage(page, plan, range, font, numericFont, thumbnail, grid)
  }

  drawPdfMaterialsPages(document, snapshot, font, numericFont, plan.pages.length + 2)

  return { blob: await savePdfBlob(document), plan }
}

export async function downloadPdfPaginationPreview(
  snapshot: ExportSnapshot,
  dependencies: PdfPaginationPreviewDependencies = {},
): Promise<void> {
  const { blob } = await createPdfPaginationPreviewBlob(snapshot, dependencies)
  downloadBlob(blob, `${snapshot.fileNameBase}.pdf`)
}
