import { describe, expect, it, vi } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { BEAD_SIZE_MM } from '../../src/domain/generation/config'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import { createExportSnapshot } from '../../src/features/export/snapshot'
import {
  createEffectPreviewPngBlob,
  deriveEffectPreviewLayout,
  renderEffectPreviewCanvas,
} from '../../src/features/export/png/effect-preview'

const source: Source = {
  originalImage: new Blob(['task078-unit'], { type: 'image/png' }),
  originalFileName: 'preview.png',
  mimeType: 'image/png',
  originalWidth: 30,
  originalHeight: 10,
}

function projectWithGrid(values: readonly number[]): Project {
  const project = createProject({
    source: { ...source },
    projectName: 'Preview',
    crop: { x: 0, y: 0, width: 30, height: 10, rotation: 0, aspectRatio: 3 },
  })
  const grid = createGrid(values.length, 1)
  grid.cells.set(values)
  return { ...project, grid }
}

function createCanvasHarness(blob: Blob | null = new Blob(['png-bytes'], { type: 'image/png' })) {
  const texts: string[] = []
  const fills: string[] = []
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    fillRect: vi.fn(),
    fillText: vi.fn((text: string) => texts.push(text)),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(function (this: { fillStyle: string }) {
      fills.push(this.fillStyle)
    }),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback, type?: string) => {
      expect(type).toBe('image/png')
      callback(blob)
    }),
  } as unknown as HTMLCanvasElement
  return { canvas, context, fills, texts }
}

describe('TASK-078 effect preview PNG', () => {
  it('derives a bounded canvas layout while preserving the Grid aspect ratio', () => {
    expect(deriveEffectPreviewLayout({ width: 4, height: 3 })).toMatchObject({
      canvasWidth: 192,
      canvasHeight: 236,
      scale: 1,
    })

    const large = deriveEffectPreviewLayout({ width: 1000, height: 1000 })
    expect(large.canvasWidth).toBeLessThanOrEqual(8192)
    expect(large.canvasHeight).toBeLessThanOrEqual(8192)
    expect(large.canvasWidth * large.canvasHeight).toBeLessThanOrEqual(16_000_000)
    expect(large.scale).toBeLessThan(1)
  })

  it('renders effect beads and required size/spec metadata from only the snapshot Grid and MARD', () => {
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const snapshot = createExportSnapshot(projectWithGrid([0, 1, white.paletteIndex]))
    const harness = createCanvasHarness()
    const canvas = renderEffectPreviewCanvas(snapshot, () => harness.canvas)

    expect(canvas.width).toBe(160)
    expect(canvas.height).toBe(172)
    expect(harness.context.arc).toHaveBeenCalledTimes(2)
    expect(harness.fills).toContain(MARD_291_PALETTE.entries[0]!.hex)
    expect(harness.fills).toContain(white.hex)
    expect(harness.texts).toContain('Preview')
    expect(harness.texts).toContain(`3 × 1 颗 · ${BEAD_SIZE_MM}mm 拼豆`)
  })

  it('encodes the rendered canvas as a PNG Blob and rejects missing context or failed encoding', async () => {
    const snapshot = createExportSnapshot(projectWithGrid([1]))
    const blob = new Blob(['valid png payload'], { type: 'image/png' })
    const harness = createCanvasHarness(blob)
    await expect(createEffectPreviewPngBlob(snapshot, () => harness.canvas)).resolves.toBe(blob)

    const noContext = {
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement
    expect(() => renderEffectPreviewCanvas(snapshot, () => noContext)).toThrow(
      'Canvas 2D context is unavailable',
    )

    const failedEncoding = createCanvasHarness(null)
    await expect(createEffectPreviewPngBlob(snapshot, () => failedEncoding.canvas)).rejects.toThrow(
      'could not encode',
    )
  })

  it('rejects a palette version the renderer cannot faithfully draw', () => {
    const project = projectWithGrid([1])
    project.generation = { ...project.generation, paletteVersion: 'unsupported-version' }
    const snapshot = createExportSnapshot(project)
    expect(() => renderEffectPreviewCanvas(snapshot, () => createCanvasHarness().canvas)).toThrow(
      'unsupported MARD Palette version',
    )
  })
})
