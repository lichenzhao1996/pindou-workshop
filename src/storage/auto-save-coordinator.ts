import { reactive } from 'vue'
import type { Project, Source } from '../domain/project'
import {
  createGenerationIntentSnapshot,
  createProjectSourceIdentity,
  createActiveSessionStore,
  type ActiveSessionState,
  type ActiveSessionStore,
  type GenerationIntentSnapshot,
} from './active-session-store'

export const AUTO_SAVE_DEBOUNCE_MS = 450
const AUTO_SAVE_MAX_WAIT_MS = 1500

export interface AutoSaveStatus {
  isSaving: boolean
  isDirty: boolean
  errorMessage: string | null
  lastSavedAt: number | null
}

export interface AutoSaveCoordinator {
  readonly status: AutoSaveStatus
  stagePendingUpload(uploadId: string, source: Source): Promise<boolean>
  clearPendingUpload(uploadId: string): Promise<boolean>
  saveProject(project: Project, options?: { immediate?: boolean }): Promise<boolean>
  startGeneration(project: Project, intentId: string): Promise<boolean>
  finishGeneration(project: Project, intentId: string): Promise<boolean>
  clearGenerationIntent(intentId: string): Promise<boolean>
  retry(): Promise<boolean>
  flush(): Promise<boolean>
  close(): Promise<void>
}

export interface AutoSaveCoordinatorOptions {
  /** Keeps component/unit tests without a browser IDB implementation isolated. */
  skipInTestWithoutIndexedDB?: boolean
}

const EMPTY_SESSION: ActiveSessionState = {
  project: null,
  pendingUpload: null,
  generationIntent: null,
}

function sourceMatches(left: Source, right: Source): boolean {
  return (
    left.originalImage === right.originalImage &&
    left.originalFileName === right.originalFileName &&
    left.mimeType === right.mimeType &&
    left.originalWidth === right.originalWidth &&
    left.originalHeight === right.originalHeight
  )
}

function intentMatchesProject(intent: GenerationIntentSnapshot, project: Project): boolean {
  return (
    intent.projectId === project.projectId &&
    intent.sourceIdentity === createProjectSourceIdentity(project) &&
    JSON.stringify(intent.crop) === JSON.stringify(project.crop) &&
    JSON.stringify(intent.generation) === JSON.stringify(project.generation)
  )
}

function errorText(error: unknown): string {
  const detail = error instanceof Error ? error.message : '未知存储错误'
  return `当前修改尚未成功保存，刷新页面可能丢失最新更改。(${detail})`
}

