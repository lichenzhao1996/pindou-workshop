import type { Pinia } from 'pinia'
import { reactive } from 'vue'
import { useEditorStore } from './stores/editorStore'
import { useProjectStore } from './stores/projectStore'
import { useUploadStore } from './stores/uploadStore'
import {
  clearActiveSession,
  createProjectSourceIdentity,
  loadActiveSessionState,
  type ActiveSessionState,
  type GenerationIntentSnapshot,
} from '../storage/active-session-store'
import { autoSaveCoordinator } from '../storage/auto-save-coordinator'
import {
  decodeImageDimensions,
  inspectImageInput,
  type ImageDimensionDecoder,
  type ImageInputInspection,
} from '../features/upload/input'
import type { Project, Source } from '../domain/project'

export type SessionRecoveryStatus = 'loading' | 'ready' | 'error'

export const sessionRecoveryState = reactive<{
  status: SessionRecoveryStatus
  session: ActiveSessionState | null
  errorMessage: string | null
  generationError: string | null
  discarding: boolean
}>({
  status: 'loading',
  session: null,
  errorMessage: null,
  generationError: null,
  discarding: false,
})

let activePinia: Pinia | null = null
let recoverySequence = 0
let recoveryPromise: Promise<boolean> | null = null
interface SessionRecoveryDependencies {
  loadSession: typeof loadActiveSessionState
  clearSession: typeof clearActiveSession
  markGenerationAttempt: typeof autoSaveCoordinator.markGenerationIntentAutoRecoveryAttempted
  decodeImage: ImageDimensionDecoder
}

const defaultDependencies: SessionRecoveryDependencies = {
  loadSession: loadActiveSessionState,
  clearSession: clearActiveSession,
  markGenerationAttempt: autoSaveCoordinator.markGenerationIntentAutoRecoveryAttempted,
  decodeImage: decodeImageDimensions,
}
let dependencies: SessionRecoveryDependencies = defaultDependencies

function friendlyRecoveryError(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'ActiveSessionStoreError') {
    const code = (error as { code?: string }).code
    if (code === 'unavailable') return '当前浏览器无法使用本地存储，暂时不能安全恢复作品。'
    if (code === 'incompatible-database-version') {
      return '本地作品由较新版本保存，当前版本无法安全读取。'
    }
  }
  if (error instanceof Error && error.message.startsWith('RECOVERY_SOURCE:')) {
    return '保存的原图无法读取或图片信息不匹配。原记录未删除。'
  }
  return '本地作品数据不完整或与当前版本不兼容，无法安全恢复。原记录未删除。'
}

async function inspectStoredSource(
  source: Source,
): Promise<Exclude<ImageInputInspection, null> & { status: 'valid' }> {
  const inspected = await inspectImageInput(
    source.originalImage,
    source.originalFileName,
    dependencies.decodeImage,
  )
  if (
    !inspected ||
    inspected.status !== 'valid' ||
    inspected.input.mimeType !== source.mimeType ||
    inspected.dimensions.width !== source.originalWidth ||
    inspected.dimensions.height !== source.originalHeight
  ) {
    throw new Error('RECOVERY_SOURCE: persisted source could not be verified')
  }
  return inspected
}

async function restoreSession(pinia: Pinia, sequence: number): Promise<boolean> {
  sessionRecoveryState.status = 'loading'
  sessionRecoveryState.errorMessage = null
  sessionRecoveryState.generationError = null
  try {
    const session = await dependencies.loadSession()
    const projectSource = session?.project
      ? await inspectStoredSource(session.project.source)
      : null
    const pendingSource = session?.pendingUpload
      ? await inspectStoredSource(session.pendingUpload.source)
      : null

    if (sequence !== recoverySequence) return false

    const projectStore = useProjectStore(pinia)
    const uploadStore = useUploadStore(pinia)
    useEditorStore(pinia)
    projectStore.hydrateCurrentProject(session?.project ?? null)
    uploadStore.clearPendingInput()

    if (session?.pendingUpload && pendingSource?.status === 'valid') {
      uploadStore.setPendingInput(
        pendingSource.input,
        pendingSource.warnings,
        pendingSource.dimensions,
        session.pendingUpload.uploadId,
      )
    } else if (session?.project && projectSource?.status === 'valid') {
      // The Project source is available on Crop, but is not a pending new upload.
      uploadStore.setPendingInput(
        projectSource.input,
        projectSource.warnings,
        projectSource.dimensions,
        null,
      )
    }

    sessionRecoveryState.session = session
    sessionRecoveryState.status = 'ready'
    sessionRecoveryState.errorMessage = null
    return true
  } catch (error) {
    if (sequence !== recoverySequence) return false
    sessionRecoveryState.status = 'error'
    sessionRecoveryState.errorMessage = friendlyRecoveryError(error)
    // Deliberately do not hydrate partial data or write/clear the record.
    return false
  }
}

