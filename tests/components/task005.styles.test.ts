import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import App from '../../src/App.vue'
import '../../src/styles/globals.css'

describe('TASK-005 global styles', () => {
  it('loads the global variables and mounts the scoped root shell', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: { template: '<div data-test="route-view" />' },
        },
      },
    })

    expect(wrapper.get('.app-shell').exists()).toBe(true)
    const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
    const globalsCss = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')

    expect(tokensCss).toContain('--color-page-background')
    expect(tokensCss).toContain('--space-6')
    expect(globalsCss).toContain('box-sizing: border-box')
  })
})
