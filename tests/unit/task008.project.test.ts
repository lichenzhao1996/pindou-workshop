import { describe, expect, it } from 'vitest'
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  DEFAULT_GRID_WIDTH,
  DEFAULT_PROJECT_NAME,
  INITIAL_PROJECT_REVISION,
  INITIAL_PROJECT_VERSION,
  createProject,
} from '../../src/domain/project'
import type { CropState, Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: '我的猫咪.jpg',
  mimeType: 'image/png',
  originalWidth: 400,
  originalHeight: 300,
}

const crop: CropState = {
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  rotation: 0,
  aspectRatio: 4 / 3,
}

describe('Project domain model', () => {
  it('creates a valid Project with the required defaults', () => {
    const project = createProject({ source, crop, now: new Date('2026-09-08T00:00:00.000Z') })

    expect(project.projectId).toEqual(expect.any(String))
    expect(project.projectName).toBe('我的猫咪')
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION)
    expect(project.projectVersion).toBe(INITIAL_PROJECT_VERSION)
    expect(project.createdAt).toBe('2026-09-08T00:00:00.000Z')
    expect(project.updatedAt).toBe(project.createdAt)
    expect(project.generation.widthBeads).toBe(DEFAULT_GRID_WIDTH)
    expect(project.generation.heightBeads).toBe(48)
    expect(project.generation.beadSizeMm).toBe(2.6)
    expect(project.generation.mode).toBe('optimized')
    expect(project.grid).toBeNull()
    expect(project.revision).toBe(INITIAL_PROJECT_REVISION)
  })

  it('uses the unnamed default when no original filename exists', () => {
    const project = createProject({
      source: { ...source, originalFileName: null },
      crop,
    })

    expect(project.projectName).toBe(DEFAULT_PROJECT_NAME)
  })

  it('keeps Project version and schema version as separate fields', () => {
    const project = createProject({ source, crop })

    expect(project).toHaveProperty('projectVersion')
    expect(project).toHaveProperty('schemaVersion')
    expect(project.projectVersion).not.toBeUndefined()
    expect(project.schemaVersion).not.toBeUndefined()
  })

  it('creates unique Project ids without persistence side effects', () => {
    const first = createProject({ source, crop })
    const second = createProject({ source, crop })

    expect(first.projectId).not.toBe(second.projectId)
    expect(first.grid).toBeNull()
    expect(second.grid).toBeNull()
  })

  it('rejects widths outside the V1 range', () => {
    expect(() => createProject({ source, crop, widthBeads: 7 })).toThrow(RangeError)
    expect(() => createProject({ source, crop, widthBeads: 257 })).toThrow(RangeError)
  })
})
