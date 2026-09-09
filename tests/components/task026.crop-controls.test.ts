import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadStore } from '../../src/app/stores/uploadStore'
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
  zoomable?: boolean
  zoomOnWheel?: boolean
  rotatable?: boolean
  ready?: (event: unknown) => void
  crop?: (event: { detail: CropDataFixture }) => void
}

interface CropperInstanceFixture {
  destroy: ReturnType<typeof vi.fn>
  zoom: ReturnType<typeof vi.fn>
  rotate: ReturnType<typeof vi.fn>
  options: CropperOptionsFixture
}

const cropperMock = vi.hoisted(() => ({
  instances: [] as CropperInstanceFixture[],
}))

vi.mock('cropperjs', () => ({
  default: class MockCropper {
    destroy = vi.fn()
    zoom = vi.fn()
    rotate = vi.fn()
    options: CropperOptionsFixture

    constructor(_imageElement: HTMLImageElement, options: CropperOptionsFixture) {
      this.options = options
      cropperMock.instances.push(this as unknown as CropperInstanceFixture)
      options.ready?.({ currentTarget: { cropper: this } })
    }

    getData(): CropDataFixture {
      return {
        x: 0,
        y: 0,
        width: 640,
        height: 480,
        rotate: 0,
        scaleX: 1,
        scaleY: 1,
      }
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
  const wrapper = mount(CropView, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { wrapper, input }
}

beforeEach(() => {
  cropperMock.instances.length = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:task026'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TASK-026 crop controls', () => {
  it('enables Cropper zoom and rotation without changing the CropState coordinate model', async () => {
    const { wrapper } = await mountCropView()
    const instance = cropperMock.instances[0]

    expect(instance.options.zoomable).toBe(true)
    expect(instance.options.zoomOnWheel).toBe(true)
    expect(instance.options.rotatable).toBe(true)
    expect((wrapper.vm as unknown as { cropState: unknown }).cropState).toMatchObject({
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      rotation: 0,
    })

    await wrapper.get('[data-testid="crop-zoom-in"]').trigger('click')
    await wrapper.get('[data-testid="crop-zoom-out"]').trigger('click')
    await wrapper.get('[data-testid="crop-rotate-left"]').trigger('click')
    await wrapper.get('[data-testid="crop-rotate-right"]').trigger('click')

    expect(instance.zoom).toHaveBeenNthCalledWith(1, 0.1)
    expect(instance.zoom).toHaveBeenNthCalledWith(2, -0.1)
    expect(instance.rotate).toHaveBeenNthCalledWith(1, -90)
    expect(instance.rotate).toHaveBeenNthCalledWith(2, 90)

    wrapper.unmount()
  })

  it('normalizes rotated Cropper data into source-coordinate CropState', async () => {
    const { wrapper, input } = await mountCropView()
    const cropHandler = cropperMock.instances[0].options.crop
    if (!cropHandler) {
      throw new Error('expected Cropper crop handler')
    }

    cropHandler({
      detail: {
        x: 40,
        y: 30,
        width: 200,
        height: 100,
        rotate: -90,
        scaleX: 1,
        scaleY: 1,
      },
    })

    expect((wrapper.vm as unknown as { cropState: unknown }).cropState).toEqual({
      x: 510,
      y: 40,
      width: 100,
      height: 200,
      rotation: 270,
      aspectRatio: 0.5,
    })
    expect((wrapper.vm as unknown as { sourceImageUrl: string }).sourceImageUrl).toBe(
      'blob:task026',
    )
    expect(input.originalImage.size).toBe(5)

    wrapper.unmount()
  })
})
