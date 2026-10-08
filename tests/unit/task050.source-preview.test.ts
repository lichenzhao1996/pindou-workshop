import { describe, expect, it, vi } from 'vitest'
import { SourcePreviewCache, type SourceCropRasterizer } from '../../src/rendering/source-preview'
import type { CropState, Source } from '../../src/domain/project/types'
import type { RgbaImage } from '../../src/domain/generation/rasterize'

function createInput(projectId = 'project-1', sourceBlob = new Blob(['image'])) {
  const source: Source = {
    originalImage: sourceBlob,
    originalFileName: 'source.png',
    mimeType: 'image/png',
    originalWidth: 4,
    originalHeight: 3,
  }
  const crop: CropState = {
    x: 1,
    y: 0,
    width: 2,
    height: 3,
    rotation: 90,
    aspectRatio: 2 / 3,
  }
  return { projectId, source, crop }
}

function createCanvas(image: RgbaImage) {
  return { width: image.width, height: image.height } as HTMLCanvasElement
}

describe('TASK-050 cropped source preview cache', () => {
  it('rasterizes the formal source and crop once and reuses the cached image', async () => {
    const input = createInput()
    const rasterize = vi.fn<SourceCropRasterizer>(async (source, crop) => {
      expect(source).toBe(input.source)
      expect(crop).toEqual(input.crop)
      return { width: 3, height: 2, data: new Uint8ClampedArray(24) }
    })
    const cache = new SourcePreviewCache(rasterize, createCanvas)

    const first = await cache.get(input)
    const second = await cache.get(input)
    expect(first).toBe(second)
    expect(first).toMatchObject({ width: 3, height: 2 })
    expect(rasterize).toHaveBeenCalledTimes(1)
  })

  it('invalidates by Project, source Blob, crop geometry, and rotation and releases prior canvases', async () => {
    const rasterize = vi.fn<SourceCropRasterizer>(async (_source, crop) => ({
      width: crop.rotation === 90 ? 3 : 2,
      height: crop.rotation === 90 ? 2 : 3,
      data: new Uint8ClampedArray(24),
    }))
    const cache = new SourcePreviewCache(rasterize, createCanvas)
    const firstInput = createInput()
    const first = (await cache.get(firstInput))!

    const nextCrop = { ...firstInput.crop, x: 2 }
    const second = (await cache.get({ ...firstInput, crop: nextCrop }))!
    expect(first.width).toBe(0)
    expect(first.height).toBe(0)
    expect(second).not.toBe(first)

    const changedSource = createInput('project-1', new Blob(['changed']))
    const third = (await cache.get(changedSource))!
    expect(second.width).toBe(0)
    expect(third).not.toBe(second)

    const changedProject = createInput('project-2', changedSource.source.originalImage)
    await cache.get(changedProject)
    expect(third.width).toBe(0)
    expect(rasterize).toHaveBeenCalledTimes(4)
  })

  it('drops and releases an asynchronous preview that became stale before decoding completed', async () => {
    let resolveRasterize!: (image: RgbaImage) => void
    const rasterize = vi.fn<SourceCropRasterizer>(
      () =>
        new Promise((resolve) => {
          resolveRasterize = resolve
        }),
    )
    const created: HTMLCanvasElement[] = []
    const cache = new SourcePreviewCache(rasterize, (image) => {
      const canvas = createCanvas(image)
      created.push(canvas)
      return canvas
    })

    const result = cache.get(createInput())
    cache.invalidate()
    resolveRasterize({ width: 2, height: 2, data: new Uint8ClampedArray(16) })

    await expect(result).resolves.toBeNull()
    expect(created[0]).toMatchObject({ width: 0, height: 0 })
  })

  it('returns no preview without formal source/crop and propagates decode failures for safe UI handling', async () => {
    const cache = new SourcePreviewCache(async () => {
      throw new Error('decode failed')
    }, createCanvas)
    await expect(
      cache.get({ projectId: 'project-1', source: null, crop: null }),
    ).resolves.toBeNull()
    await expect(cache.get(createInput())).rejects.toThrow('decode failed')
  })
})
