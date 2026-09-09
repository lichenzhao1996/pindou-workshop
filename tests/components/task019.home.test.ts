import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import HomeView from '../../src/features/home/HomeView.vue'

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: HomeView }],
  })
}

describe('TASK-019 home foundation', () => {
  it('renders the product value, upload entry, and three-step explanation', () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [createPinia(), createTestRouter()],
      },
    })

    expect(wrapper.get('h1').text()).toBe('把你的图片，变成可以直接制作的拼豆图纸')
    expect(wrapper.get('[data-testid="upload-cta"]').text()).toBe('上传图片')
    expect(wrapper.get('h2').text()).toContain('可以照着制作的图纸')
    expect(wrapper.text()).toContain('MARD 291 色')
    expect(wrapper.text()).toContain('用豆数量统计')
    expect(wrapper.text()).toContain('下载制作图纸')
    expect(wrapper.findAll('.step-item')).toHaveLength(3)
    expect(wrapper.findAll('.step-item h3').map((step) => step.text())).toEqual([
      '上传图片',
      '调整尺寸',
      '下载图纸',
    ])
    expect(wrapper.text()).not.toContain('试试看示例')
  })
})
