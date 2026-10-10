import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import EditorSidebar from '../../src/features/editor/components/EditorSidebar.vue'

const source: Source = {
  originalImage: new Blob(['task076-component'], { type: 'image/png' }),
  originalFileName: 'materials.png',
  mimeType: 'image/png',
  originalWidth: 40,
  originalHeight: 30,
}

function projectWithGrid(values: readonly number[]): Project {
  const project = createProject({
    source: { ...source },
    crop: { x: 0, y: 0, width: 40, height: 30, rotation: 0, aspectRatio: 4 / 3 },
  })
  const grid = createGrid(values.length, 1)
  grid.cells.set(values)
  return { ...project, grid }
}

function mountSidebar(project: Project | null) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const projects = useProjectStore(pinia)
  projects.setCurrentProject(project)
  const Host = defineComponent({
    setup() {
      return () => h(EditorSidebar, { project: projects.currentProject })
    },
  })
  const wrapper = mount(Host, {
    global: { plugins: [pinia], stubs: { RouterLink: true } },
  })
  return { wrapper, projects }
}

describe('TASK-076 complete materials list component', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens and closes a complete list independent of search, then updates after edits and Project switch', async () => {
    const { wrapper, projects } = mountSidebar(projectWithGrid([1, 1, 2, 0]))
    await wrapper.get('[data-testid="used-color-search"]').setValue('A1')
    await wrapper.get('[data-testid="material-list-toggle"]').trigger('click')

    const list = wrapper.get('[data-testid="full-material-list"]')
    expect(list.findAll('[data-testid^="material-list-row-"]')).toHaveLength(2)
    expect(list.get('[data-testid="material-list-table"]').text()).toContain('实际数量')
    expect(list.get('[data-testid="material-list-table"]').text()).toContain('建议准备数量')
    expect(list.get('[data-testid="material-list-row-1"]').text()).toContain('2 颗')
    expect(list.get('[data-testid="material-list-row-1"]').text()).toContain('3 颗')
    expect(list.find('[data-testid="material-list-row-0"]').exists()).toBe(false)

    await wrapper.get('[data-testid="material-list-close"]').trigger('click')
    expect(wrapper.find('[data-testid="full-material-list"]').exists()).toBe(false)
    await wrapper.get('[data-testid="material-list-toggle"]').trigger('click')

    const current = projects.currentProject!
    expect(
      projects.applyGridOperation(
        { type: 'setCell', row: 0, column: 0, value: 0 },
        current,
        current.grid!,
      ),
    ).toBe(true)
    await flushPromises()
    expect(wrapper.get('[data-testid="material-list-row-1"]').text()).toContain('1 颗')
    expect(wrapper.get('[data-testid="material-list-row-1"]').text()).toContain('2 颗')

    projects.setCurrentProject(projectWithGrid([3, 0]))
    await flushPromises()
    expect(wrapper.find('[data-testid="full-material-list"]').exists()).toBe(false)
    await wrapper.get('[data-testid="material-list-toggle"]').trigger('click')
    expect(wrapper.findAll('[data-testid^="material-list-row-"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="material-list-row-3"]').text()).toContain('1 颗')
    expect(wrapper.find('[data-testid="material-list-row-1"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not offer a materials list with no used colors', () => {
    const { wrapper } = mountSidebar(projectWithGrid([0, 0]))
    expect(wrapper.find('[data-testid="material-list-toggle"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="full-material-list"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
