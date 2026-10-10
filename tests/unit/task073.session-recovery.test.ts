import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createGrid, createProject } from '../../src/domain/project'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
import {
  resolveInitialSessionRoute,
  initializeSessionRecovery,
  resumeDeferredGenerationIntent,
  retrySessionRecovery,
  discardLocalSession,
  sessionRecoveryState,
} from '../../src/app/session-recovery'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { useUploadStore } from '../../src/app/stores/uploadStore'
import {
  createGenerationIntentSnapshot,
  type ActiveSessionState,
} from '../../src/storage/active-session-store'

function fixtureProject(name: string, withGrid = true) {
  const source = {
    originalImage: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    originalFileName: `${name}.png`,
    mimeType: 'image/png',
    originalWidth: 40,
    originalHeight: 30,
  }
  const project = createProject({
    source,
    crop: { x: 2, y: 3, width: 30, height: 20, rotation: 90, aspectRatio: 1.5 },
    projectName: name,
    widthBeads: 16,
    mode: 'optimized',
    paletteVersion: MARD_291_PALETTE_VERSION,
    algorithmVersion: 'v1',
    now: new Date('2026-10-01T12:00:00.000Z'),
  })
  const grid = withGrid
    ? createGrid(project.generation.widthBeads, project.generation.heightBeads)
    : null
  if (grid) grid.cells.set([0, 1, 291])
  return { ...project, grid, revision: withGrid ? 7 : 0 }
}

function resetRecoveryState() {
  sessionRecoveryState.status = 'loading'
  sessionRecoveryState.session = null
  sessionRecoveryState.errorMessage = null
  sessionRecoveryState.generationError = null
  sessionRecoveryState.discarding = false
}

afterEach(() => {
  resetRecoveryState()
  vi.restoreAllMocks()
})

