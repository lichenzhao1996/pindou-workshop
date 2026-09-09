import { describe, expect, it } from 'vitest'
import {
  createImageInput,
  getSupportedImageMimeType,
  isSupportedImageFile,
} from '../../src/features/upload'

describe('TASK-020 image input model', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.webp', 'image/webp'],
  ])('accepts %s as %s', (fileName, mimeType) => {
    const file = new File(['image'], fileName, { type: mimeType })

    expect(isSupportedImageFile(file)).toBe(true)
    expect(getSupportedImageMimeType(file)).toBe(mimeType)
  })

  it('keeps the original File as the source Blob and preserves its name', () => {
    const file = new File(['image'], '我的猫咪.jpg', { type: 'image/jpeg' })

    expect(createImageInput(file)).toEqual({
      originalImage: file,
      originalFileName: '我的猫咪.jpg',
      mimeType: 'image/jpeg',
    })
  })

  it('rejects unsupported and cancelled selections', () => {
    expect(createImageInput(new File(['text'], 'notes.txt', { type: 'text/plain' }))).toBeNull()
    expect(createImageInput(null)).toBeNull()
  })
})
