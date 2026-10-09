import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import EditorSidebar from '../../src/features/editor/components/EditorSidebar.vue'

const source: Source = {
  originalImage: new Blob(['task069-component'], { type: 'image/png' }),
  originalFileName: '猫咪.png',
  mimeType: 'image/png',
  originalWidth: 80,
  originalHeight: 60,
}

function makeProject(name?: string): Project {
  const project = createProject({
    source: { ...source },
    crop: { x: 0, y: 0, width: 80, height: 60, rotation: 0, aspectRatio: 4 / 3 },
    projectName: name,
  })
  const grid = createGrid(3, 2)
  grid.cells.set([1, 2, 3, 4, 0, 1])
  return { ...project, grid }
}

function mountSidebar(initialProject = makeProject()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const projectStore = useProjectStore(pinia)
  projectStore.setCurrentProject(initialProject)
  const editor = useEditorStore(pinia)
  const Host = defineComponent({
    setup() {
      const project = computed(() => projectStore.currentProject)
      return () => h(EditorSidebar, { project: project.value })
    },
  })
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      stubs: { EditorColorManagement: true, RouterLink: true },
    },
  })
  return { wrapper, projectStore, editor, initialProject }
}

describe('TASK-069 Editor project name', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the formal name, keeps the input as a draft, and confirms through ProjectStore', async () => {
    const { wrapper, projectStore, editor, initialProject } = mountSidebar()
    editor.setActiveTool('brush')
    editor.selectPaletteIndex(9)
    editor.setSelectedCell({ row: 0, column: 1, index: 1 })
    editor.setHighlightedPaletteIndex(2)
    editor.toggleLabels()
    editor.setViewport({ zoom: 1.75, panX: 14, panY: -7 })
    const first = projectStore.currentProject!
    projectStore.applyGridOperation(
      { type: 'setCell', row: 0, column: 0, value: 8 },
      first,
      first.grid!,
    )
    const historyProject = projectStore.currentProject!
    const historyPast = projectStore.past
    const historyFuture = projectStore.future
    const grid = historyProject.grid
    const cells = Array.from(grid!.cells)
    const revision = historyProject.revision
    const updatedAt = historyProject.updatedAt

    expect(wrapper.get('[data-testid="editor-project-name"]').text()).toBe('猫咪')
    await wrapper.get('[data-testid="project-name-rename"]').trigger('click')
    await flushPromises()
    const input = wrapper.get('[data-testid="project-name-input"]')
    expect(input.element).toBe(document.activeElement)
    await input.setValue('  我的新作品  ')

    expect(projectStore.currentProject).toBe(historyProject)
    expect(projectStore.currentProject?.projectName).toBe('猫咪')
    expect(projectStore.currentProject?.updatedAt).toBe(updatedAt)
    expect(projectStore.currentProject?.revision).toBe(revision)

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="editor-project-name"]').text()).toBe('我的新作品')
    expect(projectStore.currentProject).not.toBe(historyProject)
    expect(projectStore.currentProject?.projectId).toBe(initialProject.projectId)
    expect(projectStore.currentProject?.updatedAt).not.toBe(updatedAt)
    expect(projectStore.currentProject?.grid).toBe(grid)
    expect(Array.from(projectStore.currentProject!.grid!.cells)).toEqual(cells)
    expect(projectStore.currentProject?.revision).toBe(revision)
    expect(projectStore.past).toBe(historyPast)
    expect(projectStore.future).toBe(historyFuture)
    expect(projectStore.canUndo).toBe(true)
    expect(editor).toMatchObject({
      activeTool: 'brush',
      activePaletteIndex: 9,
      selectedCell: { row: 0, column: 1, index: 1 },
      highlightedPaletteIndex: 2,
      showLabels: true,
      zoom: 1.75,
      panX: 14,
      panY: -7,
    })
    wrapper.unmount()
  })

  it('cancels with Escape or the cancel button without changing Project metadata', async () => {
    const { wrapper, projectStore } = mountSidebar()
    const initial = projectStore.currentProject!
    await wrapper.get('[data-testid="project-name-rename"]').trigger('click')
    await wrapper.get('[data-testid="project-name-input"]').setValue('discard this')
    await wrapper.get('[data-testid="project-name-input"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(projectStore.currentProject).toBe(initial)

    await wrapper.get('[data-testid="project-name-rename"]').trigger('click')
    await wrapper.get('[data-testid="project-name-input"]').setValue('also discard')
    await wrapper.get('[data-testid="project-name-cancel"]').trigger('click')
    expect(projectStore.currentProject).toBe(initial)
    expect(wrapper.get('[data-testid="editor-project-name"]').text()).toBe('猫咪')
    wrapper.unmount()
  })

  it('normalizes blank input to the formal fallback name', async () => {
    const { wrapper, projectStore } = mountSidebar()
    await wrapper.get('[data-testid="project-name-rename"]').trigger('click')
    await wrapper.get('[data-testid="project-name-input"]').setValue('  \t  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(projectStore.currentProject?.projectName).toBe('未命名作品')
    expect(wrapper.get('[data-testid="editor-project-name"]').text()).toBe('未命名作品')
    wrapper.unmount()
  })

  it('treats trimmed same-name submission as a complete no-op', async () => {
    const { wrapper, projectStore } = mountSidebar()
    const initial = projectStore.currentProject!
    const past = projectStore.past
    const future = projectStore.future
    await wrapper.get('[data-testid="project-name-rename"]').trigger('click')
    await wrapper.get('[data-testid="project-name-input"]').setValue('  猫咪  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(projectStore.currentProject).toBe(initial)
    expect(projectStore.currentProject?.updatedAt).toBe(initial.updatedAt)
    expect(projectStore.past).toBe(past)
    expect(projectStore.future).toBe(future)
    wrapper.unmount()
  })

  it('invalidates an old draft when the active Project changes', async () => {
    const { wrapper, projectStore } = mountSidebar()
    await wrapper.get('[data-testid="project-name-rename"]').trigger('click')
    await wrapper.get('[data-testid="project-name-input"]').setValue('旧项目草稿')
    const nextProject = makeProject('新项目')
    projectStore.setCurrentProject(nextProject)
    await flushPromises()
    expect(wrapper.find('[data-testid="project-name-input"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="editor-project-name"]').text()).toBe('新项目')
    expect(projectStore.currentProject?.projectName).toBe('新项目')
    wrapper.unmount()
  })
})