export function initializeSessionRecovery(
  pinia: Pinia,
  overrides: Partial<SessionRecoveryDependencies> = {},
): Promise<boolean> {
  activePinia = pinia
  dependencies = { ...defaultDependencies, ...overrides }
  if (recoveryPromise) return recoveryPromise
  const sequence = ++recoverySequence
  recoveryPromise = restoreSession(pinia, sequence).finally(() => {
    recoveryPromise = null
  })
  return recoveryPromise
}

export async function retrySessionRecovery(): Promise<boolean> {
  if (!activePinia || sessionRecoveryState.status === 'loading') return false
  const sequence = ++recoverySequence
  return restoreSession(activePinia, sequence)
}

export function resolveInitialSessionRoute(
  path: string,
  session: ActiveSessionState | null,
): string {
  const hasPending = Boolean(session?.pendingUpload)
  const project = session?.project ?? null
  const hasUnattemptedIntent = Boolean(
    session?.generationIntent && !session.generationIntent.autoRecoveryAttempted,
  )

  if (hasPending) return '/crop'
  if (path === '/crop') return project ? '/crop' : '/'
  if (path === '/editor') {
    if (project?.grid && !hasUnattemptedIntent) return '/editor'
    if (project) return '/crop'
    return '/'
  }
  if (project && (hasUnattemptedIntent || !project.grid)) return '/crop'
  if (project?.grid) return '/editor'
  return '/'
}

function intentMatchesProject(intent: GenerationIntentSnapshot, project: Project): boolean {
  return (
    intent.projectId === project.projectId &&
    intent.sourceIdentity === createProjectSourceIdentity(project) &&
    JSON.stringify(intent.crop) === JSON.stringify(project.crop) &&
    JSON.stringify(intent.generation) === JSON.stringify(project.generation)
  )
}

/** Starts at most one persisted automatic resume for the currently hydrated intent. */
export async function resumeDeferredGenerationIntent(
  onSuccess?: () => Promise<unknown>,
): Promise<boolean> {
  const pinia = activePinia
  const session = sessionRecoveryState.session
  const intent = session?.generationIntent
  if (
    !pinia ||
    !intent ||
    intent.autoRecoveryAttempted ||
    sessionRecoveryState.status !== 'ready'
  ) {
    return false
  }

  const projectStore = useProjectStore(pinia)
  const uploadStore = useUploadStore(pinia)
  const project = projectStore.currentProject
  if (uploadStore.pendingUploadId || !project || !intentMatchesProject(intent, project)) {
    return false
  }

  const marked = await dependencies.markGenerationAttempt(intent.intentId)
  if (!marked) {
    sessionRecoveryState.generationError =
      '无法安全记录本次自动恢复尝试，因此没有重新生成。请检查保存状态后手动重试。'
    return false
  }

  sessionRecoveryState.session = {
    ...session,
    generationIntent: { ...intent, autoRecoveryAttempted: true },
  }
  const generated = await projectStore.generateCurrentProject({ recoveryIntentId: intent.intentId })
  if (generated) {
    sessionRecoveryState.session = {
      ...sessionRecoveryState.session!,
      project: projectStore.currentProject,
      generationIntent: null,
    }
    sessionRecoveryState.generationError = null
    await onSuccess?.()
    return true
  }

  sessionRecoveryState.generationError =
    projectStore.generationError ?? '自动恢复生成未完成。可以在裁剪页手动重新生成。'
  const latestSession = sessionRecoveryState.session
  if (latestSession) {
    sessionRecoveryState.session = {
      ...latestSession,
      project: projectStore.currentProject,
      generationIntent: null,
    }
  }
  return false
}

export async function discardLocalSession(): Promise<boolean> {
  if (sessionRecoveryState.status !== 'error' || sessionRecoveryState.discarding) return false
  sessionRecoveryState.discarding = true
  try {
    await dependencies.clearSession()
    if (activePinia) {
      useProjectStore(activePinia).hydrateCurrentProject(null)
      useUploadStore(activePinia).clearPendingInput()
    }
    sessionRecoveryState.session = null
    sessionRecoveryState.errorMessage = null
    sessionRecoveryState.generationError = null
    sessionRecoveryState.status = 'ready'
    return true
  } catch {
    sessionRecoveryState.errorMessage =
      '未能清除本地会话，原记录仍保留。请重试恢复，或稍后再次确认放弃。'
    return false
  } finally {
    sessionRecoveryState.discarding = false
  }
}
