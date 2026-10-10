import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import EditorSidebar from '../../src/features/editor/components/EditorSidebar.vue'

const source: Source = {
  originalImage: new Blob(['task074-component'], { type: 'image/png' }),
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

describe('TASK-074 material stats component', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('refreshes the shared materials view after edits, erasing, replacement, Undo/Redo and Project switch', async () => {
    const { wrapper, projects } = mountSidebar(projectWithGrid([1, 1, 2, 0]))
    const a1 = MARD_291_PALETTE.entries.find(({ paletteIndex }) => paletteIndex === 1)!
    const a2 = MARD_291_PALETTE.entries.find(({ paletteIndex }) => paletteIndex === 2)!
    const a3 = MARD_291_PALETTE.entries.find(({ paletteIndex }) => paletteIndex === 3)!
    const a4 = MARD_291_PALETTE.entries.find(({ paletteIndex }) => paletteIndex === 4)!

    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('2 / 291')
    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('3 颗拼豆')
    expect(wrapper.get('[data-testid="used-color-row-1"]').text()).toContain(a1.displayCode)
    expect(wrapper.get('[data-testid="used-color-row-1"]').text()).toContain(a1.name)
    expect(wrapper.get('[data-testid="used-color-row-1"]').text()).toContain('2 颗')
    expect(wrapper.get('[data-testid="used-color-row-2"]').text()).toContain(a2.name)

    let current = projects.currentProject!
    expect(
      projects.applyGridOperation(
        { type: 'setCell', row: 0, column: 3, value: 3 },
        current,
        current.grid!,
      ),
    ).toBe(true)
    await flushPromises()
    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('3 / 291')
    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('4 颗拼豆')
    expect(wrapper.get('[data-testid="used-color-row-3"]').text()).toContain(a3.displayCode)

    current = projects.currentProject!
    expect(
      projects.applyGridOperation(
        { type: 'setCell', row: 0, column: 0, value: 0 },
        current,
        current.grid!,
      ),
    ).toBe(true)
    await flushPromises()
    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('3 颗拼豆')
    expect(wrapper.get('[data-testid="used-color-row-1"]').text()).toContain('1 颗')

    await wrapper.get('[data-testid="used-color-replace-1"]').trigger('click')
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    await wrapper.get('[data-testid="picker-mode-code"]').trigger('click')
    await wrapper.get('[data-testid="picker-color-4"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="replacement-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="used-color-row-4"]').text()).toContain(a4.displayCode)
    expect(wrapper.find('[data-testid="used-color-row-1"]').exists()).toBe(false)

    expect(projects.undo()).toBe(true)
    await flushPromises()
    expect(wrapper.get('[data-testid="used-color-row-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="used-color-row-4"]').exists()).toBe(false)
    expect(projects.redo()).toBe(true)
    await flushPromises()
    expect(wrapper.get('[data-testid="used-color-row-4"]').exists()).toBe(true)

    projects.setCurrentProject(projectWithGrid([5, 0]))
    await flushPromises()
    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('1 / 291')
    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('1 颗拼豆')
    expect(wrapper.get('[data-testid="used-color-row-5"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="used-color-row-4"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows correct all-EMPTY and no-Grid empty states without fabricating material rows', () => {
    const allEmpty = mountSidebar(projectWithGrid([0, 0]))
    expect(allEmpty.wrapper.get('[data-testid="used-color-summary"]').text()).toContain(
      '0 / 291 种颜色 · 0 颗拼豆',
    )
    expect(allEmpty.wrapper.get('[data-testid="used-color-empty"]').text()).toContain(
      '当前作品没有已使用颜色',
    )
    expect(allEmpty.wrapper.findAll('[data-testid^="used-color-row-"]')).toHaveLength(0)
    allEmpty.wrapper.unmount()

    const noProject = mountSidebar(null)
    expect(noProject.wrapper.get('[data-testid="editor-info-empty"]').exists()).toBe(true)
    expect(noProject.wrapper.get('[data-testid="used-color-summary"]').text()).toContain(
      '0 / 291 种颜色 · 0 颗拼豆',
    )
    expect(noProject.wrapper.get('[data-testid="used-color-empty"]').text()).toContain(
      '暂无作品颜色',
    )
    noProject.wrapper.unmount()
  })
})
