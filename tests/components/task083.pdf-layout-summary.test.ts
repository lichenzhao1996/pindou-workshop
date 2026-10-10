import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PdfLayoutSummary from '../../src/features/editor/components/PdfLayoutSummary.vue'

describe('TASK-083 PDF layout default summary', () => {
  it('displays A4, auto orientation, 10mm margins and the 6mm readable target range', () => {
    const wrapper = mount(PdfLayoutSummary)
    expect(wrapper.get('[data-testid="pdf-default-paper"]').text()).toBe('A4')
    expect(wrapper.get('[data-testid="pdf-default-orientation"]').text()).toBe('自动')
    expect(wrapper.get('[data-testid="pdf-default-margin"]').text()).toBe('10 mm')
    expect(wrapper.get('[data-testid="pdf-default-cell-size"]').text()).toContain('6 mm（5～7 mm）')
  })
})
