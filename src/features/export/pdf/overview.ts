import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib'
import type { ExportSnapshot } from '../snapshot'
import { assertSupportedExportPalette } from '../snapshot'
import { downloadBlob } from '../download'
import { createEffectPreviewPngBlob } from '../png/effect-preview'
import { addPdfPage, createPdfDocument, savePdfBlob } from './document'
import { embedChineseFont, type PdfFontBytesLoader } from './font'
import { PDF_DEFAULT_LAYOUT_INPUT } from './layout'
import { mmToPdfPoints, PDF_A4_SIZE_MM } from './units'

export interface PdfOverviewFacts {
  readonly projectName: string
  readonly gridWidth: number
  readonly gridHeight: number
  readonly beadSizeMm: number
  readonly productWidthMm: number
  readonly productHeightMm: number
  readonly usedColorCount: number
  readonly totalBeads: number
}

export interface PdfImagePlacement {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface PdfOverviewDependencies {
  readonly loadFontBytes?: PdfFontBytesLoader
  readonly renderEffectPreview?: (snapshot: ExportSnapshot) => Promise<Blob>
}

export function derivePdfOverviewFacts(snapshot: ExportSnapshot): PdfOverviewFacts {
  assertSupportedExportPalette(snapshot)
  const grid = snapshot.grid
  const stats = snapshot.stats
  const displayMillimeters = (value: number) => Number(value.toFixed(1))
  return {
    projectName: snapshot.project.projectName,
    gridWidth: grid.width,
    gridHeight: grid.height,
    beadSizeMm: snapshot.project.generation.beadSizeMm,
    productWidthMm: displayMillimeters(stats.productWidthMm),
    productHeightMm: displayMillimeters(stats.productHeightMm),
    usedColorCount: stats.usedColorCount,
    totalBeads: stats.totalBeads,
  }
}

export function derivePdfOverviewImagePlacement(
  pageWidthPt: number,
  pageHeightPt: number,
  imageWidth: number,
  imageHeight: number,
  imageTopPt: number,
  marginMm = PDF_DEFAULT_LAYOUT_INPUT.marginsMm,
): PdfImagePlacement {
  if (
    ![pageWidthPt, pageHeightPt, imageWidth, imageHeight, imageTopPt, marginMm].every(
      Number.isFinite,
    ) ||
    pageWidthPt <= 0 ||
    pageHeightPt <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    marginMm < 0
  ) {
    throw new RangeError('PDF overview image placement requires positive finite dimensions')
  }
  const marginPt = mmToPdfPoints(marginMm)
  const boxWidth = pageWidthPt - marginPt * 2
  const boxHeight = imageTopPt - marginPt
  if (boxWidth <= 0 || boxHeight <= 0) {
    throw new RangeError('PDF overview has no printable area for its effect image')
  }
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return {
    x: (pageWidthPt - width) / 2,
    y: marginPt + (boxHeight - height) / 2,
    width,
    height,
  }
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const character of Array.from(text)) {
    const nextLine = `${line}${character}`
    if (line && font.widthOfTextAtSize(nextLine, fontSize) > maxWidth) {
      lines.push(line)
      line = character
    } else {
      line = nextLine
    }
  }
  if (line || lines.length === 0) lines.push(line)
  return lines
}

export async function drawPdfOverviewPage(
  document: PDFDocument,
  page: PDFPage,
  snapshot: ExportSnapshot,
  font: PDFFont,
  effectPreviewPng: Uint8Array,
): Promise<void> {
  const facts = derivePdfOverviewFacts(snapshot)
  const marginPt = mmToPdfPoints(PDF_DEFAULT_LAYOUT_INPUT.marginsMm)
  const maxTextWidth = page.getWidth() - marginPt * 2
  let y = page.getHeight() - marginPt - 19
  const textColor = rgb(0.16, 0.15, 0.13)
  page.drawText('拼豆作品总览', { x: marginPt, y, size: 18, font, color: textColor })
  y -= 25

  const projectNameLines = wrapText(`作品名称：${facts.projectName}`, font, 13, maxTextWidth)
  for (const line of projectNameLines) {
    page.drawText(line, { x: marginPt, y, size: 13, font, color: textColor })
    y -= 17
  }

  const detailLines = [
    `豆数尺寸：${facts.gridWidth} × ${facts.gridHeight} 颗`,
    `拼豆规格：${facts.beadSizeMm}mm · 实际成品尺寸：${facts.productWidthMm} × ${facts.productHeightMm}mm`,
    `使用颜色：${facts.usedColorCount} 色 · 拼豆总数：${facts.totalBeads} 颗`,
  ]
  for (const line of detailLines) {
    page.drawText(line, { x: marginPt, y, size: 11, font, color: textColor })
    y -= 15
  }

  const image = await document.embedPng(effectPreviewPng)
  const placement = derivePdfOverviewImagePlacement(
    page.getWidth(),
    page.getHeight(),
    image.width,
    image.height,
    y - 4,
  )
  page.drawImage(image, placement)
}

export async function createPdfOverviewBlob(
  snapshot: ExportSnapshot,
  dependencies: PdfOverviewDependencies = {},
): Promise<Blob> {
  const document = await createPdfDocument(snapshot)
  const page = addPdfPage(document, PDF_A4_SIZE_MM)
  const font = await embedChineseFont(document, dependencies.loadFontBytes)
  const previewBlob = await (dependencies.renderEffectPreview ?? createEffectPreviewPngBlob)(
    snapshot,
  )
  const previewBytes = new Uint8Array(await previewBlob.arrayBuffer())
  await drawPdfOverviewPage(document, page, snapshot, font, previewBytes)
  return savePdfBlob(document)
}

export async function downloadPdfOverview(
  snapshot: ExportSnapshot,
  dependencies: PdfOverviewDependencies = {},
): Promise<void> {
  const blob = await createPdfOverviewBlob(snapshot, dependencies)
  downloadBlob(blob, `${snapshot.fileNameBase}.pdf`)
}
