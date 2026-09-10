import type { RgbaImage } from './rasterize'

export interface RgbaPixel {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly alpha: number
}

export interface EmptyPixel {
  readonly kind: 'empty'
}

export interface RgbPixel {
  readonly kind: 'rgb'
  readonly r: number
  readonly g: number
  readonly b: number
}

export type PreparedPixel = EmptyPixel | RgbPixel

export interface PreparedRgbaImage {
  readonly width: number
  readonly height: number
  readonly pixels: readonly PreparedPixel[]
}

function assertByte(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${name} must be an integer from 0 to 255`)
  }
}

function assertRgbaPixel(pixel: RgbaPixel): void {
  assertByte(pixel.r, 'red')
  assertByte(pixel.g, 'green')
  assertByte(pixel.b, 'blue')
  assertByte(pixel.alpha, 'alpha')
}

function compositeChannel(channel: number, alpha: number): number {
  const opacity = alpha / 255
  return Math.round(channel * opacity + 255 * (1 - opacity))
}

/** Classifies one RGBA pixel and composites every non-transparent pixel over white. */
export function compositeAlphaOverWhite(pixel: RgbaPixel): PreparedPixel {
  assertRgbaPixel(pixel)

  if (pixel.alpha === 0) {
    return { kind: 'empty' }
  }

  return {
    kind: 'rgb',
    r: compositeChannel(pixel.r, pixel.alpha),
    g: compositeChannel(pixel.g, pixel.alpha),
    b: compositeChannel(pixel.b, pixel.alpha),
  }
}

function assertRgbaImage(image: RgbaImage): void {
  if (
    !Number.isSafeInteger(image.width) ||
    image.width <= 0 ||
    !Number.isSafeInteger(image.height) ||
    image.height <= 0
  ) {
    throw new RangeError('RGBA image dimensions must be positive safe integers')
  }

  if (image.data.length !== image.width * image.height * 4) {
    throw new RangeError('RGBA data length must equal width × height × 4')
  }
}

/** Normalizes an RgbaImage without changing its dimensions or input buffer. */
export function normalizeRgbaImage(image: RgbaImage): PreparedRgbaImage {
  assertRgbaImage(image)

  const pixels: PreparedPixel[] = new Array(image.width * image.height)
  for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4
    pixels[pixelIndex] = compositeAlphaOverWhite({
      r: image.data[dataIndex],
      g: image.data[dataIndex + 1],
      b: image.data[dataIndex + 2],
      alpha: image.data[dataIndex + 3],
    })
  }

  return {
    width: image.width,
    height: image.height,
    pixels,
  }
}
