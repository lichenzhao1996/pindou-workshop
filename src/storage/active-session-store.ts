import { MARD_291_PALETTE_VERSION } from '../domain/palette/version'
import {
  assertValidProjectSnapshot,
  assertValidProjectSource,
  restoreProjectSnapshot,
  serializeProjectSnapshot,
} from '../domain/project/serialization'
import type {
  CropState,
  GenerationState,
  Project,
  ProjectSnapshot,
  Source,
} from '../domain/project'

export const ACTIVE_SESSION_DATABASE_NAME = 'pindou-workshop'
export const ACTIVE_SESSION_DATABASE_VERSION = 1
export const ACTIVE_SESSION_OBJECT_STORE_NAME = 'active-session'
export const ACTIVE_SESSION_RECORD_KEY = 'current'
export const LEGACY_ACTIVE_SESSION_RECORD_SCHEMA_VERSION = 1
export const ACTIVE_SESSION_RECORD_SCHEMA_VERSION = 2

export interface PendingUploadSnapshot {
  uploadId: string
  source: Source
}

export interface GenerationIntentSnapshot {
  intentId: string
  projectId: string
  sourceIdentity: string
  crop: CropState
  generation: GenerationState
  startedAt: string
  /** Optional for compatibility with already persisted v2 records. */
  autoRecoveryAttempted?: boolean
}

export interface ActiveSessionState {
  project: Project | null
  pendingUpload: PendingUploadSnapshot | null
  generationIntent: GenerationIntentSnapshot | null
}

interface LegacyActiveSessionRecord {
  id: typeof ACTIVE_SESSION_RECORD_KEY
  schemaVersion: typeof LEGACY_ACTIVE_SESSION_RECORD_SCHEMA_VERSION
  project: ProjectSnapshot
}

interface ActiveSessionRecord {
  id: typeof ACTIVE_SESSION_RECORD_KEY
  schemaVersion: typeof ACTIVE_SESSION_RECORD_SCHEMA_VERSION
  project: ProjectSnapshot | null
  pendingUpload: PendingUploadSnapshot | null
  generationIntent: GenerationIntentSnapshot | null
}

export type ActiveSessionStoreErrorCode =
  | 'unavailable'
  | 'database-open-failed'
  | 'incompatible-database-version'
  | 'invalid-project'
  | 'invalid-record'
  | 'unsupported-record-version'
  | 'transaction-failed'

export class ActiveSessionStoreError extends Error {
  constructor(
    readonly code: ActiveSessionStoreErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ActiveSessionStoreError'
  }
}

export interface ActiveSessionStore {
  saveActiveSession(project: Project): Promise<void>
  loadActiveSession(): Promise<Project | null>
  saveActiveSessionState(state: ActiveSessionState): Promise<void>
  loadActiveSessionState(): Promise<ActiveSessionState | null>
  clearActiveSession(): Promise<void>
  close(): Promise<void>
}

export interface ActiveSessionStoreOptions {
  /** Override the native factory to isolate storage instances in tests. */
  indexedDB?: IDBFactory | null
  /** Override the database name to isolate storage instances in tests. */
  databaseName?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === expected[index])
}

function isLegacyActiveSessionRecord(value: unknown): value is LegacyActiveSessionRecord {
  if (!isRecord(value)) return false

  return (
    hasExactKeys(value, ['id', 'project', 'schemaVersion']) &&
    value.id === ACTIVE_SESSION_RECORD_KEY &&
    value.schemaVersion === LEGACY_ACTIVE_SESSION_RECORD_SCHEMA_VERSION
  )
}

function isActiveSessionRecord(value: unknown): value is ActiveSessionRecord {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['generationIntent', 'id', 'pendingUpload', 'project', 'schemaVersion']) &&
    value.id === ACTIVE_SESSION_RECORD_KEY &&
    value.schemaVersion === ACTIVE_SESSION_RECORD_SCHEMA_VERSION
  )
}

/** Project identity plus source metadata ties a persisted intent to its formal input. */
export function createProjectSourceIdentity(project: Project): string {
  const source = project.source
  return JSON.stringify([
    project.projectId,
    source.originalFileName,
    source.mimeType,
    source.originalWidth,
    source.originalHeight,
    source.originalImage.type,
    source.originalImage.size,
  ])
}