export function createAutoSaveCoordinator(
  store: ActiveSessionStore = createActiveSessionStore(),
  debounceMs = AUTO_SAVE_DEBOUNCE_MS,
  options: AutoSaveCoordinatorOptions = {},
): AutoSaveCoordinator {
  const status = reactive<AutoSaveStatus>({
    isSaving: false,
    isDirty: false,
    errorMessage: null,
    lastSavedAt: null,
  })

  let session: ActiveSessionState | undefined
  let loadPromise: Promise<void> | undefined
  let serialQueue: Promise<unknown> = Promise.resolve()
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined
  let dirtyVersion = 0
  const deferredMutations: Array<(current: ActiveSessionState) => ActiveSessionState | null> = []

  function shouldSkipPersistence(): boolean {
    return Boolean(
      options.skipInTestWithoutIndexedDB &&
      import.meta.env.MODE === 'test' &&
      typeof globalThis.indexedDB === 'undefined',
    )
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = serialQueue.then(operation, operation)
    serialQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async function ensureLoaded(): Promise<void> {
    if (session) return
    if (!loadPromise) {
      loadPromise = store
        .loadActiveSessionState()
        .then((loaded) => {
          session = loaded ?? { ...EMPTY_SESSION }
        })
        .catch((error: unknown) => {
          loadPromise = undefined
          throw error
        })
    }
    await loadPromise
  }

  function clearTimers(): void {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer)
    if (maxWaitTimer !== undefined) clearTimeout(maxWaitTimer)
    debounceTimer = undefined
    maxWaitTimer = undefined
  }

  async function writeLatest(): Promise<boolean> {
    await ensureLoaded()
    const current = session!
    const version = dirtyVersion
    status.isSaving = true
    try {
      if (!current.project && !current.pendingUpload && !current.generationIntent) {
        await store.clearActiveSession()
      } else {
        await store.saveActiveSessionState(current)
      }
      if (version === dirtyVersion) {
        status.isDirty = false
        status.errorMessage = null
        status.lastSavedAt = Date.now()
      }
      return true
    } catch (error) {
      status.isDirty = true
      status.errorMessage = errorText(error)
      return false
    } finally {
      status.isSaving = false
    }
  }

  function scheduleFlush(): void {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      if (maxWaitTimer !== undefined) clearTimeout(maxWaitTimer)
      maxWaitTimer = undefined
      void enqueue(writeLatest)
    }, debounceMs)
    if (maxWaitTimer === undefined) {
      maxWaitTimer = setTimeout(
        () => {
          maxWaitTimer = undefined
          if (debounceTimer !== undefined) clearTimeout(debounceTimer)
          debounceTimer = undefined
          void enqueue(writeLatest)
        },
        Math.max(debounceMs, AUTO_SAVE_MAX_WAIT_MS),
      )
    }
  }

  function markChanged(): void {
    dirtyVersion += 1
    status.isDirty = true
    status.errorMessage = null
  }

  async function mutate(
    update: (current: ActiveSessionState) => ActiveSessionState | null,
    immediate: boolean,
  ): Promise<boolean> {
    return enqueue(async () => {
      try {
        await ensureLoaded()
      } catch (error) {
        deferredMutations.push(update)
        status.isDirty = true
        status.errorMessage = errorText(error)
        return false
      }
      const next = update(session!)
      if (!next) return false
      session = next
      markChanged()
      if (immediate) {
        clearTimers()
        return writeLatest()
      }
      scheduleFlush()
      return true
    })
  }

  function stagePendingUpload(uploadId: string, source: Source): Promise<boolean> {
    if (shouldSkipPersistence()) return Promise.resolve(true)
    return mutate((current) => {
      return {
        ...current,
        pendingUpload: { uploadId, source: { ...source } },
      }
    }, true)
  }

  function clearPendingUpload(uploadId: string): Promise<boolean> {
    if (shouldSkipPersistence()) return Promise.resolve(true)
    return mutate((current) => {
      if (!current.pendingUpload || current.pendingUpload.uploadId !== uploadId) return null
      return { ...current, pendingUpload: null }
    }, true)
  }

  function saveProject(project: Project, options: { immediate?: boolean } = {}): Promise<boolean> {
    if (shouldSkipPersistence()) return Promise.resolve(true)
    const immediate = options.immediate ?? false
    return mutate((current) => {
      const replaced = current.project?.projectId !== project.projectId
      const pendingUpload =
        current.pendingUpload && sourceMatches(current.pendingUpload.source, project.source)
          ? null
          : current.pendingUpload
      const generationIntent =
        !replaced &&
        current.generationIntent &&
        intentMatchesProject(current.generationIntent, project)
          ? current.generationIntent
          : null
      return { ...current, project, pendingUpload, generationIntent }
    }, immediate)
  }

  function startGeneration(project: Project, intentId: string): Promise<boolean> {
    if (shouldSkipPersistence()) return Promise.resolve(true)
    return mutate(
      (current) => ({
        ...current,
        project,
        generationIntent: createGenerationIntentSnapshot(project, intentId),
      }),
      true,
    )
  }

  function finishGeneration(project: Project, intentId: string): Promise<boolean> {
    if (shouldSkipPersistence()) return Promise.resolve(true)
    return mutate((current) => {
      const intent = current.generationIntent
      if (
        !intent ||
        intent.intentId !== intentId ||
        !intentMatchesProject(intent, project) ||
        current.project?.projectId !== project.projectId
      ) {
        return null
      }
      return { ...current, project, generationIntent: null }
    }, true)
  }

  function clearGenerationIntent(intentId: string): Promise<boolean> {
    if (shouldSkipPersistence()) return Promise.resolve(true)
    return mutate((current) => {
      if (current.generationIntent?.intentId !== intentId) return null
      return { ...current, generationIntent: null }
    }, true)
  }

  function flush(): Promise<boolean> {
    clearTimers()
    return enqueue(async () => {
      try {
        return await writeLatest()
      } catch (error) {
        status.isDirty = true
        status.errorMessage = errorText(error)
        return false
      }
    })
  }

  function retry(): Promise<boolean> {
    clearTimers()
    return enqueue(async () => {
      if (!status.isDirty) return true
      try {
        if (!session) {
          loadPromise = undefined
          await ensureLoaded()
        }
      } catch (error) {
        status.errorMessage = errorText(error)
        return false
      }
      if (deferredMutations.length > 0) {
        let next = session!
        for (const update of deferredMutations.splice(0)) {
          const changed = update(next)
          if (changed) next = changed
        }
        session = next
        dirtyVersion += 1
      }
      return writeLatest()
    })
  }

  async function close(): Promise<void> {
    clearTimers()
    await serialQueue
    await store.close()
  }

  return {
    status,
    stagePendingUpload,
    clearPendingUpload,
    saveProject,
    startGeneration,
    finishGeneration,
    clearGenerationIntent,
    retry,
    flush,
    close,
  }
}

export const autoSaveCoordinator = createAutoSaveCoordinator(undefined, undefined, {
  skipInTestWithoutIndexedDB: true,
})
export const autoSaveStatus = autoSaveCoordinator.status
export const retryAutoSave = () => autoSaveCoordinator.retry()
