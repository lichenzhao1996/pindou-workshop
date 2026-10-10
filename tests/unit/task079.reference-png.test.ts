import { afterEach, describe, expect, it, vi } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import {
  createReferencePngBlob,
  deriveReferencePngLayout,
  downloadReferencePng,
  renderReferencePngCanvas,
} from '../../src/features/export/png/reference-guide'
import { createExportSnapshot } from '../../src/features/export/snapshot'

const source: Source = {
  originalImage: new Blob(['task079'], { type: 'image/png' }),
  originalFileName: 'reference.png',
  mimeType: 'image/png',
  originalWidth: 32,
  originalHeight: 24,
}

function makeProject(cells: readonly number[], width: number, height: number): Project {
  const project = createProject({
    source: { ...source },
    projectName: '制作参考',
    crop: { x: 0, y: 0, width: 32, height: 24, rotation: 0, aspectRatio: 4 / 3 },
  })
  const grid = createGrid(width, height)
  grid.cells.set(cells)
  return { ...project, grid }
}

function createCanvasHarness() {
  const texts: Array<{ text: string; color: string }> = []
  const fills: Array<{ x: number; y: number; color: string }> = []
  let fillStyle = ''
  const context = {
    scale: vi.fn(),
    fillRect: vi.fn((x: number, y: number) => fills.push({ x, y, color: fillStyle })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    fillText: vi.fn((text: string) => texts.push({ text, color: fillStyle })),
    set fillStyle(value: string) {
      fillStyle = value
    },
    get fillStyle() {
      return fillStyle
    },
    set font(_value: string) {},
    set textAlign(_value: CanvasTextAlign) {},
    set textBaseline(_value: CanvasTextBaseline) {},
    set lineWidth(_value: number) {},
    set strokeStyle(_value: string) {},
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }))),
  }
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    context,
    texts,
    fills,
    factory: () => canvas as unknown as HTMLCanvasElement,
  }
}

describe('TASK-079 reference PNG', () => {
  afterEach(() => vi.restoreAllMocks())

  it('bounds the canvas and keeps the bead grid geometry consistent with the legend layout', () => {
    const layout = deriveReferencePngLayout({ width: 256, height: 320 }, 291)
    expect(layout.canvasWidth).toBeLessThanOrEqual(8192)
    expect(layout.canvasHeight).toBeLessThanOrEqual(8192)
    expect(layout.canvasWidth * layout.canvasHeight).toBeLessThanOrEqual(16_000_000)
    expect(layout.boardWidth).toBeCloseTo(256 * layout.cellSize)
    expect(layout.boardHeight).toBeCloseTo(320 * layout.cellSize)
    expect(layout.legendColumns).toBe(4)
    expect(() => deriveReferencePngLayout({ width: 0, height: 1 }, 0)).toThrow(RangeError)
  })

  it('renders official display codes, 0-based coordinates, colors, EMPTY, and snapshot counts', () => {
    const white = MARD_291_PALETTE.entries.find(
      (entry) => entry.rgb.r === 255 && entry.rgb.g === 255 && entry.rgb.b === 255,
    )
    const dark = MARD_291_PALETTE.entries.find(
      (entry) => entry.rgb.r < 80 && entry.rgb.g < 80 && entry.rgb.b < 80,
    )
    if (!white || !dark) throw new Error('Expected official MARD white and dark colors')
    const snapshot = createExportSnapshot(
      makeProject([0, white.paletteIndex, dark.paletteIndex, white.paletteIndex], 2, 2),
    )
    const harness = createCanvasHarness()

    const canvas = renderReferencePngCanvas(snapshot, harness.factory)

    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
    expect(harness.texts.map(({ text }) => text)).toContain('0')
    expect(harness.texts.map(({ text }) => text)).toContain('1')
    expect(harness.texts.map(({ text }) => text)).toContain(white.displayCode)
    expect(harness.texts.map(({ text }) => text)).toContain(dark.displayCode)
    expect(harness.texts.map(({ text }) => text)).toContain(
      `${white.displayCode} ${white.name}  2 颗`,
    )
    expect(harness.texts.map(({ text }) => text)).toContain(
      `${dark.displayCode} ${dark.name}  1 颗`,
    )
    expect(harness.texts.map(({ text }) => text)).toContain('使用色号清单（2 色）')
    expect(harness.texts.map(({ text }) => text)).toContain('2 × 2 颗 · 2.6mm 拼豆 · 2 色 · 3 颗')
    expect(harness.fills.some(({ color }) => color === '#f2efe9')).toBe(true)
    expect(harness.fills.some(({ color }) => color.toLowerCase() === white.hex.toLowerCase())).toBe(
      true,
    )
    expect(snapshot.stats.totalBeads).toBe(3)
    expect(snapshot.stats.usedColorCount).toBe(2)
  })

  it('returns a PNG Blob and downloads it using the shared export filename base', async () => {
    const snapshot = createExportSnapshot(makeProject([1, 35], 2, 1))
    const harness = createCanvasHarness()
    const blob = await createReferencePngBlob(snapshot, harness.factory)
    expect(blob.type).toBe('image/png')

    const downloadBlob = await import('../../src/features/export/download')
    const spy = vi.spyOn(downloadBlob, 'downloadBlob').mockImplementation(() => {})
    await downloadReferencePng(snapshot, harness.factory)
    expect(spy).toHaveBeenCalledWith(expect.any(Blob), '制作参考_2x1.png')
  })

  it('fails visibly when the 2D context or PNG encoder is unavailable', async () => {
    const snapshot = createExportSnapshot(makeProject([1], 1, 1))
    const noContext = {
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement
    expect(() => renderReferencePngCanvas(snapshot, () => noContext)).toThrow(/Canvas 2D context/)

    const noBlob = {
      ...createCanvasHarness().canvas,
      toBlob: (callback: BlobCallback) => callback(null),
    } as unknown as HTMLCanvasElement
    await expect(createReferencePngBlob(snapshot, () => noBlob)).rejects.toThrow(/encode/)
  })

  it('rejects invalid palette indices instead of painting an invented bead color', () => {
    const project = makeProject([65535], 1, 1)
    expect(() => createExportSnapshot(project)).toThrow(/Grid cell value/)
  })
})
