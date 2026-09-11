import { describe, expect, it } from 'vitest'
import {
  commitGenerationResultToProject,
  createGenerationRequest,
  createGrid,
  createProject,
} from '../../src/domain/project'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createPinia, setActivePinia } from 'pinia'
import type { GenerationResult } from '../../src/domain/generation'
import type { Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'task037.png',
  mimeType: 'image/png',
  originalWidth: 640,
  originalHeight: 480,
}

function createTestProject() {
  return createProject({
    source,
    crop: {
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      rotation: 0,
      aspectRatio: 4 / 3,
    },
    mode: 'high-fidelity',
    now: new Date('2026-09-10T00:00:00.000Z'),
  })
}

function createResult(project: ReturnType<typeof createTestProject>): GenerationResult {
  return {
    grid: createGrid(project.generation.widthBeads, project.generation.heightBeads),
    heightBeads: project.generation.heightBeads,
    paletteVersion: project.generation.paletteVersion,
    algorithmVersion: project.generation.algorithmVersion,
    diagnostics: {
      sourceSize: { width: 640, height: 480 },
      cropSize: { width: 640, height: 480 },
      elapsedMs: 0,
    },
  }
}

describe('TASK-037 generation Project commit', () => {
  it('commits a new Grid baseline without changing Project identity or contract versions', () => {
    const project = { ...createTestProject(), revision: 4, grid: createGrid(64, 48) }
    const request = createGenerationRequest(project)
    const result = createResult(project)

    const updated = commitGenerationResultToProject(
      project,
      request,
      result,
      new Date('2026-09-10T00:01:00.000Z'),
    )

    expect(updated).not.toBe(project)
    expect(updated.projectId).toBe(project.projectId)
    expect(updated.createdAt).toBe(project.createdAt)
    expect(updated.source).toBe(project.source)
    expect(updated.crop).toBe(project.crop)
    expect(updated.schemaVersion).toBe(project.schemaVersion)
    expect(updated.projectVersion).toBe(project.projectVersion)
    expect(updated.grid).not.toBe(project.grid)
    expect(updated.grid?.cells).not.toBe(result.grid.cells)
    expect(updated.revision).toBe(0)
    expect(updated.updatedAt).toBe('2026-09-10T00:01:00.000Z')
  })

  it('rejects a result from a stale Project request without changing the Project', () => {
    const project = createTestProject()
    const request = createGenerationRequest(project)
    const result = createResult(project)

    expect(() =>
      commitGenerationResultToProject(project, { ...request, widthBeads: 32 }, result),
    ).toThrow(RangeError)
  })

  it('allows the store to commit only the current request and preserves the Project on failure', () => {
    setActivePinia(createPinia())
    const store = useProjectStore()
    const project = createTestProject()
    store.setCurrentProject(project)

    const firstRequestId = store.beginGeneration()
    const secondRequestId = store.beginGeneration()
    expect(store.commitGenerationResult(firstRequestId, createResult(project))).toBe(false)
    expect(store.currentProject).toBe(project)

    expect(store.failGeneration(secondRequestId, new Error('decode failed'))).toBe(true)
    expect(store.currentProject).toBe(project)
    expect(store.generationStatus).toBe('error')
    expect(store.generationError).toBe('decode failed')
  })
})
