import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'

describe('TASK-054 editor Palette recents', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('records valid user choices as an eight-entry MRU list with duplicate promotion', () => {
    const editor = useEditorStore()
    for (let index = 1; index <= 9; index += 1) {
      expect(editor.selectPaletteIndex(index)).toBe(true)
    }
    expect(editor.recentPaletteIndexes).toEqual([9, 8, 7, 6, 5, 4, 3, 2])

    expect(editor.selectPaletteIndex(5)).toBe(true)
    expect(editor.recentPaletteIndexes).toEqual([5, 9, 8, 7, 6, 4, 3, 2])
    expect(editor.activePaletteIndex).toBe(5)
  })

  it('does not record EMPTY, null, fractional, or out-of-range Palette indexes', () => {
    const editor = useEditorStore()
    for (const invalid of [0, -1, 1.5, 292, Number.NaN]) {
      expect(editor.selectPaletteIndex(invalid)).toBe(false)
    }
    editor.setActivePaletteIndex(292)
    expect(editor.activePaletteIndex).toBeNull()
    expect(editor.recentPaletteIndexes).toEqual([])

    editor.setActivePaletteIndex(null)
    expect(editor.activePaletteIndex).toBeNull()
  })

  it('keeps recent colors when current selection is updated passively', () => {
    const editor = useEditorStore()
    editor.selectPaletteIndex(12)
    editor.setActivePaletteIndex(30)

    expect(editor.activePaletteIndex).toBe(30)
    expect(editor.recentPaletteIndexes).toEqual([12])
  })
})
