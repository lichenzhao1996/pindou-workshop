import { describe, expect, it } from 'vitest'
import { createGrid } from '../../src/domain/project/grid'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { renderBeadGrid } from '../../src/rendering/bead-canvas-renderer'
import { hitTestGridCell } from '../../src/rendering/hit-test'
import {
  centerViewport,
  fitViewport,
  getCanvasBackingSize,
  GRID_AXIS_MARGIN,
  CELL_SIZE,
  MAX_CANVAS_PIXELS,
  worldToScreen,
} from '../../src/rendering/viewport'

const rect = { left: 100, top: 40, width: 900, height: 700 }
const grid = createGrid(4, 3)

function clientAt(
  row: number,
  column: number,
  viewport: { zoom: number; panX: number; panY: number },
) {
  const point = worldToScreen(
    {
      x: GRID_AXIS_MARGIN + (column + 0.5) * CELL_SIZE,
      y: GRID_AXIS_MARGIN + (row + 0.5) * CELL_SIZE,
    },
    viewport,
  )
  return { x: rect.left + point.x, y: rect.top + point.y }
}

describe('TASK-049 Canvas hit testing', () => {
  it('maps CSS pointer coordinates through zoom=1, zoomed, and panned viewports', () => {
    const viewports = [
      { zoom: 1, panX: 0, panY: 0 },
      { zoom: 2.25, panX: -33, panY: 51 },
      { zoom: 0.42, panX: 192, panY: 118 },
    ]

    for (const viewport of viewports) {
      expect(hitTestGridCell(clientAt(1, 2, viewport), rect, viewport, grid)).toEqual({
        row: 1,
        column: 2,
        index: 6,
      })
    }
  })

  it('hits the top-left and bottom-right cells and uses half-open Grid bounds', () => {
    const viewport = { zoom: 1, panX: 0, panY: 0 }
    const point = (worldX: number, worldY: number) => {
      const screen = worldToScreen({ x: worldX, y: worldY }, viewport)
      return { x: rect.left + screen.x, y: rect.top + screen.y }
    }

    expect(
      hitTestGridCell(point(GRID_AXIS_MARGIN, GRID_AXIS_MARGIN), rect, viewport, grid),
    ).toEqual({ row: 0, column: 0, index: 0 })
    expect(
      hitTestGridCell(
        point(
          GRID_AXIS_MARGIN + grid.width * CELL_SIZE - 0.001,
          GRID_AXIS_MARGIN + grid.height * CELL_SIZE - 0.001,
        ),
        rect,
        viewport,
        grid,
      ),
    ).toEqual({ row: 2, column: 3, index: 11 })
    expect(
      hitTestGridCell(
        point(GRID_AXIS_MARGIN + grid.width * CELL_SIZE, GRID_AXIS_MARGIN + CELL_SIZE),
        rect,
        viewport,
        grid,
      ),
    ).toBeNull()
    expect(
      hitTestGridCell(
        point(GRID_AXIS_MARGIN + CELL_SIZE, GRID_AXIS_MARGIN + grid.height * CELL_SIZE),
        rect,
        viewport,
        grid,
      ),
    ).toBeNull()
  })

  it('does not clamp negative world points or client points outside the Canvas', () => {
    const viewport = { zoom: 1, panX: 0, panY: 0 }
    expect(hitTestGridCell({ x: rect.left + 1, y: rect.top + 1 }, rect, viewport, grid)).toBeNull()
    expect(hitTestGridCell({ x: rect.left - 1, y: rect.top + 40 }, rect, viewport, grid)).toBeNull()
    expect(
      hitTestGridCell({ x: rect.left + rect.width, y: rect.top + 40 }, rect, viewport, grid),
    ).toBeNull()
  })

  it('remains aligned after fit, center, and backing-store DPR limits', () => {
    const size = { width: rect.width, height: rect.height }
    const fit = fitViewport(grid, size)
    const center = centerViewport(grid, size, 1.6)
    const limitedBacking = getCanvasBackingSize({ width: 12_000, height: 2_000 }, 4)
    const limitedViewport = { zoom: 1.7, panX: -21, panY: 34 }

    expect(hitTestGridCell(clientAt(2, 3, fit), rect, fit, grid)?.index).toBe(11)
    expect(hitTestGridCell(clientAt(0, 1, center), rect, center, grid)?.index).toBe(1)
    expect(limitedBacking.dpr).toBeLessThan(4)
    expect(limitedBacking.width).toBeLessThanOrEqual(8192)
    expect(limitedBacking.width * limitedBacking.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS)
    expect(hitTestGridCell(clientAt(1, 1, limitedViewport), rect, limitedViewport, grid)).toEqual({
      row: 1,
      column: 1,
      index: 5,
    })
  })

  it('draws preview, selected, and hovered overlays without changing the single Grid', () => {
    const emptyGrid = createGrid(2, 2)
    const originalCells = emptyGrid.cells.slice()
    const context = {
      canvas: { width: 240, height: 180 } as HTMLCanvasElement,
      setTransform() {},
      clearRect() {},
      fillRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fillText() {},
    } as unknown as CanvasRenderingContext2D
    const summary = renderBeadGrid(context, emptyGrid, MARD_291_PALETTE, {
      viewport: { zoom: 1, panX: 0, panY: 0 },
      size: { width: 240, height: 180 },
      dpr: 1,
      interactions: {
        previewCell: { row: 0, column: 0 },
        selectedCell: { row: 1, column: 1 },
        hoveredCell: { row: 0, column: 1 },
      },
    })

    expect(summary).toMatchObject({ previews: 1, selections: 1, hovers: 1, beads: 0 })
    expect(emptyGrid.cells).toEqual(originalCells)
  })
})
