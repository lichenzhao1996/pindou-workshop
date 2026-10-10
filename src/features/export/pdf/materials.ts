import { rgb, type PDFDocument, type PDFFont } from 'pdf-lib'
import { deriveMaterialStatsView } from '../../editor/materials/material-stats-view'
import type { ExportSnapshot } from '../snapshot'
import { assertSupportedExportPalette } from '../snapshot'
import { addPdfPage } from './document'
import { PDF_DEFAULT_LAYOUT_INPUT } from './layout'
import { mmToPdfPoints, PDF_A4_SIZE_MM } from './units'

export interface PdfMaterialRow {
  readonly paletteIndex: number
  readonly displayCode: string
  readonly name: string
  readonly actualCount: number
  readonly suggestedCount: number
}

export const PDF_MATERIALS_ROW_HEIGHT_PT = 17
export const PDF_MATERIALS_HEADER_HEIGHT_PT = 102
export const PDF_MATERIALS_FOOTER_HEIGHT_PT = 20

/** Maps the one formal ProjectStats snapshot into printable rows; it never scans Grid.cells. */
export function derivePdfMaterialRows(snapshot: ExportSnapshot): PdfMaterialRow[] {
  assertSupportedExportPalette(snapshot)
  const materials = deriveMaterialStatsView(snapshot.stats)
  if (!materials) throw new RangeError('PDF materials require ExportSnapshot statistics')
  return materials.rows.map((row) => ({
    paletteIndex: row.paletteIndex,
    displayCode: row.entry.displayCode,
    name: row.entry.name,
    actualCount: row.count,
    suggestedCount: row.suggestedCount,
  }))
}

export function derivePdfMaterialsRowsPerPage(): number {
  const pageHeightPt = mmToPdfPoints(PDF_A4_SIZE_MM.height)
  const marginPt = mmToPdfPoints(PDF_DEFAULT_LAYOUT_INPUT.marginsMm)
  const printableRowsHeight =
    pageHeightPt - marginPt * 2 - PDF_MATERIALS_HEADER_HEIGHT_PT - PDF_MATERIALS_FOOTER_HEIGHT_PT
  const rowsPerPage = Math.floor(printableRowsHeight / PDF_MATERIALS_ROW_HEIGHT_PT)
  if (rowsPerPage < 1) throw new RangeError('PDF materials page has no printable rows')
  return rowsPerPage
}

export function paginatePdfMaterialRows(
  rows: readonly PdfMaterialRow[],
  rowsPerPage = derivePdfMaterialsRowsPerPage(),
): PdfMaterialRow[][] {
  if (!Number.isSafeInteger(rowsPerPage) || rowsPerPage <= 0) {
    throw new RangeError('PDF materials rows per page must be a positive safe integer')
  }
  if (rows.length === 0) return [[]]
  const pages: PdfMaterialRow[][] = []
  for (let start = 0; start < rows.length; start += rowsPerPage) {
    pages.push(rows.slice(start, start + rowsPerPage))
  }
  return pages
}

export function drawPdfMaterialsPages(
  document: PDFDocument,
  snapshot: ExportSnapshot,
  font: PDFFont,
  numericFont: PDFFont,
  firstPdfPageNumber: number,
): number {
  const rows = derivePdfMaterialRows(snapshot)
  const pages = paginatePdfMaterialRows(rows)
  const marginPt = mmToPdfPoints(PDF_DEFAULT_LAYOUT_INPUT.marginsMm)
  const textColor = rgb(0.16, 0.15, 0.13)
  const mutedColor = rgb(0.38, 0.36, 0.33)
  const lineColor = rgb(0.76, 0.74, 0.7)
  const pageWidthPt = mmToPdfPoints(PDF_A4_SIZE_MM.width)
  const contentWidth = pageWidthPt - marginPt * 2
  const nameX = marginPt + contentWidth * 0.18
  const actualX = marginPt + contentWidth * 0.6
  const suggestedX = marginPt + contentWidth * 0.79
  const rowHeight = PDF_MATERIALS_ROW_HEIGHT_PT

  pages.forEach((pageRows, pageIndex) => {
    const page = addPdfPage(document, PDF_A4_SIZE_MM)
    let y = page.getHeight() - marginPt - 22
    page.drawText(
      pages.length > 1 ? `材料清单（续 ${pageIndex + 1}/${pages.length}）` : '拼豆材料清单',
      {
        x: marginPt,
        y,
        size: 17,
        font,
        color: textColor,
      },
    )
    y -= 24
    page.drawText(`作品：${snapshot.project.projectName}`, {
      x: marginPt,
      y,
      size: 10,
      font,
      color: mutedColor,
    })
    y -= 18
    page.drawText(
      `实际使用 ${snapshot.stats.usedColorCount} 色 · 总豆数 ${snapshot.stats.totalBeads} 颗`,
      { x: marginPt, y, size: 10, font, color: mutedColor },
    )
    y -= 22

    page.drawText('色号', { x: marginPt, y, size: 9, font, color: textColor })
    page.drawText('名称', { x: nameX, y, size: 9, font, color: textColor })
    page.drawText('使用数量', { x: actualX, y, size: 9, font, color: textColor })
    page.drawText('建议准备数量', { x: suggestedX, y, size: 9, font, color: textColor })
    y -= 7
    page.drawLine({
      start: { x: marginPt, y },
      end: { x: pageWidthPt - marginPt, y },
      thickness: 0.8,
      color: lineColor,
    })
    y -= 13

    if (pageRows.length === 0) {
      page.drawText('当前 Grid 没有实际使用的拼豆颜色。', {
        x: marginPt,
        y,
        size: 10,
        font,
        color: mutedColor,
      })
    } else {
      for (const row of pageRows) {
        const nameFont = /^[\x20-\x7e]*$/.test(row.name) ? numericFont : font
        page.drawText(row.displayCode, {
          x: marginPt,
          y,
          size: 9,
          font: numericFont,
          color: textColor,
        })
        page.drawText(row.name, {
          x: nameX,
          y,
          size: 9,
          font: nameFont,
          color: textColor,
          maxWidth: actualX - nameX - 8,
        })
        page.drawText(String(row.actualCount), {
          x: actualX,
          y,
          size: 9,
          font: numericFont,
          color: textColor,
        })
        page.drawText(String(row.suggestedCount), {
          x: suggestedX,
          y,
          size: 9,
          font: numericFont,
          color: textColor,
        })
        y -= rowHeight
      }
    }

    page.drawText(
      `第 ${firstPdfPageNumber + pageIndex} 页 / 共 ${firstPdfPageNumber + pages.length - 1} 页`,
      {
        x: marginPt,
        y: marginPt - 2,
        size: 8,
        font,
        color: mutedColor,
      },
    )
  })
  return pages.length
}
