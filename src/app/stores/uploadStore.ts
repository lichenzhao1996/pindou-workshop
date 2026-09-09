import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { ImageInput } from '../../features/upload'

/** Holds the selected local image while the user moves from Home to Crop. */
export const useUploadStore = defineStore('upload', () => {
  const pendingInput = shallowRef<ImageInput | null>(null)

  function setPendingInput(input: ImageInput) {
    pendingInput.value = input
  }

  function clearPendingInput() {
    pendingInput.value = null
  }

  return {
    pendingInput,
    setPendingInput,
    clearPendingInput,
  }
})
