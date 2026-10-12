import { describe, expect, it, vi } from 'vitest'
import { deriveEffectPreviewLayout } from '../../src/features/export/png/effect-preview'
import { deriveReferencePngLayout } from '../../src/features/export/png/reference-guide'
import { encodeCanvasPngAndRelease } from '../../src/features/export/png/canvas-blob'

describe('TASK-097 large PNG export safety', () => {
  it('keeps maximum-width PNG canvases within the documented canvas bounds', () => {
    const grid = { width: 256, height: 192 }
    const effect = deriveEffectPreviewLayout(grid)
    const reference = deriveReferencePngLayout(grid, 291)

    for (const layout of [effect, reference]) {
      expect(layout.canvasWidth).toBeLessThanOrEqual(8192)
      expect(layout.canvasHeight).toBeLessThanOrEqual(8192)
      expect(layout.canvasWidth * layout.canvasHeight).toBeLessThanOrEqual(16_000_000)
      expect(layout.scale).toBeLessThan(1)
    }
  })

  it('releases the temporary canvas backing store after a successful PNG encode', async () => {
    const canvas = createCanvas(new Blob(['png'], { type: 'image/png' }))
    canvas.width = 4096
    canvas.height = 2048

    await expect(encodeCanvasPngAndRelease(canvas, 'encode failed')).resolves.toMatchObject({
      type: 'image/png',
    })
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it('releases the backing store when the encoder returns null or throws', async () => {
    const noBlob = createCanvas(null)
    noBlob.width = 32
    noBlob.height = 24
    await expect(encodeCanvasPngAndRelease(noBlob, 'PNG encode failed')).rejects.toThrow(
      'PNG encode failed',
    )
    expect(noBlob.width).toBe(0)
    expect(noBlob.height).toBe(0)

    const failure = createCanvas(null, new DOMException('Canvas allocation failed', 'AbortError'))
    failure.width = 48
    failure.height = 36
    await expect(encodeCanvasPngAndRelease(failure, 'PNG encode failed')).rejects.toThrow(
      'Canvas allocation failed',
    )
    expect(failure.width).toBe(0)
    expect(failure.height).toBe(0)
  })
})

function createCanvas(blob: Blob | null, thrown?: Error): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    toBlob: vi.fn((callback: BlobCallback) => {
      if (thrown) throw thrown
      callback(blob)
    }),
  } as unknown as HTMLCanvasElement
}
