import { describe, expect, it, vi } from 'vitest'
import { getRelativeLuminance } from '../../src/domain/palette/color'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { EMPTY, createGrid } from '../../src/domain/project'
import { renderBeadGrid } from '../../src/rendering/bead-canvas-renderer'

function createLabelContext() {
  const state = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
  }
  const alphaStack: number[] = []
  const labels: Array<{
    text: string
    x: number
    y: number
    maxWidth: number | undefined
    color: string
    font: string
  }> = []
  const context = {
    canvas: { width: 600, height: 400 } as HTMLCanvasElement,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(() => alphaStack.push(state.globalAlpha)),
    restore: vi.fn(() => {
      state.globalAlpha = alphaStack.pop() ?? 1
    }),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number, maxWidth?: number) => {
      labels.push({ text, x, y, maxWidth, color: state.fillStyle, font: state.font })
    }),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    get fillStyle() {
      return state.fillStyle
    },
    set fillStyle(value: string) {
      state.fillStyle = value
    },
    get globalAlpha() {
      return state.globalAlpha
    },
    set globalAlpha(value: number) {
      state.globalAlpha = value
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
  return { context, labels }
}

function renderLabels(
  grid: ReturnType<typeof createGrid>,
  zoom: number,
  options: { showLabels?: boolean; dpr?: number; panX?: number; panY?: number } = {},
) {
  const { context, labels } = createLabelContext()
  const summary = renderBeadGrid(context, grid, MARD_291_PALETTE, {
    viewport: { zoom, panX: options.panX ?? 0, panY: options.panY ?? 0 },
    size: { width: 600, height: 400 },
    dpr: options.dpr ?? 1,
    showLabels: options.showLabels,
  })
  return { context, labels, summary }
}

describe('TASK-048 palette labels', () => {
  it('keeps labels off by default, uses displayCode, and never labels EMPTY', () => {
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const grid = createGrid(3, 1)
    grid.cells.set([EMPTY, white.paletteIndex, 35])
    const { labels, summary } = renderLabels(grid, 1, { showLabels: true })
    const expectedCodes = [
      MARD_291_PALETTE.entries.find((entry) => entry.paletteIndex === white.paletteIndex)!
        .displayCode,
      MARD_291_PALETTE.entries.find((entry) => entry.paletteIndex === 35)!.displayCode,
    ]

    expect(labels.slice(0, 2).map(({ text }) => text)).toEqual(expectedCodes)
    expect(summary.labels).toBe(2)
    expect(renderLabels(grid, 1).summary.labels).toBe(0)
    expect(grid.cells).toEqual(new Uint16Array([EMPTY, white.paletteIndex, 35]))
  })

  it('uses the exact 18px threshold and automatically restores labels after zooming in', () => {
    const grid = createGrid(1, 1)
    grid.cells[0] = 1

    expect(renderLabels(grid, 0.749, { showLabels: true }).summary.labels).toBe(0)
    expect(renderLabels(grid, 0.75, { showLabels: true }).summary.labels).toBe(1)
    expect(renderLabels(grid, 0.2, { showLabels: false }).summary.labels).toBe(0)
    expect(renderLabels(grid, 2, { showLabels: true }).summary.labels).toBe(1)
  })

  it('uses the shared sRGB luminance conversion and readable text for white and dark beads', () => {
    const below = getRelativeLuminance({ r: 195, g: 195, b: 195 })
    const above = getRelativeLuminance({ r: 196, g: 196, b: 196 })
    expect(below).toBeLessThan(0.55)
    expect(above).toBeGreaterThanOrEqual(0.55)

    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const grid = createGrid(2, 1)
    grid.cells.set([white.paletteIndex, 35])
    const { labels } = renderLabels(grid, 1, { showLabels: true })
    expect(labels[0]?.color).toBe('#1f2933')
    expect(labels[1]?.color).toBe('#ffffff')
  })

  it('keeps text centered within a cell and bounded when display codes are long', () => {
    const grid = createGrid(1, 1)
    grid.cells[0] = 1
    const palette = {
      ...MARD_291_PALETTE,
      entries: MARD_291_PALETTE.entries.map((entry) =>
        entry.paletteIndex === 1 ? { ...entry, displayCode: 'LONG-CODE-123' } : entry,
      ),
    }
    const { context, labels } = createLabelContext()
    const summary = renderBeadGrid(context, grid, palette, {
      viewport: { zoom: 1, panX: 0, panY: 0 },
      size: { width: 600, height: 400 },
      dpr: 2,
      showLabels: true,
    })

    expect(summary.labels).toBe(1)
    expect(labels[0]).toMatchObject({ x: 36, y: 36, maxWidth: 20 })
    expect(Number.parseFloat(labels[0]!.font)).toBeGreaterThanOrEqual(8)
    expect(Number.parseFloat(labels[0]!.font)).toBeLessThanOrEqual(12)
  })

  it('uses the same viewport and effective DPR transform for beads and labels', () => {
    const grid = createGrid(1, 1)
    grid.cells[0] = 1
    const { context, labels } = renderLabels(grid, 1.5, {
      showLabels: true,
      dpr: 1.4,
      panX: 31,
      panY: -9,
    })

    const transform = vi.mocked(context.setTransform).mock.calls.at(-1)!
    expect(transform[0]).toBeCloseTo(2.1)
    expect(transform[3]).toBeCloseTo(2.1)
    expect(transform[4]).toBeCloseTo(43.4)
    expect(transform[5]).toBeCloseTo(-12.6)
    expect(labels[0]?.x).toBe(36)
    expect(labels[0]?.y).toBe(36)
  })
})
