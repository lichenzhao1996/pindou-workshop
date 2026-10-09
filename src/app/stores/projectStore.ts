import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { useEditorStore } from './editorStore'
import {
  commitGenerationResultToProject,
  createGenerationRequest,
  generationRequestMatchesProject,
  type ProjectGenerationRequest,
  type GenerationResult,
} from '../../domain/generation'
import { rasterizeCrop } from '../../domain/generation/rasterize'
import {
  createGenerationWorkerClient,
  GenerationRequestCancelledError,
  GenerationRequestSupersededError,
  type GenerationWorkerClient,
} from '../../domain/generation/worker-client'
import type { Project } from '../../domain/project'
import { applyGridOperation as applyProjectGridOperation } from '../../domain/project/operations'
import type { GridOperation } from '../../domain/project/operations'
import type { Grid } from '../../domain/project/grid'
import {
  createGridHistoryEntry,
  MAX_GRID_HISTORY_ENTRIES,
  restoreGridHistorySnapshot,
  type GridHistoryEntry,
} from '../../domain/project/history'

interface HistoryLineage {
  projectId: string
  grid: Grid
  revision: number
  basisProject: Project
}

export type GenerationStatus = 'idle' | 'generating' | 'success' | 'error'

/**
 * Holds the one cross-page current Project reference.
 *
 * The shallow ref preserves the boundary where an immutable Project/Grid
 * snapshot can be replaced without deep-proxying a Uint16Array. Generation
 * status and request tokens are kept here because they are shared by the
 * generation orchestration and Project commit boundary.
 */
