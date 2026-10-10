import { rgb } from 'pdf-lib'
import { MARD_291_PALETTE } from '../../../domain/palette'
import { deriveUsedColorRowsFromStats } from '../../editor/color-management'
import type { ExportSnapshot } from '../snapshot'
import { downloadBlob } from '../download'
import { createPdfDocument, addPdfPage, savePdfBlob } from './document'
import { embedChineseFont, type PdfFontBytesLoader } from './font'
import { mmToPdfPoints } from './units'

export async function createPdfFontSampleBlob(
  snapshot: ExportSnapshot,
  loadBytes?: PdfFontBytesLoader,
): Promise<Blob> {
  const document = await createPdfDocument(snapshot)
  const page = addPdfPage(document)
  const font = await embedChineseFont(document, loadBytes)
  const left = mmToPdfPoints(18)
  const top = page.getHeight() - mmToPdfPoints(24)

  page.drawText('拼豆工坊 PDF 字体嵌入样例', {
    x: left,
    y: top,
    size: 18,
    font,
    color: rgb(0.16, 0.15, 0.13),
  })
  page.drawText(`作品名称：${snapshot.project.projectName}`, {
    x: left,
    y: top - 32,
    size: 13,
    font,
    color: rgb(0.16, 0.15, 0.13),
  })

  const firstUsedRow = deriveUsedColorRowsFromStats(snapshot.stats)[0]
  const sampleColorText = firstUsedRow
    ? `材料示例：${firstUsedRow.entry.displayCode} ${firstUsedRow.entry.name}，${firstUsedRow.count} 颗`
    : `材料示例：${MARD_291_PALETTE.entries[0]!.displayCode} ${MARD_291_PALETTE.entries[0]!.name}，0 颗`
  page.drawText(sampleColorText, {
    x: left,
    y: top - 58,
    size: 12,
    font,
    color: rgb(0.24, 0.23, 0.21),
  })
  return savePdfBlob(document)
}

export async function downloadPdfFontSample(
  snapshot: ExportSnapshot,
  loadBytes?: PdfFontBytesLoader,
): Promise<void> {
  const blob = await createPdfFontSampleBlob(snapshot, loadBytes)
  downloadBlob(blob, `${snapshot.fileNameBase}.pdf`)
}
