import { rgb, StandardFonts, type PDFImage, type PDFFont, type RGB } from 'pdf-lib'
import {
  getRelativeLuminance,
  getPaletteEntryByIndex,
  MARD_291_PALETTE,
} from '../../../domain/palette'
import { EMPTY, MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../../domain/project/constants'
import type { ExportSnapshot } from '../snapshot'
import { assertSupportedExportPalette } from '../snapshot'
import { downloadBlob } from '../download'
import { createEffectPreviewPngBlob } from '../png/effect-preview'
import { addPdfPage, createPdfDocument, savePdfBlob } from './document'
import { embedChineseFont } from './font'
import { createPdfLayoutInputFromSnapshot, type PdfColorMode } from './layout'
import { drawPdfMaterialsPages, derivePdfMaterialRows, paginatePdfMaterialRows } from './materials'
import { drawPdfOverviewPage, type PdfOverviewDependencies } from './overview'
import { recommendPdfPagination, type PdfGridRange, type PdfPaginationPlan } from './pagination'
import { createPdfGridThumbnailPng, derivePdfThumbnailRangeRect } from './thumbnail'
import { mmToPdfPoints } from './units'

export interface PdfProductionDependencies extends PdfOverviewDependencies {
  readonly renderGridThumbnail?: (snapshot: ExportSnapshot) => Promise<Uint8Array>
}

export interface PdfProductionGridGeometry {
  readonly x: number
  readonly topY: number
  readonly cellSizePt: number
  readonly columns: number
  readonly rows: number
  readonly right: number
  readonly bottom: number
}

const EMPTY_CELL_RGB = Object.freeze({ r: 0.93, g: 0.92, b: 0.89 })

export function derivePdfProductionGridGeometry(
  plan: PdfPaginationPlan,
  range: PdfGridRange,
): PdfProductionGridGeometry {
  const columns = range.columnEndExclusive - range.columnStart
  const rows = range.rowEndExclusive - range.rowStart
  if (!Number.isSafeInteger(columns) || columns <= 0 || !Number.isSafeInteger(rows) || rows <= 0) {
    throw new RangeError('PDF production page requires a non-empty Grid range')
  }
  const x = mmToPdfPoints(plan.marginsMm + plan.coordinateGutterMm)
  const topY =
    mmToPdfPoints(plan.pageHeightMm) -
    mmToPdfPoints(plan.marginsMm + plan.headerMm + plan.coordinateHeaderMm)
  const cellSizePt = mmToPdfPoints(plan.cellSizeMm)
  const right = x + columns * cellSizePt
  const bottom = topY - rows * cellSizePt
  const pageWidthPt = mmToPdfPoints(plan.pageWidthMm)
  const pageHeightPt = mmToPdfPoints(plan.pageHeightMm)
  const marginPt = mmToPdfPoints(plan.marginsMm)
  if (
    x < marginPt - 0.01 ||
    right > pageWidthPt - marginPt + 0.01 ||
    bottom < marginPt + mmToPdfPoints(plan.footerMm) - 0.01 ||
    topY > pageHeightPt - marginPt - mmToPdfPoints(plan.headerMm) + 0.01
  ) {
    throw new RangeError('PDF production Grid exceeds the printable page area')
  }
  return { x, topY, cellSizePt, columns, rows, right, bottom }
}

export function derivePdfProductionCellFill(paletteIndex: number, colorMode: PdfColorMode): RGB {
  if (!Number.isInteger(paletteIndex) || paletteIndex < EMPTY || paletteIndex > MAX_PALETTE_INDEX) {
    throw new RangeError(`PDF production Grid contains invalid palette index ${paletteIndex}`)
  }
  if (paletteIndex === EMPTY) return rgb(EMPTY_CELL_RGB.r, EMPTY_CELL_RGB.g, EMPTY_CELL_RGB.b)
  if (paletteIndex < MIN_PALETTE_INDEX) {
    throw new RangeError(`PDF production Grid contains invalid palette index ${paletteIndex}`)
  }
  if (colorMode === 'monochrome') return rgb(1, 1, 1)
  const entry = getPaletteEntryByIndex(MARD_291_PALETTE, paletteIndex)
  if (!entry)
    throw new RangeError(`PDF production Grid contains invalid palette index ${paletteIndex}`)
  return rgb(entry.rgb.r / 255, entry.rgb.g / 255, entry.rgb.b / 255)
}

function drawPageThumbnail(
  page: ReturnType<typeof addPdfPage>,
  thumbnail: PDFImage,
  range: PdfGridRange,
  grid: Pick<ExportSnapshot['grid'], 'width' | 'height'>,
  plan: PdfPaginationPlan,
  font: PDFFont,
): void {
  const boxWidth = mmToPdfPoints(29)
  const boxHeight = mmToPdfPoints(17)
  const margin = mmToPdfPoints(plan.marginsMm)
  const x = page.getWidth() - margin - boxWidth
  const top = page.getHeight() - margin - mmToPdfPoints(2)
  const scale = Math.min(boxWidth / thumbnail.width, boxHeight / thumbnail.height)
  const width = thumbnail.width * scale
  const height = thumbnail.height * scale
  const y = top - height
  page.drawText('整幅位置', { x, y: top + 1, size: 7, font, color: rgb(0.18, 0.17, 0.15) })
  page.drawImage(thumbnail, { x: x + (boxWidth - width) / 2, y, width, height })
  page.drawRectangle({
    x: x + (boxWidth - width) / 2,
    y,
    width,
    height,
    borderColor: rgb(0.4, 0.39, 0.36),
    borderWidth: 0.5,
  })

  const normalizedRange = derivePdfThumbnailRangeRect(grid, range)
  page.drawRectangle({
    x: x + (boxWidth - width) / 2 + normalizedRange.x * width,
    y: y + (1 - normalizedRange.y - normalizedRange.height) * height,
    width: normalizedRange.width * width,
    height: normalizedRange.height * height,
    color: rgb(0.95, 0.18, 0.08),
    opacity: 0.2,
    borderColor: rgb(0.72, 0.08, 0.04),
    borderWidth: 1,
  })
}

function fitCodeFontSize(font: PDFFont, code: string, desired: number, maxWidth: number): number {
  let size = desired
  while (size > 2.5 && font.widthOfTextAtSize(code, size) > maxWidth) size -= 0.25
  return size
}

function drawGridCells(
  page: ReturnType<typeof addPdfPage>,
  snapshot: ExportSnapshot,
  plan: PdfPaginationPlan,
  range: PdfGridRange,
  geometry: PdfProductionGridGeometry,
  input: ReturnType<typeof createPdfLayoutInputFromSnapshot>,
  numericFont: PDFFont,
): void {
  const grid = snapshot.grid
  const cellSize = geometry.cellSizePt
  const inset = Math.max(0.6, cellSize * 0.08)

  for (let rowOffset = 0; rowOffset < geometry.rows; rowOffset += 1) {
    const row = range.rowStart + rowOffset
    const y = geometry.topY - (rowOffset + 1) * cellSize
    for (let columnOffset = 0; columnOffset < geometry.columns; columnOffset += 1) {
      const column = range.columnStart + columnOffset
      const paletteIndex = grid.cells[row * grid.width + column]!
      const fill = derivePdfProductionCellFill(paletteIndex, input.colorMode)
      const x = geometry.x + columnOffset * cellSize
      page.drawRectangle({ x, y, width: cellSize, height: cellSize, color: fill })

      if (paletteIndex === EMPTY || !input.showLabels) continue
      const entry = getPaletteEntryByIndex(MARD_291_PALETTE, paletteIndex)
      if (!entry)
        throw new RangeError(`PDF production Grid contains invalid palette index ${paletteIndex}`)
      const code = entry.displayCode
      const fontSize = fitCodeFontSize(
        numericFont,
        code,
        plan.labelFontSizePt,
        cellSize - inset * 2,
      )
      const codeWidth = numericFont.widthOfTextAtSize(code, fontSize)
      const textColor =
        input.colorMode === 'monochrome' || getRelativeLuminance(entry.rgb) >= 0.55
          ? rgb(0.08, 0.08, 0.08)
          : rgb(1, 1, 1)
      page.drawText(code, {
        x: x + (cellSize - codeWidth) / 2,
        y: y + (cellSize - fontSize) / 2,
        size: fontSize,
        font: numericFont,
        color: textColor,
      })
    }
  }
}

function drawGridLines(
  page: ReturnType<typeof addPdfPage>,
  range: PdfGridRange,
  geometry: PdfProductionGridGeometry,
  input: ReturnType<typeof createPdfLayoutInputFromSnapshot>,
): void {
  const cellSize = geometry.cellSizePt
  const regularColor = rgb(0.43, 0.42, 0.39)
  const majorColor = rgb(0.14, 0.14, 0.13)
  const drawVertical = (offset: number, boundary: number) => {
    const outer = offset === 0 || offset === geometry.columns
    const major = input.showTenCellGuides && boundary % 10 === 0
    if (!outer && !input.showGrid && !major) return
    page.drawLine({
      start: { x: geometry.x + offset * cellSize, y: geometry.bottom },
      end: { x: geometry.x + offset * cellSize, y: geometry.topY },
      thickness: major ? 1.1 : outer ? 0.8 : 0.28,
      color: major ? majorColor : regularColor,
    })
  }
  const drawHorizontal = (offset: number, boundary: number) => {
    const outer = offset === 0 || offset === geometry.rows
    const major = input.showTenCellGuides && boundary % 10 === 0
    if (!outer && !input.showGrid && !major) return
    const y = geometry.topY - offset * cellSize
    page.drawLine({
      start: { x: geometry.x, y },
      end: { x: geometry.right, y },
      thickness: major ? 1.1 : outer ? 0.8 : 0.28,
      color: major ? majorColor : regularColor,
    })
  }

  for (let offset = 0; offset <= geometry.columns; offset += 1) {
    drawVertical(offset, range.columnStart + offset)
  }
  for (let offset = 0; offset <= geometry.rows; offset += 1) {
    drawHorizontal(offset, range.rowStart + offset)
  }
}

function drawCoordinates(
  page: ReturnType<typeof addPdfPage>,
  range: PdfGridRange,
  geometry: PdfProductionGridGeometry,
  plan: PdfPaginationPlan,
  font: PDFFont,
): void {
  const size = 5
  const margin = mmToPdfPoints(plan.marginsMm)
  for (let offset = 0; offset < geometry.columns; offset += 1) {
    const label = String(range.columnStart + offset)
    const width = font.widthOfTextAtSize(label, size)
    const x = geometry.x + (offset + 0.5) * geometry.cellSizePt - width / 2
    page.drawText(label, { x, y: geometry.topY + 2, size, font, color: rgb(0.18, 0.18, 0.17) })
  }
  for (let offset = 0; offset < geometry.rows; offset += 1) {
    const label = String(range.rowStart + offset)
    const width = font.widthOfTextAtSize(label, size)
    const x = margin + plan.coordinateGutterMm * (72 / 25.4) - width - 2
    const y = geometry.topY - (offset + 0.5) * geometry.cellSizePt - size / 2
    page.drawText(label, { x, y, size, font, color: rgb(0.18, 0.18, 0.17) })
  }
}

function drawProductionPage(
  page: ReturnType<typeof addPdfPage>,
  snapshot: ExportSnapshot,
  plan: PdfPaginationPlan,
  range: PdfGridRange,
  pageIndex: number,
  totalPages: number,
  thumbnail: PDFImage,
  font: PDFFont,
  numericFont: PDFFont,
): void {
  const input = createPdfLayoutInputFromSnapshot(snapshot)
  const geometry = derivePdfProductionGridGeometry(plan, range)
  const margin = mmToPdfPoints(plan.marginsMm)
  const titleY = page.getHeight() - margin - mmToPdfPoints(6)
  const pageEndRow = range.rowEndExclusive - 1
  const pageEndColumn = range.columnEndExclusive - 1
  const mode = input.colorMode === 'color' ? '彩色' : '黑白'
  page.drawText(`制作图 ${pageIndex + 1}/${plan.pages.length} · 第 ${range.pageNumber} 页`, {
    x: margin,
    y: titleY,
    size: 13,
    font,
    color: rgb(0.14, 0.13, 0.12),
  })
  page.drawText(`作品：${snapshot.project.projectName}`, {
    x: margin,
    y: titleY - 14,
    size: 8,
    font,
    color: rgb(0.32, 0.31, 0.29),
    maxWidth: Math.max(30, page.getWidth() - margin * 2 - mmToPdfPoints(38)),
  })
  page.drawText(
    `${mode} · 行 ${range.rowStart}–${pageEndRow} · 列 ${range.columnStart}–${pageEndColumn}（0-based）`,
    {
      x: margin,
      y: titleY - 26,
      size: 8,
      font,
      color: rgb(0.32, 0.31, 0.29),
      maxWidth: Math.max(30, page.getWidth() - margin * 2 - mmToPdfPoints(38)),
    },
  )
  drawPageThumbnail(page, thumbnail, range, snapshot.grid, plan, font)
  drawGridCells(page, snapshot, plan, range, geometry, input, numericFont)
  drawGridLines(page, range, geometry, input)
  if (input.showCoordinates) drawCoordinates(page, range, geometry, plan, numericFont)
  page.drawText(
    `每页 ${plan.columnsPerPage} 列 × ${plan.rowsPerPage} 行 · 单格 ${plan.cellSizeMm.toFixed(2)}mm · 第 ${range.pageNumber} 页 / 共 ${totalPages} 页`,
    {
      x: margin,
      y: margin + mmToPdfPoints(1),
      size: 7,
      font,
      color: rgb(0.3, 0.29, 0.27),
      maxWidth: page.getWidth() - margin * 2,
    },
  )
}

export async function createPdfProductionBlob(
  snapshot: ExportSnapshot,
  dependencies: PdfProductionDependencies = {},
): Promise<{ blob: Blob; plan: PdfPaginationPlan; pageCount: number }> {
  assertSupportedExportPalette(snapshot)
  const grid = snapshot.grid
  const input = createPdfLayoutInputFromSnapshot(snapshot)
  const plan = recommendPdfPagination(grid, input)
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
  const materialPages = input.includeMaterials
    ? paginatePdfMaterialRows(derivePdfMaterialRows(snapshot)).length
    : 0
  const pageCount = 1 + plan.pages.length + materialPages

  plan.pages.forEach((range, index) => {
    const page = addPdfPage(document, { width: plan.pageWidthMm, height: plan.pageHeightMm })
    drawProductionPage(page, snapshot, plan, range, index, pageCount, thumbnail, font, numericFont)
  })
  if (input.includeMaterials) {
    drawPdfMaterialsPages(document, snapshot, font, numericFont, plan.pages.length + 2)
  }

  return { blob: await savePdfBlob(document), plan, pageCount }
}

export async function downloadPdfProduction(
  snapshot: ExportSnapshot,
  dependencies: PdfProductionDependencies = {},
): Promise<void> {
  const { blob } = await createPdfProductionBlob(snapshot, dependencies)
  downloadBlob(blob, `${snapshot.fileNameBase}.pdf`)
}
