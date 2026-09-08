import { EMPTY, MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from './constants'

export interface Grid {
  width: number
  height: number
  cells: Uint16Array
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
