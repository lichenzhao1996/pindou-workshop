import {
  EXTREME_ASPECT_RATIO_WARNING_THRESHOLD,
  LARGE_IMAGE_DIMENSION_WARNING_THRESHOLD,
  LARGE_IMAGE_PIXEL_WARNING_THRESHOLD,
} from '../../domain/generation/config'

const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type SupportedImageMimeType = (typeof SUPPORTED_MIME_TYPES)[number]

export interface ImageInput {
  readonly originalImage: Blob
  readonly originalFileName: string | null
  readonly mimeType: SupportedImageMimeType
}

export interface ImageDimensions {
  readonly width: number
  readonly height: number
}

export type ImageWarningCode = 'low-resolution' | 'large-image' | 'extreme-aspect-ratio'

export interface ImageWarning {
  readonly code: ImageWarningCode
  readonly message: string
}

export type ImageInvalidReason = 'unsupported-format' | 'decode-failed' | 'invalid-dimensions'

export interface ValidImageInputInspection {
  readonly status: 'valid'
  readonly input: ImageInput
  readonly dimensions: ImageDimensions
  readonly warnings: readonly ImageWarning[]
}

export interface InvalidImageInputInspection {
  readonly status: 'invalid'
  readonly reason: ImageInvalidReason
  readonly message: string
}

export type ImageInputInspection = ValidImageInputInspection | InvalidImageInputInspection | null

export type ImageDimensionDecoder = (image: Blob) => Promise<ImageDimensions>

type ImageFileMetadata = Pick<Blob, 'type'> & Partial<Pick<File, 'name'>>

const MIME_TYPE_BY_EXTENSION: Record<string, SupportedImageMimeType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const LOW_RESOLUTION_THRESHOLD = 128
function mimeTypeFromFileName(fileName: string): SupportedImageMimeType | null {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  return MIME_TYPE_BY_EXTENSION[extension] ?? null
}

function normalizedMimeType(fileType: string): SupportedImageMimeType | null {
  const mimeType = fileType.toLowerCase()
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType)
    ? (mimeType as SupportedImageMimeType)
    : null
}

export function getSupportedImageMimeType(file: ImageFileMetadata): SupportedImageMimeType | null {
  return normalizedMimeType(file.type) ?? mimeTypeFromFileName(file.name ?? '')
}

export function isSupportedImageFile(file: ImageFileMetadata): boolean {
  return getSupportedImageMimeType(file) !== null
}

export function createImageInput(
  file: Blob | null,
  originalFileNameOverride?: string | null,
): ImageInput | null {
  if (!file) {
    return null
  }

  const mimeType = getSupportedImageMimeType(file)
  if (!mimeType) {
    return null
  }

  return {
    originalImage: file,
    originalFileName:
      originalFileNameOverride !== undefined
        ? originalFileNameOverride
        : 'name' in file && typeof file.name === 'string' && file.name
          ? file.name
          : null,
    mimeType,
  }
}

function isValidDimension(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export function inspectImageDimensions(
  dimensions: ImageDimensions,
): Omit<ValidImageInputInspection, 'input'> | InvalidImageInputInspection {
  const { width, height } = dimensions

  if (!isValidDimension(width) || !isValidDimension(height)) {
    return {
      status: 'invalid',
      reason: 'invalid-dimensions',
      message: '无法读取有效的图片尺寸，请选择一张有效图片。',
    }
  }

  const pixelCount = width * height
  if (!Number.isSafeInteger(pixelCount)) {
    return {
      status: 'invalid',
      reason: 'invalid-dimensions',
      message: '图片尺寸超出当前浏览器可处理范围，请选择一张有效图片。',
    }
  }

  const warnings: ImageWarning[] = []
  if (width < LOW_RESOLUTION_THRESHOLD || height < LOW_RESOLUTION_THRESHOLD) {
    warnings.push({
      code: 'low-resolution',
      message: '图片分辨率较低，生成后细节可能不足，但仍可继续。',
    })
  }

  if (
    pixelCount > LARGE_IMAGE_PIXEL_WARNING_THRESHOLD ||
    Math.max(width, height) > LARGE_IMAGE_DIMENSION_WARNING_THRESHOLD
  ) {
    warnings.push({
      code: 'large-image',
      message: '图片尺寸较大，后续处理可能需要更多资源。',
    })
  }

  const aspectRatio = Math.max(width / height, height / width)
  if (aspectRatio > EXTREME_ASPECT_RATIO_WARNING_THRESHOLD) {
    warnings.push({
      code: 'extreme-aspect-ratio',
      message: '图片宽高比较极端，生成的作品可能较狭长，但仍可继续。',
    })
  }

  return {
    status: 'valid',
    dimensions,
    warnings,
  }
}

async function decodeWithImageElement(blob: Blob): Promise<ImageDimensions> {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Image object URLs are unavailable')
  }

  if (typeof Image === 'undefined') {
    throw new Error('Image decoding is unavailable')
  }

  const objectUrl = URL.createObjectURL(blob)
  const image = new Image()

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Image decoding failed'))
      image.src = objectUrl
    })

    if (typeof image.decode === 'function') {
      await image.decode()
    }

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const decodeImageDimensions: ImageDimensionDecoder = async (blob) => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)

    try {
      return {
        width: bitmap.width,
        height: bitmap.height,
      }
    } finally {
      bitmap.close()
    }
  }

  return decodeWithImageElement(blob)
}

export async function inspectImageInput(
  file: Blob | null,
  originalFileNameOverride?: string | null,
  decode: ImageDimensionDecoder = decodeImageDimensions,
): Promise<ImageInputInspection> {
  if (!file) {
    return null
  }

  const input = createImageInput(file, originalFileNameOverride)
  if (!input) {
    return {
      status: 'invalid',
      reason: 'unsupported-format',
      message: '文件格式不支持，请选择 JPG、PNG 或 WEBP 图片。',
    }
  }

  let dimensions: ImageDimensions
  try {
    dimensions = await decode(input.originalImage)
  } catch {
    return {
      status: 'invalid',
      reason: 'decode-failed',
      message: '图片无法读取，请选择有效的 JPG、PNG 或 WEBP 图片。',
    }
  }

  const inspection = inspectImageDimensions(dimensions)
  if (inspection.status === 'invalid') {
    return inspection
  }

  return {
    ...inspection,
    input,
  }
}
