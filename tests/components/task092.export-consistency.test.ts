import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, createProject } from '../../src/domain/project'
import type { Source } from '../../src/domain/project'
import EditorSidebar from '../../src/features/editor/components/EditorSidebar.vue'

const source: Source = {
  originalImage: new Blob(['task092-component'], { type: 'image/png' }),
  originalFileName: 'task092.png',
  mimeType: 'image/png',
  originalWidth: 8,
  originalHeight: 1,
}

describe('TASK-092 materials component consistency', () => {
  it('shows the same actual counts in used colors and the complete materials list', async () => {
    const pinia = createPinia()
    const store = useProjectStore(pinia)
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const project = createProject({
      source,
      crop: { x: 0, y: 0, width: 8, height: 1, rotation: 0, aspectRatio: 8 },
      widthBeads: 8,
    })
    const grid = createGrid(8, 1)
    grid.cells.set([0, white.paletteIndex, white.paletteIndex, 2, 2, 2, 35, 35])
    store.setCurrentProject({ ...project, grid, revision: 7 })
    const wrapper = mount(EditorSidebar, {
      props: { project: store.currentProject! },
      global: { plugins: [pinia], stubs: { RouterLink: true } },
    })

    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain(
      '3 / 291 种颜色 · 7 颗拼豆',
    )
    for (const [paletteIndex, count] of [
      [2, 3],
      [35, 2],
      [white.paletteIndex, 2],
    ] as const) {
      expect(wrapper.get(`[data-testid="used-color-row-${paletteIndex}"]`).text()).toContain(
        `${count} 颗`,
      )
    }
    expect(wrapper.find('[data-testid="used-color-row-0"]').exists()).toBe(false)

    await wrapper.get('[data-testid="material-list-toggle"]').trigger('click')
    expect(wrapper.findAll('[data-testid^="material-list-row-"]')).toHaveLength(3)
    for (const [paletteIndex, count] of [
      [2, 3],
      [35, 2],
      [white.paletteIndex, 2],
    ] as const) {
      expect(wrapper.get(`[data-testid="material-list-row-${paletteIndex}"]`).text()).toContain(
        `${count} 颗`,
      )
    }
    expect(store.currentProject?.revision).toBe(7)
    wrapper.unmount()
  })
})
