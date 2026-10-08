import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'

describe('TASK-046 screen-space pan state', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('applies pointer deltas directly in CSS pixels at every zoom level', () => {
    const store = useEditorStore()
    store.setViewport({ zoom: 4, panX: -18, panY: 35 })

    store.panBy(27, -14)

    expect(store.viewport).toEqual({ zoom: 4, panX: 9, panY: 21 })
    store.setViewport({ zoom: 0.25, panX: 9, panY: 21 })
    store.panBy(-8, 12)
    expect(store.viewport).toEqual({ zoom: 0.25, panX: 1, panY: 33 })
  })
})
