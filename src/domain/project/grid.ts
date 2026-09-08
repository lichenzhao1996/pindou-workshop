import { EMPTY, MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from './constants'

export interface Grid {
  width: number
  height: number
  cells: Uint16Array
}

export interface GridPosition {
  row: number
  column: number
}

export type GridCellValue = number

export function isValidGridCellValue(value: number): boolean {
  return (
    Number.isInteger(value) &&
    (value === EMPTY || (value >= MIN_PALETTE_INDEX && value <= MAX_PALETTE_INDEX))
  )
}

export function assertValidGridCellValue(value: number): asserts value is GridCellValue {
  if (!isValidGridCellValue(value)) {
    throw new RangeError(
      `Grid cell value must be EMPTY or an index from ${MIN_PALETTE_INDEX} to ${MAX_PALETTE_INDEX}`,
    )
  }
}

function assertPositiveInteger(value: number, name: 'width' | 'height'): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`Grid ${name} must be a positive integer`)
  }
}

function assertCoordinate(value: number, name: 'row' | 'column', limit: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= limit) {
    throw new RangeError(`Grid ${name} must be an integer from 0 to ${limit - 1}`)
  }
}

function assertIndex(index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new RangeError(`Grid index must be an integer from 0 to ${length - 1}`)
  }
}

export function toGridIndex(grid: Grid, row: number, column: number): number {
  assertCoordinate(row, 'row', grid.height)
  assertCoordinate(column, 'column', grid.width)

  return row * grid.width + column
}

export function fromGridIndex(grid: Grid, index: number): GridPosition {
  assertIndex(index, grid.cells.length)

  return {
    row: Math.floor(index / grid.width),
    column: index % grid.width,
  }
}

export function getCell(grid: Grid, row: number, column: number): GridCellValue {
  return grid.cells[toGridIndex(grid, row, column)]
}

export function createGrid(width: number, height: number): Grid {
  assertPositiveInteger(width, 'width')
  assertPositiveInteger(height, 'height')

  const length = width * height
  if (!Number.isSafeInteger(length)) {
    throw new RangeError('Grid cell count is too large')
  }

  return {
    width,
    height,
    cells: new Uint16Array(length),
  }
}
