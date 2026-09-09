import { describe, expect, it } from 'vitest'
import {
  createFullImageCropState,
  createProject,
  updateProjectGenerationSize,
} from '../../src/domain/project'
import type { Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'photo.png',
  mimeType: 'image/png',
  originalWidth: 400,
  originalHeight: 300,
}

describe('TASK-028 Project generation size', () => {
  it('updates width and derived height immutably without creating a Grid', () => {
    const project = createProject({
      source,
      crop: createFullImageCropState(400, 300),
      now: new Date('2026-09-09T00:00:00.000Z'),
    })

    const updated = updateProjectGenerationSize(project, 32, new Date('2026-09-09T00:01:00.000Z'))

    expect(updated).not.toBe(project)
    expect(updated.generation.widthBeads).toBe(32)
    expect(updated.generation.heightBeads).toBe(24)
    expect(updated.generation.beadSizeMm).toBe(2.6)
    expect(updated.grid).toBeNull()
    expect(updated.projectId).toBe(project.projectId)
    expect(updated.revision).toBe(project.revision)
    expect(updated.source).toBe(project.source)
    expect(updated.crop).toBe(project.crop)
    expect(updated.updatedAt).toBe('2026-09-09T00:01:00.000Z')
  })

  it('returns the same Project for an unchanged width and derived height', () => {
    const project = createProject({ source, crop: createFullImageCropState(400, 300) })

    expect(updateProjectGenerationSize(project, 64)).toBe(project)
  })
})
