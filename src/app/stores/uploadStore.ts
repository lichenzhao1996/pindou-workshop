import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { ImageDimensions, ImageInput, ImageWarning } from '../../features/upload'

/** Holds the selected local image while the user moves from Home to Crop. */
export const useUploadStore = defineStore('upload', () => {
  const pendingInput = shallowRef<ImageInput | null>(null)
  const pendingDimensions = shallowRef<ImageDimensions | null>(null)
  const pendingWarnings = shallowRef<readonly ImageWarning[]>([])

  function setPendingInput(
    input: ImageInput,
    warnings: readonly ImageWarning[] = [],
    dimensions: ImageDimensions | null = null,
  ) {
    pendingInput.value = input
    pendingDimensions.value = dimensions
    pendingWarnings.value = warnings
  }

  function clearPendingInput() {
    pendingInput.value = null
    pendingDimensions.value = null
    pendingWarnings.value = []
  }

  return {
    pendingInput,
    pendingDimensions,
    pendingWarnings,
    setPendingInput,
    clearPendingInput,
  }
})
