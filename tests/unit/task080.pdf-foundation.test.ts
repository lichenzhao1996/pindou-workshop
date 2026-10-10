import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import { createBasePdfBlob, downloadBasePdf } from '../../src/features/export/pdf/document'
import { addPdfPage, createPdfDocument, savePdfBlob } from '../../src/features/export/pdf/document'
import { mmToPdfPoints, PDF_A4_SIZE_MM } from '../../src/features/export/pdf/units'
import { createExportSnapshot } from '../../src/features/export/snapshot'

const source: Source = {
  originalImage: new Blob(['task080'], { type: 'image/png' }),
  originalFileName: 'pdf.png',
  mimeType: 'image/png',
  originalWidth: 32,
  originalHeight: 24,
}

function makeSnapshot(): ReturnType<typeof createExportSnapshot> {
  const project = createProject({
    source: { ...source },
    projectName: 'PDF 基础',
    crop: { x: 0, y: 0, width: 32, height: 24, rotation: 0, aspectRatio: 4 / 3 },
  })
  const grid = createGrid(2, 2)
  grid.cells.set([1, 0, 35, 1])
  return createExportSnapshot({ ...project, grid } satisfies Project)
}

describe('TASK-080 PDF foundation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('converts millimeters to PDF points with stable A4 dimensions', () => {
    expect(mmToPdfPoints(25.4)).toBe(72)
    expect(mmToPdfPoints(PDF_A4_SIZE_MM.width)).toBeCloseTo(595.27559055, 7)
    expect(mmToPdfPoints(PDF_A4_SIZE_MM.height)).toBeCloseTo(841.88976378, 7)
    expect(() => mmToPdfPoints(Number.NaN)).toThrow(RangeError)
    expect(() => mmToPdfPoints(-1)).toThrow(RangeError)
  })

  it('creates pages from physical measurements and produces an openable A4 PDF Blob', async () => {
    const snapshot = makeSnapshot()
    const document = await createPdfDocument(snapshot)
    const customPage = addPdfPage(document, { width: 100, height: 50 })
    expect(customPage.getWidth()).toBeCloseTo(mmToPdfPoints(100))
    expect(customPage.getHeight()).toBeCloseTo(mmToPdfPoints(50))

    const blob = await createBasePdfBlob(snapshot)
    expect(blob.type).toBe('application/pdf')
    const parsed = await PDFDocument.load(await blob.arrayBuffer())
    expect(parsed.getPageCount()).toBe(1)
    expect(parsed.getPage(0).getWidth()).toBeCloseTo(mmToPdfPoints(210))
    expect(parsed.getPage(0).getHeight()).toBeCloseTo(mmToPdfPoints(297))
  })

  it('reports PDF serialization errors and downloads with the snapshot filename', async () => {
    const document = await PDFDocument.create()
    vi.spyOn(document, 'save').mockRejectedValueOnce(new Error('serialization'))
    await expect(savePdfBlob(document)).rejects.toThrow('PDF document could not be serialized')

    const downloadModule = await import('../../src/features/export/download')
    const spy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {})
    await downloadBasePdf(makeSnapshot())
    expect(spy).toHaveBeenCalledWith(expect.any(Blob), 'PDF 基础_2x2.pdf')
  })
})
