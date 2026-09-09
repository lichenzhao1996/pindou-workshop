const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type SupportedImageMimeType = (typeof SUPPORTED_MIME_TYPES)[number]

export interface ImageInput {
  readonly originalImage: Blob
  readonly originalFileName: string | null
  readonly mimeType: SupportedImageMimeType
}

const MIME_TYPE_BY_EXTENSION: Record<string, SupportedImageMimeType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

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

export function getSupportedImageMimeType(
  file: Pick<File, 'name' | 'type'>,
): SupportedImageMimeType | null {
  return normalizedMimeType(file.type) ?? mimeTypeFromFileName(file.name)
}

export function isSupportedImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  return getSupportedImageMimeType(file) !== null
}

export function createImageInput(file: File | null): ImageInput | null {
  if (!file) {
    return null
  }

  const mimeType = getSupportedImageMimeType(file)
  if (!mimeType) {
    return null
  }

  return {
    originalImage: file,
    originalFileName: file.name || null,
    mimeType,
  }
}
