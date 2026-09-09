import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadStore } from '../../src/app/stores/uploadStore'
import CropView from '../../src/features/crop/CropView.vue'
import HomeView from '../../src/features/home/HomeView.vue'

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      {
        path: '/crop',
        name: 'crop',
        component: defineComponent({ template: '<main>裁剪页路由占位</main>' }),
      },
    ],
  })
}

async function mountHome() {
  const pinia = createPinia()
  const router = createTestRouter()
  await router.push('/')
  await router.isReady()
  const wrapper = mount(HomeView, {
    global: { plugins: [pinia, router] },
  })

  return { pinia, router, wrapper }
}

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', async () => ({
    width: 100,
    height: 100,
    close: vi.fn(),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TASK-023 image notices', () => {
  it('stores warnings, continues to crop, and displays them on the crop route', async () => {
    const { pinia, router, wrapper } = await mountHome()
    const file = new File(['image'], 'small.png', { type: 'image/png' })
    const input = wrapper.get('[data-testid="image-file-input"]')

    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()

    const store = useUploadStore(pinia)
    expect(router.currentRoute.value.name).toBe('crop')
    expect(store.pendingWarnings.map((warning) => warning.code)).toEqual(['low-resolution'])

    const cropWrapper = mount(CropView, { global: { plugins: [pinia] } })
    expect(cropWrapper.get('[role="status"]').text()).toContain('图片分辨率较低')
  })

  it('keeps decode errors on the home route and shows a readable message', async () => {
    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('decode failed')
    })
    const { router, wrapper } = await mountHome()
    const file = new File(['broken'], 'broken.png', { type: 'image/png' })
    const input = wrapper.get('[data-testid="image-file-input"]')

    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('home')
    expect(wrapper.get('[role="alert"]').text()).toBe(
      '图片无法读取，请选择有效的 JPG、PNG 或 WEBP 图片。',
    )
  })
})