describe('TASK-073 boot session recovery', () => {
  it('routes startup and direct routes by valid Project, pending upload, and intent priority', () => {
    const project = fixtureProject('A')
    const pending = { uploadId: 'B', source: { ...project.source, originalFileName: 'B.png' } }
    const base: ActiveSessionState = {
      project,
      pendingUpload: null,
      generationIntent: null,
    }

    expect(resolveInitialSessionRoute('/', null)).toBe('/')
    expect(resolveInitialSessionRoute('/', { ...base, project: null })).toBe('/')
    expect(resolveInitialSessionRoute('/', base)).toBe('/editor')
    expect(resolveInitialSessionRoute('/', { ...base, project: fixtureProject('A', false) })).toBe(
      '/crop',
    )
    expect(resolveInitialSessionRoute('/editor', { ...base, pendingUpload: pending })).toBe('/crop')
    expect(resolveInitialSessionRoute('/crop', base)).toBe('/crop')
    expect(
      resolveInitialSessionRoute('/', {
        ...base,
        generationIntent: {
          intentId: 'i',
          projectId: project.projectId,
          sourceIdentity: 'source',
          crop: project.crop,
          generation: project.generation,
          startedAt: new Date().toISOString(),
        },
      }),
    ).toBe('/crop')
    expect(
      resolveInitialSessionRoute('/editor', {
        ...base,
        generationIntent: {
          intentId: 'attempted',
          projectId: project.projectId,
          sourceIdentity: 'source',
          crop: project.crop,
          generation: project.generation,
          startedAt: new Date().toISOString(),
          autoRecoveryAttempted: true,
        },
      }),
    ).toBe('/editor')
  })

  it('hydrates a Project and its typed Grid without persistence, revision, or History changes', async () => {
    const project = fixtureProject('saved')
    const save = vi.fn(async () => true)
    const pinia = createPinia()
    const restored = await initializeSessionRecovery(pinia, {
      loadSession: async () => ({ project, pendingUpload: null, generationIntent: null }),
      clearSession: async () => undefined,
      markGenerationAttempt: save,
      decodeImage: async () => ({ width: 40, height: 30 }),
    })

    const projects = useProjectStore(pinia)
    const uploads = useUploadStore(pinia)
    const editor = useEditorStore(pinia)
    expect(restored).toBe(true)
    expect(projects.currentProject).toMatchObject({
      projectId: project.projectId,
      projectName: 'saved',
      revision: 7,
      crop: project.crop,
      generation: project.generation,
      updatedAt: project.updatedAt,
    })
    expect(projects.currentProject?.grid?.cells).toBeInstanceOf(Uint16Array)
    expect(Array.from(projects.currentProject!.grid!.cells).slice(0, 3)).toEqual([0, 1, 291])
    expect(projects.past).toEqual([])
    expect(projects.future).toEqual([])
    expect(projects.canUndo).toBe(false)
    expect(editor.zoom).toBe(1)
    expect(editor.activeTool).toBe('select')
    expect(uploads.pendingUploadId).toBeNull()
    expect(uploads.pendingInput?.originalImage).toBe(project.source.originalImage)
    expect(save).not.toHaveBeenCalled()
  })

  it('hydrates A and pending B separately, with B taking Crop priority', async () => {
    const project = fixtureProject('A')
    const pendingSource = {
      ...project.source,
      originalImage: new Blob([new Uint8Array([4, 5, 6, 7])], { type: 'image/png' }),
      originalFileName: 'B.png',
      originalWidth: 80,
      originalHeight: 60,
    }
    const pinia = createPinia()
    const restored = await initializeSessionRecovery(pinia, {
      loadSession: async () => ({
        project,
        pendingUpload: { uploadId: 'upload-B', source: pendingSource },
        generationIntent: null,
      }),
      clearSession: async () => undefined,
      markGenerationAttempt: async () => true,
      decodeImage: async (blob) =>
        blob.size === 4 ? { width: 80, height: 60 } : { width: 40, height: 30 },
    })

    expect(restored).toBe(true)
    expect(useProjectStore(pinia).currentProject?.projectId).toBe(project.projectId)
    expect(useProjectStore(pinia).currentProject?.grid?.cells).toBeInstanceOf(Uint16Array)
    expect(useUploadStore(pinia).pendingUploadId).toBe('upload-B')
    expect(useUploadStore(pinia).pendingInput?.originalFileName).toBe('B.png')
    expect(resolveInitialSessionRoute('/', sessionRecoveryState.session)).toBe('/crop')
  })

  it('persists the one-time marker before calling the existing generation path and navigates only after success', async () => {
    const project = fixtureProject('intent', false)
    const intent = createGenerationIntentSnapshot(project, 'resume-intent')
    const events: string[] = []
    const pinia = createPinia()
    await initializeSessionRecovery(pinia, {
      loadSession: async () => ({ project, pendingUpload: null, generationIntent: intent }),
      clearSession: async () => undefined,
      markGenerationAttempt: async (intentId) => {
        expect(intentId).toBe('resume-intent')
        events.push('mark-attempted')
        return true
      },
      decodeImage: async () => ({ width: 40, height: 30 }),
    })
    const projectStore = useProjectStore(pinia)
    projectStore.generateCurrentProject = vi.fn(async () => {
      events.push('worker-generation')
      return true
    })
    const navigate = vi.fn(async () => {
      events.push('editor-navigation')
    })

    expect(await resumeDeferredGenerationIntent(navigate)).toBe(true)
    expect(events).toEqual(['mark-attempted', 'worker-generation', 'editor-navigation'])
    expect(projectStore.generateCurrentProject).toHaveBeenCalledWith({
      recoveryIntentId: 'resume-intent',
    })
    expect(sessionRecoveryState.session?.generationIntent).toBeNull()
  })

  it('blocks corrupted image metadata, leaves the Project untouched, retries, and only discards when called', async () => {
    const project = fixtureProject('bad')
    const pinia = createPinia()
    const clear = vi.fn(async () => undefined)
    let decodedWidth = 12
    const dependencies = {
      loadSession: async () => ({ project, pendingUpload: null, generationIntent: null }),
      clearSession: clear,
      markGenerationAttempt: async () => true,
      decodeImage: async () => ({ width: decodedWidth, height: decodedWidth === 12 ? 12 : 30 }),
    }

    expect(await initializeSessionRecovery(pinia, dependencies)).toBe(false)
    expect(sessionRecoveryState.status).toBe('error')
    expect(sessionRecoveryState.errorMessage).toContain('原记录未删除')
    expect(useProjectStore(pinia).currentProject).toBeNull()
    expect(clear).not.toHaveBeenCalled()

    decodedWidth = 40
    expect(await retrySessionRecovery()).toBe(true)
    expect(useProjectStore(pinia).currentProject?.projectId).toBe(project.projectId)
    expect(clear).not.toHaveBeenCalled()
  })

  it('keeps recovery blocked when the explicitly requested clear fails', async () => {
    const pinia = createPinia()
    await initializeSessionRecovery(pinia, {
      loadSession: async () => {
        throw new Error('bad record')
      },
      clearSession: async () => {
        throw new Error('clear failed')
      },
      markGenerationAttempt: async () => true,
      decodeImage: async () => ({ width: 40, height: 30 }),
    })

    expect(await discardLocalSession()).toBe(false)
    expect(sessionRecoveryState.status).toBe('error')
    expect(sessionRecoveryState.errorMessage).toContain('原记录仍保留')
  })
})
