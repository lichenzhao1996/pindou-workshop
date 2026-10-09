import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from './constants'
import type { Grid } from './grid'
import type { SetCellsOperation } from './operations'

export interface PaletteReplacementPlan {
  readonly sourcePaletteIndex: number
  readonly targetPaletteIndex: number
  readonly count: number
  readonly operation: SetCellsOperation | null
}

/** Builds one deterministic batch edit without modifying the source Grid. */
export function createPaletteReplacementPlan(
  grid: Grid,
  sourcePaletteIndex: number,
  targetPaletteIndex: number,
): PaletteReplacementPlan | null {
  const isPaletteIndex = (value: number) =>
    Number.isInteger(value) && value >= MIN_PALETTE_INDEX && value <= MAX_PALETTE_INDEX
  if (!isPaletteIndex(sourcePaletteIndex) || !isPaletteIndex(targetPaletteIndex)) return null
  if (sourcePaletteIndex === targetPaletteIndex) {
    return { sourcePaletteIndex, targetPaletteIndex, count: 0, operation: null }
  }

  const changes: Array<{ row: number; column: number; value: number }> = []
  for (let index = 0; index < grid.cells.length; index += 1) {
    if (grid.cells[index] === sourcePaletteIndex) {
      changes.push({
        row: Math.floor(index / grid.width),
        column: index % grid.width,
        value: targetPaletteIndex,
      })
    }
  }

  return {
    sourcePaletteIndex,
    targetPaletteIndex,
    count: changes.length,
    operation: changes.length > 0 ? { type: 'setCells', changes } : null,
  }
}
