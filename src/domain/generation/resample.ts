import { deriveGenerationDimensions } from './dimensions'
import type { GenerationRequest } from './request'
import type { RgbaImage } from './rasterize'

/** The small part of a Canvas 2D context needed by the resampling contract. */
export interface ResampleImageData {
  readonly data: Uint8ClampedArray
}

export interface ResampleCanvasContext {
  imageSmoothingEnabled: boolean
  imageSmoothingQuality?: string
  createImageData(width: number, height: number): ResampleImageData
  putImageData(imageData: ResampleImageData, dx: number, dy: number): void
  drawImage(
    image: ResampleCanvas,
    sx: number,
    sy: number,
    sourceWidth: number,
    sourceHeight: number,
    dx: number,
    dy: number,
    destinationWidth: number,
    destinationHeight: number,
  ): void
  getImageData(sx: number, sy: number, width: number, height: number): ResampleImageData
}

export interface ResampleCanvas {
  width: number
  height: number
  getContext(contextId: '2d'): ResampleCanvasContext | null
}

export type ResampleCanvasFactory = (width: number, height: number) => ResampleCanvas

function assertImage(image: RgbaImage, name: string): void {
  if (
    !Number.isSafeInteger(image.width) ||
    image.width <= 0 ||
    !Number.isSafeInteger(image.height) ||
    image.height <= 0 ||
    image.data.length !== image.width * image.height * 4
  ) {
    throw new RangeError(`${name} must contain valid RGBA dimensions and data`)
  }
}

function assertTargetDimension(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
}

function createDefaultCanvas(width: number, height: number): ResampleCanvas {
  let canvas: ResampleCanvas

  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas') as unknown as ResampleCanvas
  } else if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height) as unknown as ResampleCanvas
  } else {
    throw new Error('当前环境不支持 Canvas 2D')
  }

  canvas.width = width
  canvas.height = height
  return canvas
}

function getContext(canvas: ResampleCanvas): ResampleCanvasContext {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('当前环境不支持 Canvas 2D')
  }

  return context
}

/**
 * Resamples an already-rasterized crop with Canvas 2D. Alpha is kept as RGBA
 * data; this function does not classify transparent pixels or perform palette mapping.
 */
export function resampleRgbaImage(
  source: RgbaImage,
  targetWidth: number,
  targetHeight: number,
  canvasFactory: ResampleCanvasFactory = createDefaultCanvas,
): RgbaImage {
  assertImage(source, 'source image')
  assertTargetDimension(targetWidth, 'targetWidth')
  assertTargetDimension(targetHeight, 'targetHeight')

  const sourceCanvas = canvasFactory(source.width, source.height)
  const targetCanvas = canvasFactory(targetWidth, targetHeight)
  const sourceContext = getContext(sourceCanvas)
  const targetContext = getContext(targetCanvas)

  const sourceImageData = sourceContext.createImageData(source.width, source.height)
  sourceImageData.data.set(source.data)
  sourceContext.putImageData(sourceImageData, 0, 0)

  targetContext.imageSmoothingEnabled = true
  if ('imageSmoothingQuality' in targetContext) {
    targetContext.imageSmoothingQuality = 'high'
  }
  targetContext.drawImage(
    sourceCanvas,
    0,
    0,
    source.width,
    source.height,
    0,
    0,
    targetWidth,
    targetHeight,
  )

  const outputImageData = targetContext.getImageData(0, 0, targetWidth, targetHeight)
  if (outputImageData.data.length !== targetWidth * targetHeight * 4) {
    throw new RangeError('resampled image contains invalid RGBA data')
  }

  return {
    width: targetWidth,
    height: targetHeight,
    data: new Uint8ClampedArray(outputImageData.data),
  }
}

/** Resamples a crop to the dimensions already defined by the generation request. */
export function resampleGenerationImage(
  source: RgbaImage,
  request: Pick<GenerationRequest, 'widthBeads' | 'crop'>,
  canvasFactory?: ResampleCanvasFactory,
): RgbaImage {
  const dimensions = deriveGenerationDimensions(request.widthBeads, request.crop)
  return resampleRgbaImage(source, dimensions.widthBeads, dimensions.heightBeads, canvasFactory)
}
