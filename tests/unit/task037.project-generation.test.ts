import { describe, expect, it } from 'vitest'
import {
  commitGenerationResultToProject,
  createGenerationRequest,
  createGrid,
  createProject,
  confirmProjectCrop,
  deriveGenerationDimensions,
  updateProjectGenerationMode,
  updateProjectGenerationSize,
} from '../../src/domain/project'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createPinia, setActivePinia } from 'pinia'
import type { GenerationResult } from '../../src/domain/generation'
import type { Project, Source } from '../../src/domain/project'

type MutableGenerationResult = {
  -readonly [Key in keyof GenerationResult]: GenerationResult[Key]
}

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'task037.png',
  mimeType: 'image/png',
  originalWidth: 640,
  originalHeight: 480,
}

function createTestProject() {
  return createProject({
    source: { ...source },
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

function createEditedProject(): Project {
  const project = createTestProject()
  return { ...project, revision: 4, grid: createGrid(64, 48) }
}

function createStore(project: Project = createTestProject()) {
  setActivePinia(createPinia())
  const store = useProjectStore()
  store.setCurrentProject(project)
  return store
}

function createResult(project: ReturnType<typeof createTestProject>): MutableGenerationResult {
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
    expect(updated.generation).toBe(project.generation)
    expect(updated.projectName).toBe(project.projectName)
    expect(updated.schemaVersion).toBe(project.schemaVersion)
    expect(updated.projectVersion).toBe(project.projectVersion)
    expect(updated.grid).not.toBe(project.grid)
    expect(updated.grid?.cells).not.toBe(result.grid.cells)
    expect(updated.revision).toBe(0)
    expect(updated.updatedAt).toBe('2026-09-10T00:01:00.000Z')
    result.grid.cells[0] = 1
    expect(updated.grid?.cells[0]).toBe(0)
    expect(project.revision).toBe(4)
    expect(project.updatedAt).toBe('2026-09-10T00:00:00.000Z')
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

  it('builds a copied formal Project snapshot from the original image, never the old Grid', () => {
    const project = createEditedProject()
    project.grid?.cells.fill(291)
    const request = createGenerationRequest(project)
    expect(request.projectId).toBe(project.projectId)
    expect(request.originalImage).toBe(project.source.originalImage)
    expect(request.source).toEqual(project.source)
    expect(request.source).not.toBe(project.source)
    expect(request.crop).toEqual(project.crop)
    expect(request.crop).not.toBe(project.crop)
    expect(request.widthBeads).toBe(64)
    expect(request.heightBeads).toBe(48)
    expect(request.mode).toBe('high-fidelity')
    expect(request.paletteVersion).toBe(project.generation.paletteVersion)
    expect(request.algorithmVersion).toBe(project.generation.algorithmVersion)
    expect(request).not.toHaveProperty('grid')
    expect(request).not.toHaveProperty('revision')

    project.crop.x = 1
    project.source.originalFileName = 'changed.png'
    expect(request.crop.x).toBe(0)
    expect(request.source.originalFileName).toBe('task037.png')
  })

  it('derives request height using the formal width and visual crop helper', () => {
    const original = createTestProject()
    const project = confirmProjectCrop(original, { ...original.crop, rotation: 90 })
    const request = createGenerationRequest(project)
    expect(request.heightBeads).toBe(deriveGenerationDimensions(64, project.crop).heightBeads)
    expect(request.heightBeads).toBe(85)
  })

  it.each([
    ['crop', (project: Project) => confirmProjectCrop(project, { ...project.crop, width: 320 })],
    ['width', (project: Project) => updateProjectGenerationSize(project, 96)],
    ['mode', (project: Project) => updateProjectGenerationMode(project, 'optimized')],
  ] as const)(
    'immediately invalidates an old Grid on actual %s change without resetting revision',
    (_, change) => {
      const project = createEditedProject()
      const updated = change(project)
      expect(updated).not.toBe(project)
      expect(updated.projectId).toBe(project.projectId)
      expect(updated.grid).toBeNull()
      expect(updated.revision).toBe(4)
      expect(updated.updatedAt).not.toBe(project.updatedAt)
      expect(updated.schemaVersion).toBe(project.schemaVersion)
      expect(updated.projectVersion).toBe(project.projectVersion)
      expect(project.grid).not.toBeNull()
    },
  )

  it('applies width, derived height and existing setter timestamp semantics together', () => {
    const project = createEditedProject()
    const now = new Date('2026-09-10T00:01:00.000Z')
    const updated = updateProjectGenerationSize(project, 96, now)
    expect(updated.generation.widthBeads).toBe(96)
    expect(updated.generation.heightBeads).toBe(72)
    expect(updated.updatedAt).toBe(now.toISOString())
    expect(updated.grid).toBeNull()
    expect(updated.revision).toBe(4)
  })

  it.each([
    ['crop', (project: Project) => confirmProjectCrop(project, { ...project.crop })],
    ['width', (project: Project) => updateProjectGenerationSize(project, 64)],
    ['mode', (project: Project) => updateProjectGenerationMode(project, 'high-fidelity')],
  ] as const)(
    'treats same %s as a safe no-op even with an active generation request',
    (_, sameValue) => {
      const project = createEditedProject()
      const store = createStore(project)
      const token = store.beginGeneration()
      const request = store.pendingGenerationRequest
      const updated = sameValue(project)
      expect(updated).toBe(project)
      store.setCurrentProject(updated)
      expect(store.currentProject).toBe(project)
      expect(store.currentProject?.grid).toBe(project.grid)
      expect(store.currentProject?.revision).toBe(4)
      expect(store.currentProject?.updatedAt).toBe(project.updatedAt)
      expect(store.pendingGenerationRequest).toBe(request)
      expect(store.generationStatus).toBe('generating')
      expect(store.commitGenerationResult(token, createResult(project))).toBe(true)
    },
  )

  it('does not mutate Project data while preparing or beginning a request', () => {
    const project = createEditedProject()
    const store = createStore(project)
    const request = store.prepareGenerationRequest()
    expect(request).toEqual(createGenerationRequest(project))
    expect(store.generationStatus).toBe('idle')
    store.beginGeneration()
    expect(store.generationStatus).toBe('generating')
    expect(store.currentProject).toBe(project)
    expect(project.revision).toBe(4)
    expect(project.grid).not.toBeNull()
    expect(project.updatedAt).toBe('2026-09-10T00:00:00.000Z')
  })

  it('returns the unchanged active snapshot when preparing during a pending request', () => {
    const project = createEditedProject()
    const store = createStore(project)
    const token = store.beginGeneration()
    const activeSnapshot = store.pendingGenerationRequest

    expect(store.prepareGenerationRequest()).toBe(activeSnapshot)
    expect(store.prepareGenerationRequest()).toBe(activeSnapshot)
    expect(store.pendingGenerationRequest).toBe(activeSnapshot)
    expect(store.isCurrentGenerationRequest(token)).toBe(true)
    expect(store.generationStatus).toBe('generating')
    expect(store.currentProject).toBe(project)
    expect(store.commitGenerationResult(token, createResult(project))).toBe(true)
  })

  it('cannot authorize changed settings by overwriting the visible pending request snapshot', () => {
    const project = createEditedProject()
    const store = createStore(project)
    const token = store.beginGeneration()
    const activeSnapshot = store.pendingGenerationRequest
    const changed = updateProjectGenerationSize(project, 96)

    // Simulate code bypassing immutable setters and tampering with the exposed UI state.
    project.generation = changed.generation
    store.pendingGenerationRequest = createGenerationRequest(project)
    expect(store.pendingGenerationRequest.widthBeads).toBe(96)
    expect(activeSnapshot?.widthBeads).toBe(64)

    // Even an otherwise legal result for the tampered parameters cannot gain commit authority.
    expect(store.commitGenerationResult(token, createResult(project))).toBe(false)
    expect(store.currentProject).toBe(project)
    expect(store.currentProject?.grid).toBe(project.grid)
    expect(store.currentProject?.revision).toBe(4)
    expect(store.currentProject?.updatedAt).toBe(project.updatedAt)
    expect(store.generationStatus).not.toBe('success')
    expect(store.generationError).toBeNull()
  })

  it('allows first generation with the current same-value default mode', () => {
    const project = updateProjectGenerationMode(createTestProject(), 'optimized')
    const store = createStore(project)
    store.setCurrentProject(updateProjectGenerationMode(project, 'optimized'))
    const token = store.beginGeneration()
    expect(store.commitGenerationResult(token, createResult(project))).toBe(true)
    expect(store.currentProject?.generation.mode).toBe('optimized')
    expect(store.generationStatus).toBe('success')
  })

  it('commits only the latest monotonic token and establishes one atomic generated baseline', () => {
    const project = createEditedProject()
    const store = createStore(project)
    const firstToken = store.beginGeneration()
    const latestToken = store.beginGeneration()
    const request = store.pendingGenerationRequest
    const result = createResult(project)
    const now = new Date('2026-09-10T00:02:00.000Z')

    expect(latestToken).toBeGreaterThan(firstToken)
    expect(store.commitGenerationResult(firstToken, result, now)).toBe(false)
    expect(store.failGeneration(firstToken, new Error('old failure'))).toBe(false)
    expect(store.cancelGeneration(firstToken)).toBe(false)
    expect(store.currentProject).toBe(project)
    expect(store.pendingGenerationRequest).toBe(request)
    expect(store.generationStatus).toBe('generating')
    expect(store.generationError).toBeNull()

    expect(store.commitGenerationResult(latestToken, result, now)).toBe(true)
    expect(store.currentProject).not.toBe(project)
    expect(store.currentProject?.grid).toEqual(result.grid)
    expect(store.currentProject?.grid?.cells).not.toBe(result.grid.cells)
    expect(store.currentProject?.projectId).toBe(project.projectId)
    expect(store.currentProject?.generation).toBe(project.generation)
    expect(store.currentProject?.revision).toBe(0)
    expect(store.currentProject?.updatedAt).toBe(now.toISOString())
    expect(store.generationStatus).toBe('success')
    expect(store.pendingGenerationRequest).toBeNull()
    expect(store.commitGenerationResult(latestToken, result)).toBe(false)
  })

  it.each(['failure', 'cancel'] as const)(
    'does not roll back confirmed settings or reset revision on %s',
    (outcome) => {
      const oldProject = createEditedProject()
      const changed = updateProjectGenerationMode(
        updateProjectGenerationSize(oldProject, 96),
        'optimized',
      )
      const store = createStore(changed)
      const token = store.beginGeneration()
      const updatedAt = changed.updatedAt

      if (outcome === 'failure') {
        expect(store.failGeneration(token, new Error('Worker failed'))).toBe(true)
        expect(store.generationStatus).toBe('error')
        expect(store.generationError).toBe('Worker failed')
      } else {
        expect(store.cancelGeneration(token)).toBe(true)
        expect(store.generationStatus).toBe('idle')
        expect(store.generationError).toBeNull()
      }

      expect(store.currentProject).toBe(changed)
      expect(store.currentProject?.generation.widthBeads).toBe(96)
      expect(store.currentProject?.generation.mode).toBe('optimized')
      expect(store.currentProject?.grid).toBeNull()
      expect(store.currentProject?.revision).toBe(4)
      expect(store.currentProject?.updatedAt).toBe(updatedAt)
      expect(store.pendingGenerationRequest).toBeNull()
      expect(store.commitGenerationResult(token, createResult(changed))).toBe(false)
    },
  )

  it('retains a prior legal Grid when generation fails without an intervening settings change', () => {
    const project = createEditedProject()
    const store = createStore(project)
    const token = store.beginGeneration()
    store.failGeneration(token, new Error('image decode failed'))
    expect(store.currentProject).toBe(project)
    expect(store.currentProject?.grid).toBe(project.grid)
    expect(store.currentProject?.revision).toBe(4)
    expect(store.currentProject?.updatedAt).toBe(project.updatedAt)
  })

  it('does not overwrite a newer error with stale success or failure', () => {
    const project = createTestProject()
    const store = createStore(project)
    const firstToken = store.beginGeneration()
    const latestToken = store.beginGeneration()
    store.failGeneration(latestToken, new Error('new failure'))
    expect(store.commitGenerationResult(firstToken, createResult(project))).toBe(false)
    expect(store.failGeneration(firstToken, new Error('old failure'))).toBe(false)
    expect(store.generationStatus).toBe('error')
    expect(store.generationError).toBe('new failure')
    expect(store.currentProject).toBe(project)
  })

  it.each([
    ['crop', (project: Project) => confirmProjectCrop(project, { ...project.crop, width: 320 })],
    ['width', (project: Project) => updateProjectGenerationSize(project, 96)],
    ['mode', (project: Project) => updateProjectGenerationMode(project, 'optimized')],
  ] as const)(
    'invalidates the active token on formal %s change and never restores its old settings',
    (_, change) => {
      const project = createEditedProject()
      const result = createResult(project)
      const store = createStore(project)
      const token = store.beginGeneration()
      const updated = change(project)
      store.setCurrentProject(updated)
      expect(store.commitGenerationResult(token, result)).toBe(false)
      expect(store.failGeneration(token, new Error('old failure'))).toBe(false)
      expect(store.currentProject).toBe(updated)
      expect(store.currentProject?.grid).toBeNull()
      expect(store.currentProject?.revision).toBe(4)
      expect(store.currentProject?.updatedAt).toBe(updated.updatedAt)
      expect(store.generationStatus).not.toBe('success')
      expect(store.generationError).toBeNull()
    },
  )

  it('rejects an old result after switching to a different Project with the same revision', () => {
    const project = createEditedProject()
    const otherProject = createEditedProject()
    const store = createStore(project)
    const token = store.beginGeneration()
    store.setCurrentProject(otherProject)
    expect(otherProject.revision).toBe(project.revision)
    expect(store.commitGenerationResult(token, createResult(project))).toBe(false)
    expect(store.currentProject).toBe(otherProject)
    expect(store.currentProject?.updatedAt).toBe(otherProject.updatedAt)
  })

  it('defends Project lineage even if a replacement bypasses setCurrentProject and keeps projectId', () => {
    const project = createEditedProject()
    const store = createStore(project)
    const token = store.beginGeneration()
    const replacement = { ...project }
    store.currentProject = replacement
    expect(store.commitGenerationResult(token, createResult(project))).toBe(false)
    expect(store.currentProject).toBe(replacement)
    expect(store.currentProject?.grid).toBe(project.grid)
    expect(store.currentProject?.revision).toBe(4)
    expect(store.currentProject?.updatedAt).toBe(project.updatedAt)
  })

  it.each([
    [
      'project identity',
      (project: Project) => {
        project.projectId = 'other-project'
      },
    ],
    [
      'original Blob',
      (project: Project) => {
        project.source.originalImage = new Blob(['new image'])
      },
    ],
    [
      'source dimensions',
      (project: Project) => {
        project.source.originalWidth = 800
      },
    ],
    [
      'source filename',
      (project: Project) => {
        project.source.originalFileName = 'other.png'
      },
    ],
    [
      'crop',
      (project: Project) => {
        project.crop.x = 1
      },
    ],
    [
      'width',
      (project: Project) => {
        project.generation.widthBeads = 96
      },
    ],
    [
      'height',
      (project: Project) => {
        project.generation.heightBeads = deriveGenerationDimensions(96, project.crop).heightBeads
      },
    ],
    [
      'mode',
      (project: Project) => {
        project.generation.mode = 'optimized'
      },
    ],
    [
      'palette version',
      (project: Project) => {
        project.generation.paletteVersion = 'changed-palette'
      },
    ],
    [
      'algorithm version',
      (project: Project) => {
        project.generation.algorithmVersion = 'changed-algorithm'
      },
    ],
  ] as const)(
    'rejects stale %s parameters even when code improperly mutates the same Project reference',
    (_, mutate) => {
      const project = createEditedProject()
      const result = createResult(project)
      const store = createStore(project)
      const token = store.beginGeneration()
      mutate(project)
      const stateAfterMutation = { ...project }
      expect(store.commitGenerationResult(token, result)).toBe(false)
      expect(store.currentProject).toBe(project)
      expect(store.currentProject).toEqual(stateAfterMutation)
      expect(store.currentProject?.revision).toBe(4)
      expect(store.currentProject?.updatedAt).toBe('2026-09-10T00:00:00.000Z')
      expect(store.generationStatus).not.toBe('success')
      expect(store.generationError).toBeNull()
    },
  )

  it('keeps tokens monotonic after Project clear and rejects late results', () => {
    const project = createTestProject()
    const store = createStore(project)
    const firstToken = store.beginGeneration()
    store.clearCurrentProject()
    expect(store.commitGenerationResult(firstToken, createResult(project))).toBe(false)
    expect(store.currentProject).toBeNull()
    expect(store.pendingGenerationRequest).toBeNull()
    store.setCurrentProject(project)
    expect(store.beginGeneration()).toBeGreaterThan(firstToken)
  })

  it('does not begin a request without a current Project', () => {
    setActivePinia(createPinia())
    const store = useProjectStore()
    expect(store.prepareGenerationRequest()).toBeNull()
    expect(() => store.beginGeneration()).toThrow(RangeError)
    expect(store.generationStatus).toBe('idle')
  })

  it.each([
    [
      'width',
      (result: MutableGenerationResult) => {
        result.grid.width = 32
      },
    ],
    [
      'height',
      (result: MutableGenerationResult) => {
        result.heightBeads += 1
      },
    ],
    [
      'cells length',
      (result: MutableGenerationResult) => {
        result.grid.cells = new Uint16Array(1)
      },
    ],
    [
      'cells encoding',
      (result: MutableGenerationResult) => {
        result.grid.cells = Array.from(result.grid.cells) as unknown as Uint16Array
      },
    ],
    [
      'palette version',
      (result: MutableGenerationResult) => {
        result.paletteVersion = 'wrong'
      },
    ],
    [
      'algorithm version',
      (result: MutableGenerationResult) => {
        result.algorithmVersion = 'wrong'
      },
    ],
    [
      'palette index',
      (result: MutableGenerationResult) => {
        result.grid.cells[0] = 292
      },
    ],
  ] as const)(
    'rejects an illegal result %s without partially mutating the Project',
    (_, mutate) => {
      const project = createEditedProject()
      const request = createGenerationRequest(project)
      const result = createResult(project)
      mutate(result)
      const store = createStore(project)
      const token = store.beginGeneration()
      expect(() => commitGenerationResultToProject(project, request, result)).toThrow(RangeError)
      expect(() => store.commitGenerationResult(token, result)).toThrow(RangeError)
      expect(store.currentProject).toBe(project)
      expect(store.currentProject?.grid).toBe(project.grid)
      expect(store.currentProject?.revision).toBe(4)
      expect(store.currentProject?.updatedAt).toBe(project.updatedAt)
      expect(store.generationStatus).toBe('error')
      expect(store.pendingGenerationRequest).toBeNull()
    },
  )
})
