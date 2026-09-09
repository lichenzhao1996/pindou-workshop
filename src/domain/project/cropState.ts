import type { CropRotation, CropState } from './types'

export interface CropDataInput {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotate: number
}

export interface CropImageBounds {
  readonly width: number
  readonly height: number
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

  const aspectRatio = width / height
  if (!Number.isFinite(aspectRatio)) {
    throw new RangeError('crop aspect ratio must be finite')
  }

  return {
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    aspectRatio,
  }
}

function assertWithinImageBounds(data: CropDataInput, bounds: CropImageBounds): void {
  assertPositiveDimension(bounds.width, 'image width')
  assertPositiveDimension(bounds.height, 'image height')

  if (
    data.x < 0 ||
    data.y < 0 ||
    data.x + data.width > bounds.width ||
    data.y + data.height > bounds.height
  ) {
    throw new RangeError('crop data must stay within source image bounds')
  }
}

function toSourceCoordinates(
  data: CropDataInput,
  rotation: CropRotation,
  bounds: CropImageBounds,
): CropDataInput {
  switch (rotation) {
    case 90:
      return {
        x: data.y,
        y: bounds.height - data.x - data.width,
        width: data.height,
        height: data.width,
        rotate: data.rotate,
      }
    case 180:
      return {
        x: bounds.width - data.x - data.width,
        y: bounds.height - data.y - data.height,
        width: data.width,
        height: data.height,
        rotate: data.rotate,
      }
    case 270:
      return {
        x: bounds.width - data.y - data.height,
        y: data.x,
        width: data.height,
        height: data.width,
        rotate: data.rotate,
      }
    default:
      return data
  }
}

function toCropperCoordinates(
  data: CropDataInput,
  rotation: CropRotation,
  bounds: CropImageBounds,
): CropDataInput {
  switch (rotation) {
    case 90:
      return {
        x: bounds.height - data.y - data.height,
        y: data.x,
        width: data.height,
        height: data.width,
        rotate: data.rotate,
      }
    case 180:
      return {
        x: bounds.width - data.x - data.width,
        y: bounds.height - data.y - data.height,
        width: data.width,
        height: data.height,
        rotate: data.rotate,
      }
    case 270:
      return {
        x: data.y,
        y: bounds.width - data.x - data.width,
        width: data.height,
        height: data.width,
        rotate: data.rotate,
      }
    default:
      return data
  }
}

export function cropDataToState(data: CropDataInput, bounds?: CropImageBounds): CropState {
  assertPositiveDimension(data.width, 'crop width')
  assertPositiveDimension(data.height, 'crop height')

  if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) {
    throw new RangeError('crop position must be finite')
  }

  if (data.x < 0 || data.y < 0) {
    throw new RangeError('crop position must be non-negative')
  }

  const rotation = toCropRotation(data.rotate)
  const sourceData = bounds ? toSourceCoordinates(data, rotation, bounds) : data
  if (bounds) {
    assertWithinImageBounds(sourceData, bounds)
  }

  const aspectRatio = sourceData.width / sourceData.height
  if (!Number.isFinite(aspectRatio)) {
    throw new RangeError('crop aspect ratio must be finite')
  }

  return {
    x: sourceData.x,
    y: sourceData.y,
    width: sourceData.width,
    height: sourceData.height,
    rotation,
    aspectRatio,
  }
}

export function cropStateToData(state: CropState, bounds?: CropImageBounds): CropDataInput {
  const sourceData: CropDataInput = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    rotate: state.rotation,
  }
  const normalized = cropDataToState(sourceData)

  if (normalized.rotation !== 0 && !bounds) {
    throw new RangeError('source image bounds are required for rotated crop data')
  }

  if (!bounds) {
    return {
      x: normalized.x,
      y: normalized.y,
      width: normalized.width,
      height: normalized.height,
      rotate: normalized.rotation,
    }
  }

  assertWithinImageBounds(sourceData, bounds)
  return toCropperCoordinates(sourceData, normalized.rotation, bounds)
}
