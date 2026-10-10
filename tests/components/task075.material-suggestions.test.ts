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
  originalImage: new Blob(['task075-component'], { type: 'image/png' }),
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

function expectMaterialRow(
  wrapper: ReturnType<typeof mount>,
  paletteIndex: number,
  actual: number,
  suggested: number,
) {
  const row = wrapper.get(`[data-testid="used-color-row-${paletteIndex}"]`)
  expect(row.text()).toContain(`实际：${actual} 颗`)
  expect(row.text()).toContain(`建议：${suggested} 颗`)
}

describe('TASK-075 material suggestions component', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows separately labeled actual and suggested quantities for small, boundary and multi-color counts', () => {
    const values = [
      1,
      ...Array.from({ length: 10 }, () => 2),
      ...Array.from({ length: 20 }, () => 3),
      ...Array.from({ length: 21 }, () => 4),
    ]
    const { wrapper } = mountSidebar(projectWithGrid(values))

    expectMaterialRow(wrapper, 1, 1, 2)
    expectMaterialRow(wrapper, 2, 10, 11)
    expectMaterialRow(wrapper, 3, 20, 21)
    expectMaterialRow(wrapper, 4, 21, 23)
    expect(wrapper.find('[data-testid="used-color-row-0"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid^="used-color-row-"]')).toHaveLength(4)
    wrapper.unmount()
  })

  it('refreshes suggestions after erasing, global replacement, Undo/Redo and Project switch', async () => {
    const values = [1, ...Array.from({ length: 21 }, () => 2)]
    const { wrapper, projects } = mountSidebar(projectWithGrid(values))
    const a3 = MARD_291_PALETTE.entries.find(({ paletteIndex }) => paletteIndex === 3)!

    expectMaterialRow(wrapper, 2, 21, 23)
    const current = projects.currentProject!
    expect(
      projects.applyGridOperation(
        { type: 'setCell', row: 0, column: 1, value: 0 },
        current,
        current.grid!,
      ),
    ).toBe(true)
    await flushPromises()
    expectMaterialRow(wrapper, 2, 20, 21)

    await wrapper.get('[data-testid="used-color-replace-2"]').trigger('click')
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    await wrapper.get('[data-testid="picker-mode-code"]').trigger('click')
    await wrapper.get('[data-testid="picker-color-3"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="replacement-confirm"]').trigger('click')
    await flushPromises()
    expectMaterialRow(wrapper, 3, 20, 21)
    expect(wrapper.get('[data-testid="used-color-row-3"]').text()).toContain(a3.displayCode)

    expect(projects.undo()).toBe(true)
    await flushPromises()
    expectMaterialRow(wrapper, 2, 20, 21)
    expect(wrapper.find('[data-testid="used-color-row-3"]').exists()).toBe(false)

    expect(projects.redo()).toBe(true)
    await flushPromises()
    expectMaterialRow(wrapper, 3, 20, 21)

    projects.setCurrentProject(projectWithGrid([5, 0]))
    await flushPromises()
    expectMaterialRow(wrapper, 5, 1, 2)
    expect(wrapper.find('[data-testid="used-color-row-3"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not create rows for EMPTY-only Projects', () => {
    const { wrapper } = mountSidebar(projectWithGrid([0, 0]))
    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain(
      '0 / 291 种颜色 · 0 颗拼豆',
    )
    expect(wrapper.findAll('[data-testid^="used-color-row-"]')).toHaveLength(0)
    wrapper.unmount()
  })
})
