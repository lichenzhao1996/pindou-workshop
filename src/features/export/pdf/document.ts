import { PDFDocument, type PDFPage } from 'pdf-lib'
import type { ExportSnapshot } from '../snapshot'
import { assertSupportedExportPalette } from '../snapshot'
import { downloadBlob } from '../download'
import {
  assertValidPdfPageSizeMm,
  mmToPdfPoints,
  PDF_A4_SIZE_MM,
  type PdfPageSizeMm,
} from './units'

export async function createPdfDocument(snapshot: ExportSnapshot): Promise<PDFDocument> {
  assertSupportedExportPalette(snapshot)
  // Validate the copied Grid and stats at the document boundary; all later pages use this snapshot.
  const grid = snapshot.grid
  const stats = snapshot.stats
  if (grid.cells.length !== grid.width * grid.height) {
    throw new RangeError('PDF Export Snapshot Grid dimensions are inconsistent')
  }
  void stats
  return PDFDocument.create({ updateMetadata: false })
}

export function addPdfPage(document: PDFDocument, sizeMm: PdfPageSizeMm = PDF_A4_SIZE_MM): PDFPage {
  assertValidPdfPageSizeMm(sizeMm)
  return document.addPage([mmToPdfPoints(sizeMm.width), mmToPdfPoints(sizeMm.height)])
}

export async function savePdfBlob(document: PDFDocument): Promise<Blob> {
  try {
    const bytes = await document.save()
    const copy = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(copy).set(bytes)
    return new Blob([copy], { type: 'application/pdf' })
  } catch {
    throw new Error('PDF document could not be serialized')
  }
}

export async function createBasePdfBlob(snapshot: ExportSnapshot): Promise<Blob> {
  const document = await createPdfDocument(snapshot)
  addPdfPage(document)
  return savePdfBlob(document)
}

export async function downloadBasePdf(snapshot: ExportSnapshot): Promise<void> {
  const blob = await createBasePdfBlob(snapshot)
  downloadBlob(blob, `${snapshot.fileNameBase}.pdf`)
}
