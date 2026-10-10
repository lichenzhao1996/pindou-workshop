import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PdfLayoutSummary from '../../src/features/editor/components/PdfLayoutSummary.vue'

describe('TASK-085 manual PDF pagination settings', () => {
  it('updates estimated pages and readability warning while keeping the settings editable', async () => {
    const wrapper = mount(PdfLayoutSummary, {
      props: { grid: { width: 64, height: 48 }, manualCells: null },
    })

    expect(wrapper.get('[data-testid="pdf-pagination-estimate"]').text()).toContain('预计 4 页')
    await wrapper.get('[data-testid="pdf-manual-columns"]').setValue('70')
    expect(wrapper.emitted('update:manualCells')?.at(-1)?.[0]).toEqual({ columns: 70, rows: 31 })

    await wrapper.setProps({ manualCells: { columns: 70, rows: 31 } })
    await wrapper.get('[data-testid="pdf-manual-rows"]').setValue('60')
    expect(wrapper.emitted('update:manualCells')?.at(-1)?.[0]).toEqual({ columns: 70, rows: 60 })

    await wrapper.setProps({ manualCells: { columns: 70, rows: 60 } })
    expect(wrapper.get('[data-testid="pdf-pagination-estimate"]').text()).toContain('预计 1 页')
    expect(wrapper.get('[data-testid="pdf-readability-warning"]').text()).toContain('仍可继续导出')
    expect(wrapper.get('[data-testid="pdf-manual-columns"]').attributes('aria-invalid')).toBe(
      'false',
    )
  })

  it('rejects malformed counts without creating an unsafe page plan and can reset to auto', async () => {
    const wrapper = mount(PdfLayoutSummary, {
      props: { grid: { width: 64, height: 48 }, manualCells: { columns: 20, rows: 20 } },
    })

    await wrapper.get('[data-testid="pdf-manual-columns"]').setValue('0')
    expect(wrapper.get('[data-testid="pdf-pagination-input-error"]').text()).toContain('正整数')
    expect(wrapper.get('[data-testid="pdf-manual-columns"]').attributes('aria-invalid')).toBe(
      'true',
    )
    await wrapper.get('[data-testid="pdf-reset-pagination"]').trigger('click')
    expect(wrapper.emitted('update:manualCells')?.at(-1)?.[0]).toBeNull()
  })
})
