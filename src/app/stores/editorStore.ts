import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Holds only editor state shared by multiple core components.
 *
 * The tool and palette index are intentionally primitive boundary values until
 * the later editor and Palette tasks define their domain types. Search text,
 * hover, pointer coordinates, dialogs and other transient UI state stay local
 * to their owning components.
 */
export const useEditorStore = defineStore('editor', () => {
  const activeTool = ref<string | null>(null)
  const activePaletteIndex = ref<number | null>(null)

  function setActiveTool(tool: string | null) {
    activeTool.value = tool
  }

  function setActivePaletteIndex(index: number | null) {
    activePaletteIndex.value = index
  }

  function resetEditorState() {
    activeTool.value = null
    activePaletteIndex.value = null
  }

  return {
    activeTool,
    activePaletteIndex,
    setActiveTool,
    setActivePaletteIndex,
    resetEditorState,
  }
})
