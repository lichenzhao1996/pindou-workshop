import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadStore } from '../../src/app/stores/uploadStore'
import HomeView from '../../src/features/home/HomeView.vue'

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', async () => ({
    width: 300,
    height: 300,
    close: vi.fn(),
  }))
})

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

function createPasteEvent(items: Array<{ type: string; getAsFile: () => File | null }>) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: { items },
  })
  return event
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TASK-022 pasted image upload', () => {
  it('uses the shared upload flow and enters the crop route without a filename', async () => {
    const { pinia, router, wrapper } = await mountHome()
    const file = new File(['image'], 'pasted.png', { type: 'image/png' })
    const event = createPasteEvent([{ type: 'image/png', getAsFile: () => file }])

    window.dispatchEvent(event)
    await flushPromises()

    const store = useUploadStore(pinia)
    expect(event.defaultPrevented).toBe(true)
    expect(router.currentRoute.value.name).toBe('crop')
    expect(store.pendingInput?.originalImage).toBe(file)
    expect(store.pendingInput?.originalFileName).toBeNull()

    wrapper.unmount()
  })

  it('ignores pasted text and does not create an image input', async () => {
    const { pinia, router, wrapper } = await mountHome()
    const event = createPasteEvent([{ type: 'text/plain', getAsFile: () => null }])

    window.dispatchEvent(event)
    await flushPromises()

    expect(event.defaultPrevented).toBe(false)
    expect(router.currentRoute.value.name).toBe('home')
    expect(useUploadStore(pinia).pendingInput).toBeNull()

    wrapper.unmount()
  })

  it('removes the paste listener when the home component unmounts', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { wrapper } = await mountHome()
    const pasteListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'paste',
    )?.[1]

    wrapper.unmount()

    expect(pasteListener).toEqual(expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('paste', pasteListener)
  })
})
