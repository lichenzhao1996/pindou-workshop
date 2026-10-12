import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { initializeSessionRecovery, sessionRecoveryState } from '../../src/app/session-recovery'
import { createGrid, createProject } from '../../src/domain/project'
import {
  ActiveSessionStoreError,
  createActiveSessionStore,
} from '../../src/storage/active-session-store'

afterEach(() => {
  sessionRecoveryState.status = 'loading'
  sessionRecoveryState.session = null
  sessionRecoveryState.errorMessage = null
  sessionRecoveryState.generationError = null
  sessionRecoveryState.discarding = false
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

describe('TASK-096 storage failure degradation', () => {
  it('reports an IndexedDB open failure as a storage error, not a generation error', async () => {
    const indexedDB = {
      open: vi.fn(() => {
        throw new DOMException('storage blocked', 'SecurityError')
      }),
    } as unknown as IDBFactory
    const store = createActiveSessionStore({ indexedDB, databaseName: 'task096-open-failure' })

    await expect(store.loadActiveSessionState()).rejects.toMatchObject({
      name: 'ActiveSessionStoreError',
      code: 'database-open-failed',
    } satisfies Partial<ActiveSessionStoreError>)
    expect(indexedDB.open).toHaveBeenCalledOnce()
    await store.close()
  })

  it('explains a database open failure without mislabelling stored data as corrupt', async () => {
    const pinia = createPinia()
    const restored = await initializeSessionRecovery(pinia, {
      loadSession: async () => {
        throw new ActiveSessionStoreError('database-open-failed', 'database unavailable')
      },
      clearSession: async () => undefined,
      markGenerationAttempt: async () => true,
      decodeImage: async () => ({ width: 1, height: 1 }),
    })

    expect(restored).toBe(false)
    expect(sessionRecoveryState.status).toBe('error')
    expect(sessionRecoveryState.errorMessage).toContain('本地存储暂时无法使用')
    expect(sessionRecoveryState.errorMessage).not.toContain('数据不完整')
  })

  it('does not let failed recovery replace a legal in-memory Project', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const project = createProject({
      source: {
        originalImage: new Blob(['valid-memory-project'], { type: 'image/png' }),
        originalFileName: 'valid.png',
        mimeType: 'image/png',
        originalWidth: 40,
        originalHeight: 30,
      },
      crop: { x: 0, y: 0, width: 40, height: 30, rotation: 0, aspectRatio: 4 / 3 },
    })
    project.grid = createGrid(8, 6)
    project.grid.cells.set([0, 1, 291])
    const projects = useProjectStore(pinia)
    projects.setCurrentProject(project)

    expect(
      await initializeSessionRecovery(pinia, {
        loadSession: async () => {
          throw new DOMException('database unavailable', 'UnknownError')
        },
        clearSession: async () => undefined,
        markGenerationAttempt: async () => true,
        decodeImage: async () => ({ width: 40, height: 30 }),
      }),
    ).toBe(false)

    expect(sessionRecoveryState.status).toBe('error')
    expect(sessionRecoveryState.errorMessage).toContain('无法安全恢复')
    expect(projects.currentProject).toBe(project)
    expect(projects.currentProject?.grid?.cells).toBe(project.grid.cells)
    expect(projects.currentProject?.revision).toBe(project.revision)
  })
})
