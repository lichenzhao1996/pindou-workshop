import { describe, expect, it, vi } from 'vitest'
import { inspectImageDimensions, inspectImageInput } from '../../src/features/upload'

describe('TASK-023 image dimensions', () => {
  it('returns a valid inspection without warnings for an ordinary image', () => {
    expect(inspectImageDimensions({ width: 300, height: 300 })).toEqual({
      status: 'valid',
      dimensions: { width: 300, height: 300 },
      warnings: [],
    })
  })

  it('warns for low resolution below 128 pixels and allows continuing', () => {
    const lowResolution = inspectImageDimensions({ width: 127, height: 300 })
    const boundary = inspectImageDimensions({ width: 128, height: 300 })

    expect(lowResolution.status).toBe('valid')
    expect(lowResolution.warnings.map((warning) => warning.code)).toEqual(['low-resolution'])
    expect(boundary.warnings).toEqual([])
  })

  it('warns for images above the pixel threshold or dimension threshold', () => {
    const tooManyPixels = inspectImageDimensions({ width: 5000, height: 5000 })
    const tooLargeDimension = inspectImageDimensions({ width: 8193, height: 3000 })

    expect(tooManyPixels.warnings.map((warning) => warning.code)).toEqual(['large-image'])
    expect(tooLargeDimension.warnings.map((warning) => warning.code)).toEqual(['large-image'])
  })

  it('warns for an aspect ratio above 4 but not at exactly 4', () => {
    const extreme = inspectImageDimensions({ width: 1000, height: 249 })
    const boundary = inspectImageDimensions({ width: 1000, height: 250 })

    expect(extreme.warnings.map((warning) => warning.code)).toEqual(['extreme-aspect-ratio'])
    expect(boundary.warnings).toEqual([])
  })

  it('returns every applicable warning together', () => {
    const inspection = inspectImageDimensions({ width: 100, height: 10000 })

    expect(inspection.status).toBe('valid')
    expect(inspection.warnings.map((warning) => warning.code)).toEqual([
      'low-resolution',
      'large-image',
      'extreme-aspect-ratio',
    ])
  })

  it.each([
    [0, 100],
    [-1, 100],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
    [100, 0],
  ])('rejects invalid dimensions %s x %s', (width, height) => {
    expect(inspectImageDimensions({ width, height })).toMatchObject({
      status: 'invalid',
      reason: 'invalid-dimensions',
    })
  })
})

describe('TASK-023 image input inspection', () => {
  it('rejects unsupported formats without trying to decode them', async () => {
    const decode = vi.fn()
    const result = await inspectImageInput(
      new Blob(['text'], { type: 'text/plain' }),
      undefined,
      decode,
    )

    expect(result).toEqual({
      status: 'invalid',
      reason: 'unsupported-format',
      message: '文件格式不支持，请选择 JPG、PNG 或 WEBP 图片。',
    })
    expect(decode).not.toHaveBeenCalled()
  })

  it('returns a readable decode error when the image cannot be decoded', async () => {
    const result = await inspectImageInput(
      new Blob(['broken'], { type: 'image/png' }),
      undefined,
      async () => {
        throw new Error('decode failed')
      },
    )

    expect(result).toEqual({
      status: 'invalid',
      reason: 'decode-failed',
      message: '图片无法读取，请选择有效的 JPG、PNG 或 WEBP 图片。',
    })
  })

  it('rejects invalid dimensions reported by the decoder', async () => {
    const result = await inspectImageInput(
      new Blob(['image'], { type: 'image/png' }),
      undefined,
      async () => ({ width: 0, height: 100 }),
    )

    expect(result).toMatchObject({
      status: 'invalid',
      reason: 'invalid-dimensions',
    })
  })

  it('keeps valid input and warnings in one inspection result', async () => {
    const file = new File(['image'], 'small.png', { type: 'image/png' })
    const result = await inspectImageInput(file, undefined, async () => ({
      width: 100,
      height: 100,
    }))

    expect(result).toMatchObject({
      status: 'valid',
      input: {
        originalImage: file,
        originalFileName: 'small.png',
        mimeType: 'image/png',
      },
      dimensions: { width: 100, height: 100 },
      warnings: [
        {
          code: 'low-resolution',
          message: '图片分辨率较低，生成后细节可能不足，但仍可继续。',
        },
      ],
    })
  })
})
