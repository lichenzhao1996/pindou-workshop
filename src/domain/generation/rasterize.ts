import type { CropRotation, CropState } from '../project/types'
import { shouldPreprocessLargeImage } from './config'
import { deriveGenerationDimensions } from './dimensions'
import type { GenerationRequest, ProjectGenerationRequest } from './request'

export interface RgbaImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
  /** Original natural image dimensions, set only when a large source was preprocessed. */
  readonly sourceSize?: Readonly<{ width: number; height: number }>
  /** Original crop dimensions after rotation, before bead-grid downsampling. */
  readonly cropSize?: Readonly<{ width: number; height: number }>
}

export type ImageRgbaDecoder = (blob: Blob) => Promise<RgbaImage>

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
}

function assertRgbaImage(image: RgbaImage): void {
  assertPositiveInteger(image.width, 'image width')
  assertPositiveInteger(image.height, 'image height')

  const expectedLength = image.width * image.height * 4
  if (image.data.length !== expectedLength) {
    throw new RangeError('RGBA data length must equal width × height × 4')
  }
}

function assertCropWithinImage(crop: CropState, image: Pick<RgbaImage, 'width' | 'height'>): void {
  const values = [crop.x, crop.y, crop.width, crop.height, crop.aspectRatio]
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError('crop values must be finite')
  }
  if (crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0) {
    throw new RangeError('crop must have a positive area within the source image')
  }
  if (crop.x + crop.width > image.width || crop.y + crop.height > image.height) {
    throw new RangeError('crop must stay within the source image bounds')
  }
}

function getRotatedSize(width: number, height: number, rotation: CropRotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height }
}

function getSourceCoordinates(
  outputX: number,
  outputY: number,
  width: number,
  height: number,
  rotation: CropRotation,
) {
  switch (rotation) {
    case 90:
      return { x: outputY, y: height - 1 - outputX }
    case 180:
      return { x: width - 1 - outputX, y: height - 1 - outputY }
    case 270:
      return { x: width - 1 - outputY, y: outputX }
    default:
      return { x: outputX, y: outputY }
  }
}

/**
 * Crops source pixels in natural image coordinates and rotates them clockwise.
 * The returned buffer is always a new RGBA snapshot and never aliases the input.
 */
export function rasterizeRgbaImage(source: RgbaImage, crop: CropState): RgbaImage {
  assertRgbaImage(source)
  assertCropWithinImage(crop, source)

  const cropX = Math.floor(crop.x)
  const cropY = Math.floor(crop.y)
  const cropRight = Math.ceil(crop.x + crop.width)
  const cropBottom = Math.ceil(crop.y + crop.height)
  const cropWidth = cropRight - cropX
  const cropHeight = cropBottom - cropY
  const outputSize = getRotatedSize(cropWidth, cropHeight, crop.rotation)
  const data = new Uint8ClampedArray(outputSize.width * outputSize.height * 4)

  for (let outputY = 0; outputY < outputSize.height; outputY += 1) {
    for (let outputX = 0; outputX < outputSize.width; outputX += 1) {
      const sourceCoordinates = getSourceCoordinates(
        outputX,
        outputY,
        cropWidth,
        cropHeight,
        crop.rotation,
      )
      const sourceIndex =
        ((cropY + sourceCoordinates.y) * source.width + cropX + sourceCoordinates.x) * 4
      const outputIndex = (outputY * outputSize.width + outputX) * 4
      data.set(source.data.subarray(sourceIndex, sourceIndex + 4), outputIndex)
    }
  }

  return {
    width: outputSize.width,
    height: outputSize.height,
    data,
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持 Canvas 2D 图片处理')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function readDrawableAsRgba(drawable: CanvasImageSource, width: number, height: number): RgbaImage {
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('当前环境无法创建 Canvas 2D 上下文')
  }

  context.drawImage(drawable, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)
  return {
    width,
    height,
    data: new Uint8ClampedArray(imageData.data),
  }
}

async function decodeWithImageBitmap(blob: Blob): Promise<RgbaImage> {
  const bitmap = await globalThis.createImageBitmap(blob)
  try {
    return readDrawableAsRgba(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}

async function decodeWithHtmlImage(blob: Blob): Promise<RgbaImage> {
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('当前环境不支持图片解码')
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('图片解码失败'))
      element.src = objectUrl
    })
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    return readDrawableAsRgba(image, width, height)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Decodes a local image through Canvas 2D while preserving its alpha channel. */
export async function decodeImageBlob(blob: Blob): Promise<RgbaImage> {
  if (typeof globalThis.createImageBitmap === 'function') {
    return decodeWithImageBitmap(blob)
  }

  return decodeWithHtmlImage(blob)
}

