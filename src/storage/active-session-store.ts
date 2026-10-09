import { MARD_291_PALETTE_VERSION } from '../domain/palette/version'
import {
  assertValidProjectSnapshot,
  restoreProjectSnapshot,
  serializeProjectSnapshot,
} from '../domain/project/serialization'
import type { Project, ProjectSnapshot } from '../domain/project'

export const ACTIVE_SESSION_DATABASE_NAME = 'pindou-workshop'
export const ACTIVE_SESSION_DATABASE_VERSION = 1
export const ACTIVE_SESSION_OBJECT_STORE_NAME = 'active-session'
export const ACTIVE_SESSION_RECORD_KEY = 'current'
export const ACTIVE_SESSION_RECORD_SCHEMA_VERSION = 1

interface ActiveSessionRecord {
  id: typeof ACTIVE_SESSION_RECORD_KEY
  schemaVersion: number
  project: ProjectSnapshot
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

function isActiveSessionRecord(value: unknown): value is ActiveSessionRecord {
  if (!isRecord(value)) return false

  const keys = Object.keys(value).sort()
  return (
    keys.length === 3 &&
    keys[0] === 'id' &&
    keys[1] === 'project' &&
    keys[2] === 'schemaVersion' &&
    value.id === ACTIVE_SESSION_RECORD_KEY &&
    typeof value.schemaVersion === 'number'
  )
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

function createRecord(project: Project): ActiveSessionRecord {
  let snapshot: ProjectSnapshot
  try {
    snapshot = serializeProjectSnapshot(project)
    assertCompatibleProject(snapshot)
  } catch (cause) {
    throw new ActiveSessionStoreError(
      'invalid-project',
      'The Project cannot be saved as an active session.',
      cause,
    )
  }

  return {
    id: ACTIVE_SESSION_RECORD_KEY,
    schemaVersion: ACTIVE_SESSION_RECORD_SCHEMA_VERSION,
    project: snapshot,
  }
}

function restoreRecord(value: unknown): Project {
  if (!isActiveSessionRecord(value)) {
    throw new ActiveSessionStoreError(
      'invalid-record',
      'The active-session record has an invalid structure.',
    )
  }
  if (value.schemaVersion !== ACTIVE_SESSION_RECORD_SCHEMA_VERSION) {
    throw new ActiveSessionStoreError(
      'unsupported-record-version',
      `Active-session record schemaVersion ${value.schemaVersion} is not supported.`,
    )
  }

  try {
    assertValidProjectSnapshot(value.project)
    assertCompatibleProject(value.project)
    return restoreProjectSnapshot(value.project)
  } catch (cause) {
    throw new ActiveSessionStoreError(
      'invalid-record',
      'The active-session Project snapshot is invalid or incompatible.',
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

  async function saveActiveSession(project: Project): Promise<void> {
    const record = createRecord(project)
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

  return { saveActiveSession, loadActiveSession, clearActiveSession, close }
}

const defaultActiveSessionStore = createActiveSessionStore()

export const saveActiveSession = (project: Project) =>
  defaultActiveSessionStore.saveActiveSession(project)
export const loadActiveSession = () => defaultActiveSessionStore.loadActiveSession()
export const clearActiveSession = () => defaultActiveSessionStore.clearActiveSession()
export const closeActiveSessionStore = () => defaultActiveSessionStore.close()
