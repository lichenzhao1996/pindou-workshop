import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
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
  const generationStatus = ref<GenerationStatus>('idle')
  const generationError = ref<string | null>(null)
  const pendingGenerationRequest = shallowRef<ProjectGenerationRequest | null>(null)
  let activeGenerationRequestId: number | null = null
  let nextGenerationRequestId = 0
  let requestProject: Project | null = null
  let activeRequest: ProjectGenerationRequest | null = null
  let workerClient: GenerationWorkerClient | null = null

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

    const result = applyProjectGridOperation(project, operation, now)
    if (!result.changed) return false
    currentProject.value = result.project
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
    generationStatus,
    generationError,
    pendingGenerationRequest,
    setCurrentProject,
    clearCurrentProject,
    applyGridOperation,
    prepareGenerationRequest,
    beginGeneration,
    isCurrentGenerationRequest,
    generateCurrentProject,
    commitGenerationResult,
    failGeneration,
    cancelGeneration,
  }
})
