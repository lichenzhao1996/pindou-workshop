import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HomeView from '../../src/features/home/HomeView.vue'

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', async () => ({
    width: 300,
    height: 300,
    close: vi.fn(),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
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
  const router = createTestRouter()
  await router.push('/')
  await router.isReady()
  const wrapper = mount(HomeView, {
    global: { plugins: [createPinia(), router] },
  })

  return { router, wrapper }
}

function createDragEventData(file: File) {
  return {
    files: [file],
    types: ['Files'],
  }
}

describe('TASK-021 drag image upload', () => {
  it('uses the shared upload flow and clears drag state after drop', async () => {
    const { router, wrapper } = await mountHome()
    const dropzone = wrapper.get('[data-testid="upload-dropzone"]')
    const file = new File(['image'], 'dragged.png', { type: 'image/png' })

    await dropzone.trigger('dragenter', { dataTransfer: createDragEventData(file) })
    expect(dropzone.classes()).toContain('is-dragging')

    await dropzone.trigger('drop', { dataTransfer: createDragEventData(file) })
    await flushPromises()

    expect(dropzone.classes()).not.toContain('is-dragging')
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('clears drag state when the pointer leaves the upload entry', async () => {
    const { wrapper } = await mountHome()
    const dropzone = wrapper.get('[data-testid="upload-dropzone"]')
    const file = new File(['image'], 'dragged.webp', { type: 'image/webp' })

    await dropzone.trigger('dragover', { dataTransfer: createDragEventData(file) })
    expect(dropzone.classes()).toContain('is-dragging')

    await dropzone.trigger('dragleave')

    expect(dropzone.classes()).not.toContain('is-dragging')
  })
})
