import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createProject } from '../../src/domain/project'

const project = createProject({
  source: {
    originalImage: new Blob(['image'], { type: 'image/png' }),
    originalFileName: 'fixture.png',
    mimeType: 'image/png',
    originalWidth: 100,
    originalHeight: 100,
  },
  crop: {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    aspectRatio: 1,
  },
})

describe('TASK-004 Pinia boundaries', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps one shared current Project reference', () => {
    const store = useProjectStore()

    expect(store.currentProject).toBeNull()

    store.setCurrentProject(project)
    expect(store.currentProject).toBe(project)

    store.clearCurrentProject()
    expect(store.currentProject).toBeNull()
  })

  it('keeps one shared active tool and palette index in the editor store', () => {
    const store = useEditorStore()

    expect(store.activeTool).toBe('select')
    expect(store.activePaletteIndex).toBeNull()

    store.setActiveTool('select')
    store.setActivePaletteIndex(1)
    expect(store.activeTool).toBe('select')
    expect(store.activePaletteIndex).toBe(1)

    store.resetEditorState()
    expect(store.activeTool).toBe('select')
    expect(store.activePaletteIndex).toBeNull()
  })

  it('allows a Vue component to mount against the shared stores', () => {
    const pinia = createPinia()
    const Component = defineComponent({
      setup() {
        return { editor: useEditorStore() }
      },
      template: '<div>{{ editor.activeTool ?? "none" }}</div>',
    })

    const wrapper = mount(Component, { global: { plugins: [pinia] } })

    expect(wrapper.text()).toBe('select')
  })
})
