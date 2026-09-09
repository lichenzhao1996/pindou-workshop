import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadStore } from '../../src/app/stores/uploadStore'
import CropView from '../../src/features/crop/CropView.vue'
import HomeView from '../../src/features/home/HomeView.vue'
import { createImageInput } from '../../src/features/upload'

const cropperMock = vi.hoisted(() => ({
  instances: [] as Array<{
    destroy: ReturnType<typeof vi.fn>
    getData: ReturnType<typeof vi.fn>
  }>,
}))

vi.mock('cropperjs', () => ({
  default: class MockCropper {
    destroy = vi.fn()
    getData = vi.fn(() => ({
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    }))

    constructor(_imageElement: HTMLImageElement, options: { ready?: (event: unknown) => void }) {
      cropperMock.instances.push(this as never)
      options.ready?.({ currentTarget: { cropper: this } })
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

beforeEach(() => {
  cropperMock.instances.length = 0
  let sequence = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:task024-${sequence++}`),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TASK-024 crop view', () => {
  it('shows a safe empty state when no source image is available', async () => {
    const { wrapper } = await mountCropView()

    expect(wrapper.get('[data-testid="crop-empty-state"]').text()).toContain('还没有可裁剪的图片')
    expect(wrapper.find('[data-testid="crop-source-image"]').exists()).toBe(false)
    expect(cropperMock.instances).toHaveLength(0)

    wrapper.unmount()
  })

  it('loads the original image, initializes full-image CropState, and preserves warnings', async () => {
    const pinia = createPinia()
    const uploadStore = useUploadStore(pinia)
    const input = createImageInput(new Blob(['image'], { type: 'image/png' }), 'photo.png')
    if (!input) {
      throw new Error('expected image input fixture')
    }
    uploadStore.setPendingInput(
      input,
      [
        {
          code: 'low-resolution',
          message: '图片分辨率较低，生成后细节可能不足，但仍可继续。',
        },
      ],
      { width: 640, height: 480 },
    )

    const { wrapper } = await mountCropView(pinia)
    await flushPromises()

    expect(wrapper.get('[data-testid="crop-source-image"]').attributes('src')).toBe(
      'blob:task024-0',
    )
    expect(wrapper.get('[role="status"]').text()).toContain('图片分辨率较低')
    expect((wrapper.vm as unknown as { cropState: unknown }).cropState).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      rotation: 0,
      aspectRatio: 4 / 3,
    })
    expect(cropperMock.instances).toHaveLength(1)

    wrapper.unmount()
    expect(cropperMock.instances[0].destroy).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:task024-0')
  })

  it('destroys the old cropper and releases the old URL when the source changes', async () => {
    const pinia = createPinia()
    const uploadStore = useUploadStore(pinia)
    const firstInput = createImageInput(new Blob(['one'], { type: 'image/png' }), 'one.png')
    const secondInput = createImageInput(new Blob(['two'], { type: 'image/png' }), 'two.png')
    if (!firstInput || !secondInput) {
      throw new Error('expected image input fixtures')
    }
    uploadStore.setPendingInput(firstInput, [], { width: 640, height: 480 })

    const { wrapper } = await mountCropView(pinia)
    await flushPromises()
    uploadStore.setPendingInput(secondInput, [], { width: 640, height: 480 })
    await flushPromises()

    expect(cropperMock.instances).toHaveLength(2)
    expect(cropperMock.instances[0].destroy).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:task024-0')
    expect(wrapper.get('[data-testid="crop-source-image"]').attributes('src')).toBe(
      'blob:task024-1',
    )

    wrapper.unmount()
    expect(cropperMock.instances[1].destroy).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:task024-1')
  })
})
