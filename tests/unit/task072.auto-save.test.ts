import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
import {
  applyGridOperation,
  createGrid,
  createProject,
  updateProjectGenerationMode,
} from '../../src/domain/project'
import {
  ACTIVE_SESSION_DATABASE_VERSION,
  ACTIVE_SESSION_OBJECT_STORE_NAME,
  ACTIVE_SESSION_RECORD_KEY,
  LEGACY_ACTIVE_SESSION_RECORD_SCHEMA_VERSION,
  createActiveSessionStore,
  type ActiveSessionState,
  type ActiveSessionStore,
} from '../../src/storage/active-session-store'
import { createAutoSaveCoordinator } from '../../src/storage/auto-save-coordinator'
import { serializeProjectSnapshot } from '../../src/domain/project/serialization'

let databaseSequence = 0
const stores: ActiveSessionStore[] = []

function createProjectFixture(name: string) {
  const source = {
    originalImage: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
    originalFileName: `${name}.png`,
    mimeType: 'image/png',
    originalWidth: 40,
    originalHeight: 30,
  }
  const project = createProject({
    source,
    crop: { x: 0, y: 0, width: 40, height: 30, rotation: 0, aspectRatio: 4 / 3 },
    projectName: name,
    widthBeads: 16,
    mode: 'optimized',
    paletteVersion: MARD_291_PALETTE_VERSION,
    algorithmVersion: 'v1',
    now: new Date('2026-10-01T12:00:00.000Z'),
  })
  const grid = createGrid(project.generation.widthBeads, project.generation.heightBeads)
  grid.cells[0] = 1
  return { ...project, grid, revision: 0 }
}

function createTestStore() {
  const indexedDB = new IDBFactory()
  const databaseName = `task072-${databaseSequence++}`
  const store = createActiveSessionStore({ indexedDB, databaseName })
  stores.push(store)
  return { indexedDB, databaseName, store }
}

async function readRawRecord(factory: IDBFactory, databaseName: string): Promise<unknown> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, ACTIVE_SESSION_DATABASE_VERSION)
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(ACTIVE_SESSION_OBJECT_STORE_NAME)) {
        request.result.createObjectStore(ACTIVE_SESSION_OBJECT_STORE_NAME, { keyPath: 'id' })
      }
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
  try {
    const tx = database.transaction(ACTIVE_SESSION_OBJECT_STORE_NAME, 'readonly')
    const request = tx.objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME).get(ACTIVE_SESSION_RECORD_KEY)
    return await new Promise((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener('error', () => reject(request.error), { once: true })
    })
  } finally {
    database.close()
  }
}

