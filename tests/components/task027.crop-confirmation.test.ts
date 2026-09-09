import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { useUploadStore } from '../../src/app/stores/uploadStore'
import { createFullImageCropState, createProject } from '../../src/domain/project'
import type { CropState } from '../../src/domain/project'
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

interface CropperInstanceFixture {
  destroy: ReturnType<typeof vi.fn>
  getData: ReturnType<typeof vi.fn>
  options: CropperOptionsFixture
  emitCrop: (data: CropDataFixture) => void
}

const cropperMock = vi.hoisted(() => ({
  instances: [] as CropperInstanceFixture[],
}))

vi.mock('cropperjs', () => ({
  default: class MockCropper {
    destroy = vi.fn()
    options: CropperOptionsFixture
    private data: CropDataFixture

    constructor(_imageElement: HTMLImageElement, options: CropperOptionsFixture) {
      this.options = options
      this.data = options.data ?? {
        x: 0,
        y: 0,
        width: 640,
        height: 480,
        rotate: 0,
        scaleX: 1,
        scaleY: 1,
      }
      cropperMock.instances.push(this as unknown as CropperInstanceFixture)
      options.ready?.({ currentTarget: { cropper: this } })
    }

    getData = vi.fn(() => this.data)

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

async function mountCropView(pinia = createPinia()) {
  const router = createTestRouter()
  await router.push('/crop')
  await router.isReady()
  const wrapper = mount(CropView, {
    global: { plugins: [pinia, router] },
  })

  return { pinia, router, wrapper }
}

function setImageInput(pinia: ReturnType<typeof createPinia>, fileName = 'photo.png') {
  const input = createImageInput(new Blob(['image'], { type: 'image/png' }), fileName)
  if (!input) {
    throw new Error('expected image input fixture')
  }

  const uploadStore = useUploadStore(pinia)
  uploadStore.setPendingInput(input, [], { width: 640, height: 480 })
  return input
}

beforeEach(() => {
  cropperMock.instances.length = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:task027'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TASK-027 crop confirmation boundary', () => {
  it('confirms a normalized crop into the current Project and preview input', async () => {
    const pinia = createPinia()
    const input = setImageInput(pinia)
    const { wrapper } = await mountCropView(pinia)
    await flushPromises()

    cropperMock.instances[0].emitCrop({
      x: 40,
      y: 30,
      width: 320,
      height: 240,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    })
    await wrapper.get('[data-testid="crop-confirm"]').trigger('click')

    const projectStore = useProjectStore(pinia)
    expect(projectStore.currentProject?.crop).toEqual({
      x: 40,
      y: 30,
      width: 320,
      height: 240,
      rotation: 0,
      aspectRatio: 4 / 3,
    })
    expect(projectStore.currentProject?.source.originalImage).toBe(input.originalImage)
    expect(
      (wrapper.vm as unknown as { confirmedPreviewInput: unknown }).confirmedPreviewInput,
    ).toEqual({
      originalImage: input.originalImage,
      crop: projectStore.currentProject?.crop,
    })
    expect(wrapper.get('[data-testid="crop-confirmation-status"]').text()).toContain('裁剪已确认')

    wrapper.unmount()
  })

  it('cancels an unconfirmed change without overwriting the last valid Project crop', async () => {
    const pinia = createPinia()
    const input = setImageInput(pinia)
    const fullCrop = createFullImageCropState(640, 480)
    const projectStore = useProjectStore(pinia)
    const project = createProject({
      source: {
        originalImage: input.originalImage,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        originalWidth: 640,
        originalHeight: 480,
      },
      crop: fullCrop,
    })
    projectStore.setCurrentProject(project)

    const { wrapper } = await mountCropView(pinia)
    await flushPromises()
    cropperMock.instances[0].emitCrop({
      x: 40,
      y: 30,
      width: 320,
      height: 240,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    })

    await wrapper.get('[data-testid="crop-cancel"]').trigger('click')
    await flushPromises()

    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.currentProject?.crop).toEqual(fullCrop)
    expect((wrapper.vm as unknown as { cropState: CropState }).cropState).toEqual(fullCrop)

    wrapper.unmount()
  })

  it('does not replace the current Project when confirming the same crop again', async () => {
    const pinia = createPinia()
    const input = setImageInput(pinia)
    const fullCrop = createFullImageCropState(640, 480)
    const projectStore = useProjectStore(pinia)
    const project = createProject({
      source: {
        originalImage: input.originalImage,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        originalWidth: 640,
        originalHeight: 480,
      },
      crop: fullCrop,
    })
    projectStore.setCurrentProject(project)

    const { wrapper } = await mountCropView(pinia)
    await flushPromises()
    await wrapper.get('[data-testid="crop-confirm"]').trigger('click')

    expect(projectStore.currentProject).toBe(project)

    wrapper.unmount()
  })
})
