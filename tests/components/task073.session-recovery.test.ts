import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import SessionRecoveryPanel from '../../src/app/components/SessionRecoveryPanel.vue'
import { initializeSessionRecovery, sessionRecoveryState } from '../../src/app/session-recovery'

const DummyRoute = { template: '<main data-testid="home-route">首页</main>' }

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: DummyRoute },
      { path: '/editor', component: { template: '<main>Editor</main>' } },
    ],
  })
}

afterEach(() => {
  sessionRecoveryState.status = 'loading'
  sessionRecoveryState.session = null
  sessionRecoveryState.errorMessage = null
  sessionRecoveryState.generationError = null
  sessionRecoveryState.discarding = false
  vi.restoreAllMocks()
})

describe('TASK-073 recovery error interface', () => {
  it('does not clear before the second confirmation and only returns Home after successful clear', async () => {
    const clear = vi.fn(async () => undefined)
    await initializeSessionRecovery(createPinia(), {
      loadSession: async () => {
        throw new Error('corrupt record')
      },
      clearSession: clear,
      markGenerationAttempt: async () => true,
      decodeImage: async () => ({ width: 1, height: 1 }),
    })
    const router = createTestRouter()
    await router.push('/editor')
    await router.isReady()
    const wrapper = mount(SessionRecoveryPanel, { global: { plugins: [router] } })

    await wrapper.get('button.secondary').trigger('click')
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('可能导致作品永久丢失')
    expect(clear).not.toHaveBeenCalled()

    await wrapper.get('[role="alertdialog"] button').trigger('click')
    await flushPromises()
    expect(clear).toHaveBeenCalledOnce()
    expect(sessionRecoveryState.status).toBe('ready')
    expect(router.currentRoute.value.name).toBe('home')
    wrapper.unmount()
  })

  it('retries a failed read without clearing and releases the route after a valid empty session', async () => {
    let reads = 0
    const clear = vi.fn(async () => undefined)
    await initializeSessionRecovery(createPinia(), {
      loadSession: async () => {
        reads += 1
        if (reads === 1) throw new Error('temporary read failure')
        return null
      },
      clearSession: clear,
      markGenerationAttempt: async () => true,
      decodeImage: async () => ({ width: 1, height: 1 }),
    })
    const router = createTestRouter()
    await router.push('/editor')
    await router.isReady()
    const wrapper = mount(SessionRecoveryPanel, { global: { plugins: [router] } })

    await wrapper.get('button:not(.secondary)').trigger('click')
    await flushPromises()
    expect(reads).toBe(2)
    expect(clear).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not leave the recovery screen if explicit clearing fails', async () => {
    await initializeSessionRecovery(createPinia(), {
      loadSession: async () => {
        throw new Error('corrupt record')
      },
      clearSession: async () => {
        throw new Error('blocked clear')
      },
      markGenerationAttempt: async () => true,
      decodeImage: async () => ({ width: 1, height: 1 }),
    })
    const router = createTestRouter()
    const wrapper = mount(SessionRecoveryPanel, { global: { plugins: [router] } })

    await wrapper.get('button.secondary').trigger('click')
    await wrapper.get('[role="alertdialog"] button').trigger('click')
    await flushPromises()
    expect(sessionRecoveryState.status).toBe('error')
    expect(sessionRecoveryState.errorMessage).toContain('原记录仍保留')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
