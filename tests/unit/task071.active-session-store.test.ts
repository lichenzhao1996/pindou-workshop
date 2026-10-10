import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore as FakeIDBObjectStore } from 'fake-indexeddb'
import {
  ACTIVE_SESSION_DATABASE_VERSION,
  ACTIVE_SESSION_OBJECT_STORE_NAME,
  ACTIVE_SESSION_RECORD_KEY,
  ACTIVE_SESSION_RECORD_SCHEMA_VERSION,
  LEGACY_ACTIVE_SESSION_RECORD_SCHEMA_VERSION,
  ActiveSessionStoreError,
  createActiveSessionStore,
} from '../../src/storage/active-session-store'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  applyGridOperation,
  createGrid,
  createProject,
} from '../../src/domain/project'
import { serializeProjectSnapshot } from '../../src/domain/project/serialization'
import type { Project, ProjectSnapshot } from '../../src/domain/project'

let databaseSequence = 0
const stores: ReturnType<typeof createActiveSessionStore>[] = []

function createTestStore() {
  const indexedDB = new IDBFactory()
  const databaseName = `task071-test-${databaseSequence++}`
  const store = createActiveSessionStore({ indexedDB, databaseName })
  stores.push(store)
  return { indexedDB, databaseName, store }
}

function createProjectFixture(name = 'TASK-071 会话') {
  const source = {
    originalImage: new Blob([new Uint8Array([0, 1, 2, 255])], { type: 'image/png' }),
    originalFileName: 'fixture.png',
    mimeType: 'image/png',
    originalWidth: 100,
    originalHeight: 100,
  }
  const crop = {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0 as const,
    aspectRatio: 1,
  }
  const project = createProject({
    source,
    crop,
    projectName: name,
    widthBeads: 16,
    mode: 'optimized',
    paletteVersion: MARD_291_PALETTE_VERSION,
    algorithmVersion: 'v1',
    now: new Date('2026-10-01T12:00:00.000Z'),
  })
  const grid = createGrid(project.generation.widthBeads, project.generation.heightBeads)
  grid.cells[0] = 0
  grid.cells[1] = 1
  grid.cells[2] = 291

  return {
    ...project,
    updatedAt: '2026-10-02T12:30:00.000Z',
    grid,
    revision: 7,
  }
}

function openDatabase(factory: IDBFactory, name: string, version: number) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, version)
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(ACTIVE_SESSION_OBJECT_STORE_NAME)) {
        request.result.createObjectStore(ACTIVE_SESSION_OBJECT_STORE_NAME, { keyPath: 'id' })
      }
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('Failed to open test database.')),
      { once: true },
    )
  })
}

async function writeRawRecord(
  factory: IDBFactory,
  databaseName: string,
  value: unknown,
): Promise<void> {
  const database = await openDatabase(factory, databaseName, ACTIVE_SESSION_DATABASE_VERSION)
  try {
    const transaction = database.transaction(ACTIVE_SESSION_OBJECT_STORE_NAME, 'readwrite')
    const completed = new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true })
      transaction.addEventListener(
        'abort',
        () => reject(transaction.error ?? new Error('Test transaction aborted.')),
        { once: true },
      )
    })
    transaction.objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME).put(value)
    await completed
  } finally {
    database.close()
  }
}

