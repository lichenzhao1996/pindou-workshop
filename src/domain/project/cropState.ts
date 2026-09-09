import type { CropRotation, CropState } from './types'

export interface CropDataInput {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotate: number
}

function assertPositiveDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be greater than zero`)
  }
}

function toCropRotation(degrees: number): CropRotation {
  if (!Number.isFinite(degrees)) {
    throw new RangeError('crop rotation must be finite')
  }

  const normalized = ((degrees % 360) + 360) % 360
  if (normalized !== 0 && normalized !== 90 && normalized !== 180 && normalized !== 270) {
    throw new RangeError('crop rotation must be a multiple of 90 degrees')
  }

  return normalized as CropRotation
}

export function createFullImageCropState(width: number, height: number): CropState {
  assertPositiveDimension(width, 'crop width')
  assertPositiveDimension(height, 'crop height')

  return {
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    aspectRatio: width / height,
  }
}

export function cropDataToState(data: CropDataInput): CropState {
  assertPositiveDimension(data.width, 'crop width')
  assertPositiveDimension(data.height, 'crop height')

  if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) {
    throw new RangeError('crop position must be finite')
  }

  return {
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    rotation: toCropRotation(data.rotate),
    aspectRatio: data.width / data.height,
  }
}
