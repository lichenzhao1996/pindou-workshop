import { describe, expect, it, vi } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { EMPTY, createGrid } from '../../src/domain/project'
import { renderBeadGrid } from '../../src/rendering/bead-canvas-renderer'

function makeContext(width = 1000, height = 1000) {
  const state = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  }
  const fills: Array<{ x: number; y: number; width: number; height: number; color: string }> = []
  const labels: string[] = []
  const canvas = { width, height } as HTMLCanvasElement
  const context = {
    canvas,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn((x: number, y: number, rectWidth: number, rectHeight: number) => {
      fills.push({ x, y, width: rectWidth, height: rectHeight, color: state.fillStyle })
    }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn((text: string) => labels.push(text)),
    get fillStyle() {
      return state.fillStyle
    },
    set fillStyle(value: string) {
      state.fillStyle = value
    },
    get strokeStyle() {
      return state.strokeStyle
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value
    },
    get lineWidth() {
      return state.lineWidth
    },
    set lineWidth(value: number) {
      state.lineWidth = value
    },
    get font() {
      return state.font
    },
    set font(value: string) {
      state.font = value
    },
    get textAlign() {
      return state.textAlign
    },
    set textAlign(value: string) {
      state.textAlign = value
    },
    get textBaseline() {
      return state.textBaseline
    },
    set textBaseline(value: string) {
      state.textBaseline = value
    },
  } as unknown as CanvasRenderingContext2D

  return { context, fills, labels }
}

describe('TASK-044 Canvas Grid renderer', () => {
  it('draws only non-EMPTY MARD colors, including white as a real bead', () => {
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )
    expect(white).toBeDefined()
    const grid = createGrid(3, 1)
    grid.cells.set([EMPTY, white!.paletteIndex, 1])
    const { context, fills } = makeContext()

    const summary = renderBeadGrid(context, grid, MARD_291_PALETTE, {
      viewport: { zoom: 1, panX: 0, panY: 0 },
      size: { width: 1000, height: 1000 },
      dpr: 1,
    })

    expect(summary.beads).toBe(2)
    expect(fills).toContainEqual({ x: 48, y: 24, width: 24, height: 24, color: 'rgb(255 255 255)' })
    expect(fills).toContainEqual({ x: 72, y: 24, width: 24, height: 24, color: 'rgb(250 244 200)' })
    expect(fills[0]?.color).toBe('#e8edf2')
    expect(fills.some(({ color }) => color === 'rgb(0 0 0)')).toBe(false)
    expect(context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0)
  })

  it('applies CSS viewport and DPR transforms while remaining read-only', () => {
    const grid = createGrid(2, 2)
    grid.cells.set([1, 2, 3, 4])
    const originalCells = grid.cells.slice()
    const { context } = makeContext(600, 400)

    const summary = renderBeadGrid(context, grid, MARD_291_PALETTE, {
      viewport: { zoom: 1.5, panX: 20, panY: -8 },
      size: { width: 300, height: 200 },
      dpr: 2,
    })

    expect(context.setTransform).toHaveBeenLastCalledWith(3, 0, 0, 3, 40, -16)
    expect(summary.beads).toBe(4)
    expect(grid.cells).toEqual(originalCells)
  })

  it('clears the canvas when there is no Grid and skips invalid palette indices', () => {
    const { context } = makeContext()
    expect(
      renderBeadGrid(context, null, MARD_291_PALETTE, {
        viewport: { zoom: 1, panX: 0, panY: 0 },
        size: { width: 100, height: 100 },
        dpr: 1,
      }),
    ).toMatchObject({ beads: 0, invalidCells: 0 })
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1000, 1000)

    const invalidGrid = createGrid(1, 1)
    invalidGrid.cells[0] = 292
    expect(
      renderBeadGrid(context, invalidGrid, MARD_291_PALETTE, {
        viewport: { zoom: 1, panX: 0, panY: 0 },
        size: { width: 100, height: 100 },
        dpr: 1,
      }).invalidCells,
    ).toBe(1)
  })
})
