import { describe, expect, it } from 'vitest'
import {
  confirmCrop,
  confirmProjectCrop,
  createFullImageCropState,
  createGrid,
  createProject,
  normalizeCropState,
} from '../../src/domain/project'
import type { Source } from '../../src/domain/project'

const bounds = { width: 640, height: 480 }
const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'photo.png',
  mimeType: 'image/png',
  originalWidth: bounds.width,
  originalHeight: bounds.height,
}

describe('TASK-027 crop confirmation', () => {
  it('normalizes source coordinates and recalculates the aspect ratio', () => {
    const normalized = normalizeCropState(
      {
        x: 32.5,
        y: 24.25,
        width: 320.75,
        height: 240.5,
        rotation: 0,
        aspectRatio: 99,
      },
      bounds,
    )

    expect(normalized).toEqual({
      x: 32.5,
      y: 24.25,
      width: 320.75,
      height: 240.5,
      rotation: 0,
      aspectRatio: 320.75 / 240.5,
    })
  })

  it('preserves a full-image CropState at the image boundary', () => {
    expect(normalizeCropState(createFullImageCropState(640, 480), bounds)).toEqual(
      createFullImageCropState(640, 480),
    )
  })

  it('rejects invalid source-coordinate crop data', () => {
    expect(() =>
      normalizeCropState(
        {
          x: 500,
          y: 0,
          width: 200,
          height: 100,
          rotation: 0,
          aspectRatio: 2,
        },
        bounds,
      ),
    ).toThrow('crop data must stay within source image bounds')
  })

  it('returns the original image and normalized crop as preview input', () => {
    const confirmation = confirmCrop(
      {
        source,
        crop: createFullImageCropState(bounds.width, bounds.height),
      },
      bounds,
    )

    expect(confirmation.crop.aspectRatio).toBe(4 / 3)
    expect(confirmation.preview.originalImage).toBe(source.originalImage)
    expect(confirmation.preview.crop).toBe(confirmation.crop)
  })

  it('immutably updates an existing Project and invalidates its old Grid', () => {
    const originalCrop = createFullImageCropState(bounds.width, bounds.height)
    const project = createProject({ source, crop: originalCrop, now: new Date('2026-01-01') })
    const oldGrid = createGrid(2, 2)
    const projectWithGrid = { ...project, grid: oldGrid }
    const nextCrop = {
      x: 40,
      y: 30,
      width: 320,
      height: 240,
      rotation: 0 as const,
      aspectRatio: 4 / 3,
    }
    const updated = confirmProjectCrop(projectWithGrid, nextCrop, new Date('2026-01-02'))

    expect(updated).not.toBe(projectWithGrid)
    expect(updated.projectId).toBe(projectWithGrid.projectId)
    expect(updated.createdAt).toBe(projectWithGrid.createdAt)
    expect(updated.schemaVersion).toBe(projectWithGrid.schemaVersion)
    expect(updated.projectVersion).toBe(projectWithGrid.projectVersion)
    expect(updated.revision).toBe(projectWithGrid.revision)
    expect(updated.source).toBe(projectWithGrid.source)
    expect(updated.crop).toEqual(nextCrop)
    expect(updated.updatedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(updated.grid).toBeNull()
    expect(projectWithGrid.grid).toBe(oldGrid)
    expect(oldGrid.cells).toEqual(new Uint16Array(4))
  })

  it('returns the original Project and preserves its Grid for an unchanged crop', () => {
    const originalCrop = createFullImageCropState(bounds.width, bounds.height)
    const project = createProject({ source, crop: originalCrop })
    const oldGrid = createGrid(2, 2)
    const projectWithGrid = { ...project, grid: oldGrid }

    const result = confirmProjectCrop(projectWithGrid, originalCrop, new Date('2030-01-01'))

    expect(result).toBe(projectWithGrid)
    expect(result.grid).toBe(oldGrid)
    expect(result.updatedAt).toBe(projectWithGrid.updatedAt)
    expect(result.revision).toBe(projectWithGrid.revision)
  })
})
