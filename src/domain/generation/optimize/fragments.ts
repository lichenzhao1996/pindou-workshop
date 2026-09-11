import { deltaE76 } from '../../palette/match'
import { getPaletteEntryByIndex } from '../../palette/accessors'
import { MARD_291_PALETTE } from '../../palette/mard291'
import type { Palette } from '../../palette/types'
import { EMPTY } from '../../project/constants'
import { assertValidGridCellValue, type Grid } from '../../project/grid'

export type FragmentSizeBand = '1' | '2' | '3' | '4-6' | '7+'

export interface GridFragmentAnalysis {
  readonly regionId: number
  readonly paletteIndex: number
  readonly cellIndices: readonly number[]
  readonly size: number
  readonly sizeBand: FragmentSizeBand
  readonly touchesGridEdge: boolean
  readonly edgeCellIndices: readonly number[]
  readonly neighborCounts: ReadonlyMap<number, number>
  readonly neighboringPaletteIndices: readonly number[]
  readonly neighborContactCount: number
  readonly mainNeighborPaletteIndex: number | null
  readonly mainNeighborContactCount: number
  readonly mainNeighborLabDistance: number | null
}

function getSizeBand(size: number): FragmentSizeBand {
  if (size === 1) {
    return '1'
  }

  if (size === 2) {
    return '2'
  }

  if (size === 3) {
    return '3'
  }

  return size <= 6 ? '4-6' : '7+'
}

function getNeighborIndices(grid: Grid, index: number): readonly number[] {
  const row = Math.floor(index / grid.width)
  const column = index % grid.width
  const neighbors: number[] = []

  if (row > 0) {
    neighbors.push(index - grid.width)
  }
  if (row + 1 < grid.height) {
    neighbors.push(index + grid.width)
  }
  if (column > 0) {
    neighbors.push(index - 1)
  }
  if (column + 1 < grid.width) {
    neighbors.push(index + 1)
  }

  return neighbors
}

function isGridEdge(grid: Grid, index: number): boolean {
  const row = Math.floor(index / grid.width)
  const column = index % grid.width
  return row === 0 || row === grid.height - 1 || column === 0 || column === grid.width - 1
}

function getMainNeighbor(
  neighborCounts: ReadonlyMap<number, number>,
): { paletteIndex: number; contactCount: number } | null {
  let mainNeighbor: { paletteIndex: number; contactCount: number } | null = null

  for (const [paletteIndex, contactCount] of neighborCounts) {
    if (paletteIndex === EMPTY) {
      continue
    }

    if (
      mainNeighbor === null ||
      contactCount > mainNeighbor.contactCount ||
      (contactCount === mainNeighbor.contactCount && paletteIndex < mainNeighbor.paletteIndex)
    ) {
      mainNeighbor = { paletteIndex, contactCount }
    }
  }

  return mainNeighbor
}

function assertValidGrid(grid: Grid): void {
  if (
    !Number.isSafeInteger(grid.width) ||
    !Number.isSafeInteger(grid.height) ||
    grid.width <= 0 ||
    grid.height <= 0 ||
    grid.cells.length !== grid.width * grid.height
  ) {
    throw new RangeError('Grid dimensions must match its cell data')
  }

  grid.cells.forEach(assertValidGridCellValue)
}

/** Reads same-color four-neighbor regions without modifying the source Grid. */
export function analyzeGridFragments(
  grid: Grid,
  palette: Palette = MARD_291_PALETTE,
): readonly GridFragmentAnalysis[] {
  assertValidGrid(grid)

  const visited = new Uint8Array(grid.cells.length)
  const fragments: GridFragmentAnalysis[] = []

  for (let startIndex = 0; startIndex < grid.cells.length; startIndex += 1) {
    if (visited[startIndex] !== 0) {
      continue
    }

    const paletteIndex = grid.cells[startIndex]
    const queue = [startIndex]
    const cellIndices: number[] = []
    const edgeCellIndices: number[] = []
    const neighborCounts = new Map<number, number>()
    visited[startIndex] = 1

    let queueIndex = 0
    while (queueIndex < queue.length) {
      const currentIndex = queue[queueIndex]
      queueIndex += 1
      cellIndices.push(currentIndex)

      if (isGridEdge(grid, currentIndex)) {
        edgeCellIndices.push(currentIndex)
      }

      for (const neighborIndex of getNeighborIndices(grid, currentIndex)) {
        const neighborPaletteIndex = grid.cells[neighborIndex]
        if (neighborPaletteIndex === paletteIndex) {
          if (visited[neighborIndex] === 0) {
            visited[neighborIndex] = 1
            queue.push(neighborIndex)
          }
          continue
        }

        neighborCounts.set(
          neighborPaletteIndex,
          (neighborCounts.get(neighborPaletteIndex) ?? 0) + 1,
        )
      }
    }

    const sortedNeighborEntries = [...neighborCounts.entries()].sort(
      ([left], [right]) => left - right,
    )
    const sortedNeighborCounts = new Map(sortedNeighborEntries)
    const mainNeighbor = getMainNeighbor(sortedNeighborCounts)
    const mainNeighborEntry =
      mainNeighbor === null ? undefined : getPaletteEntryByIndex(palette, mainNeighbor.paletteIndex)
    const regionEntry =
      paletteIndex === EMPTY ? undefined : getPaletteEntryByIndex(palette, paletteIndex)

    fragments.push({
      regionId: fragments.length,
      paletteIndex,
      cellIndices,
      size: cellIndices.length,
      sizeBand: getSizeBand(cellIndices.length),
      touchesGridEdge: edgeCellIndices.length > 0,
      edgeCellIndices,
      neighborCounts: sortedNeighborCounts,
      neighboringPaletteIndices: sortedNeighborEntries.map(([index]) => index),
      neighborContactCount: sortedNeighborEntries.reduce((sum, [, count]) => sum + count, 0),
      mainNeighborPaletteIndex: mainNeighbor?.paletteIndex ?? null,
      mainNeighborContactCount: mainNeighbor?.contactCount ?? 0,
      mainNeighborLabDistance:
        regionEntry && mainNeighborEntry ? deltaE76(regionEntry.lab, mainNeighborEntry.lab) : null,
    })
  }

  return fragments
}
