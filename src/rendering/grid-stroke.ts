import type { GridPosition } from '../domain/project/grid'

/** Inclusive integer-grid line with deterministic Bresenham sampling. */
export function getGridStrokeSegment(start: GridPosition, end: GridPosition): GridPosition[] {
  let x = start.column
  let y = start.row
  const targetX = end.column
  const targetY = end.row
  const deltaX = Math.abs(targetX - x)
  const stepX = x < targetX ? 1 : -1
  const deltaY = -Math.abs(targetY - y)
  const stepY = y < targetY ? 1 : -1
  let error = deltaX + deltaY
  const cells: GridPosition[] = []

  while (true) {
    cells.push({ row: y, column: x })
    if (x === targetX && y === targetY) return cells

    const doubledError = 2 * error
    if (doubledError >= deltaY) {
      error += deltaY
      x += stepX
    }
    if (doubledError <= deltaX) {
      error += deltaX
      y += stepY
    }
  }
}
