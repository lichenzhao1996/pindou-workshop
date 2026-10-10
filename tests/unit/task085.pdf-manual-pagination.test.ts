import { describe, expect, it } from 'vitest'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import {
  createDefaultPdfLayoutInput,
  createPdfLayoutInputFromSnapshot,
  PDF_MANUAL_COLUMNS_EXPORT_OPTION,
  PDF_MANUAL_ROWS_EXPORT_OPTION,
} from '../../src/features/export/pdf/layout'
import { recommendPdfPagination } from '../../src/features/export/pdf/pagination'
import { createExportSnapshot } from '../../src/features/export/snapshot'

const source: Source = {
  originalImage: new Blob(['task085'], { type: 'image/png' }),
  originalFileName: 'manual-pagination.png',
  mimeType: 'image/png',
  originalWidth: 64,
  originalHeight: 48,
}

function makeSnapshot(options: Record<string, string | number | boolean | null> = {}) {
  const project = createProject({
    source: { ...source },
    projectName: '手动分页',
    crop: { x: 0, y: 0, width: 64, height: 48, rotation: 0, aspectRatio: 4 / 3 },
  })
  const grid = createGrid(64, 48)
  grid.cells.fill(1)
  return createExportSnapshot({ ...project, grid } satisfies Project, options)
}

describe('TASK-085 manual PDF pagination', () => {
  it('uses manually confirmed columns and rows to update page count and cell size', () => {
    const snapshot = makeSnapshot({
      [PDF_MANUAL_COLUMNS_EXPORT_OPTION]: 20,
      [PDF_MANUAL_ROWS_EXPORT_OPTION]: 20,
    })
    const input = createPdfLayoutInputFromSnapshot(snapshot)
    const plan = recommendPdfPagination(snapshot.grid, input)

    expect(input.manualCells).toEqual({ columns: 20, rows: 20 })
    expect(plan.columnsPerPage).toBe(20)
    expect(plan.rowsPerPage).toBe(20)
    expect(plan.estimatedPageCount).toBe(12)
    expect(plan.cellSizeMm).toBeGreaterThanOrEqual(5)
  })

  it('warns through diagnostics when a manually increased page count makes labels too small', () => {
    const snapshot = makeSnapshot({
      [PDF_MANUAL_COLUMNS_EXPORT_OPTION]: 70,
      [PDF_MANUAL_ROWS_EXPORT_OPTION]: 60,
    })
    const plan = recommendPdfPagination(snapshot.grid, createPdfLayoutInputFromSnapshot(snapshot))

    expect(plan.estimatedPageCount).toBe(1)
    expect(plan.cellSizeMm).toBeLessThan(5)
    expect(plan.readability).toBe('below-range')
    expect(plan.diagnostics.join(' ')).toContain('小于 5mm')
  })

  it('keeps automatic defaults until a complete valid setting is confirmed in the snapshot', () => {
    const automatic = createPdfLayoutInputFromSnapshot(makeSnapshot())
    expect(automatic).toEqual(createDefaultPdfLayoutInput())
    expect(automatic.manualCells).toBeNull()
  })

  it('rejects partial or invalid confirmed settings rather than silently exporting another layout', () => {
    expect(() =>
      createPdfLayoutInputFromSnapshot(makeSnapshot({ [PDF_MANUAL_COLUMNS_EXPORT_OPTION]: 20 })),
    ).toThrow(RangeError)
    expect(() =>
      createPdfLayoutInputFromSnapshot(
        makeSnapshot({
          [PDF_MANUAL_COLUMNS_EXPORT_OPTION]: 0,
          [PDF_MANUAL_ROWS_EXPORT_OPTION]: 20,
        }),
      ),
    ).toThrow(RangeError)
  })
})
