import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { useUploadStore } from '../../src/app/stores/uploadStore'
import { applyGridOperation, createGrid, createProject } from '../../src/domain/project'
import CropView from '../../src/features/crop/CropView.vue'
import HomeView from '../../src/features/home/HomeView.vue'
import { createImageInput } from '../../src/features/upload'

const cropperMock = vi.hoisted(() => ({ instances: [] as unknown[] }))

vi.mock('cropperjs', () => ({
  default: class MockCropper {
    private readonly data = {
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    }

    constructor(_imageElement: HTMLImageElement, options: { ready?: (event: unknown) => void }) {
      cropperMock.instances.push(this)
      options.ready?.({ currentTarget: { cropper: this } })
    }

    destroy() {}

    getData() {
      return this.data
    }
  },
}))

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/crop', name: 'crop', component: CropView },
    ],
  })
}

async function mountCropView(pinia: ReturnType<typeof createPinia>) {
  const router = createTestRouter()
  await router.push('/crop')
  await router.isReady()
  const wrapper = mount(CropView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

function setImageInput(pinia: ReturnType<typeof createPinia>) {
  const input = createImageInput(new Blob(['image'], { type: 'image/png' }), 'task037.png')
  if (!input) {
    throw new Error('expected image input fixture')
  }

  useUploadStore(pinia).setPendingInput(input, [], { width: 640, height: 480 })
  return input
}

beforeEach(() => {
  cropperMock.instances.length = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:task037'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TASK-037 generation mode confirmation', () => {
  it('cancels a mode switch without clearing a manually edited Grid', async () => {
    const pinia = createPinia()
    const input = setImageInput(pinia)
    const projectStore = useProjectStore(pinia)
    const project = createProject({
      source: {
        originalImage: input.originalImage,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        originalWidth: 640,
        originalHeight: 480,
      },
      crop: {
        x: 0,
        y: 0,
        width: 640,
        height: 480,
        rotation: 0,
        aspectRatio: 4 / 3,
      },
    })
    const edited = applyGridOperation(
      { ...project, grid: createGrid(64, 48) },
      { type: 'setCell', row: 0, column: 0, value: 1 },
    ).project
    projectStore.setCurrentProject(edited)

    const wrapper = await mountCropView(pinia)
    await wrapper.get('[data-testid="generation-mode-high-fidelity"]').setValue(true)
    expect(wrapper.get('[data-testid="generation-mode-confirmation"]').exists()).toBe(true)

    await wrapper.get('[data-testid="generation-mode-cancel"]').trigger('click')

    expect(projectStore.currentProject).toBe(edited)
    expect(projectStore.currentProject?.grid).toBe(edited.grid)
    expect(wrapper.find('[data-testid="generation-mode-confirmation"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('confirms the mode switch, clears the old Grid and rebuilds the original-image request', async () => {
    const pinia = createPinia()
    const input = setImageInput(pinia)
    const projectStore = useProjectStore(pinia)
    const project = createProject({
      source: {
        originalImage: input.originalImage,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        originalWidth: 640,
        originalHeight: 480,
      },
      crop: {
        x: 0,
        y: 0,
        width: 640,
        height: 480,
        rotation: 0,
        aspectRatio: 4 / 3,
      },
    })
    const edited = applyGridOperation(
      { ...project, grid: createGrid(64, 48) },
      { type: 'setCell', row: 0, column: 0, value: 1 },
    ).project
    projectStore.setCurrentProject(edited)

    const wrapper = await mountCropView(pinia)
    await wrapper.get('[data-testid="generation-mode-high-fidelity"]').setValue(true)
    await wrapper.get('[data-testid="generation-mode-confirm"]').trigger('click')

    expect(projectStore.currentProject?.generation.mode).toBe('high-fidelity')
    expect(projectStore.currentProject?.grid).toBeNull()
    expect(projectStore.currentProject?.projectId).toBe(edited.projectId)
    expect(projectStore.currentProject?.revision).toBe(edited.revision)
    expect(projectStore.pendingGenerationRequest?.originalImage).toBe(input.originalImage)
    expect(projectStore.pendingGenerationRequest?.crop).toEqual(edited.crop)
    expect(projectStore.pendingGenerationRequest?.mode).toBe('high-fidelity')
    wrapper.unmount()
  })
})
