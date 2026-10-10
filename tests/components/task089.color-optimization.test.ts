import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createGrid, createProject, deriveProjectStats } from '../../src/domain/project'
import type { Project } from '../../src/domain/project'
import EditorColorManagement from '../../src/features/editor/components/EditorColorManagement.vue'
import { deriveMaterialStatsView } from '../../src/features/editor/materials/material-stats-view'

function createProjectWithUsage(): Project {
  const source = {
    originalImage: new Blob(['task089-component'], { type: 'image/png' }),
    originalFileName: 'optimization.png',
    mimeType: 'image/png',
    originalWidth: 15,
    originalHeight: 1,
  }
  const project = createProject({
    source,
    crop: { x: 0, y: 0, width: 15, height: 1, rotation: 0, aspectRatio: 15 },
  })
  const grid = createGrid(15, 1)
  grid.cells.set([...Array<number>(12).fill(1), ...Array<number>(3).fill(2)])
  return { ...project, grid }
}

describe('TASK-089 color optimization suggestions component', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('keeps suggestions read-only until preview confirmation and applies one undoable replacement', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const projectStore = useProjectStore(pinia)
    projectStore.setCurrentProject(createProjectWithUsage())
    const original = projectStore.currentProject!
    const originalCells = Array.from(original.grid!.cells)
    const Host = defineComponent({
      setup() {
        return () => {
          const project = projectStore.currentProject
          const view = project?.grid ? deriveMaterialStatsView(deriveProjectStats(project)) : null
          return h(EditorColorManagement, { project, materialView: view })
        }
      },
    })
    const wrapper = mount(Host, { global: { plugins: [pinia] } })

    expect(wrapper.get('[data-testid="similar-color-suggestion-count"]').text()).toContain('1 组')
    expect(wrapper.get('[data-testid="low-usage-suggestion-count"]').text()).toContain('1 种')
    await wrapper.get('[data-testid="low-usage-preview-2"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="replacement-preview"]').text()).toContain('A2 → A1')
    expect(wrapper.get('[data-testid="replacement-preview"]').text()).toContain('将影响 3 颗')
    expect(projectStore.currentProject!.grid).toBe(original.grid)
    expect(projectStore.currentProject!.revision).toBe(original.revision)
    expect(Array.from(projectStore.currentProject!.grid!.cells)).toEqual(originalCells)
    await wrapper.get('[data-testid="replacement-cancel"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="replacement-panel"]').exists()).toBe(false)
    expect(projectStore.currentProject!.grid).toBe(original.grid)
    expect(projectStore.currentProject!.revision).toBe(original.revision)

    await wrapper.get('[data-testid="low-usage-preview-2"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="replacement-confirm"]').trigger('click')
    await flushPromises()
    expect(projectStore.currentProject!.revision).toBe(original.revision + 1)
    expect(Array.from(projectStore.currentProject!.grid!.cells)).toEqual(Array<number>(15).fill(1))
    expect(projectStore.past).toHaveLength(1)
    expect(projectStore.undo(new Date('2026-01-01T00:00:00.000Z'))).toBe(true)
    expect(Array.from(projectStore.currentProject!.grid!.cells)).toEqual(originalCells)
    wrapper.unmount()
  })
})
