import { describe, expect, it } from 'vitest'
import { createImageInput } from '../../src/features/upload'

describe('TASK-022 pasted image input', () => {
  it('keeps a pasted image Blob without inventing an original filename', () => {
    const blob = new Blob(['image'], { type: 'image/png' })

    expect(createImageInput(blob)).toEqual({
      originalImage: blob,
      originalFileName: null,
      mimeType: 'image/png',
    })
  })

  it('allows a pasted File to explicitly keep no original filename', () => {
    const file = new File(['image'], 'clipboard-generated.png', { type: 'image/png' })

    expect(createImageInput(file, null)?.originalFileName).toBeNull()
  })
})
