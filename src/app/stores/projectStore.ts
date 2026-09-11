import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  commitGenerationResultToProject,
  createGenerationRequest,
  type GenerationRequest,
  type GenerationResult,
} from '../../domain/generation'
import type { Project } from '../../domain/project'

export type GenerationStatus = 'idle' | 'generating' | 'error'

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
  const pendingGenerationRequest = shallowRef<GenerationRequest | null>(null)
  let activeGenerationRequestId: number | null = null
  let nextGenerationRequestId = 0

  function setCurrentProject(project: Project | null) {
    currentProject.value = project
    generationStatus.value = 'idle'
    generationError.value = null
    pendingGenerationRequest.value = null
    activeGenerationRequestId = null
  }

  function clearCurrentProject() {
    setCurrentProject(null)
  }

  function prepareGenerationRequest(): GenerationRequest | null {
    if (!currentProject.value) {
      return null
    }

    const request = createGenerationRequest(currentProject.value)
    pendingGenerationRequest.value = request
    return request
  }

  function beginGeneration(request?: GenerationRequest) {
    const generationRequest = request ?? prepareGenerationRequest()
    if (!currentProject.value || !generationRequest) {
      throw new RangeError('Cannot start generation without a current Project')
    }

    const requestId = ++nextGenerationRequestId
    activeGenerationRequestId = requestId
    pendingGenerationRequest.value = generationRequest
    generationStatus.value = 'generating'
    generationError.value = null
    return requestId
  }

  function commitGenerationResult(
    requestId: number,
    result: GenerationResult,
    now: Date = new Date(),
  ): boolean {
    if (
      activeGenerationRequestId !== requestId ||
      !currentProject.value ||
      !pendingGenerationRequest.value
    ) {
      return false
    }

    try {
      currentProject.value = commitGenerationResultToProject(
        currentProject.value,
        pendingGenerationRequest.value,
        result,
        now,
      )
      generationStatus.value = 'idle'
      generationError.value = null
      pendingGenerationRequest.value = null
      activeGenerationRequestId = null
      return true
    } catch (error) {
      generationStatus.value = 'error'
      generationError.value = error instanceof Error ? error.message : '拼豆图生成失败'
      pendingGenerationRequest.value = null
      activeGenerationRequestId = null
      throw error
    }
  }

  function failGeneration(requestId: number, error: unknown): boolean {
    if (activeGenerationRequestId !== requestId) {
      return false
    }

    generationStatus.value = 'error'
    generationError.value = error instanceof Error ? error.message : '拼豆图生成失败'
    pendingGenerationRequest.value = null
    activeGenerationRequestId = null
    return true
  }

  function cancelGeneration(requestId: number): boolean {
    if (activeGenerationRequestId !== requestId) {
      return false
    }

    generationStatus.value = 'idle'
    generationError.value = null
    pendingGenerationRequest.value = null
    activeGenerationRequestId = null
    return true
  }

  return {
    currentProject,
    generationStatus,
    generationError,
    pendingGenerationRequest,
    setCurrentProject,
    clearCurrentProject,
    prepareGenerationRequest,
    beginGeneration,
    commitGenerationResult,
    failGeneration,
    cancelGeneration,
  }
})