export const useProjectStore = defineStore('project', () => {
  const currentProject = shallowRef<Project | null>(null)
  const past = shallowRef<GridHistoryEntry[]>([])
  const future = shallowRef<GridHistoryEntry[]>([])
  let historyLineage: HistoryLineage | null = null
  const generationStatus = ref<GenerationStatus>('idle')
  const generationError = ref<string | null>(null)
  const pendingGenerationRequest = shallowRef<ProjectGenerationRequest | null>(null)
  let activeGenerationRequestId: number | null = null
  let nextGenerationRequestId = 0
  let requestProject: Project | null = null
  let activeRequest: ProjectGenerationRequest | null = null
  let workerClient: GenerationWorkerClient | null = null

  function sameCrop(left: Project['crop'], right: Project['crop']): boolean {
    return (
      left.x === right.x &&
      left.y === right.y &&
      left.width === right.width &&
      left.height === right.height &&
      left.rotation === right.rotation &&
      left.aspectRatio === right.aspectRatio
    )
  }

  function sameGeneration(left: Project['generation'], right: Project['generation']): boolean {
    return (
      left.widthBeads === right.widthBeads &&
      left.heightBeads === right.heightBeads &&
      left.beadSizeMm === right.beadSizeMm &&
      left.mode === right.mode &&
      left.paletteVersion === right.paletteVersion &&
      left.algorithmVersion === right.algorithmVersion
    )
  }

  function sameSource(left: Project['source'], right: Project['source']): boolean {
    return (
      left.originalImage === right.originalImage &&
      left.originalFileName === right.originalFileName &&
      left.mimeType === right.mimeType &&
      left.originalWidth === right.originalWidth &&
      left.originalHeight === right.originalHeight
    )
  }

  function compatibleGridLineage(left: Project | null, right: Project | null): boolean {
    return Boolean(
      left &&
      right &&
      left.projectId === right.projectId &&
      left.grid !== null &&
      left.grid === right.grid &&
      left.revision === right.revision &&
      sameSource(left.source, right.source) &&
      sameCrop(left.crop, right.crop) &&
      sameGeneration(left.generation, right.generation),
    )
  }

  function historyMatchesCurrent(): boolean {
    const project = currentProject.value
    return Boolean(
      project &&
      historyLineage &&
      project.projectId === historyLineage.projectId &&
      project.grid === historyLineage.grid &&
      project.revision === historyLineage.revision &&
      compatibleGridLineage(historyLineage.basisProject, project),
    )
  }

  function clearHistory() {
    past.value = []
    future.value = []
    historyLineage = null
  }

  const canUndo = computed(() => past.value.length > 0 && historyMatchesCurrent())
  const canRedo = computed(() => future.value.length > 0 && historyMatchesCurrent())

  function clearGenerationRequest() {
    pendingGenerationRequest.value = null
    activeGenerationRequestId = null
    requestProject = null
    activeRequest = null
  }

  function setCurrentProject(project: Project | null) {
    if (currentProject.value === project) {
      return
    }

    if (!compatibleGridLineage(currentProject.value, project)) clearHistory()
    workerClient?.cancel()
    currentProject.value = project
    generationStatus.value = 'idle'
    generationError.value = null
    clearGenerationRequest()
  }

  function clearCurrentProject() {
    setCurrentProject(null)
  }

  /**
   * Commits one immutable edit only while the captured Project and Grid are still current.
   * A gesture therefore cannot write an older Grid over a switched or edited Project.
   */
  function applyGridOperation(
    operation: GridOperation,
    expectedProject: Project,
    expectedGrid: Grid,
    now?: Date,
  ): boolean {
    const project = currentProject.value
    if (
      !project ||
      project !== expectedProject ||
      project.grid !== expectedGrid ||
      expectedProject.grid !== expectedGrid
    ) {
      return false
    }

    if ((past.value.length > 0 || future.value.length > 0) && !historyMatchesCurrent()) {
      clearHistory()
    }
    const committedAt = now ?? new Date()
    const result = applyProjectGridOperation(project, operation, committedAt)
    if (!result.changed) return false
    const entry = createGridHistoryEntry(project, result.project, operation, committedAt)
    currentProject.value = result.project
    past.value = [...past.value, entry].slice(-MAX_GRID_HISTORY_ENTRIES)
    future.value = []
    historyLineage = {
      projectId: result.project.projectId,
      grid: result.project.grid!,
      revision: result.project.revision,
      basisProject: result.project,
    }
    return true
  }

  function undo(now: Date = new Date()): boolean {
    if (past.value.length === 0) return false
    const project = currentProject.value
    if (!project || !historyMatchesCurrent()) {
      clearHistory()
      return false
    }
    const entry = past.value[past.value.length - 1]!
    if (
      entry.projectId !== project.projectId ||
      entry.afterProject.revision !== project.revision ||
      !project.grid
    ) {
      clearHistory()
      return false
    }

    const restored = restoreGridHistorySnapshot(project, entry.beforeProject, now)
    currentProject.value = restored
    past.value = past.value.slice(0, -1)
    future.value = [...future.value, entry].slice(-MAX_GRID_HISTORY_ENTRIES)
    historyLineage = {
      projectId: restored.projectId,
      grid: restored.grid!,
      revision: restored.revision,
      basisProject: restored,
    }
    useEditorStore().markHistoryRestore()
    return true
  }

  function redo(now: Date = new Date()): boolean {
    if (future.value.length === 0) return false
    const project = currentProject.value
    if (!project || !historyMatchesCurrent()) {
      clearHistory()
      return false
    }
    const entry = future.value[future.value.length - 1]!
    if (
      entry.projectId !== project.projectId ||
      entry.beforeProject.revision !== project.revision ||
      !project.grid
    ) {
      clearHistory()
      return false
    }

    const restored = restoreGridHistorySnapshot(project, entry.afterProject, now)
    currentProject.value = restored
    future.value = future.value.slice(0, -1)
    past.value = [...past.value, entry].slice(-MAX_GRID_HISTORY_ENTRIES)
    historyLineage = {
      projectId: restored.projectId,
      grid: restored.grid!,
      revision: restored.revision,
      basisProject: restored,
    }
    useEditorStore().markHistoryRestore()
    return true
  }

  function prepareGenerationRequest(): ProjectGenerationRequest | null {
    if (activeGenerationRequestId !== null) {
      return activeRequest
    }
    if (!currentProject.value) {
      return null
    }

    const request = createGenerationRequest(currentProject.value)
    pendingGenerationRequest.value = request
    return request
  }

  function beginGeneration(request?: ProjectGenerationRequest) {
    const generationRequest =
      request ?? (currentProject.value ? createGenerationRequest(currentProject.value) : null)
    if (!currentProject.value || !generationRequest) {
      throw new RangeError('Cannot start generation without a current Project')
    }
    if (!generationRequestMatchesProject(currentProject.value, generationRequest)) {
      throw new RangeError('Generation request does not match the current Project')
    }

    workerClient?.cancel()
    const requestId = ++nextGenerationRequestId
    activeGenerationRequestId = requestId
    pendingGenerationRequest.value = generationRequest
    generationStatus.value = 'generating'
    generationError.value = null
    requestProject = currentProject.value
    activeRequest = generationRequest
    return requestId
  }

  function isCurrentGenerationRequest(requestId: number): boolean {
    if (activeGenerationRequestId !== requestId) {
      return false
    }

    let matches = false
    try {
      matches =
        currentProject.value !== null &&
        currentProject.value === requestProject &&
        activeRequest !== null &&
        generationRequestMatchesProject(currentProject.value, activeRequest)
    } catch {
      // Malformed or changed live settings cannot authorize a late response either.
    }

    if (!matches) {
      generationStatus.value = 'idle'
      generationError.value = null
      clearGenerationRequest()
    }
    return matches
  }

  function commitGenerationResult(
    requestId: number,
    result: GenerationResult,
    now: Date = new Date(),
  ): boolean {
    if (!isCurrentGenerationRequest(requestId) || !currentProject.value || !activeRequest) {
      return false
    }

    try {
      currentProject.value = commitGenerationResultToProject(
        currentProject.value,
        activeRequest,
        result,
        now,
      )
      clearHistory()
      generationStatus.value = 'success'
      generationError.value = null
      clearGenerationRequest()
      return true
    } catch (error) {
      generationStatus.value = 'error'
      generationError.value = error instanceof Error ? error.message : '拼豆图生成失败'
      clearGenerationRequest()
      throw error
    }
  }

  function failGeneration(requestId: number, error: unknown): boolean {
    if (!isCurrentGenerationRequest(requestId)) {
      return false
    }

    generationStatus.value = 'error'
    generationError.value = error instanceof Error ? error.message : '拼豆图生成失败'
    clearGenerationRequest()
    return true
  }

  function cancelGeneration(requestId: number | null = activeGenerationRequestId): boolean {
    if (requestId === null) {
      return false
    }
    if (activeGenerationRequestId !== requestId) {
      return false
    }

    generationStatus.value = 'idle'
    generationError.value = null
    clearGenerationRequest()
    workerClient?.cancel()
    return true
  }

  /** One application path from the formal Project snapshot through the real Worker to commit. */
  async function generateCurrentProject(): Promise<boolean> {
    let requestId: number | null = null
    try {
      requestId = beginGeneration()
      const request = activeRequest!
      const rasterized = await rasterizeCrop(request)
      if (!isCurrentGenerationRequest(requestId)) {
        return false
      }

      workerClient ??= createGenerationWorkerClient()
      const response = await workerClient.generateGrid(request, rasterized)
      if (!isCurrentGenerationRequest(requestId)) {
        return false
      }
      if (!response.generationResult) {
        throw new Error('生成 Worker 未返回真实 Grid 结果')
      }
      return commitGenerationResult(requestId, response.generationResult)
    } catch (error) {
      if (requestId !== null) {
        if (
          error instanceof GenerationRequestCancelledError ||
          error instanceof GenerationRequestSupersededError
        ) {
          cancelGeneration(requestId)
        } else {
          failGeneration(requestId, error)
        }
      } else {
        generationStatus.value = 'error'
        generationError.value = error instanceof Error ? error.message : '拼豆图生成失败'
      }
      return false
    }
  }

  return {
    currentProject,
    past,
    future,
    canUndo,
    canRedo,
    generationStatus,
    generationError,
    pendingGenerationRequest,
    setCurrentProject,
    clearCurrentProject,
    applyGridOperation,
    undo,
    redo,
    clearHistory,
    prepareGenerationRequest,
    beginGeneration,
    isCurrentGenerationRequest,
    generateCurrentProject,
    commitGenerationResult,
    failGeneration,
    cancelGeneration,
  }
})
