import { describe, expect, it } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import {
  derivePdfMaterialRows,
  derivePdfMaterialsRowsPerPage,
  paginatePdfMaterialRows,
} from '../../src/features/export/pdf/materials'
import { createExportSnapshot } from '../../src/features/export/snapshot'

const source: Source = {
  originalImage: new Blob(['task087'], { type: 'image/png' }),
  originalFileName: 'materials.pdf',
  mimeType: 'image/png',
  originalWidth: 4,
  originalHeight: 2,
}

function makeSnapshot(values: readonly number[]) {
  const project = createProject({
    source: { ...source },
    projectName: '材料清单作品',
    crop: { x: 0, y: 0, width: 4, height: 2, rotation: 0, aspectRatio: 2 },
  })
  const grid = createGrid(values.length, 1)
  grid.cells.set(values)
  return createExportSnapshot({ ...project, grid, revision: 7 } satisfies Project)
}

describe('TASK-087 PDF materials data and page splitting', () => {
  it('maps MARD entries and exact actual/suggested quantities from snapshot stats', () => {
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const snapshot = makeSnapshot([0, 2, 1, 2, white.paletteIndex, white.paletteIndex])
    const revision = snapshot.project.revision
    const rows = derivePdfMaterialRows(snapshot)

    expect(rows.map(({ paletteIndex }) => paletteIndex)).toEqual([2, white.paletteIndex, 1])
    expect(
      rows.map(({ displayCode, name, actualCount, suggestedCount }) => [
        displayCode,
        name,
        actualCount,
        suggestedCount,
      ]),
    ).toEqual([
      [MARD_291_PALETTE.entries[1]!.displayCode, MARD_291_PALETTE.entries[1]!.name, 2, 3],
      [white.displayCode, white.name, 2, 3],
      [MARD_291_PALETTE.entries[0]!.displayCode, MARD_291_PALETTE.entries[0]!.name, 1, 2],
    ])
    expect(rows.some(({ paletteIndex }) => paletteIndex === 0)).toBe(false)
    expect(snapshot.stats.totalBeads).toBe(5)
    expect(snapshot.project.revision).toBe(revision)
    expect(Array.from(snapshot.grid.cells)).toEqual([
      0,
      2,
      1,
      2,
      white.paletteIndex,
      white.paletteIndex,
    ])
  })

  it('does not invent material rows for missing beads and keeps a single explanatory page', () => {
    const rows = derivePdfMaterialRows(makeSnapshot([0, 0, 0, 0]))
    expect(rows).toEqual([])
    expect(paginatePdfMaterialRows(rows)).toEqual([[]])
  })

  it('splits long lists without dropping, duplicating or changing fields', () => {
    const rows = derivePdfMaterialRows(makeSnapshot([1, 2, 3, 4, 5]))
    const pages = paginatePdfMaterialRows(rows, 2)
    expect(pages.map((page) => page.map(({ paletteIndex }) => paletteIndex))).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ])
    expect(pages.flat()).toEqual(rows)
    expect(derivePdfMaterialsRowsPerPage()).toBeGreaterThan(1)
    expect(() => paginatePdfMaterialRows(rows, 0)).toThrow(RangeError)
  })
})
