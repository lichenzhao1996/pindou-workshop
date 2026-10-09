import { describe, expect, it, vi } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { createGrid } from '../../src/domain/project/grid'
import { renderBeadGrid } from '../../src/rendering/bead-canvas-renderer'

function createContext() {
  const canvas = { width: 600, height: 600 } as HTMLCanvasElement
  const labels: Array<{ text: string; x: number; y: number }> = []
  const alphaStack: number[] = []
  let globalAlpha = 1
  const context = {
    canvas,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(() => alphaStack.push(globalAlpha)),
    restore: vi.fn(() => {
      globalAlpha = alphaStack.pop() ?? 1
    }),
    get globalAlpha() {
      return globalAlpha
    },
    set globalAlpha(value: number) {
      globalAlpha = value
    },
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => labels.push({ text, x, y })),
  } as unknown as CanvasRenderingContext2D

  return { context, labels }
}

describe('TASK-047 Grid overlays', () => {
  it('draws 10-cell major lines and 0-based row and column coordinates on the same world transform', () => {
    const grid = createGrid(20, 20)
    const { context, labels } = createContext()

    const summary = renderBeadGrid(context, grid, MARD_291_PALETTE, {
      viewport: { zoom: 1, panX: 0, panY: 0 },
      size: { width: 600, height: 600 },
      dpr: 1,
    })

    expect(summary.beads).toBe(0)
    expect(summary.normalLines).toBeGreaterThan(0)
    expect(summary.majorLines).toBe(6)
    expect(summary.coordinates).toBe(labels.length)
    expect(labels.some(({ text }) => text === '0')).toBe(true)
    expect(labels.some(({ text }) => text === '10')).toBe(true)
    expect(context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0)
    expect(context.moveTo).toHaveBeenCalledWith(264, 24)
  })

  it('weakens fine grid at low zoom while retaining major guides and sparse coordinates', () => {
    const grid = createGrid(20, 20)
    const { context } = createContext()
    const summary = renderBeadGrid(context, grid, MARD_291_PALETTE, {
      viewport: { zoom: 0.2, panX: 0, panY: 0 },
      size: { width: 600, height: 600 },
      dpr: 1,
    })

    expect(summary.normalLines).toBe(0)
    expect(summary.majorLines).toBe(6)
    expect(summary.coordinates).toBeGreaterThan(0)
    expect(summary.coordinates).toBeLessThan(40)
  })
})
