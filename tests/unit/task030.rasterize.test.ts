import { describe, expect, it, vi } from 'vitest'
import {
  decodeImageBlob,
  rasterizeCrop,
  rasterizeRgbaImage,
  type RgbaImage,
} from '../../src/domain/generation'
import {
  createFullImageCropState,
  createGenerationRequest,
  createProject,
} from '../../src/domain/project'
import type { CropState, Source } from '../../src/domain/project'

function createFixture(values: number[][]): RgbaImage {
  const height = values.length
  const width = values[0]?.length ?? 0
  const data = new Uint8ClampedArray(width * height * 4)

  values.forEach((row, y) => {
    row.forEach((value, x) => {
      const index = (y * width + x) * 4
      data[index] = value
      data[index + 1] = value + 1
      data[index + 2] = value + 2
      data[index + 3] = value === 0 ? 0 : 255
    })
  })

  return { width, height, data }
}

function getRedChannel(image: RgbaImage): number[][] {
  return Array.from({ length: image.height }, (_, y) =>
    Array.from({ length: image.width }, (_, x) => image.data[(y * image.width + x) * 4]),
  )
}

function createCrop(rotation: CropState['rotation']): CropState {
  return {
    x: 0,
    y: 0,
    width: 3,
    height: 2,
    rotation,
    aspectRatio: 3 / 2,
  }
}

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'fixture.png',
  mimeType: 'image/png',
  originalWidth: 3,
  originalHeight: 2,
}

describe('TASK-030 crop rasterization', () => {
  it.each([
    [
      0,
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
    ],
    [
      90,
      [
        [4, 1],
        [5, 2],
        [6, 3],
      ],
    ],
    [
      180,
      [
        [6, 5, 4],
        [3, 2, 1],
      ],
    ],
    [
      270,
      [
        [3, 6],
        [2, 5],
        [1, 4],
      ],
    ],
  ] as const)('crops and rotates a directional fixture at %i degrees', (rotation, expected) => {
    const result = rasterizeRgbaImage(
      createFixture([
        [1, 2, 3],
        [4, 5, 6],
      ]),
      createCrop(rotation),
    )

    expect(getRedChannel(result)).toEqual(expected)
    expect(result.data.length).toBe(result.width * result.height * 4)
  })

  it('uses natural pixel bounds for a fractional crop and preserves RGBA values', () => {
    const result = rasterizeRgbaImage(
      createFixture([
        [1, 2, 3],
        [4, 5, 6],
      ]),
      {
        x: 0.25,
        y: 0.25,
        width: 1.5,
        height: 1.5,
        rotation: 0,
        aspectRatio: 1,
      },
    )

    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(getRedChannel(result)).toEqual([
      [1, 2],
      [4, 5],
    ])
    expect(Array.from(result.data.slice(3, 4))).toEqual([255])
  })

  it('accepts a GenerationRequest and never mutates the decoded source', async () => {
    const project = createProject({ source, crop: createFullImageCropState(3, 2) })
    const decoded = createFixture([
      [1, 2, 3],
      [4, 5, 6],
    ])
    const originalData = Array.from(decoded.data)
    const decode = vi.fn(async () => decoded)

    const result = await rasterizeCrop(
      { ...createGenerationRequest(project), crop: createCrop(90) },
      decode,
    )

    expect(decode).toHaveBeenCalledWith(source.originalImage)
    expect(getRedChannel(result)).toEqual([
      [4, 1],
      [5, 2],
      [6, 3],
    ])
    expect(Array.from(decoded.data)).toEqual(originalData)
  })

  it('reads decoded pixels through Canvas 2D and closes the ImageBitmap', async () => {
    const drawImage = vi.fn()
    const getImageData = vi.fn(() => ({ data: new Uint8ClampedArray([1, 2, 3, 0]) }))
    const canvas = {
      getContext: vi.fn(() => ({ drawImage, getImageData })),
    }
    const close = vi.fn()
    const bitmap = { width: 1, height: 1, close }
    const createImageBitmap = vi.fn(async () => bitmap)

    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(canvas as unknown as HTMLCanvasElement)

    try {
      const result = await decodeImageBlob(new Blob(['image'], { type: 'image/png' }))

      expect(createImageBitmap).toHaveBeenCalledOnce()
      expect(createElement).toHaveBeenCalledWith('canvas')
      expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1, 1)
      expect(result).toEqual({
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([1, 2, 3, 0]),
      })
      expect(close).toHaveBeenCalledOnce()
    } finally {
      createElement.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('rejects malformed RGBA data and out-of-bounds crop regions', () => {
    expect(() =>
      rasterizeRgbaImage({ width: 2, height: 2, data: new Uint8ClampedArray(3) }, createCrop(0)),
    ).toThrow(RangeError)

    expect(() =>
      rasterizeRgbaImage(
        createFixture([
          [1, 2],
          [3, 4],
        ]),
        {
          x: 1,
          y: 1,
          width: 2,
          height: 1,
          rotation: 0,
          aspectRatio: 2,
        },
      ),
    ).toThrow(RangeError)
  })
})
