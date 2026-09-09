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
  aspectRatio?: number
  data?: unknown
  dragMode?: string
  cropBoxMovable?: boolean
  cropBoxResizable?: boolean
  movable?: boolean
  rotatable?: boolean
  scalable?: boolean
  zoomable?: boolean
  ready?: (event: unknown) => void
  crop?: (event: { detail: CropDataFixture }) => void
}

interface CropperInstanceFixture {
  destroy: ReturnType<typeof vi.fn>
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

    emitCrop(data: CropDataFixture) {
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

async function prepareSource() {
  const pinia = createPinia()
  const uploadStore = useUploadStore(pinia)
  const sourceBlob = new Blob(['image'], { type: 'image/png' })
  const input = createImageInput(sourceBlob, 'photo.png')
  if (!input) {
    throw new Error('expected image input fixture')
  }
  uploadStore.setPendingInput(input, [], { width: 640, height: 480 })

  const mounted = await mountCropView(pinia)
  await flushPromises()
  return { ...mounted, input, sourceBlob }
}

beforeEach(() => {
  cropperMock.instances.length = 0
  let sequence = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:task025-${sequence++}`),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TASK-025 crop interaction', () => {
  it('enables a movable, resizable crop box with no fixed ratio', async () => {
    const { wrapper } = await prepareSource()
    const instance = cropperMock.instances[0]

    expect(instance.options.dragMode).toBe('none')
    expect(instance.options.cropBoxMovable).toBe(true)
    expect(instance.options.cropBoxResizable).toBe(true)
    expect(instance.options.aspectRatio).toBeUndefined()

    wrapper.unmount()
  })

  it('syncs moved and resized crop data to CropState without changing the source blob', async () => {
    const { wrapper, sourceBlob } = await prepareSource()
    cropperMock.instances[0].emitCrop({
      x: 80.5,
      y: 40.25,
      width: 320.75,
      height: 200.5,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    })

    expect((wrapper.vm as unknown as { cropState: unknown }).cropState).toEqual({
      x: 80.5,
      y: 40.25,
      width: 320.75,
      height: 200.5,
      rotation: 0,
      aspectRatio: 320.75 / 200.5,
    })
    expect((wrapper.vm as unknown as { sourceImageUrl: string }).sourceImageUrl).toBe(
      'blob:task025-0',
    )
    expect(sourceBlob.size).toBe(5)

    wrapper.unmount()
  })

  it('rejects crop events that exceed the source image bounds', async () => {
    const { wrapper } = await prepareSource()

    expect(() =>
      cropperMock.instances[0].emitCrop({
        x: 400,
        y: 0,
        width: 320,
        height: 240,
        rotate: 0,
        scaleX: 1,
        scaleY: 1,
      }),
    ).toThrow('crop data must stay within source image bounds')

    wrapper.unmount()
  })
})