async function writeLegacyRecord(
  factory: IDBFactory,
  databaseName: string,
  project: ReturnType<typeof createProjectFixture>,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, ACTIVE_SESSION_DATABASE_VERSION)
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(ACTIVE_SESSION_OBJECT_STORE_NAME)) {
        request.result.createObjectStore(ACTIVE_SESSION_OBJECT_STORE_NAME, { keyPath: 'id' })
      }
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
  try {
    const transaction = database.transaction(ACTIVE_SESSION_OBJECT_STORE_NAME, 'readwrite')
    const completed = new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true })
      transaction.addEventListener('abort', () => reject(transaction.error), { once: true })
    })
    transaction.objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME).put({
      id: ACTIVE_SESSION_RECORD_KEY,
      schemaVersion: LEGACY_ACTIVE_SESSION_RECORD_SCHEMA_VERSION,
      project: serializeProjectSnapshot(project),
    })
    await completed
  } finally {
    database.close()
  }
}

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob)
})

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()))
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('TASK-072 active session envelope and auto-save coordination', () => {
  it('writes pending upload while retaining the existing Project in the same single v2 record', async () => {
    const { indexedDB, databaseName, store } = createTestStore()
    const previous = createProjectFixture('旧作品')
    await store.saveActiveSession(previous)
    const coordinator = createAutoSaveCoordinator(store, 10)
    const next = createProjectFixture('待确认图片')
    const uploadId = 'upload-b'

    expect(await coordinator.stagePendingUpload(uploadId, next.source)).toBe(true)
    const state = await store.loadActiveSessionState()
    expect(state).toMatchObject({
      project: { projectId: previous.projectId, revision: previous.revision },
      pendingUpload: { uploadId, source: { originalFileName: next.source.originalFileName } },
      generationIntent: null,
    })
    const record = await readRawRecord(indexedDB, databaseName)
    expect(record).toMatchObject({ id: 'current', schemaVersion: 2 })
  })

  it('supports a pending-only first upload and lets the latest upload supersede stale staging', async () => {
    const { store } = createTestStore()
    const coordinator = createAutoSaveCoordinator(store, 10)
    const first = createProjectFixture('第一张')
    const second = createProjectFixture('第二张')

    const firstStage = coordinator.stagePendingUpload('upload-a', first.source)
    const latestStage = coordinator.stagePendingUpload('upload-b', second.source)
    await Promise.all([firstStage, latestStage])

    await expect(store.loadActiveSessionState()).resolves.toMatchObject({
      project: null,
      pendingUpload: {
        uploadId: 'upload-b',
        source: { originalFileName: second.source.originalFileName },
      },
      generationIntent: null,
    })
  })

  it('preserves a valid v1 Project when the first v2 pending-upload save occurs', async () => {
    const { indexedDB, databaseName, store } = createTestStore()
    const previous = createProjectFixture('v1 中的旧作品')
    const next = createProjectFixture('v2 待确认图片')
    await writeLegacyRecord(indexedDB, databaseName, previous)
    const coordinator = createAutoSaveCoordinator(store, 10)

    expect(await coordinator.stagePendingUpload('upload-v2', next.source)).toBe(true)
    await expect(store.loadActiveSessionState()).resolves.toMatchObject({
      project: { projectId: previous.projectId, projectName: previous.projectName },
      pendingUpload: { uploadId: 'upload-v2' },
    })
    await expect(readRawRecord(indexedDB, databaseName)).resolves.toMatchObject({
      id: 'current',
      schemaVersion: 2,
      project: { projectId: previous.projectId },
    })
  })

  it('clears only the matching pending upload and removes an empty session', async () => {
    const { store } = createTestStore()
    const coordinator = createAutoSaveCoordinator(store, 10)
    const first = createProjectFixture('第一张')
    const second = createProjectFixture('第二张')
    await coordinator.stagePendingUpload('upload-a', first.source)
    await coordinator.stagePendingUpload('upload-b', second.source)

    expect(await coordinator.clearPendingUpload('upload-a')).toBe(false)
    await expect(store.loadActiveSessionState()).resolves.toMatchObject({
      pendingUpload: { uploadId: 'upload-b' },
    })
    expect(await coordinator.clearPendingUpload('upload-b')).toBe(true)
    await expect(store.loadActiveSessionState()).resolves.toBeNull()
  })

  it('atomically replaces the formal Project and clears the matching pending input on confirmation', async () => {
    const { store } = createTestStore()
    const statesWritten: ActiveSessionState[] = []
    const observedStore: ActiveSessionStore = {
      saveActiveSession: (project) => store.saveActiveSession(project),
      loadActiveSession: () => store.loadActiveSession(),
      saveActiveSessionState: async (state) => {
        statesWritten.push(state)
        await store.saveActiveSessionState(state)
      },
      loadActiveSessionState: () => store.loadActiveSessionState(),
      clearActiveSession: () => store.clearActiveSession(),
      close: () => store.close(),
    }
    const coordinator = createAutoSaveCoordinator(observedStore, 10)
    const previous = createProjectFixture('旧作品')
    const next = createProjectFixture('新作品')
    await store.saveActiveSession(previous)
    await coordinator.stagePendingUpload('new-upload', next.source)
    statesWritten.length = 0

    expect(await coordinator.saveProject(next, { immediate: true })).toBe(true)
    expect(statesWritten).toHaveLength(1)
    expect(statesWritten[0]).toMatchObject({
      project: { projectId: next.projectId },
      pendingUpload: null,
      generationIntent: null,
    })
    await expect(store.loadActiveSessionState()).resolves.toMatchObject({
      project: { projectId: next.projectId },
      pendingUpload: null,
    })
  })

  it('stores current generation intent and prevents an older callback clearing a newer intent', async () => {
    const { store } = createTestStore()
    const coordinator = createAutoSaveCoordinator(store, 10)
    const project = createProjectFixture('生成作品')
    const replacement = createProjectFixture('后续作品')
    await coordinator.startGeneration(project, 'intent-a')
    await coordinator.startGeneration(replacement, 'intent-b')

    expect(await coordinator.clearGenerationIntent('intent-a')).toBe(false)
    expect(await coordinator.finishGeneration(project, 'intent-a')).toBe(false)
    await expect(store.loadActiveSessionState()).resolves.toMatchObject({
      project: { projectId: replacement.projectId },
      generationIntent: { intentId: 'intent-b', projectId: replacement.projectId },
    })

    const committed = applyGridOperation(replacement, {
      type: 'setCell',
      row: 0,
      column: 1,
      value: 291,
    }).project
    expect(await coordinator.finishGeneration(committed, 'intent-b')).toBe(true)
    await expect(store.loadActiveSessionState()).resolves.toMatchObject({
      project: { projectId: replacement.projectId, revision: committed.revision },
      generationIntent: null,
    })
  })

  it('invalidates an intent when confirmed generation settings change', async () => {
    const { store } = createTestStore()
    const coordinator = createAutoSaveCoordinator(store, 10)
    const project = createProjectFixture('生成设置变化')
    await coordinator.startGeneration(project, 'intent-before-mode-change')
    const changed = updateProjectGenerationMode(project, 'high-fidelity')

    await coordinator.saveProject(changed, { immediate: true })
    await expect(store.loadActiveSessionState()).resolves.toMatchObject({
      project: { generation: { mode: 'high-fidelity' } },
      generationIntent: null,
    })
  })

  it('debounces a burst of Project updates and persists the latest immutable Grid and revision', async () => {
    const { store } = createTestStore()
    const coordinator = createAutoSaveCoordinator(store, 20)
    const initial = createProjectFixture('编辑作品')
    const first = applyGridOperation(initial, {
      type: 'setCell',
      row: 0,
      column: 1,
      value: 2,
    }).project
    const latest = applyGridOperation(first, {
      type: 'setCell',
      row: 0,
      column: 2,
      value: 3,
    }).project

    await coordinator.saveProject(initial, { immediate: true })
    await coordinator.saveProject(first)
    await coordinator.saveProject(latest)
    await new Promise((resolve) => setTimeout(resolve, 40))

    const saved = await store.loadActiveSession()
    expect(saved?.revision).toBe(latest.revision)
    expect([...saved!.grid!.cells.slice(0, 3)]).toEqual([1, 2, 3])
  })

  it('reports write failure, keeps the last committed snapshot, and retries the latest memory Project', async () => {
    const { store } = createTestStore()
    let failNextSave = false
    const flakyStore: ActiveSessionStore = {
      saveActiveSession: (project) => store.saveActiveSession(project),
      loadActiveSession: () => store.loadActiveSession(),
      saveActiveSessionState: (state) => {
        if (failNextSave) {
          failNextSave = false
          return Promise.reject(new DOMException('quota exceeded', 'QuotaExceededError'))
        }
        return store.saveActiveSessionState(state)
      },
      loadActiveSessionState: () => store.loadActiveSessionState(),
      clearActiveSession: () => store.clearActiveSession(),
      close: () => store.close(),
    }
    const coordinator = createAutoSaveCoordinator(flakyStore, 10)
    const previous = createProjectFixture('已保存作品')
    const latest = createProjectFixture('未保存的新作品')
    await coordinator.saveProject(previous, { immediate: true })

    failNextSave = true
    expect(await coordinator.saveProject(latest, { immediate: true })).toBe(false)
    expect(coordinator.status.isDirty).toBe(true)
    expect(coordinator.status.errorMessage).toContain('刷新页面可能丢失最新更改')
    await expect(store.loadActiveSession()).resolves.toMatchObject({
      projectId: previous.projectId,
    })

    expect(await coordinator.retry()).toBe(true)
    expect(coordinator.status.isDirty).toBe(false)
    await expect(store.loadActiveSession()).resolves.toMatchObject({
      projectId: latest.projectId,
    })
  })

  it('replays an in-memory save request after a temporary database read failure', async () => {
    const { store } = createTestStore()
    let failFirstLoad = true
    const transientStore: ActiveSessionStore = {
      saveActiveSession: (project) => store.saveActiveSession(project),
      loadActiveSession: () => store.loadActiveSession(),
      saveActiveSessionState: (state) => store.saveActiveSessionState(state),
      loadActiveSessionState: () => {
        if (failFirstLoad) {
          failFirstLoad = false
          return Promise.reject(new Error('temporary database open failure'))
        }
        return store.loadActiveSessionState()
      },
      clearActiveSession: () => store.clearActiveSession(),
      close: () => store.close(),
    }
    const coordinator = createAutoSaveCoordinator(transientStore, 10)
    const project = createProjectFixture('需要重试的作品')

    expect(await coordinator.saveProject(project, { immediate: true })).toBe(false)
    expect(coordinator.status.isDirty).toBe(true)
    expect(await coordinator.retry()).toBe(true)
    await expect(store.loadActiveSession()).resolves.toMatchObject({
      projectId: project.projectId,
    })
  })

  it('serializes two overlapping storage writes so the older snapshot cannot finish last', async () => {
    const { store } = createTestStore()
    let releaseFirst!: () => void
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let writeCount = 0
    const delayedStore: ActiveSessionStore = {
      saveActiveSession: (project) => store.saveActiveSession(project),
      loadActiveSession: () => store.loadActiveSession(),
      saveActiveSessionState: async (state) => {
        writeCount += 1
        if (writeCount === 1) await firstWriteGate
        await store.saveActiveSessionState(state)
      },
      loadActiveSessionState: () => store.loadActiveSessionState(),
      clearActiveSession: () => store.clearActiveSession(),
      close: () => store.close(),
    }
    const coordinator = createAutoSaveCoordinator(delayedStore, 10)
    const first = createProjectFixture('先写入')
    const latest = createProjectFixture('后写入')

    const firstOperation = coordinator.saveProject(first, { immediate: true })
    await vi.waitFor(() => expect(writeCount).toBe(1))
    const latestOperation = coordinator.saveProject(latest, { immediate: true })
    releaseFirst()
    await Promise.all([firstOperation, latestOperation])

    await expect(store.loadActiveSession()).resolves.toMatchObject({
      projectId: latest.projectId,
      projectName: latest.projectName,
    })
  })

  it('does not treat a null Grid as a generation intent', async () => {
    const { store } = createTestStore()
    const coordinator = createAutoSaveCoordinator(store, 10)
    const project = { ...createProjectFixture('待生成配置'), grid: null }

    await coordinator.saveProject(project, { immediate: true })
    await expect(store.loadActiveSessionState()).resolves.toMatchObject({
      project: { grid: null },
      generationIntent: null,
    })
  })
})
