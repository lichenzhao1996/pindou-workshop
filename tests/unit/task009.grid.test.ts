import { describe, expect, it } from 'vitest'
import {
  EMPTY,
  MAX_PALETTE_INDEX,
  MIN_PALETTE_INDEX,
  assertValidGridCellValue,
  createGrid,
  isValidGridCellValue,
} from '../../src/domain/project'
import { createProject } from '../../src/domain/project'
import type { CropState, Project, Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'grid-fixture.png',
  mimeType: 'image/png',
  originalWidth: 100,
  originalHeight: 100,
}

const crop: CropState = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  aspectRatio: 1,
}

describe('Grid foundation', () => {
  it('creates a row-major Uint16Array with the requested dimensions', () => {
    const grid = createGrid(4, 3)

    expect(grid.width).toBe(4)
    expect(grid.height).toBe(3)
    expect(grid.cells).toBeInstanceOf(Uint16Array)
    expect(grid.cells.length).toBe(grid.width * grid.height)
  })

  it('initializes every cell as EMPTY', () => {
    const grid = createGrid(4, 3)

    expect(EMPTY).toBe(0)
    expect([...grid.cells].every((value) => value === EMPTY)).toBe(true)
  })

  it('accepts only EMPTY or the MARD Palette index range', () => {
    expect(isValidGridCellValue(EMPTY)).toBe(true)
    expect(isValidGridCellValue(MIN_PALETTE_INDEX)).toBe(true)
    expect(isValidGridCellValue(MAX_PALETTE_INDEX)).toBe(true)
    expect(isValidGridCellValue(MAX_PALETTE_INDEX + 1)).toBe(false)
    expect(isValidGridCellValue(-1)).toBe(false)
    expect(isValidGridCellValue(1.5)).toBe(false)

    expect(() => assertValidGridCellValue(MAX_PALETTE_INDEX + 1)).toThrow(RangeError)
  })

  it('keeps EMPTY distinct from any legal Palette index', () => {
    expect(EMPTY).not.toBe(MIN_PALETTE_INDEX)
    expect(isValidGridCellValue(EMPTY)).toBe(true)
    expect(isValidGridCellValue(MIN_PALETTE_INDEX)).toBe(true)
  })

  it('rejects non-positive or non-integer dimensions', () => {
    for (const dimensions of [
      [0, 3],
      [4, 0],
      [-1, 3],
      [4, -1],
      [1.5, 3],
      [4, 1.5],
      [Number.NaN, 3],
      [4, Number.POSITIVE_INFINITY],
    ]) {
      expect(() => createGrid(dimensions[0], dimensions[1])).toThrow(RangeError)
    }
  })

  it('does not share mutable cell storage between Grid instances', () => {
    const first = createGrid(2, 2)
    const second = createGrid(2, 2)

    first.cells[0] = MIN_PALETTE_INDEX

    expect(second.cells[0]).toBe(EMPTY)
  })

  it('can be referenced by the TASK-008 Project type without adding Grid behavior', () => {
    const grid = createGrid(2, 2)
    const project: Project = { ...createProject({ source, crop }), grid }

    expect(project.grid).toBe(grid)
    expect(project.grid?.cells).toBeInstanceOf(Uint16Array)
  })
})