/** Uses only the original image and confirmed CropState from a generation request. */
export async function rasterizeCrop(
  request: Pick<GenerationRequest, 'originalImage' | 'crop'>,
  decode: ImageRgbaDecoder = decodeImageBlob,
): Promise<RgbaImage> {
  const source = await decode(request.originalImage)
  return rasterizeRgbaImage(source, request.crop)
}

interface ImageDrawableWithCleanup {
  readonly drawable: CanvasImageSource
  readonly dispose: () => void
}

async function loadHtmlImageDrawable(blob: Blob): Promise<ImageDrawableWithCleanup> {
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('当前环境不支持图片解码')
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('图片解码失败'))
      element.src = objectUrl
    })
    return { drawable: image, dispose: () => URL.revokeObjectURL(objectUrl) }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

function prepareRotationTransform(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  rotation: CropRotation,
): void {
  switch (rotation) {
    case 90:
      context.translate(width, 0)
      context.rotate(Math.PI / 2)
      break
    case 180:
      context.translate(width, height)
      context.rotate(Math.PI)
      break
    case 270:
      context.translate(0, height)
      context.rotate(-Math.PI / 2)
      break
    default:
      break
  }
}

/**
 * For sources that cross the documented large-image warning threshold, draw only
 * the confirmed crop into the final bead-sized raster. This avoids allocating a
 * full-resolution Uint8ClampedArray and a second full crop copy on the main thread.
 */
export async function rasterizeLargeCropForGeneration(
  request: ProjectGenerationRequest,
): Promise<RgbaImage> {
  const sourceSize = {
    width: request.source.originalWidth,
    height: request.source.originalHeight,
  }
  if (!shouldPreprocessLargeImage(sourceSize.width, sourceSize.height)) {
    return rasterizeCrop(request)
  }

  assertCropWithinImage(request.crop, { width: sourceSize.width, height: sourceSize.height })
  const cropX = Math.floor(request.crop.x)
  const cropY = Math.floor(request.crop.y)
  const cropRight = Math.ceil(request.crop.x + request.crop.width)
  const cropBottom = Math.ceil(request.crop.y + request.crop.height)
  const cropWidth = cropRight - cropX
  const cropHeight = cropBottom - cropY
  const dimensions = deriveGenerationDimensions(request.widthBeads, request.crop)
  if (dimensions.heightBeads !== request.heightBeads) {
    throw new RangeError('generation dimensions do not match the confirmed crop')
  }

  const targetWidth = dimensions.widthBeads
  const targetHeight = dimensions.heightBeads
  const rotatedCropWidth =
    request.crop.rotation === 90 || request.crop.rotation === 270 ? targetHeight : targetWidth
  const rotatedCropHeight =
    request.crop.rotation === 90 || request.crop.rotation === 270 ? targetWidth : targetHeight
  const canvas = createCanvas(targetWidth, targetHeight)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境无法创建 Canvas 2D 上下文')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  prepareRotationTransform(context, targetWidth, targetHeight, request.crop.rotation)

  let bitmap: ImageBitmap | null = null
  let fallback: ImageDrawableWithCleanup | null = null
  try {
    if (typeof globalThis.createImageBitmap === 'function') {
      try {
        bitmap = await globalThis.createImageBitmap(
          request.originalImage,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          {
            resizeWidth: rotatedCropWidth,
            resizeHeight: rotatedCropHeight,
            resizeQuality: 'high',
          },
        )
        context.drawImage(bitmap, 0, 0, rotatedCropWidth, rotatedCropHeight)
      } catch {
        bitmap?.close()
        bitmap = null
        fallback = await loadHtmlImageDrawable(request.originalImage)
        context.drawImage(
          fallback.drawable,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          rotatedCropWidth,
          rotatedCropHeight,
        )
      }
    } else {
      fallback = await loadHtmlImageDrawable(request.originalImage)
      context.drawImage(
        fallback.drawable,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        rotatedCropWidth,
        rotatedCropHeight,
      )
    }

    const imageData = context.getImageData(0, 0, targetWidth, targetHeight)
    const cropSize = getRotatedSize(cropRight - cropX, cropBottom - cropY, request.crop.rotation)
    return {
      width: targetWidth,
      height: targetHeight,
      data: new Uint8ClampedArray(imageData.data),
      sourceSize,
      cropSize,
    }
  } finally {
    bitmap?.close()
    fallback?.dispose()
    canvas.width = 0
    canvas.height = 0
  }
}