function validatePendingUpload(value: unknown): asserts value is PendingUploadSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ['source', 'uploadId'])) {
    throw new TypeError('Pending upload snapshot has an invalid structure')
  }
  if (typeof value.uploadId !== 'string' || !value.uploadId.trim()) {
    throw new TypeError('Pending upload uploadId must not be empty')
  }
  assertValidProjectSource(value.source)
}

function copySource(source: Source): Source {
  return {
    originalImage: source.originalImage,
    originalFileName: source.originalFileName,
    mimeType: source.mimeType,
    originalWidth: source.originalWidth,
    originalHeight: source.originalHeight,
  }
}

function sameCrop(left: CropState, right: CropState): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.rotation === right.rotation &&
    left.aspectRatio === right.aspectRatio
  )
}

function sameGeneration(left: GenerationState, right: GenerationState): boolean {
  return (
    left.widthBeads === right.widthBeads &&
    left.heightBeads === right.heightBeads &&
    left.beadSizeMm === right.beadSizeMm &&
    left.mode === right.mode &&
    left.paletteVersion === right.paletteVersion &&
    left.algorithmVersion === right.algorithmVersion
  )
}

function validateGenerationIntent(
  value: unknown,
  project: Project,
): asserts value is GenerationIntentSnapshot {
  if (
    !isRecord(value) ||
    !(
      hasExactKeys(value, [
        'crop',
        'generation',
        'intentId',
        'projectId',
        'sourceIdentity',
        'startedAt',
      ]) ||
      hasExactKeys(value, [
        'autoRecoveryAttempted',
        'crop',
        'generation',
        'intentId',
        'projectId',
        'sourceIdentity',
        'startedAt',
      ])
    )
  ) {
    throw new TypeError('Generation intent has an invalid structure')
  }
  if (
    typeof value.intentId !== 'string' ||
    !value.intentId.trim() ||
    value.projectId !== project.projectId ||
    value.sourceIdentity !== createProjectSourceIdentity(project) ||
    typeof value.startedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    (value.autoRecoveryAttempted !== undefined &&
      typeof value.autoRecoveryAttempted !== 'boolean') ||
    !isRecord(value.crop) ||
    !isRecord(value.generation) ||
    !hasExactKeys(value.crop, ['aspectRatio', 'height', 'rotation', 'width', 'x', 'y']) ||
    !hasExactKeys(value.generation, [
      'algorithmVersion',
      'beadSizeMm',
      'heightBeads',
      'mode',
      'paletteVersion',
      'widthBeads',
    ]) ||
    !sameCrop(value.crop as unknown as CropState, project.crop) ||
    !sameGeneration(value.generation as unknown as GenerationState, project.generation)
  ) {
    throw new TypeError('Generation intent does not match its formal Project inputs')
  }
}

export function createGenerationIntentSnapshot(
  project: Project,
  intentId: string,
  startedAt: Date = new Date(),
  autoRecoveryAttempted = false,
): GenerationIntentSnapshot {
  return {
    intentId,
    projectId: project.projectId,
    sourceIdentity: createProjectSourceIdentity(project),
    crop: { ...project.crop },
    generation: { ...project.generation },
    startedAt: startedAt.toISOString(),
    autoRecoveryAttempted,
  }
}

function assertCompatibleProject(snapshot: ProjectSnapshot): void {
  if (!snapshot.projectId.trim()) {
    throw new TypeError('Project snapshot projectId must not be empty')
  }
  if (snapshot.generation.paletteVersion !== MARD_291_PALETTE_VERSION) {
    throw new RangeError(
      `Project Palette version ${snapshot.generation.paletteVersion} is not supported`,
    )
  }
  if (
    snapshot.grid &&
    (snapshot.grid.width !== snapshot.generation.widthBeads ||
      snapshot.grid.height !== snapshot.generation.heightBeads)
  ) {
    throw new RangeError('Project Grid dimensions do not match its generation settings')
  }
}