async function readRawRecords(
  factory: IDBFactory,
  databaseName: string,
  version = ACTIVE_SESSION_DATABASE_VERSION,
): Promise<unknown[]> {
  const database = await openDatabase(factory, databaseName, version)
  try {
    const transaction = database.transaction(ACTIVE_SESSION_OBJECT_STORE_NAME, 'readonly')
    const request = transaction.objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME).getAll()
    return await new Promise((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener(
        'error',
        () => reject(request.error ?? new Error('Test read failed.')),
        { once: true },
      )
    })
  } finally {
    database.close()
  }
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TASK-071 active-session IndexedDB store', () => {
  beforeEach(() => {
    // happy-dom's Blob is not structured-clone compatible with fake-indexeddb.
    vi.stubGlobal('Blob', NodeBlob)
  })

  it('returns null for an empty database', async () => {
    const { store } = createTestStore()

    await expect(store.loadActiveSession()).resolves.toBeNull()
  })

  it('reads a valid v1 Project record as a formal Project without migrating or deleting it', async () => {
    const { indexedDB, databaseName, store } = createTestStore()
    const project = createProjectFixture('旧版会话作品')
    await writeRawRecord(indexedDB, databaseName, {
      id: ACTIVE_SESSION_RECORD_KEY,
      schemaVersion: LEGACY_ACTIVE_SESSION_RECORD_SCHEMA_VERSION,
      project: serializeProjectSnapshot(project),
    })

    await expect(store.loadActiveSession()).resolves.toMatchObject({
      projectId: project.projectId,
      projectName: project.projectName,
      revision: project.revision,
    })
    await expect(store.loadActiveSessionState()).resolves.toMatchObject({
      project: { projectId: project.projectId },
      pendingUpload: null,
      generationIntent: null,
    })
    expect(await readRawRecords(indexedDB, databaseName)).toMatchObject([
      { id: ACTIVE_SESSION_RECORD_KEY, schemaVersion: LEGACY_ACTIVE_SESSION_RECORD_SCHEMA_VERSION },
    ])
  })

  it('round-trips the complete Project, Blob bytes, MIME type, and Uint16Array values', async () => {
    const { store } = createTestStore()
    const project = createProjectFixture()

    await store.saveActiveSession(project)
    const restored = await store.loadActiveSession()

    expect(restored).not.toBeNull()
    expect(restored).toMatchObject({
      schemaVersion: project.schemaVersion,
      projectVersion: project.projectVersion,
      projectId: project.projectId,
      projectName: project.projectName,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      crop: project.crop,
      generation: project.generation,
      revision: 7,
    })
    expect(restored?.source.originalFileName).toBe('fixture.png')
    expect(restored?.source.mimeType).toBe('image/png')
    expect(restored?.source.originalImage.type).toBe('image/png')
    expect([...new Uint8Array(await restored!.source.originalImage.arrayBuffer())]).toEqual([
      0, 1, 2, 255,
    ])
    expect(restored?.grid?.width).toBe(project.grid?.width)
    expect(restored?.grid?.height).toBe(project.grid?.height)
    expect(restored?.grid?.cells).toBeInstanceOf(Uint16Array)
    expect([...restored!.grid!.cells.slice(0, 3)]).toEqual([0, 1, 291])
  })

  it('replaces the same fixed session record instead of creating a project list', async () => {
    const { indexedDB, databaseName, store } = createTestStore()
    const first = createProjectFixture('第一份')
    const second = createProjectFixture('第二份')

    await store.saveActiveSession(first)
    await store.saveActiveSession(second)

    expect((await store.loadActiveSession())?.projectName).toBe('第二份')
    const records = await readRawRecords(indexedDB, databaseName)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: ACTIVE_SESSION_RECORD_KEY,
      schemaVersion: ACTIVE_SESSION_RECORD_SCHEMA_VERSION,
    })
  })

  it('keeps the stored snapshot independent from caller references and strips runtime extras', async () => {
    const { indexedDB, databaseName, store } = createTestStore()
    const project = {
      ...createProjectFixture(),
      grid: createProjectFixture().grid,
      selectedCell: { row: 0, column: 0 },
      viewport: { zoom: 2, panX: 10, panY: 20 },
    } as Project & { selectedCell: unknown; viewport: unknown }
    const originalFirstCell = project.grid!.cells[0]

    await store.saveActiveSession(project)
    project.grid!.cells[0] = 18
    project.projectName = '变更后的调用方名称'

    const restored = await store.loadActiveSession()
    const [record] = await readRawRecords(indexedDB, databaseName)
    expect(restored?.projectName).toBe('TASK-071 会话')
    expect(restored?.grid?.cells[0]).toBe(originalFirstCell)
    expect(record).not.toHaveProperty('selectedCell')
    expect(record).not.toHaveProperty('viewport')
    expect((record as { project: Record<string, unknown> }).project).not.toHaveProperty(
      'selectedCell',
    )
  })

  it('returns detached Grid cell storage that remains usable by Project operations', async () => {
    const { store } = createTestStore()
    const project = createProjectFixture()
    await store.saveActiveSession(project)

    const restored = (await store.loadActiveSession())!
    expect(restored.grid?.cells).not.toBe(project.grid?.cells)
    const changed = applyGridOperation(restored, {
      type: 'setCell',
      row: 0,
      column: 1,
      value: 42,
    })

    expect(changed.project.grid?.cells[1]).toBe(42)
    expect(project.grid?.cells[1]).toBe(1)
    expect(restored.revision).toBe(7)
  })

  it('clears only the active record, tolerates repeated clears, and can save again', async () => {
    const { store } = createTestStore()
    await store.saveActiveSession(createProjectFixture())

    await store.clearActiveSession()
    await store.clearActiveSession()
    await expect(store.loadActiveSession()).resolves.toBeNull()

    const replacement = createProjectFixture('清除后保存')
    await store.saveActiveSession(replacement)
    await expect(store.loadActiveSession()).resolves.toMatchObject({
      projectName: replacement.projectName,
    })
  })

  it('does not touch another IndexedDB database when clearing the session', async () => {
    const { indexedDB, store } = createTestStore()
    const otherDatabaseName = `task071-unrelated-${databaseSequence++}`
    const otherDatabase = await openDatabase(
      indexedDB,
      otherDatabaseName,
      ACTIVE_SESSION_DATABASE_VERSION,
    )
    const otherTransaction = otherDatabase.transaction(
      ACTIVE_SESSION_OBJECT_STORE_NAME,
      'readwrite',
    )
    const otherCompletion = new Promise<void>((resolve, reject) => {
      otherTransaction.addEventListener('complete', () => resolve(), { once: true })
      otherTransaction.addEventListener(
        'abort',
        () => reject(otherTransaction.error ?? new Error('Unrelated transaction aborted.')),
        { once: true },
      )
    })
    otherTransaction.objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME).put({
      id: 'unrelated-record',
      value: 'keep',
    })
    await otherCompletion
    otherDatabase.close()

    await store.saveActiveSession(createProjectFixture())
    await store.clearActiveSession()

    await expect(readRawRecords(indexedDB, otherDatabaseName)).resolves.toEqual([
      { id: 'unrelated-record', value: 'keep' },
    ])
  })

  it('rejects a Project with an incompatible Palette version before writing', async () => {
    const { indexedDB, databaseName, store } = createTestStore()
    const project = createProjectFixture()
    await store.saveActiveSession(project)
    const incompatible = {
      ...project,
      generation: { ...project.generation, paletteVersion: 'older-palette' },
    }

    await expect(store.saveActiveSession(incompatible)).rejects.toMatchObject({
      code: 'invalid-project',
    })
    await expect(store.loadActiveSession()).resolves.toMatchObject({
      projectName: project.projectName,
    })
    expect(await readRawRecords(indexedDB, databaseName)).toHaveLength(1)
  })

  it('rejects an incompatible Project schema version on save', async () => {
    const { store } = createTestStore()
    const project = {
      ...createProjectFixture(),
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION + 1,
    } as Project

    await expect(store.saveActiveSession(project)).rejects.toMatchObject({
      code: 'invalid-project',
    })
  })

  it.each([
    ['Project schema version', (snapshot: ProjectSnapshot) => ({ ...snapshot, schemaVersion: 99 })],
    [
      'unsupported Palette version',
      (snapshot: ProjectSnapshot) => ({
        ...snapshot,
        generation: { ...snapshot.generation, paletteVersion: 'unknown-palette' },
      }),
    ],
    [
      'Grid dimensions',
      (snapshot: ProjectSnapshot) => ({
        ...snapshot,
        grid: { ...snapshot.grid!, width: 15 },
      }),
    ],
    [
      'Grid and generation dimension mismatch',
      (snapshot: ProjectSnapshot) => ({
        ...snapshot,
        grid: { ...snapshot.grid!, width: 15, cells: new Uint16Array(15 * 16) },
      }),
    ],
    [
      'Grid cell length',
      (snapshot: ProjectSnapshot) => ({
        ...snapshot,
        grid: { ...snapshot.grid!, cells: new Uint16Array([1]) },
      }),
    ],
    [
      'Grid palette index range',
      (snapshot: ProjectSnapshot) => {
        const cells = snapshot.grid!.cells.slice()
        cells[0] = 65535
        return { ...snapshot, grid: { ...snapshot.grid!, cells } }
      },
    ],
    [
      'Blob type',
      (snapshot: ProjectSnapshot) => ({
        ...snapshot,
        source: { ...snapshot.source, originalImage: 'not a Blob' },
      }),
    ],
    [
      'required Project field',
      (snapshot: ProjectSnapshot) =>
        Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'projectName')),
    ],
  ])('rejects corrupted stored %s and preserves the source record', async (_label, mutate) => {
    const { indexedDB, databaseName, store } = createTestStore()
    const project = createProjectFixture()
    await store.saveActiveSession(project)
    const snapshot = serializeProjectSnapshot(project)
    await writeRawRecord(indexedDB, databaseName, {
      id: ACTIVE_SESSION_RECORD_KEY,
      schemaVersion: ACTIVE_SESSION_RECORD_SCHEMA_VERSION,
      project: mutate(snapshot),
    })

    await expect(store.loadActiveSession()).rejects.toMatchObject({ code: 'invalid-record' })
    expect(await readRawRecords(indexedDB, databaseName)).toHaveLength(1)
  })

  it('rejects an unsupported active-session record version without deleting it', async () => {
    const { indexedDB, databaseName, store } = createTestStore()
    const project = createProjectFixture()
    await store.saveActiveSession(project)
    await writeRawRecord(indexedDB, databaseName, {
      id: ACTIVE_SESSION_RECORD_KEY,
      schemaVersion: ACTIVE_SESSION_RECORD_SCHEMA_VERSION + 1,
      project: serializeProjectSnapshot(project),
    })

    await expect(store.loadActiveSession()).rejects.toBeInstanceOf(ActiveSessionStoreError)
    await expect(store.loadActiveSession()).rejects.toMatchObject({
      code: 'unsupported-record-version',
    })
    expect(await readRawRecords(indexedDB, databaseName)).toHaveLength(1)
  })

  it('rejects a malformed active-session envelope', async () => {
    const { indexedDB, databaseName, store } = createTestStore()
    await store.loadActiveSession()
    await writeRawRecord(indexedDB, databaseName, {
      id: ACTIVE_SESSION_RECORD_KEY,
      schemaVersion: ACTIVE_SESSION_RECORD_SCHEMA_VERSION,
      project: {},
      viewport: { zoom: 1 },
    })

    await expect(store.loadActiveSession()).rejects.toMatchObject({ code: 'invalid-record' })
  })

  it('propagates transaction abort and preserves the previous successful snapshot', async () => {
    const { store } = createTestStore()
    const first = createProjectFixture('旧的有效快照')
    const second = createProjectFixture('写入失败的新快照')
    await store.saveActiveSession(first)

    const originalPut = FakeIDBObjectStore.prototype.put
    const putSpy = vi.spyOn(FakeIDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: Parameters<IDBObjectStore['put']>[0],
      key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key)
      if (this.transaction.mode === 'readwrite') this.transaction.abort()
      return request
    })

    await expect(store.saveActiveSession(second)).rejects.toMatchObject({
      code: 'transaction-failed',
    })
    putSpy.mockRestore()

    await expect(store.loadActiveSession()).resolves.toMatchObject({
      projectName: first.projectName,
      revision: first.revision,
    })
    expect(second.projectName).toBe('写入失败的新快照')
    expect(second.revision).toBe(7)
  })

  it('propagates DataCloneError and leaves the database readable', async () => {
    const { store } = createTestStore()
    const cloneError = new DOMException('The value could not be cloned.', 'DataCloneError')
    const putSpy = vi.spyOn(FakeIDBObjectStore.prototype, 'put').mockImplementation(function () {
      throw cloneError
    })

    await expect(store.saveActiveSession(createProjectFixture())).rejects.toMatchObject({
      code: 'transaction-failed',
      cause: cloneError,
    })
    putSpy.mockRestore()
    await expect(store.loadActiveSession()).resolves.toBeNull()
  })

  it('reports unavailable IndexedDB instead of treating it as an empty database', async () => {
    const store = createActiveSessionStore({ indexedDB: null, databaseName: 'unavailable-test' })

    await expect(store.loadActiveSession()).rejects.toMatchObject({ code: 'unavailable' })
    await expect(store.saveActiveSession(createProjectFixture())).rejects.toMatchObject({
      code: 'unavailable',
    })
  })

  it('refuses a newer database version without deleting its data', async () => {
    const indexedDB = new IDBFactory()
    const databaseName = `task071-newer-db-${databaseSequence++}`
    const newerDatabase = await openDatabase(
      indexedDB,
      databaseName,
      ACTIVE_SESSION_DATABASE_VERSION + 1,
    )
    const transaction = newerDatabase.transaction(ACTIVE_SESSION_OBJECT_STORE_NAME, 'readwrite')
    const completed = new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true })
      transaction.addEventListener(
        'abort',
        () => reject(transaction.error ?? new Error('Newer database transaction aborted.')),
        { once: true },
      )
    })
    transaction.objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME).put({
      id: 'preserved-record',
      value: 'keep',
    })
    await completed
    newerDatabase.close()
    const store = createActiveSessionStore({ indexedDB, databaseName })

    await expect(store.loadActiveSession()).rejects.toMatchObject({
      code: 'incompatible-database-version',
    })
    const stillNewer = await openDatabase(
      indexedDB,
      databaseName,
      ACTIVE_SESSION_DATABASE_VERSION + 1,
    )
    expect(stillNewer.version).toBe(ACTIVE_SESSION_DATABASE_VERSION + 1)
    stillNewer.close()
    await expect(
      readRawRecords(indexedDB, databaseName, ACTIVE_SESSION_DATABASE_VERSION + 1),
    ).resolves.toEqual([{ id: 'preserved-record', value: 'keep' }])
    stores.push(store)
  })
})
