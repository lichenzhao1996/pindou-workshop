import type { Grid } from './grid'

/** Returns the row-major indices in the four-connected region at the start cell. */
export function getFourConnectedRegion(
  grid: Grid,
  startRow: number,
  startColumn: number,
): number[] {
  if (
    !Number.isInteger(startRow) ||
    !Number.isInteger(startColumn) ||
    startRow < 0 ||
    startColumn < 0 ||
    startRow >= grid.height ||
    startColumn >= grid.width ||
    grid.cells.length !== grid.width * grid.height
  ) {
    return []
  }

  const startIndex = startRow * grid.width + startColumn
  const target = grid.cells[startIndex]
  const visited = new Uint8Array(grid.cells.length)
  const pending = [startIndex]
  const region: number[] = []
  visited[startIndex] = 1

  while (pending.length > 0) {
    const index = pending.pop()!
    region.push(index)
    const row = Math.floor(index / grid.width)
    const column = index % grid.width
    const neighbors = [
      row > 0 ? index - grid.width : -1,
      row + 1 < grid.height ? index + grid.width : -1,
      column > 0 ? index - 1 : -1,
      column + 1 < grid.width ? index + 1 : -1,
    ]

    for (const neighbor of neighbors) {
      if (neighbor < 0 || visited[neighbor] || grid.cells[neighbor] !== target) continue
      visited[neighbor] = 1
      pending.push(neighbor)
    }
  }

  return region.sort((left, right) => left - right)
}