function serializeProject(project: Project): ProjectSnapshot {
  try {
    const snapshot = serializeProjectSnapshot(project)
    assertCompatibleProject(snapshot)
    return snapshot
  } catch (cause) {
    throw new ActiveSessionStoreError(
      'invalid-project',
      'The Project cannot be saved as an active session.',
      cause,
    )
  }
}

function createRecord(state: ActiveSessionState): ActiveSessionRecord {
  if (!state.project && !state.pendingUpload && !state.generationIntent) {
    throw new ActiveSessionStoreError(
      'invalid-record',
      'An empty active-session record must be cleared instead of saved.',
    )
  }
  let project: ProjectSnapshot | null = null
  if (state.project) project = serializeProject(state.project)

  let pendingUpload: PendingUploadSnapshot | null = null
  if (state.pendingUpload) {
    try {
      validatePendingUpload(state.pendingUpload)
      pendingUpload = {
        uploadId: state.pendingUpload.uploadId,
        source: copySource(state.pendingUpload.source),
      }
    } catch (cause) {
      throw new ActiveSessionStoreError(
        'invalid-record',
        'The pending upload cannot be saved as an active session.',
        cause,
      )
    }
  }

  let generationIntent: GenerationIntentSnapshot | null = null
  if (state.generationIntent) {
    if (!state.project) {
      throw new ActiveSessionStoreError(
        'invalid-record',
        'A generation intent requires a formal Project.',
      )
    }
    try {
      validateGenerationIntent(state.generationIntent, state.project)
      generationIntent = {
        ...state.generationIntent,
        crop: { ...state.generationIntent.crop },
        generation: { ...state.generationIntent.generation },
      }
    } catch (cause) {
      throw new ActiveSessionStoreError(
        'invalid-record',
        'The generation intent does not match its formal Project.',
        cause,
      )
    }
  }

  return {
    id: ACTIVE_SESSION_RECORD_KEY,
    schemaVersion: ACTIVE_SESSION_RECORD_SCHEMA_VERSION,
    project,
    pendingUpload,
    generationIntent,
  }
}

function restoreProject(value: unknown): Project {
  try {
    assertValidProjectSnapshot(value)
    assertCompatibleProject(value)
    return restoreProjectSnapshot(value)
  } catch (cause) {
    throw new ActiveSessionStoreError(
      'invalid-record',
      'The active-session Project snapshot is invalid or incompatible.',
      cause,
    )
  }
}

function restoreRecord(value: unknown): ActiveSessionState {
  if (isLegacyActiveSessionRecord(value)) {
    return {
      project: restoreProject(value.project),
      pendingUpload: null,
      generationIntent: null,
    }
  }
  if (
    isRecord(value) &&
    value.id === ACTIVE_SESSION_RECORD_KEY &&
    value.schemaVersion !== 1 &&
    value.schemaVersion !== 2
  ) {
    throw new ActiveSessionStoreError(
      'unsupported-record-version',
      `Active-session record schemaVersion ${value.schemaVersion} is not supported.`,
    )
  }
  if (!isActiveSessionRecord(value)) {
    throw new ActiveSessionStoreError(
      'invalid-record',
      'The active-session record has an invalid structure.',
    )
  }
  if (value.project === null && value.pendingUpload === null) {
    throw new ActiveSessionStoreError(
      'invalid-record',
      'An empty active-session record is invalid.',
    )
  }
  try {
    const project = value.project === null ? null : restoreProject(value.project)
    if (value.pendingUpload !== null) validatePendingUpload(value.pendingUpload)
    if (value.generationIntent !== null) {
      if (!project) throw new TypeError('Generation intent requires a formal Project')
      validateGenerationIntent(value.generationIntent, project)
    }
    return {
      project,
      pendingUpload:
        value.pendingUpload === null
          ? null
          : {
              uploadId: value.pendingUpload.uploadId,
              source: copySource(value.pendingUpload.source),
            },
      generationIntent:
        value.generationIntent === null
          ? null
          : {
              ...value.generationIntent,
              autoRecoveryAttempted: value.generationIntent.autoRecoveryAttempted ?? false,
              crop: { ...value.generationIntent.crop },
              generation: { ...value.generationIntent.generation },
            },
    }
  } catch (cause) {
    throw new ActiveSessionStoreError(
      'invalid-record',
      'The active-session record contains invalid or incompatible data.',
      cause,
    )
  }
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener(
      'abort',
      () =>
        reject(
          transaction.error ?? new DOMException('IndexedDB transaction aborted.', 'AbortError'),
        ),
      { once: true },
    )
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed.')),
      { once: true },
    )
  })
}

