import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PersistenceNotice from '../../src/app/components/PersistenceNotice.vue'
import { autoSaveStatus } from '../../src/storage/auto-save-coordinator'

afterEach(() => {
  autoSaveStatus.isDirty = false
  autoSaveStatus.isSaving = false
  autoSaveStatus.errorMessage = null
  autoSaveStatus.lastSavedAt = null
})

describe('TASK-096 storage degradation notice', () => {
  it('keeps the active in-memory editor visible beside a clear save-failure notice', () => {
    autoSaveStatus.isDirty = true
    autoSaveStatus.errorMessage = '当前修改尚未成功保存，刷新页面可能丢失最新更改。'
    const wrapper = mount({
      components: { PersistenceNotice },
      template: `
        <main>
          <PersistenceNotice />
          <section data-testid="memory-editor">当前作品仍可继续编辑</section>
        </main>
      `,
    })

    expect(wrapper.get('[data-testid="memory-editor"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="persistence-notice"]').attributes('role')).toBe('alert')
    expect(wrapper.get('[data-testid="persistence-notice"]').text()).toContain(
      '刷新页面可能丢失最新更改',
    )
    expect(wrapper.get('button').text()).toBe('重试保存')
    wrapper.unmount()
  })
})
