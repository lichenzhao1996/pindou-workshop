import { describe, expect, it } from 'vitest'
import { cropDataToState, cropStateToData } from '../../src/domain/project'

const sourceBounds = { width: 640, height: 480 }

describe('TASK-026 crop rotation conversion', () => {
  it('maps a clockwise Cropper rotation into original image coordinates', () => {
    expect(
      cropDataToState({ x: 40, y: 30, width: 200, height: 100, rotate: 90 }, sourceBounds),
    ).toEqual({
      x: 30,
      y: 240,
      width: 100,
      height: 200,
      rotation: 90,
      aspectRatio: 0.5,
    })
  })

  it('maps a counter-clockwise Cropper rotation and normalizes its angle', () => {
    expect(
      cropDataToState({ x: 50, y: 20, width: 100, height: 200, rotate: -90 }, sourceBounds),
    ).toEqual({
      x: 420,
      y: 50,
      width: 200,
      height: 100,
      rotation: 270,
      aspectRatio: 2,
    })
  })

  it('round-trips rotated CropState through Cropper data without drift', () => {
    const cropState = {
      x: 120.5,
      y: 80.25,
      width: 200.75,
      height: 100.5,
      rotation: 90 as const,
      aspectRatio: 200.75 / 100.5,
    }

    expect(cropDataToState(cropStateToData(cropState, sourceBounds), sourceBounds)).toEqual(
      cropState,
    )
  })

  it('requires source bounds to restore a rotated CropState', () => {
    expect(() =>
      cropStateToData({
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        rotation: 180,
        aspectRatio: 100 / 80,
      }),
    ).toThrow('source image bounds are required for rotated crop data')
  })
})
