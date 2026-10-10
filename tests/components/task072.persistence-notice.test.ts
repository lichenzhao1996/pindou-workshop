import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PersistenceNotice from '../../src/app/components/PersistenceNotice.vue'
import { autoSaveStatus } from '../../src/storage/auto-save-coordinator'

function resetStatus() {
  autoSaveStatus.isSaving = false
  autoSaveStatus.isDirty = false
  autoSaveStatus.errorMessage = null
  autoSaveStatus.lastSavedAt = null
}

afterEach(resetStatus)

describe('TASK-072 persistence failure notice', () => {
  it('shows a clear unsaved-change warning and retry action without hiding the app', () => {
    autoSaveStatus.isDirty = true
    autoSaveStatus.errorMessage = '当前修改尚未成功保存，刷新页面可能丢失最新更改。'

    const wrapper = mount(PersistenceNotice)

    expect(wrapper.get('[role="alert"]').text()).toContain(
      '当前修改尚未成功保存，刷新页面可能丢失最新更改。',
    )
    expect(wrapper.get('button').text()).toBe('重试保存')
    wrapper.unmount()
  })

  it('shows a non-error saving status while a write is pending', () => {
    autoSaveStatus.isDirty = true
    autoSaveStatus.isSaving = true

    const wrapper = mount(PersistenceNotice)

    expect(wrapper.get('[role="status"]').text()).toContain('正在保存作品')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
