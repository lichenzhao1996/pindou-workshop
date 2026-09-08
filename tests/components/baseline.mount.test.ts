import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MountExample from './fixtures/MountExample.vue'

describe('Vue Test Utils baseline', () => {
  it('mounts a Vue component and observes an interaction', async () => {
    const wrapper = mount(MountExample)

    expect(wrapper.text()).toBe('点击次数：0')

    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toBe('点击次数：1')
  })
})
