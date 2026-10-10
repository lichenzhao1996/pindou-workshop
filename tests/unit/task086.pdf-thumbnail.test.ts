import { describe, expect, it } from 'vitest'
import { derivePdfThumbnailRangeRect } from '../../src/features/export/pdf/thumbnail'
import type { PdfGridRange } from '../../src/features/export/pdf/pagination'

describe('TASK-086 PDF pagination thumbnail geometry', () => {
  it('maps each half-open page range to exact normalized thumbnail coordinates', () => {
    const grid = { width: 64, height: 48 }
    const ranges: PdfGridRange[] = [
      {
        pageNumber: 2,
        pageRow: 0,
        pageColumn: 0,
        rowStart: 0,
        rowEndExclusive: 31,
        columnStart: 0,
        columnEndExclusive: 46,
      },
      {
        pageNumber: 3,
        pageRow: 0,
        pageColumn: 1,
        rowStart: 0,
        rowEndExclusive: 31,
        columnStart: 46,
        columnEndExclusive: 64,
      },
      {
        pageNumber: 4,
        pageRow: 1,
        pageColumn: 0,
        rowStart: 31,
        rowEndExclusive: 48,
        columnStart: 0,
        columnEndExclusive: 46,
      },
      {
        pageNumber: 5,
        pageRow: 1,
        pageColumn: 1,
        rowStart: 31,
        rowEndExclusive: 48,
        columnStart: 46,
        columnEndExclusive: 64,
      },
    ]

    const rectangles = ranges.map((range) => derivePdfThumbnailRangeRect(grid, range))
    expect(rectangles[0]).toEqual({ x: 0, y: 0, width: 46 / 64, height: 31 / 48 })
    expect(rectangles[1]).toEqual({ x: 46 / 64, y: 0, width: 18 / 64, height: 31 / 48 })
    expect(rectangles[2]).toEqual({ x: 0, y: 31 / 48, width: 46 / 64, height: 17 / 48 })
    expect(rectangles[3]).toEqual({ x: 46 / 64, y: 31 / 48, width: 18 / 64, height: 17 / 48 })
    expect(new Set(rectangles.map((rect) => JSON.stringify(rect))).size).toBe(4)
    expect(rectangles.reduce((sum, rect) => sum + rect.width * rect.height, 0)).toBe(1)
  })

  it('rejects empty or out-of-Grid ranges', () => {
    expect(() =>
      derivePdfThumbnailRangeRect(
        { width: 64, height: 48 },
        {
          rowStart: 0,
          rowEndExclusive: 48,
          columnStart: 0,
          columnEndExclusive: 65,
        },
      ),
    ).toThrow(RangeError)
    expect(() =>
      derivePdfThumbnailRangeRect(
        { width: 64, height: 48 },
        {
          rowStart: 10,
          rowEndExclusive: 10,
          columnStart: 0,
          columnEndExclusive: 2,
        },
      ),
    ).toThrow(RangeError)
  })
})
