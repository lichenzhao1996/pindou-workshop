import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
import { createProject } from '../../src/domain/project'
import {
  ACTIVE_SESSION_DATABASE_VERSION,
  ACTIVE_SESSION_OBJECT_STORE_NAME,
  ACTIVE_SESSION_RECORD_KEY,
  createActiveSessionStore,
  type ActiveSessionStore,
} from '../../src/storage/active-session-store'
import { createAutoSaveCoordinator } from '../../src/storage/auto-save-coordinator'

let sequence = 0
const stores: ActiveSessionStore[] = []
const coordinators: ReturnType<typeof createAutoSaveCoordinator>[] = []

function createFixture() {
  const project = createProject({
    source: {
      originalImage: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      originalFileName: 'resume.png',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 30,
    },
    crop: { x: 0, y: 0, width: 40, height: 30, rotation: 0, aspectRatio: 4 / 3 },
    projectName: 'resume',
    widthBeads: 16,
    mode: 'optimized',
    paletteVersion: MARD_291_PALETTE_VERSION,
    algorithmVersion: 'v1',
  })
  return project
}

function createStore() {
  const databaseName = `task073-intent-${sequence++}`
  const indexedDB = new IDBFactory()
  const store = createActiveSessionStore({ indexedDB, databaseName })
  const coordinator = createAutoSaveCoordinator(store, 0)
  stores.push(store)
  coordinators.push(coordinator)
  return { indexedDB, databaseName, store, coordinator }
}

async function readRaw(factory: IDBFactory, databaseName: string) {
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
    const request = database
      .transaction(ACTIVE_SESSION_OBJECT_STORE_NAME, 'readonly')
      .objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME)
      .get(ACTIVE_SESSION_RECORD_KEY)
    return await new Promise<unknown>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener('error', () => reject(request.error), { once: true })
    })
  } finally {
    database.close()
  }
}

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob)
})

afterEach(async () => {
  await Promise.all(coordinators.splice(0).map((coordinator) => coordinator.close()))
  await Promise.all(stores.splice(0).map((store) => store.close()))
  vi.unstubAllGlobals()
})

describe('TASK-073 generation recovery intent', () => {
  it('reads a legacy v2 intent as unattempted, durably marks it, and does not mark twice', async () => {
    const { indexedDB, databaseName, store, coordinator } = createStore()
    const project = createFixture()
    const intentId = 'legacy-intent'
    await store.saveActiveSessionState({
      project,
      pendingUpload: null,
      generationIntent: {
        intentId,
        projectId: project.projectId,
        sourceIdentity: JSON.stringify([
          project.projectId,
          project.source.originalFileName,
          project.source.mimeType,
          project.source.originalWidth,
          project.source.originalHeight,
          project.source.originalImage.type,
          project.source.originalImage.size,
        ]),
        crop: { ...project.crop },
        generation: { ...project.generation },
        startedAt: new Date().toISOString(),
      },
    })

    expect((await store.loadActiveSessionState())?.generationIntent?.autoRecoveryAttempted).toBe(
      false,
    )
    expect(await coordinator.markGenerationIntentAutoRecoveryAttempted(intentId)).toBe(true)
    expect(await readRaw(indexedDB, databaseName)).toMatchObject({
      schemaVersion: 2,
      generationIntent: { intentId, autoRecoveryAttempted: true },
    })

    const rawBeforeSecondCall = await readRaw(indexedDB, databaseName)
    expect(await coordinator.markGenerationIntentAutoRecoveryAttempted(intentId)).toBe(true)
    expect(await readRaw(indexedDB, databaseName)).toEqual(rawBeforeSecondCall)
  })

  it('uses a fresh unattempted intent for a later manual generation', async () => {
    const { store, coordinator } = createStore()
    const project = createFixture()
    await store.saveActiveSessionState({
      project,
      pendingUpload: null,
      generationIntent: {
        intentId: 'old',
        projectId: project.projectId,
        sourceIdentity: JSON.stringify([
          project.projectId,
          project.source.originalFileName,
          project.source.mimeType,
          project.source.originalWidth,
          project.source.originalHeight,
          project.source.originalImage.type,
          project.source.originalImage.size,
        ]),
        crop: { ...project.crop },
        generation: { ...project.generation },
        startedAt: new Date().toISOString(),
        autoRecoveryAttempted: true,
      },
    })

    await coordinator.startGeneration(project, 'manual-new-intent')
    expect((await store.loadActiveSessionState())?.generationIntent).toMatchObject({
      intentId: 'manual-new-intent',
      autoRecoveryAttempted: false,
    })
  })
})
