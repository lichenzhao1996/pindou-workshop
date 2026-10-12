import { describe, expect, it, vi } from 'vitest'
import { createGrid, createProject, createFullImageCropState } from '../../src/domain/project'
import { createExportSnapshot } from '../../src/features/export/snapshot'
import { createPdfGridThumbnailPng } from '../../src/features/export/pdf/thumbnail'
import { createDefaultPdfLayoutInput } from '../../src/features/export/pdf/layout'
import { recommendPdfPagination } from '../../src/features/export/pdf/pagination'

function coverExactlyOnce(
  width: number,
  height: number,
  ranges: readonly {
    rowStart: number
    rowEndExclusive: number
    columnStart: number
    columnEndExclusive: number
  }[],
) {
  const coverage = new Uint8Array(width * height)
  for (const range of ranges) {
    for (let row = range.rowStart; row < range.rowEndExclusive; row += 1) {
      for (let column = range.columnStart; column < range.columnEndExclusive; column += 1) {
        coverage[row * width + column] += 1
      }
    }
  }
  return coverage
}

describe('TASK-099 large PDF pagination and temporary resources', () => {
  it('covers a maximum-width 256×192 Grid exactly once in automatic and manual plans', () => {
    const grid = { width: 256, height: 192 }
    const automatic = recommendPdfPagination(grid)
    const manual = recommendPdfPagination(grid, {
      ...createDefaultPdfLayoutInput(),
      manualCells: { columns: 128, rows: 96 },
    })

    for (const plan of [automatic, manual]) {
      const coverage = coverExactlyOnce(grid.width, grid.height, plan.pages)
      expect(coverage.every((count) => count === 1)).toBe(true)
      expect(plan.pages[0]).toMatchObject({ rowStart: 0, columnStart: 0 })
      expect(plan.pages.at(-1)).toMatchObject({ rowEndExclusive: 192, columnEndExclusive: 256 })
    }
    expect(automatic.estimatedPageCount).toBe(45)
    expect(manual.estimatedPageCount).toBe(4)
    expect(manual.readability).toBe('below-range')
  })

  it('releases the thumbnail canvas after PNG encoding, including encoder failure', async () => {
    const project = createProject({
      source: {
        originalImage: new Blob(['pdf-thumb'], { type: 'image/png' }),
        originalFileName: 'pdf-thumb.png',
        mimeType: 'image/png',
        originalWidth: 4,
        originalHeight: 3,
      },
      crop: createFullImageCropState(4, 3),
    })
    const grid = createGrid(256, 192)
    grid.cells.fill(35)
    const snapshot = createExportSnapshot({ ...project, grid })

    const createCanvas = (blob: Blob | null) => {
      const context = {
        createImageData: (width: number, height: number) =>
          ({ data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
        putImageData: vi.fn(),
      }
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        toBlob: (callback: BlobCallback) => callback(blob),
      } as unknown as HTMLCanvasElement
      return canvas
    }

    const canvas = createCanvas(new Blob(['thumbnail'], { type: 'image/png' }))
    await expect(createPdfGridThumbnailPng(snapshot, () => canvas)).resolves.toBeInstanceOf(
      Uint8Array,
    )
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)

    const failed = createCanvas(null)
    await expect(createPdfGridThumbnailPng(snapshot, () => failed)).rejects.toThrow(/encoded/)
    expect(failed.width).toBe(0)
    expect(failed.height).toBe(0)
  })
})