function transactionError(action: string, cause: unknown): ActiveSessionStoreError {
  return new ActiveSessionStoreError(
    'transaction-failed',
    `IndexedDB could not ${action} the active session.`,
    cause,
  )
}

export function createActiveSessionStore(
  options: ActiveSessionStoreOptions = {},
): ActiveSessionStore {
  const databaseName = options.databaseName ?? ACTIVE_SESSION_DATABASE_NAME
  let databasePromise: Promise<IDBDatabase> | undefined

  function openDatabase(): Promise<IDBDatabase> {
    let indexedDBFactory: IDBFactory | null | undefined
    try {
      indexedDBFactory = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB
    } catch (cause) {
      return Promise.reject(
        new ActiveSessionStoreError(
          'unavailable',
          'IndexedDB is unavailable in this environment.',
          cause,
        ),
      )
    }
    if (!indexedDBFactory) {
      return Promise.reject(
        new ActiveSessionStoreError('unavailable', 'IndexedDB is unavailable in this environment.'),
      )
    }
    if (!databaseName.trim()) {
      return Promise.reject(
        new ActiveSessionStoreError('database-open-failed', 'The IndexedDB name is invalid.'),
      )
    }

    let request: IDBOpenDBRequest
    try {
      request = indexedDBFactory.open(databaseName, ACTIVE_SESSION_DATABASE_VERSION)
    } catch (cause) {
      return Promise.reject(
        new ActiveSessionStoreError(
          'database-open-failed',
          'The active-session database could not be opened.',
          cause,
        ),
      )
    }

    return new Promise((resolve, reject) => {
      let settled = false
      let upgradeError: Error | undefined

      const rejectOpen = (error: ActiveSessionStoreError) => {
        if (settled) return
        settled = true
        reject(error)
      }

      request.addEventListener('upgradeneeded', () => {
        const database = request.result
        const transaction = request.transaction
        if (!database.objectStoreNames.contains(ACTIVE_SESSION_OBJECT_STORE_NAME)) {
          database.createObjectStore(ACTIVE_SESSION_OBJECT_STORE_NAME, { keyPath: 'id' })
          return
        }

        const objectStore = transaction?.objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME)
        if (!objectStore || objectStore.keyPath !== 'id' || objectStore.autoIncrement) {
          upgradeError = new Error(
            'The active-session object store has an incompatible key schema.',
          )
          transaction?.abort()
        }
      })

      request.addEventListener('blocked', () => {
        rejectOpen(
          new ActiveSessionStoreError(
            'database-open-failed',
            'Opening the active-session database is blocked by another connection.',
          ),
        )
      })

      request.addEventListener('error', () => {
        const error = request.error
        rejectOpen(
          new ActiveSessionStoreError(
            error?.name === 'VersionError'
              ? 'incompatible-database-version'
              : 'database-open-failed',
            error?.name === 'VersionError'
              ? 'The active-session database has a newer unsupported version.'
              : 'The active-session database could not be opened.',
            upgradeError ?? error,
          ),
        )
      })

      request.addEventListener('success', () => {
        const database = request.result
        if (settled) {
          database.close()
          return
        }
        if (!database.objectStoreNames.contains(ACTIVE_SESSION_OBJECT_STORE_NAME)) {
          database.close()
          rejectOpen(
            new ActiveSessionStoreError(
              'database-open-failed',
              'The active-session object store is missing.',
            ),
          )
          return
        }

        const transaction = database.transaction(ACTIVE_SESSION_OBJECT_STORE_NAME, 'readonly')
        const objectStore = transaction.objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME)
        if (objectStore.keyPath !== 'id' || objectStore.autoIncrement) {
          database.close()
          rejectOpen(
            new ActiveSessionStoreError(
              'database-open-failed',
              'The active-session object store has an incompatible key schema.',
            ),
          )
          return
        }

        database.onversionchange = () => {
          database.close()
          databasePromise = undefined
        }
        settled = true
        resolve(database)
      })
    })
  }

  function getDatabase(): Promise<IDBDatabase> {
    if (!databasePromise) {
      databasePromise = openDatabase().catch((error: unknown) => {
        databasePromise = undefined
        throw error
      })
    }
    return databasePromise
  }

  async function saveActiveSessionState(state: ActiveSessionState): Promise<void> {
    const record = createRecord(state)
    const database = await getDatabase()
    let transaction: IDBTransaction | undefined
    let completion: Promise<void> | undefined

    try {
      transaction = database.transaction(ACTIVE_SESSION_OBJECT_STORE_NAME, 'readwrite')
      completion = transactionCompletion(transaction)
      transaction.objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME).put(record)
      await completion
    } catch (cause) {
      if (transaction) {
        try {
          transaction.abort()
        } catch {
          // The transaction may already have aborted or completed.
        }
      }
      await completion?.catch(() => undefined)
      throw transactionError('save', cause)
    }
  }

  async function loadActiveSession(): Promise<Project | null> {
    return (await loadActiveSessionState())?.project ?? null
  }

  async function loadActiveSessionState(): Promise<ActiveSessionState | null> {
    const database = await getDatabase()
    let transaction: IDBTransaction | undefined
    let completion: Promise<void> | undefined
    try {
      transaction = database.transaction(ACTIVE_SESSION_OBJECT_STORE_NAME, 'readonly')
      completion = transactionCompletion(transaction)
      const request = transaction
        .objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME)
        .get(ACTIVE_SESSION_RECORD_KEY)
      const [record] = await Promise.all([requestResult(request), completion])
      if (record === undefined) return null
      return restoreRecord(record)
    } catch (cause) {
      if (cause instanceof ActiveSessionStoreError) throw cause
      try {
        transaction?.abort()
      } catch {
        // The transaction may already have aborted or completed.
      }
      await completion?.catch(() => undefined)
      throw transactionError('read', cause)
    }
  }

  async function saveActiveSession(project: Project): Promise<void> {
    await saveActiveSessionState({ project, pendingUpload: null, generationIntent: null })
  }

  async function clearActiveSession(): Promise<void> {
    const database = await getDatabase()
    let transaction: IDBTransaction | undefined
    let completion: Promise<void> | undefined
    try {
      transaction = database.transaction(ACTIVE_SESSION_OBJECT_STORE_NAME, 'readwrite')
      completion = transactionCompletion(transaction)
      transaction.objectStore(ACTIVE_SESSION_OBJECT_STORE_NAME).delete(ACTIVE_SESSION_RECORD_KEY)
      await completion
    } catch (cause) {
      if (transaction) {
        try {
          transaction.abort()
        } catch {
          // The transaction may already have aborted or completed.
        }
      }
      await completion?.catch(() => undefined)
      throw transactionError('clear', cause)
    }
  }

  async function close(): Promise<void> {
    const currentDatabasePromise = databasePromise
    databasePromise = undefined
    if (!currentDatabasePromise) return
    try {
      const database = await currentDatabasePromise
      database.close()
    } catch {
      // A failed open has no connection to release.
    }
  }

  return {
    saveActiveSession,
    loadActiveSession,
    saveActiveSessionState,
    loadActiveSessionState,
    clearActiveSession,
    close,
  }
}

const defaultActiveSessionStore = createActiveSessionStore()

export const saveActiveSession = (project: Project) =>
  defaultActiveSessionStore.saveActiveSession(project)
export const loadActiveSession = () => defaultActiveSessionStore.loadActiveSession()
export const saveActiveSessionState = (state: ActiveSessionState) =>
  defaultActiveSessionStore.saveActiveSessionState(state)
export const loadActiveSessionState = () => defaultActiveSessionStore.loadActiveSessionState()
export const clearActiveSession = () => defaultActiveSessionStore.clearActiveSession()
export const closeActiveSessionStore = () => defaultActiveSessionStore.close()
