/* eslint-disable vue/one-component-per-file -- local child stubs isolate the three Editor slots */
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h, onMounted } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createGrid, createProject } from '../../src/domain/project'
import type { Grid } from '../../src/domain/project/grid'
import type { Project } from '../../src/domain/project/types'
import EditorView from '../../src/features/editor/EditorView.vue'

function createProjectFixture() {
  const project = createProject({
    source: {
      originalImage: new Blob(['image'], { type: 'image/png' }),
      originalFileName: 'editor-shell.png',
      mimeType: 'image/png',
      originalWidth: 80,
      originalHeight: 60,
    },
    crop: { x: 0, y: 0, width: 80, height: 60, rotation: 0, aspectRatio: 4 / 3 },
  })
  project.grid = createGrid(8, 6)
  project.grid.cells.fill(1)
  return project
}

describe('TASK-043 Editor shell', () => {
  it('mounts three read-only regions and passes the same Project/Grid references', async () => {
    const pinia = createPinia()
    const project = createProjectFixture()
    const projectStore = useProjectStore(pinia)
    projectStore.setCurrentProject(project)

    const received: {
      sidebar?: Project | null
      canvasGrid?: Grid | null
      toolbarGrid?: Grid | null
    } = {}
    const ToolbarStub = defineComponent({
      props: {
        grid: { type: Object, default: null },
        canvasSize: { type: Object, required: true },
      },
      setup(props) {
        received.toolbarGrid = props.grid as Grid | null
        return () =>
          h('div', {
            'data-testid': 'toolbar-stub',
            'data-grid-width': (props.grid as Grid | null)?.width,
          })
      },
    })
    const CanvasStub = defineComponent({
      props: { grid: { type: Object, default: null }, projectId: { type: String, default: null } },
      emits: ['resize'],
      setup(props, { emit }) {
        received.canvasGrid = props.grid as Grid | null
        onMounted(() => emit('resize', { width: 640, height: 480 }))
        return () => h('div', { 'data-testid': 'canvas-stub', 'data-project-id': props.projectId })
      },
    })
    const SidebarStub = defineComponent({
      props: { project: { type: Object, default: null } },
      setup(props) {
        received.sidebar = props.project as Project | null
        return () => h('aside', { 'data-testid': 'sidebar-stub' })
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/editor', name: 'editor', component: EditorView },
        { path: '/crop', name: 'crop', component: { template: '<div />' } },
        { path: '/', name: 'home', component: { template: '<div />' } },
      ],
    })
    await router.push('/editor')
    await router.isReady()

    const wrapper = mount(EditorView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          EditorToolbar: ToolbarStub,
          EditorCanvasArea: CanvasStub,
          EditorSidebar: SidebarStub,
        },
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="editor-tools"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="toolbar-stub"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="canvas-stub"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="sidebar-stub"]').exists()).toBe(true)
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(received.sidebar).toBe(projectStore.currentProject)
    expect(received.canvasGrid).toBe(projectStore.currentProject?.grid)
    expect(received.toolbarGrid).toBe(projectStore.currentProject?.grid)
    expect(wrapper.get('[data-testid="toolbar-stub"]').attributes('data-grid-width')).toBe('8')
    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.currentProject?.revision).toBe(0)

    wrapper.unmount()
  })
})
