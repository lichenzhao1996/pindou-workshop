import { describe, expect, it } from 'vitest'
import { cropDataToState, createFullImageCropState } from '../../src/domain/project'

describe('TASK-024 crop state', () => {
  it('creates a full-image crop state from source dimensions', () => {
    expect(createFullImageCropState(640, 480)).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      rotation: 0,
      aspectRatio: 4 / 3,
    })
  })

  it('converts cropper data into source-coordinate CropState', () => {
    expect(
      cropDataToState({
        x: 12,
        y: 24,
        width: 320,
        height: 240,
        rotate: -90,
      }),
    ).toEqual({
      x: 12,
      y: 24,
      width: 320,
      height: 240,
      rotation: 270,
      aspectRatio: 4 / 3,
    })
  })

  it('rejects invalid crop dimensions and unsupported rotations', () => {
    expect(() => createFullImageCropState(0, 480)).toThrow(RangeError)
    expect(() => cropDataToState({ x: 0, y: 0, width: 320, height: 240, rotate: 45 })).toThrow(
      RangeError,
    )
  })
})
