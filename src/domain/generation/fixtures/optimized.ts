import { EMPTY } from '../../project/constants'
import { createGrid, type Grid } from '../../project/grid'

/** Fixed MARD A1/A2 fixture: a close-color interior detail survives only in high-fidelity. */
export function createOptimizationDetailFixture(): Grid {
  const grid = createGrid(8, 8)
  grid.cells.fill(1)
  grid.cells[27] = 2
  return grid
}

/** A close-color detail touching transparency must be protected before fragment merge. */
export function createOptimizationContourFixture(): Grid {
  const grid = createOptimizationDetailFixture()
  grid.cells[28] = EMPTY
  grid.cells[0] = EMPTY
  return grid
}
