import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldPreprocessLargeImage } from '../../src/domain/generation/config'
import { rasterizeLargeCropForGeneration } from '../../src/domain/generation/rasterize'
import {
  createFullImageCropState,
  createGenerationRequest,
  createProject,
} from '../../src/domain/project'
import type { ProjectGenerationRequest } from '../../src/domain/generation'
import type { Source } from '../../src/domain/project'

function makeRequest(
  width: number,
  height: number,
  rotation: 0 | 90 | 180 | 270 = 0,
): ProjectGenerationRequest {
  const source: Source = {
    originalImage: new Blob(['large image'], { type: 'image/png' }),
    originalFileName: 'large.png',
    mimeType: 'image/png',
    originalWidth: width,
    originalHeight: height,
  }
  const crop = { ...createFullImageCropState(width, height), rotation }
  const project = createProject({ source, crop, widthBeads: 64 })
  return createGenerationRequest(project)
}

describe('TASK-093 large image preprocessing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('preprocesses sources beyond the documented 4096px normal dimension without adding a product limit', () => {
    expect(shouldPreprocessLargeImage(4096, 2048)).toBe(false)
    expect(shouldPreprocessLargeImage(4096, 4096)).toBe(false)
    expect(shouldPreprocessLargeImage(5000, 2000)).toBe(true)
    expect(shouldPreprocessLargeImage(5000, 5000)).toBe(true)
    expect(shouldPreprocessLargeImage(9000, 10)).toBe(true)
    expect(shouldPreprocessLargeImage(0, 2048)).toBe(false)
  })

  it('decodes only the confirmed crop into bead-sized RGBA and retains source/crop diagnostics', async () => {
    const request = makeRequest(5000, 5000)
    const close = vi.fn()
    const bitmap = { width: 64, height: 64, close } as unknown as ImageBitmap
    const createBitmap = vi.fn(async () => bitmap)
    vi.stubGlobal('createImageBitmap', createBitmap)
    const drawImage = vi.fn()
    const translate = vi.fn()
    const rotate = vi.fn()
    const getImageData = vi.fn(() => ({ data: new Uint8ClampedArray(64 * 64 * 4) }))
    const context = {
      drawImage,
      translate,
      rotate,
      getImageData,
    } as unknown as CanvasRenderingContext2D
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)

    const output = await rasterizeLargeCropForGeneration(request)

    expect(createBitmap).toHaveBeenCalledWith(request.originalImage, 0, 0, 5000, 5000, {
      resizeWidth: 64,
      resizeHeight: 64,
      resizeQuality: 'high',
    })
    expect(output).toMatchObject({
      width: 64,
      height: 64,
      sourceSize: { width: 5000, height: 5000 },
      cropSize: { width: 5000, height: 5000 },
    })
    expect(output.data).toHaveLength(64 * 64 * 4)
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 64, 64)
    expect(close).toHaveBeenCalledOnce()
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it('applies rotation after crop preprocessing and preserves the original crop dimensions', async () => {
    const request = makeRequest(9000, 3000, 90)
    const close = vi.fn()
    const bitmap = { width: 192, height: 64, close } as unknown as ImageBitmap
    const createBitmap = vi.fn(async () => bitmap)
    vi.stubGlobal('createImageBitmap', createBitmap)
    const context = {
      drawImage: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(64 * 192 * 4) })),
    } as unknown as CanvasRenderingContext2D
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)

    const output = await rasterizeLargeCropForGeneration(request)

    expect(createBitmap).toHaveBeenCalledWith(request.originalImage, 0, 0, 9000, 3000, {
      resizeWidth: 192,
      resizeHeight: 64,
      resizeQuality: 'high',
    })
    expect(output).toMatchObject({
      width: 64,
      height: 192,
      cropSize: { width: 3000, height: 9000 },
    })
    expect(context.translate).toHaveBeenCalledWith(64, 0)
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2)
    expect(close).toHaveBeenCalledOnce()
  })

  it('rounds fractional crop bounds outward before preprocessing to preserve rasterizer semantics', async () => {
    const source: Source = {
      originalImage: new Blob(['large image'], { type: 'image/png' }),
      originalFileName: 'large.png',
      mimeType: 'image/png',
      originalWidth: 9000,
      originalHeight: 3000,
    }
    const crop = {
      x: 2.4,
      y: 3.2,
      width: 4000.1,
      height: 2000.3,
      rotation: 90 as const,
      aspectRatio: 2,
    }
    const request = createGenerationRequest(createProject({ source, crop, widthBeads: 64 }))
    const bitmap = {
      width: 128,
      height: 64,
      close: vi.fn(),
    } as unknown as ImageBitmap
    const createBitmap = vi.fn(async () => bitmap)
    vi.stubGlobal('createImageBitmap', createBitmap)
    const context = {
      drawImage: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(64 * 128 * 4) })),
    } as unknown as CanvasRenderingContext2D
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)

    const output = await rasterizeLargeCropForGeneration(request)

    expect(createBitmap).toHaveBeenCalledWith(source.originalImage, 2, 3, 4001, 2001, {
      resizeWidth: 128,
      resizeHeight: 64,
      resizeQuality: 'high',
    })
    expect(output).toMatchObject({
      width: 64,
      height: 128,
      cropSize: { width: 2001, height: 4001 },
    })
  })
})
