import { getPaletteEntryByIndex } from '../palette/accessors'
import { MARD_291_PALETTE } from '../palette/mard291'
import { deltaE76 } from '../palette/match'
import type { Palette } from '../palette/types'
import { EMPTY } from '../project/constants'
import { assertValidGridCellValue, type Grid } from '../project/grid'
import type { GridFragmentAnalysis } from './optimize/fragments'

const MAX_MERGE_REGION_SIZE = 3
const MAX_MERGE_DELTA_E76 = 8

interface MergeCandidate {
  readonly paletteIndex: number
  readonly contactCount: number
  readonly deltaE: number
}

function getMergeTarget(fragment: GridFragmentAnalysis, palette: Palette): number | undefined {
  const source = getPaletteEntryByIndex(palette, fragment.paletteIndex)
  if (!source) {
    throw new RangeError(`Palette entry ${fragment.paletteIndex} is missing`)
  }

  const candidates: MergeCandidate[] = []

  for (const [paletteIndex, contactCount] of fragment.neighborCounts) {
    if (paletteIndex === EMPTY) {
      continue
    }

    const target = getPaletteEntryByIndex(palette, paletteIndex)
    if (!target) {
      throw new RangeError(`Palette entry ${paletteIndex} is missing`)
    }

    const distance = deltaE76(source.lab, target.lab)
    if (distance <= MAX_MERGE_DELTA_E76) {
      candidates.push({ paletteIndex, contactCount, deltaE: distance })
    }
  }

  candidates.sort(
    (left, right) =>
      right.contactCount - left.contactCount ||
      left.deltaE - right.deltaE ||
      left.paletteIndex - right.paletteIndex,
  )

  return candidates[0]?.paletteIndex
}

/** Applies one conservative merge pass using TASK-038 analysis from the source Grid snapshot. */
export function mergeFragmentsConservatively(
  grid: Grid,
  fragments: readonly GridFragmentAnalysis[],
  palette: Palette = MARD_291_PALETTE,
): Grid {
  grid.cells.forEach(assertValidGridCellValue)

  const result: Grid = {
    width: grid.width,
    height: grid.height,
    cells: grid.cells.slice(),
  }

  for (const fragment of fragments) {
    if (
      fragment.paletteIndex === EMPTY ||
      fragment.size < 1 ||
      fragment.size > MAX_MERGE_REGION_SIZE ||
      fragment.touchesGridEdge
    ) {
      continue
    }

    const targetPaletteIndex = getMergeTarget(fragment, palette)
    if (targetPaletteIndex === undefined) {
      continue
    }

    for (const cellIndex of fragment.cellIndices) {
      if (grid.cells[cellIndex] !== fragment.paletteIndex) {
        throw new RangeError('Fragment analysis must match the source Grid')
      }

      result.cells[cellIndex] = targetPaletteIndex
    }
  }

  return result
}
