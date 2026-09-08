import { assertValidGridCellValue, toGridIndex } from './grid'
import type { Grid, GridCellValue } from './grid'
import type { Project } from './types'

export interface GridCellChange {
  row: number
  column: number
  value: GridCellValue
}

export interface GridMutationResult {
  grid: Grid
  changed: boolean
}

export interface SetCellOperation extends GridCellChange {
  type: 'setCell'
}

export interface SetCellsOperation {
  type: 'setCells'
  changes: readonly GridCellChange[]
}

export type GridOperation = SetCellOperation | SetCellsOperation

function cloneWithChanges(grid: Grid, changes: readonly GridCellChange[]): GridMutationResult {
  const indexedChanges = new Map<number, GridCellValue>()
  changes.forEach((change) => {
    const index = toGridIndex(grid, change.row, change.column)
    assertValidGridCellValue(change.value)
    indexedChanges.set(index, change.value)
  })

  const hasChanges = [...indexedChanges].some(([index, value]) => grid.cells[index] !== value)
  if (!hasChanges) {
    return { grid, changed: false }
  }

  const cells = grid.cells.slice()
  indexedChanges.forEach((value, index) => {
    cells[index] = value
  })

  return {
    grid: { ...grid, cells },
    changed: true,
  }
}

export function setCell(
  grid: Grid,
  row: number,
  column: number,
  value: GridCellValue,
): GridMutationResult {
  return cloneWithChanges(grid, [{ row, column, value }])
}

export function setCells(grid: Grid, changes: readonly GridCellChange[]): GridMutationResult {
  return cloneWithChanges(grid, changes)
}

export interface ProjectMutationResult {
  project: Project
  changed: boolean
}

export function applyGridOperation(
  project: Project,
  operation: GridOperation,
  now?: Date,
): ProjectMutationResult {
  if (!project.grid) {
    throw new RangeError('Project does not contain a Grid')
  }

  const gridResult =
    operation.type === 'setCells'
      ? setCells(project.grid, operation.changes)
      : setCell(project.grid, operation.row, operation.column, operation.value)

  if (!gridResult.changed) {
    return { project, changed: false }
  }

  return {
    project: {
      ...project,
      grid: gridResult.grid,
      revision: project.revision + 1,
      updatedAt: (now ?? new Date()).toISOString(),
    },
    changed: true,
  }
}
