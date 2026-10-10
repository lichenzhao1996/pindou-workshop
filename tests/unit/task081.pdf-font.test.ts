import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import { addPdfPage, createPdfDocument, savePdfBlob } from '../../src/features/export/pdf/document'
import {
  embedChineseFont,
  loadChineseFontBytes,
  PdfChineseFontError,
  PDF_CJK_FONT_ASSET,
} from '../../src/features/export/pdf/font'
import { createPdfFontSampleBlob } from '../../src/features/export/pdf/font-sample'
import { createExportSnapshot } from '../../src/features/export/snapshot'

const source: Source = {
  originalImage: new Blob(['task081'], { type: 'image/png' }),
  originalFileName: 'font.png',
  mimeType: 'image/png',
  originalWidth: 32,
  originalHeight: 24,
}

function makeSnapshot(): ReturnType<typeof createExportSnapshot> {
  const project = createProject({
    source: { ...source },
    projectName: '中文作品名称',
    crop: { x: 0, y: 0, width: 32, height: 24, rotation: 0, aspectRatio: 4 / 3 },
  })
  const grid = createGrid(2, 2)
  grid.cells.set([1, 0, 35, 1])
  return createExportSnapshot({ ...project, grid } satisfies Project)
}

describe('TASK-081 licensed Chinese font embedding', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads the bundled OTF from a stable public path and rejects missing or malformed assets', async () => {
    const otfHeader = new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 1, 2])
    const fetcher = vi.fn(async () => new Response(otfHeader, { status: 200 }))
    const bytes = await loadChineseFontBytes(fetcher)
    expect(bytes).toEqual(otfHeader)
    expect(fetcher).toHaveBeenCalledWith(PDF_CJK_FONT_ASSET)

    await expect(
      loadChineseFontBytes(vi.fn(async () => new Response(null, { status: 404 }))),
    ).rejects.toBeInstanceOf(PdfChineseFontError)
    await expect(
      loadChineseFontBytes(vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4])))),
    ).rejects.toThrow(/无效或不完整/)
    await expect(
      loadChineseFontBytes(vi.fn(async () => Promise.reject(new Error('offline')))),
    ).rejects.toThrow(/无法加载/)
  })

  it('embeds the bundled licensed OTF, writes Chinese project/material text, and produces a valid PDF', async () => {
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKsc-Regular.otf'))
    const snapshot = makeSnapshot()
    const document = await createPdfDocument(snapshot)
    const page = addPdfPage(document)
    const font = await embedChineseFont(document, async () => fontBytes)
    page.drawText('中文作品名称 · 材料清单 · 测试', { x: 40, y: 760, size: 14, font })
    const blob = await savePdfBlob(document)
    const parsed = await PDFDocument.load(await blob.arrayBuffer())

    expect(font.name).toBeTruthy()
    expect(parsed.getPageCount()).toBe(1)
    expect(blob.size).toBeGreaterThan(10_000)

    const sampleBlob = await createPdfFontSampleBlob(snapshot, async () => fontBytes)
    expect(sampleBlob.type).toBe('application/pdf')
    expect(sampleBlob.size).toBeGreaterThan(10_000)
  }, 60_000)

  it('surfaces fontkit parse or embed failures as a clear font error', async () => {
    const document = await PDFDocument.create()
    await expect(
      embedChineseFont(document, async () => new Uint8Array([0, 1, 2, 3])),
    ).rejects.toThrow(PdfChineseFontError)
  })
})
