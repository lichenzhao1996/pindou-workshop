import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { useUploadStore } from '../../src/app/stores/uploadStore'
import { createFullImageCropState, createProject } from '../../src/domain/project'
import CropView from '../../src/features/crop/CropView.vue'
import HomeView from '../../src/features/home/HomeView.vue'
import { createImageInput } from '../../src/features/upload'

const cropperMock = vi.hoisted(() => ({
  instances: [] as Array<{
    destroy: ReturnType<typeof vi.fn>
    emitCrop: (data: CropDataFixture) => void
  }>,
}))

interface CropDataFixture {
  x: number
  y: number
  width: number
  height: number
  rotate: number
  scaleX: number
  scaleY: number
}

vi.mock('cropperjs', () => ({
  default: class MockCropper {
    destroy = vi.fn()
    private data: CropDataFixture = {
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    }
    private options: { crop?: (event: { detail: CropDataFixture }) => void }

    getData = vi.fn(() => this.data)

    constructor(
      _imageElement: HTMLImageElement,
      options: {
        ready?: (event: unknown) => void
        crop?: (event: { detail: CropDataFixture }) => void
      },
    ) {
      this.options = options
      cropperMock.instances.push(this as never)
      options.ready?.({ currentTarget: { cropper: this } })
    }

    emitCrop(data: CropDataFixture) {
      this.data = data
      this.options.crop?.({ detail: data })
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

async function mountCropView() {
  const pinia = createPinia()
  const uploadStore = useUploadStore(pinia)
  const input = createImageInput(new Blob(['image'], { type: 'image/png' }), 'photo.png')
  if (!input) {
    throw new Error('expected image input fixture')
  }
  uploadStore.setPendingInput(input, [], { width: 640, height: 480 })

  const router = createTestRouter()
  await router.push('/crop')
  await router.isReady()
  const wrapper = mount(CropView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { pinia, wrapper }
}

beforeEach(() => {
  cropperMock.instances.length = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:task028'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TASK-028 generation settings', () => {
  it('shows the default 64x48 size and fixed 2.6mm physical dimensions', async () => {
    const { wrapper } = await mountCropView()

    expect(wrapper.get('[data-testid="grid-width-input"]').element).toHaveProperty('value', '64')
    expect(wrapper.get('[data-testid="grid-bead-dimensions"]').text()).toContain('64 × 48 颗')
    expect(wrapper.get('[data-testid="physical-dimensions"]').text()).toContain('16.64cm × 12.48cm')
    expect(wrapper.get('[data-testid="grid-width-preset-64"]').attributes('aria-pressed')).toBe(
      'true',
    )

    wrapper.unmount()
  })

  it('validates custom width, keeps height read-only, and synchronizes presets', async () => {
    const { wrapper, pinia } = await mountCropView()
    const input = wrapper.get('[data-testid="grid-width-input"]')

    await input.setValue('7')
    expect(wrapper.get('[data-testid="grid-width-error"]').text()).toContain('8～256')
    expect(wrapper.get('[data-testid="crop-confirm"]').attributes('disabled')).toBeDefined()

    await input.setValue('8')
    expect(wrapper.find('[data-testid="grid-width-error"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="grid-bead-dimensions"]').text()).toContain('8 × 6 颗')

    await wrapper.get('[data-testid="grid-width-preset-96"]').trigger('click')
    expect(wrapper.get('[data-testid="grid-bead-dimensions"]').text()).toContain('96 × 72 颗')

    await wrapper.get('[data-testid="crop-confirm"]').trigger('click')
    expect(useProjectStore(pinia).currentProject?.generation.widthBeads).toBe(96)
    expect(useProjectStore(pinia).currentProject?.generation.heightBeads).toBe(72)
    expect(useProjectStore(pinia).currentProject?.grid).toBeNull()

    wrapper.unmount()
  })

  it('keeps an existing Project identity while updating only generation size', async () => {
    const pinia = createPinia()
    const uploadStore = useUploadStore(pinia)
    const input = createImageInput(new Blob(['image'], { type: 'image/png' }), 'photo.png')
    if (!input) {
      throw new Error('expected image input fixture')
    }
    uploadStore.setPendingInput(input, [], { width: 640, height: 480 })
    const projectStore = useProjectStore(pinia)
    const project = createProject({
      source: {
        originalImage: input.originalImage,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        originalWidth: 640,
        originalHeight: 480,
      },
      crop: createFullImageCropState(640, 480),
    })
    projectStore.setCurrentProject(project)

    const router = createTestRouter()
    await router.push('/crop')
    await router.isReady()
    const wrapper = mount(CropView, { global: { plugins: [pinia, router] } })
    await flushPromises()
    await wrapper.get('[data-testid="grid-width-preset-32"]').trigger('click')

    const updated = projectStore.currentProject
    expect(updated?.projectId).toBe(project.projectId)
    expect(updated?.generation.widthBeads).toBe(32)
    expect(updated?.generation.heightBeads).toBe(24)
    expect(updated?.revision).toBe(project.revision)
    expect(updated?.crop).toBe(project.crop)

    wrapper.unmount()
  })

  it('shows a non-blocking warning when the crop ratio is extreme', async () => {
    const { wrapper } = await mountCropView()

    cropperMock.instances[0].emitCrop({
      x: 0,
      y: 0,
      width: 640,
      height: 100,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="generation-warnings"]').text()).toContain('作品比例较极端')
    expect(wrapper.get('[data-testid="crop-confirm"]').attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })
})
