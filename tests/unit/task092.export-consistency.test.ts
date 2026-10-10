import { describe, expect, it, vi } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import { deriveUsedColorRowsFromStats } from '../../src/features/editor/color-management'
import { derivePdfMaterialRows } from '../../src/features/export/pdf/materials'
import { renderReferencePngCanvas } from '../../src/features/export/png/reference-guide'
import { createExportSnapshot } from '../../src/features/export/snapshot'

const source: Source = {
  originalImage: new Blob(['task092'], { type: 'image/png' }),
  originalFileName: 'task092.png',
  mimeType: 'image/png',
  originalWidth: 8,
  originalHeight: 1,
}

function createSnapshot(): Project {
  const white = MARD_291_PALETTE.entries.find(
    ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
  )!
  const project = createProject({
    source,
    projectName: 'TASK-092 一致性',
    crop: { x: 0, y: 0, width: 8, height: 1, rotation: 0, aspectRatio: 8 },
    widthBeads: 8,
  })
  const grid = createGrid(8, 1)
  grid.cells.set([0, white.paletteIndex, white.paletteIndex, 2, 2, 2, 35, 35])
  return { ...project, grid, revision: 7 }
}

function createCanvasHarness() {
  const fillText = vi.fn()
  const context = {
    scale: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillText,
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  }
  return { context, canvas, fillText }
}

describe('TASK-092 Project/Grid/stats/export consistency', () => {
  it('derives sidebar rows, PNG legend labels and PDF materials from one ExportSnapshot', () => {
    const project = createSnapshot()
    const snapshot = createExportSnapshot(project)
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const sidebarRows = deriveUsedColorRowsFromStats(snapshot.stats)
    const pdfRows = derivePdfMaterialRows(snapshot)
    const { canvas, fillText } = createCanvasHarness()

    renderReferencePngCanvas(snapshot, () => canvas as unknown as HTMLCanvasElement)

    const expected = [
      [2, 3],
      [35, 2],
      [white.paletteIndex, 2],
    ] as const
    expect(sidebarRows.map(({ paletteIndex, count }) => [paletteIndex, count])).toEqual(expected)
    expect(pdfRows.map(({ paletteIndex, actualCount }) => [paletteIndex, actualCount])).toEqual(
      expected,
    )
    for (const [paletteIndex, count] of expected) {
      const entry = MARD_291_PALETTE.entries.find(
        (candidate) => candidate.paletteIndex === paletteIndex,
      )!
      expect(fillText).toHaveBeenCalledWith(
        `${entry.displayCode} ${entry.name}  ${count} 颗`,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
      )
    }
    expect(snapshot.stats.totalBeads).toBe(7)
    expect(snapshot.stats.usedColorCount).toBe(3)
    expect(pdfRows.some(({ paletteIndex }) => paletteIndex === 0)).toBe(false)
    expect(snapshot.project.revision).toBe(7)
    expect(Array.from(snapshot.grid.cells)).toEqual(Array.from(project.grid!.cells))
  })
})
