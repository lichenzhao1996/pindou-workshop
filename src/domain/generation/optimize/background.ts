import { getPaletteEntryByIndex } from '../../palette/accessors'
import { MARD_291_PALETTE } from '../../palette/mard291'
import { deltaE76 } from '../../palette/match'
import type { Palette } from '../../palette/types'
import { EMPTY } from '../../project/constants'
import { assertValidGridCellValue, type Grid } from '../../project/grid'
import type { GridFragmentAnalysis } from './fragments'

const MIN_BACKGROUND_SIDE_COUNT = 2
const MIN_BACKGROUND_CELL_FRACTION = 0.25
const MAX_BACKGROUND_FRAGMENT_SIZE = 6
const MAX_BACKGROUND_DELTA_E76 = 6

function getTouchedSideCount(grid: Grid, fragment: GridFragmentAnalysis): number {
  let top = false
  let bottom = false
  let left = false
  let right = false

  for (const cellIndex of fragment.cellIndices) {
    const row = Math.floor(cellIndex / grid.width)
    const column = cellIndex % grid.width
    top ||= row === 0
    bottom ||= row === grid.height - 1
    left ||= column === 0
    right ||= column === grid.width - 1
  }

  return Number(top) + Number(bottom) + Number(left) + Number(right)
}

function hasEmptyBorder(grid: Grid): boolean {
  for (let column = 0; column < grid.width; column += 1) {
    if (
      grid.cells[column] === EMPTY ||
      grid.cells[(grid.height - 1) * grid.width + column] === EMPTY
    ) {
      return true
    }
  }

  for (let row = 0; row < grid.height; row += 1) {
    if (
      grid.cells[row * grid.width] === EMPTY ||
      grid.cells[row * grid.width + grid.width - 1] === EMPTY
    ) {
      return true
    }
  }

  return false
}

function getPrimaryBackground(
  grid: Grid,
  fragments: readonly GridFragmentAnalysis[],
): GridFragmentAnalysis | undefined {
  const minimumSize = grid.width * grid.height * MIN_BACKGROUND_CELL_FRACTION
  let largest: GridFragmentAnalysis | undefined
  let largestIsTied = false

  for (const fragment of fragments) {
    if (
      fragment.paletteIndex === EMPTY ||
      fragment.size < minimumSize ||
      getTouchedSideCount(grid, fragment) < MIN_BACKGROUND_SIDE_COUNT
    ) {
      continue
    }

    if (!largest || fragment.size > largest.size) {
      largest = fragment
      largestIsTied = false
    } else if (fragment.size === largest.size) {
      largestIsTied = true
    }
  }

  return largestIsTied ? undefined : largest
}

/** Uses one post-merge analysis snapshot; EMPTY and the primary region are never replaced. */
export function simplifyBackground(
  grid: Grid,
  fragments: readonly GridFragmentAnalysis[],
  palette: Palette = MARD_291_PALETTE,
): Grid {
  grid.cells.forEach(assertValidGridCellValue)
  const result: Grid = { width: grid.width, height: grid.height, cells: grid.cells.slice() }

  if (hasEmptyBorder(grid)) {
    return result
  }

  const primary = getPrimaryBackground(grid, fragments)
  if (!primary) {
    return result
  }

  const primaryEntry = getPaletteEntryByIndex(palette, primary.paletteIndex)
  if (!primaryEntry) {
    throw new RangeError(`Palette entry ${primary.paletteIndex} is missing`)
  }

  for (const fragment of fragments) {
    if (
      fragment.regionId === primary.regionId ||
      fragment.paletteIndex === EMPTY ||
      fragment.size < 1 ||
      fragment.size > MAX_BACKGROUND_FRAGMENT_SIZE
    ) {
      continue
    }

    const sourceEntry = getPaletteEntryByIndex(palette, fragment.paletteIndex)
    if (!sourceEntry) {
      throw new RangeError(`Palette entry ${fragment.paletteIndex} is missing`)
    }
    if (deltaE76(sourceEntry.lab, primaryEntry.lab) > MAX_BACKGROUND_DELTA_E76) {
      continue
    }

    for (const cellIndex of fragment.cellIndices) {
      if (grid.cells[cellIndex] !== fragment.paletteIndex) {
        throw new RangeError('Fragment analysis must match the source Grid')
      }
      result.cells[cellIndex] = primary.paletteIndex
    }
  }

  return result
}
