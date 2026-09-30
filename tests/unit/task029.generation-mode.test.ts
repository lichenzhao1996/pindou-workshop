import { describe, expect, it } from 'vitest'
import {
  createGenerationRequest,
  DEFAULT_GENERATION_MODE,
  GENERATION_MODES,
  isGenerationMode,
  updateProjectGenerationMode,
} from '../../src/domain/generation'
import { createFullImageCropState, createGrid, createProject } from '../../src/domain/project'
import type { Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'photo.png',
  mimeType: 'image/png',
  originalWidth: 640,
  originalHeight: 480,
}

function createTestProject() {
  return createProject({
    source,
    crop: createFullImageCropState(640, 480),
    now: new Date('2026-09-09T00:00:00.000Z'),
  })
}

describe('TASK-029 generation mode', () => {
  it('defines exactly two modes and defaults to optimized', () => {
    expect(GENERATION_MODES).toEqual(['optimized', 'high-fidelity'])
    expect(DEFAULT_GENERATION_MODE).toBe('optimized')
    expect(isGenerationMode('optimized')).toBe(true)
    expect(isGenerationMode('high-fidelity')).toBe(true)
    expect(isGenerationMode('other')).toBe(false)
  })

  it('builds a request from the original source and Project generation settings', () => {
    const project = createTestProject()
    const grid = createGrid(64, 48)
    const projectWithGrid = { ...project, grid }

    const request = createGenerationRequest(projectWithGrid)

    expect(request).toEqual({
      projectId: project.projectId,
      source: project.source,
      originalImage: source.originalImage,
      crop: project.crop,
      widthBeads: 64,
      heightBeads: 48,
      mode: 'optimized',
      paletteVersion: project.generation.paletteVersion,
      algorithmVersion: project.generation.algorithmVersion,
    })
    expect(request).not.toHaveProperty('grid')
  })

  it('updates mode immutably, invalidates an old Grid, and keeps Grid revision semantics', () => {
    const project = { ...createTestProject(), grid: createGrid(64, 48) }

    const updated = updateProjectGenerationMode(
      project,
      'high-fidelity',
      new Date('2026-09-09T00:01:00.000Z'),
    )

    expect(updated).not.toBe(project)
    expect(updated.generation.mode).toBe('high-fidelity')
    expect(updated.grid).toBeNull()
    expect(project.grid).not.toBeNull()
    expect(updated.projectId).toBe(project.projectId)
    expect(updated.createdAt).toBe(project.createdAt)
    expect(updated.source).toBe(project.source)
    expect(updated.crop).toBe(project.crop)
    expect(updated.generation.widthBeads).toBe(project.generation.widthBeads)
    expect(updated.generation.heightBeads).toBe(project.generation.heightBeads)
    expect(updated.revision).toBe(project.revision)
    expect(updated.schemaVersion).toBe(project.schemaVersion)
    expect(updated.projectVersion).toBe(project.projectVersion)
    expect(updated.updatedAt).toBe('2026-09-09T00:01:00.000Z')
  })

  it('returns the original Project when setting the current mode again', () => {
    const project = { ...createTestProject(), grid: createGrid(64, 48) }

    expect(
      updateProjectGenerationMode(project, 'optimized', new Date('2026-09-09T00:02:00.000Z')),
    ).toBe(project)
  })

  it('rejects an invalid runtime mode', () => {
    expect(() => updateProjectGenerationMode(createTestProject(), 'other' as never)).toThrow(
      RangeError,
    )
  })
})
