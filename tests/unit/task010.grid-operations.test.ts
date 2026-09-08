import { describe, expect, it } from 'vitest'
import {
  EMPTY,
  MAX_PALETTE_INDEX,
  applyGridOperation,
  createGrid,
  createProject,
  fromGridIndex,
  getCell,
  isValidGridCellValue,
  setCell,
  setCells,
  toGridIndex,
} from '../../src/domain/project'
import type { CropState, Project, Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'task010-fixture.png',
  mimeType: 'image/png',
  originalWidth: 300,
  originalHeight: 200,
}

const crop: CropState = {
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  rotation: 0,
  aspectRatio: 3 / 2,
}

function createProjectWithGrid(): Project {
  return { ...createProject({ source, crop }), grid: createGrid(3, 3) }
}

describe('Grid coordinates and operations', () => {
  it('converts 0-based row and column to a row-major index', () => {
    const grid = createGrid(3, 3)

    expect(toGridIndex(grid, 0, 0)).toBe(0)
    expect(toGridIndex(grid, 1, 2)).toBe(5)
    expect(toGridIndex(grid, 2, 2)).toBe(8)
  })

  it('converts indexes back to row and column and round-trips', () => {
    const grid = createGrid(3, 3)

    expect(fromGridIndex(grid, 0)).toEqual({ row: 0, column: 0 })
    expect(fromGridIndex(grid, 5)).toEqual({ row: 1, column: 2 })
    expect(fromGridIndex(grid, 8)).toEqual({ row: 2, column: 2 })

    for (let row = 0; row < grid.height; row += 1) {
      for (let column = 0; column < grid.width; column += 1) {
        const index = toGridIndex(grid, row, column)
        expect(fromGridIndex(grid, index)).toEqual({ row, column })
      }
    }
  })

  it('rejects invalid row, column, and index values', () => {
    const grid = createGrid(3, 3)

    expect(() => toGridIndex(grid, -1, 0)).toThrow(RangeError)
    expect(() => toGridIndex(grid, 0, -1)).toThrow(RangeError)
    expect(() => toGridIndex(grid, 3, 0)).toThrow(RangeError)
    expect(() => toGridIndex(grid, 0, 3)).toThrow(RangeError)
    expect(() => toGridIndex(grid, 1.5, 0)).toThrow(RangeError)
    expect(() => toGridIndex(grid, 0, Number.NaN)).toThrow(RangeError)
    expect(() => fromGridIndex(grid, -1)).toThrow(RangeError)
    expect(() => fromGridIndex(grid, 9)).toThrow(RangeError)
    expect(() => fromGridIndex(grid, 1.5)).toThrow(RangeError)
    expect(() => fromGridIndex(grid, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('reads EMPTY and Palette values without mutating the Grid', () => {
    const grid = createGrid(2, 2)
    grid.cells[1] = 17
    const before = grid.cells.slice()

    expect(getCell(grid, 0, 0)).toBe(EMPTY)
    expect(getCell(grid, 0, 1)).toBe(17)
    expect(grid.cells).toEqual(before)
    expect(() => getCell(grid, 2, 0)).toThrow(RangeError)
  })

  it('creates an immutable-style new Grid for valid single-cell writes', () => {
    const grid = createGrid(3, 3)
    const result = setCell(grid, 1, 1, MAX_PALETTE_INDEX)

    expect(result.changed).toBe(true)
    expect(result.grid).not.toBe(grid)
    expect(result.grid.cells).not.toBe(grid.cells)
    expect(getCell(grid, 1, 1)).toBe(EMPTY)
    expect(getCell(result.grid, 1, 1)).toBe(MAX_PALETTE_INDEX)
    expect(getCell(result.grid, 0, 0)).toBe(EMPTY)
  })

  it('accepts EMPTY, 1, and 291 and rejects invalid cell values', () => {
    const grid = createGrid(1, 1)
    const colored = setCell(grid, 0, 0, 1)
    const emptied = setCell(colored.grid, 0, 0, EMPTY)

    expect(setCell(grid, 0, 0, EMPTY).changed).toBe(false)
    expect(colored.changed).toBe(true)
    expect(emptied.changed).toBe(true)
    expect(getCell(emptied.grid, 0, 0)).toBe(EMPTY)
    expect(getCell(colored.grid, 0, 0)).toBe(1)
    expect(setCell(grid, 0, 0, MAX_PALETTE_INDEX).changed).toBe(true)
    for (const value of [-1, 292, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => setCell(grid, 0, 0, value)).toThrow(RangeError)
      expect(isValidGridCellValue(value)).toBe(false)
    }
  })

  it('returns the original Grid for a same-value write', () => {
    const grid = createGrid(2, 2)
    const first = setCell(grid, 0, 0, 17)
    const second = setCell(first.grid, 0, 0, 17)

    expect(second.changed).toBe(false)
    expect(second.grid).toBe(first.grid)
    expect(second.grid.cells).toBe(first.grid.cells)
  })

  it('applies a generic batch without changing unrelated cells', () => {
    const grid = createGrid(3, 3)
    const result = setCells(grid, [
      { row: 0, column: 2, value: 1 },
      { row: 2, column: 0, value: MAX_PALETTE_INDEX },
    ])

    expect(result.changed).toBe(true)
    expect(getCell(result.grid, 0, 2)).toBe(1)
    expect(getCell(result.grid, 2, 0)).toBe(MAX_PALETTE_INDEX)
    expect(getCell(result.grid, 1, 1)).toBe(EMPTY)
    expect(getCell(grid, 0, 2)).toBe(EMPTY)
  })

  it('updates Project Grid immutably and increments revision once', () => {
    const project = createProjectWithGrid()
    const updatedAt = new Date('2026-09-08T00:00:00.000Z')
    const result = applyGridOperation(
      project,
      { type: 'setCell', row: 1, column: 1, value: 17 },
      updatedAt,
    )

    expect(result.changed).toBe(true)
    expect(result.project).not.toBe(project)
    expect(result.project.grid).not.toBe(project.grid)
    expect(result.project?.grid?.cells).not.toBe(project.grid?.cells)
    expect(result.project.revision).toBe(project.revision + 1)
    expect(result.project.schemaVersion).toBe(project.schemaVersion)
    expect(result.project.projectVersion).toBe(project.projectVersion)
    expect(result.project.updatedAt).toBe(updatedAt.toISOString())
    expect(getCell(result.project.grid!, 1, 1)).toBe(17)
    expect(getCell(project.grid!, 1, 1)).toBe(EMPTY)
  })

  it('increments Project revision once for a batch operation', () => {
    const project = createProjectWithGrid()
    const result = applyGridOperation(project, {
      type: 'setCells',
      changes: [
        { row: 0, column: 0, value: 1 },
        { row: 2, column: 2, value: MAX_PALETTE_INDEX },
      ],
    })

    expect(result.changed).toBe(true)
    expect(result.project.revision).toBe(project.revision + 1)
    expect(getCell(result.project.grid!, 0, 0)).toBe(1)
    expect(getCell(result.project.grid!, 2, 2)).toBe(MAX_PALETTE_INDEX)
  })

  it('does not change Project or revision for a no-op operation', () => {
    const project = createProjectWithGrid()
    const result = applyGridOperation(project, {
      type: 'setCell',
      row: 0,
      column: 0,
      value: EMPTY,
    })

    expect(result.changed).toBe(false)
    expect(result.project).toBe(project)
    expect(result.project.revision).toBe(0)
  })

  it('does not increase revision when duplicate batch changes end at the original value', () => {
    const project = createProjectWithGrid()
    const result = applyGridOperation(project, {
      type: 'setCells',
      changes: [
        { row: 0, column: 0, value: 17 },
        { row: 0, column: 0, value: EMPTY },
      ],
    })

    expect(result.changed).toBe(false)
    expect(result.project).toBe(project)
    expect(result.project.revision).toBe(0)
  })

  it('rejects invalid Project operations without changing the original Project', () => {
    const project = createProjectWithGrid()

    expect(() =>
      applyGridOperation(project, { type: 'setCell', row: 3, column: 0, value: 1 }),
    ).toThrow(RangeError)
    expect(() =>
      applyGridOperation(project, { type: 'setCell', row: 0, column: 0, value: 292 }),
    ).toThrow(RangeError)
    expect(project.revision).toBe(0)
    expect(getCell(project.grid!, 0, 0)).toBe(EMPTY)
  })

  it('rejects Project operations when no Grid exists', () => {
    const project = createProject({ source, crop })

    expect(() =>
      applyGridOperation(project, { type: 'setCell', row: 0, column: 0, value: 1 }),
    ).toThrow(RangeError)
  })
})
