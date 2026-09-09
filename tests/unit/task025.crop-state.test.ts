import { describe, expect, it } from 'vitest'
import { cropDataToState, cropStateToData } from '../../src/domain/project'

describe('TASK-025 crop state boundaries', () => {
  it('preserves source coordinates and a free aspect ratio', () => {
    expect(
      cropDataToState(
        {
          x: 120.5,
          y: 80.25,
          width: 319.75,
          height: 200.5,
          rotate: 0,
        },
        { width: 640, height: 480 },
      ),
    ).toEqual({
      x: 120.5,
      y: 80.25,
      width: 319.75,
      height: 200.5,
      rotation: 0,
      aspectRatio: 319.75 / 200.5,
    })
  })

  it('accepts a crop that ends exactly at the source image boundary', () => {
    expect(
      cropDataToState(
        { x: 320, y: 240, width: 320, height: 240, rotate: 0 },
        { width: 640, height: 480 },
      ),
    ).toMatchObject({ x: 320, y: 240, width: 320, height: 240 })
  })

  it('rejects crop data outside the source image bounds', () => {
    expect(() =>
      cropDataToState(
        { x: 400, y: 0, width: 320, height: 240, rotate: 0 },
        { width: 640, height: 480 },
      ),
    ).toThrow('crop data must stay within source image bounds')
  })

  it('converts a rotated CropState back to Cropper coordinates', () => {
    expect(
      cropStateToData(
        {
          x: 12.5,
          y: 24.25,
          width: 320.75,
          height: 240.5,
          rotation: 270,
          aspectRatio: 320.75 / 240.5,
        },
        { width: 640, height: 480 },
      ),
    ).toEqual({
      x: 24.25,
      y: 306.75,
      width: 240.5,
      height: 320.75,
      rotate: 270,
    })
  })
})
