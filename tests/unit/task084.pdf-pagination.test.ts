import { describe, expect, it } from 'vitest'
import { createDefaultPdfLayoutInput } from '../../src/features/export/pdf/layout'
import { recommendPdfPagination } from '../../src/features/export/pdf/pagination'

describe('TASK-084 automatic PDF pagination recommendation', () => {
  it('fits A4 pages at a readable cell size and selects orientation from Grid shape', () => {
    const input = createDefaultPdfLayoutInput()
    const wide = recommendPdfPagination({ width: 64, height: 48 }, input)
    const tall = recommendPdfPagination({ width: 48, height: 64 }, input)

    expect(wide.orientation).toBe('landscape')
    expect(tall.orientation).toBe('portrait')
    expect(wide.cellSizeMm).toBeGreaterThanOrEqual(5)
    expect(wide.cellSizeMm).toBeLessThanOrEqual(7)
    expect(wide.readability).toBe('within-range')
    expect(wide.columnsPerPage).not.toBe(40)
    expect(wide.rowsPerPage).not.toBe(40)
  })

  it('covers small and large Grids with repeatable page counts and half-open ranges', () => {
    const small = recommendPdfPagination({ width: 8, height: 1 })
    expect(small.estimatedPageCount).toBe(1)
    expect(small.pages).toEqual([
      {
        pageNumber: 2,
        pageRow: 0,
        pageColumn: 0,
        rowStart: 0,
        rowEndExclusive: 1,
        columnStart: 0,
        columnEndExclusive: 8,
      },
    ])

    const grid = { width: 64, height: 48 }
    const first = recommendPdfPagination(grid)
    const second = recommendPdfPagination(grid)
    expect(first).toEqual(second)
    expect(first.estimatedPageCount).toBe(4)
    expect(first.pages).toHaveLength(4)

    const coverage = new Uint8Array(grid.width * grid.height)
    for (const page of first.pages) {
      for (let row = page.rowStart; row < page.rowEndExclusive; row += 1) {
        for (let column = page.columnStart; column < page.columnEndExclusive; column += 1) {
          coverage[row * grid.width + column] += 1
        }
      }
    }
    expect(coverage.every((count) => count === 1)).toBe(true)
    expect(first.pages.at(-1)).toMatchObject({
      rowStart: 31,
      rowEndExclusive: 48,
      columnStart: 46,
      columnEndExclusive: 64,
    })

    const maximum = recommendPdfPagination({ width: 256, height: 192 })
    expect(maximum.estimatedPageCount).toBe(42)
    expect(maximum.pages[0]?.rowStart).toBe(0)
    expect(maximum.pages.at(-1)?.rowEndExclusive).toBe(192)
    expect(maximum.pages.at(-1)?.columnEndExclusive).toBe(256)
  })

  it('reports an out-of-range cell recommendation instead of silently changing the target', () => {
    const input = { ...createDefaultPdfLayoutInput(), targetCellMm: 8 }
    const plan = recommendPdfPagination({ width: 64, height: 48 }, input)
    expect(plan.readability).toBe('above-range')
    expect(plan.diagnostics).toHaveLength(1)
    expect(plan.cellSizeMm).toBeGreaterThan(7)
  })

  it('rejects malformed Grid dimensions', () => {
    expect(() => recommendPdfPagination({ width: 0, height: 1 })).toThrow(RangeError)
    expect(() => recommendPdfPagination({ width: 1.5, height: 1 })).toThrow(RangeError)
  })
})
