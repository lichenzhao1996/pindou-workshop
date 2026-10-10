import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { ImageDimensions, ImageInput, ImageWarning } from '../../features/upload'

/** Holds the selected local image while the user moves from Home to Crop. */
export const useUploadStore = defineStore('upload', () => {
  const pendingInput = shallowRef<ImageInput | null>(null)
  const pendingDimensions = shallowRef<ImageDimensions | null>(null)
  const pendingWarnings = shallowRef<readonly ImageWarning[]>([])
  const pendingUploadId = shallowRef<string | null>(null)
  let fallbackUploadId = 0

  function setPendingInput(
    input: ImageInput,
    warnings: readonly ImageWarning[] = [],
    dimensions: ImageDimensions | null = null,
    uploadId: string | null = `runtime-upload-${++fallbackUploadId}`,
  ) {
    pendingInput.value = input
    pendingDimensions.value = dimensions
    pendingWarnings.value = warnings
    pendingUploadId.value = uploadId
  }

  function clearPendingInput(expectedUploadId?: string): boolean {
    if (expectedUploadId && pendingUploadId.value !== expectedUploadId) return false
    pendingInput.value = null
    pendingDimensions.value = null
    pendingWarnings.value = []
    pendingUploadId.value = null
    return true
  }

  return {
    pendingInput,
    pendingDimensions,
    pendingWarnings,
    pendingUploadId,
    setPendingInput,
    clearPendingInput,
  }
})
