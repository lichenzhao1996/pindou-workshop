import { describe, expect, it } from 'vitest'
import {
  MAX_GRID_WIDTH,
  MIN_GRID_WIDTH,
  deriveGenerationDimensions,
} from '../../src/domain/generation'
import { createGrid } from '../../src/domain/project/grid'
import { createExportSnapshot } from '../../src/features/export/snapshot'
import { createProject, createFullImageCropState } from '../../src/domain/project'

function crop(aspectRatio: number) {
  return { x: 0, y: 0, width: aspectRatio * 100, height: 100, rotation: 0 as const, aspectRatio }
}

describe('TASK-098 total-cell engineering boundaries', () => {
  it('preserves product width limits but does not create a total-cell warning or limit', () => {
    expect(MIN_GRID_WIDTH).toBe(8)
    expect(MAX_GRID_WIDTH).toBe(256)

    const dimensions = deriveGenerationDimensions(MAX_GRID_WIDTH, crop(1 / 5))
    expect(dimensions.heightBeads).toBe(1280)
    expect(dimensions.warnings.map(({ code }) => code)).toEqual(['extreme-aspect-ratio'])
    expect(dimensions.warnings.some(({ code }) => code.includes('grid'))).toBe(false)
  })

  it('allows a measured 256×1280 Grid and preserves the exact typed-array payload in Export Snapshot', () => {
    const source = new Blob(['grid-boundary'], { type: 'image/png' })
    const project = createProject({
      source: {
        originalImage: source,
        originalFileName: 'grid-boundary.png',
        mimeType: 'image/png',
        originalWidth: 64,
        originalHeight: 320,
      },
      crop: createFullImageCropState(64, 320),
    })
    const grid = createGrid(256, 1280)
    grid.cells.fill(35)
    const withGrid = { ...project, grid }
    const snapshot = createExportSnapshot(withGrid)

    expect(snapshot.grid.width).toBe(256)
    expect(snapshot.grid.height).toBe(1280)
    expect(snapshot.grid.cells).toHaveLength(327_680)
    expect(snapshot.grid.cells.byteLength).toBe(655_360)
    expect(snapshot.stats.totalBeads).toBe(327_680)
    expect(snapshot.grid.cells[0]).toBe(35)
    expect(snapshot.grid.cells.at(-1)).toBe(35)
    expect(withGrid.grid).toBe(grid)
  })

  it('rejects unsafe integer dimensions without imposing an arbitrary practical cell cap', () => {
    expect(() => createGrid(256, Number.MAX_SAFE_INTEGER)).toThrow(/cell count is too large/)
    expect(() => deriveGenerationDimensions(256, crop(1e-15))).toThrow(/safe integer/)
  })
})
