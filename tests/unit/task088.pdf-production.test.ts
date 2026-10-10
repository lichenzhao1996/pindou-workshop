import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import {
  createDefaultPdfExportSettings,
  createPdfExportOptions,
  createPdfLayoutInputFromSnapshot,
} from '../../src/features/export/pdf/layout'
import {
  createPdfProductionBlob,
  derivePdfProductionCellFill,
  derivePdfProductionGridGeometry,
} from '../../src/features/export/pdf/production'
import { createExportSnapshot } from '../../src/features/export/snapshot'
import { recommendPdfPagination } from '../../src/features/export/pdf/pagination'
import { PDFDocument } from 'pdf-lib'

const PNG_1X1 = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
)

const source: Source = {
  originalImage: new Blob(['task088'], { type: 'image/png' }),
  originalFileName: 'production.png',
  mimeType: 'image/png',
  originalWidth: 2,
  originalHeight: 2,
}

function makeSnapshot(values: readonly number[], options: Readonly<Record<string, unknown>> = {}) {
  const project = createProject({
    source: { ...source },
    projectName: '制作图测试',
    crop: { x: 0, y: 0, width: 2, height: 2, rotation: 0, aspectRatio: 1 },
  })
  const grid = createGrid(2, 2)
  grid.cells.set(values)
  return createExportSnapshot({ ...project, grid, revision: 4 } satisfies Project, options)
}

describe('TASK-088 PDF production chart', () => {
  it('defaults to all readable chart elements, materials, and color mode', () => {
    expect(createDefaultPdfExportSettings()).toEqual({
      showGrid: true,
      showLabels: true,
      showCoordinates: true,
      showTenCellGuides: true,
      includeMaterials: true,
      colorMode: 'color',
    })
    const settings = createPdfLayoutInputFromSnapshot(makeSnapshot([1, 0, 2, 1]))
    expect(settings).toMatchObject(createDefaultPdfExportSettings())
  })

  it('captures monochrome settings in one immutable snapshot and preserves mandatory codes', () => {
    const options = createPdfExportOptions(
      {
        showGrid: false,
        showLabels: false,
        showCoordinates: true,
        showTenCellGuides: false,
        includeMaterials: false,
        colorMode: 'monochrome',
      },
      { columns: 1, rows: 2 },
    )
    const snapshot = makeSnapshot([1, 0, 2, 1], options)
    const input = createPdfLayoutInputFromSnapshot(snapshot)
    expect(input).toMatchObject({
      showGrid: false,
      showLabels: true,
      showCoordinates: true,
      showTenCellGuides: false,
      includeMaterials: false,
      colorMode: 'monochrome',
      manualCells: { columns: 1, rows: 2 },
    })
  })

  it('uses the exact MARD fill in color mode and separates EMPTY from white beads in both modes', () => {
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const color = MARD_291_PALETTE.entries.find(({ paletteIndex }) => paletteIndex === 2)!
    const colorFill = derivePdfProductionCellFill(color.paletteIndex, 'color')
    const whiteFill = derivePdfProductionCellFill(white.paletteIndex, 'color')
    const emptyFill = derivePdfProductionCellFill(0, 'color')
    const monoWhiteFill = derivePdfProductionCellFill(white.paletteIndex, 'monochrome')
    const monoEmptyFill = derivePdfProductionCellFill(0, 'monochrome')

    expect([colorFill.red, colorFill.green, colorFill.blue]).toEqual([
      color.rgb.r / 255,
      color.rgb.g / 255,
      color.rgb.b / 255,
    ])
    expect([whiteFill.red, whiteFill.green, whiteFill.blue]).toEqual([1, 1, 1])
    expect([emptyFill.red, emptyFill.green, emptyFill.blue]).not.toEqual([1, 1, 1])
    expect([monoWhiteFill.red, monoWhiteFill.green, monoWhiteFill.blue]).toEqual([1, 1, 1])
    expect([monoEmptyFill.red, monoEmptyFill.green, monoEmptyFill.blue]).not.toEqual([1, 1, 1])
    expect(() => derivePdfProductionCellFill(292, 'color')).toThrow(RangeError)
  })

  it('keeps page Grid rectangles inside margins and covers every half-open range once', () => {
    const grid = { width: 64, height: 48 }
    const plan = recommendPdfPagination(grid)
    const coverage = new Uint8Array(grid.width * grid.height)
    for (const range of plan.pages) {
      const geometry = derivePdfProductionGridGeometry(plan, range)
      expect(geometry.right).toBeLessThanOrEqual(
        ((plan.pageWidthMm - plan.marginsMm) * 72) / 25.4 + 0.01,
      )
      expect(geometry.bottom).toBeGreaterThanOrEqual(
        ((plan.marginsMm + plan.footerMm) * 72) / 25.4 - 0.01,
      )
      for (let row = range.rowStart; row < range.rowEndExclusive; row += 1) {
        for (let column = range.columnStart; column < range.columnEndExclusive; column += 1) {
          coverage[row * grid.width + column] += 1
        }
      }
    }
    expect(coverage.every((count) => count === 1)).toBe(true)
  })

  it('creates a parseable, fully assembled PDF from one snapshot without changing its project data', async () => {
    const snapshot = makeSnapshot([0, 1, 2, 291], {
      pdfColorMode: 'monochrome',
      pdfIncludeMaterials: true,
    })
    const originalCells = Array.from(snapshot.grid.cells)
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKsc-Regular.otf'))
    const { blob, plan, pageCount } = await createPdfProductionBlob(snapshot, {
      loadFontBytes: async () => fontBytes,
      renderEffectPreview: async () => new Blob([PNG_1X1], { type: 'image/png' }),
      renderGridThumbnail: async () => PNG_1X1,
    })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const pdf = await PDFDocument.load(bytes)

    expect(blob.type).toBe('application/pdf')
    expect(bytes.slice(0, 5)).toEqual(new TextEncoder().encode('%PDF-'))
    expect(pageCount).toBe(1 + plan.pages.length + 1)
    expect(pdf.getPageCount()).toBe(pageCount)
    expect(pdf.getPage(1)!.getSize()).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    })
    expect(snapshot.project.revision).toBe(4)
    expect(Array.from(snapshot.grid.cells)).toEqual(originalCells)
    expect(snapshot.stats.totalBeads).toBe(3)
  })
})
