import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { useUploadStore } from '../../src/app/stores/uploadStore'
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
  const wrapper = mount(HomeView, { global: { plugins: [pinia, router] } })

  return { pinia, router, wrapper }
}

describe('TASK-020 home image selection', () => {
  it('stores a supported file and navigates to the crop route', async () => {
    const { pinia, router, wrapper } = await mountHome()
    const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })
    const input = wrapper.get('[data-testid="image-file-input"]')

    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('crop')
    expect(useUploadStore(pinia).pendingInput?.originalImage).toBe(file)
    expect(useUploadStore(pinia).pendingInput?.originalFileName).toBe('photo.jpg')
  })

  it('shows a clear error and does not navigate for unsupported files', async () => {
    const { router, wrapper } = await mountHome()
    const input = wrapper.get('[data-testid="image-file-input"]')
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' })

    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')

    expect(wrapper.get('[role="alert"]').text()).toBe(
      '文件格式不支持，请选择 JPG、PNG 或 WEBP 图片。',
    )
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('does nothing when the user cancels the file chooser', async () => {
    const { router, wrapper } = await mountHome()
    const input = wrapper.get('[data-testid="image-file-input"]')

    Object.defineProperty(input.element, 'files', { value: [] })
    await input.trigger('change')

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('home')
  })
})
