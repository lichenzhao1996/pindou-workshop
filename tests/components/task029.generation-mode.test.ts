import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { useUploadStore } from '../../src/app/stores/uploadStore'
import { createGrid, createProject } from '../../src/domain/project'
import CropView from '../../src/features/crop/CropView.vue'
import HomeView from '../../src/features/home/HomeView.vue'
import { createImageInput } from '../../src/features/upload'

interface CropDataFixture {
  x: number
  y: number
  width: number
  height: number
  rotate: number
  scaleX: number
  scaleY: number
}

interface CropperOptionsFixture {
  data?: CropDataFixture
  ready?: (event: unknown) => void
  crop?: (event: { detail: CropDataFixture }) => void
}

const cropperMock = vi.hoisted(() => ({
  instances: [] as Array<{ destroy: ReturnType<typeof vi.fn> }>,
}))

vi.mock('cropperjs', () => ({
  default: class MockCropper {
    destroy = vi.fn()
    private readonly data: CropDataFixture = {
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    }

    constructor(_imageElement: HTMLImageElement, options: CropperOptionsFixture) {
      cropperMock.instances.push(this)
      options.ready?.({ currentTarget: { cropper: this } })
    }

    getData = vi.fn(() => this.data)
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
  const input = createImageInput(new Blob(['image'], { type: 'image/png' }), 'photo.png')
  if (!input) {
    throw new Error('expected image input fixture')
  }

  useUploadStore(pinia).setPendingInput(input, [], { width: 640, height: 480 })
  return input
}

beforeEach(() => {
  cropperMock.instances.length = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:task029'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TASK-029 generation mode UI', () => {
  it('shows optimized selected by default and allows high-fidelity selection', async () => {
    const pinia = createPinia()
    setImageInput(pinia)
    const wrapper = await mountCropView(pinia)

    expect(wrapper.get('[data-testid="generation-mode-optimized"]').element).toHaveProperty(
      'checked',
      true,
    )
    expect(wrapper.get('[data-testid="generation-mode-high-fidelity"]').element).toHaveProperty(
      'checked',
      false,
    )

    await wrapper.get('[data-testid="generation-mode-high-fidelity"]').setValue(true)

    expect(wrapper.get('[data-testid="generation-mode-high-fidelity"]').element).toHaveProperty(
      'checked',
      true,
    )

    wrapper.unmount()
  })

  it('persists the selected mode on confirmation and does not use the current Grid as request input', async () => {
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
    projectStore.setCurrentProject({ ...project, grid: createGrid(64, 48) })

    const wrapper = await mountCropView(pinia)
    await wrapper.get('[data-testid="generation-mode-high-fidelity"]').setValue(true)
    await wrapper.get('[data-testid="crop-confirm"]').trigger('click')

    expect(projectStore.currentProject?.generation.mode).toBe('high-fidelity')
    expect(projectStore.currentProject?.grid).toBeNull()
    expect(projectStore.currentProject?.projectId).toBe(project.projectId)
    expect(projectStore.currentProject?.revision).toBe(project.revision)

    wrapper.unmount()
  })
})
