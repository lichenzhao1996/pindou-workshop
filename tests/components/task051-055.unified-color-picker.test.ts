import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, type PropType } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project } from '../../src/domain/project/types'
import UnifiedColorPicker from '../../src/features/editor/components/UnifiedColorPicker.vue'

function createProjectFixture(): Project {
  const project = createProject({
    source: {
      originalImage: new Blob(['picker-image'], { type: 'image/png' }),
      originalFileName: 'picker.png',
      mimeType: 'image/png',
      originalWidth: 20,
      originalHeight: 20,
    },
    crop: { x: 0, y: 0, width: 20, height: 20, rotation: 0, aspectRatio: 1 },
  })
  project.grid = createGrid(4, 2)
  project.grid.cells.set([1, 1, 2, 0, 2, 0, 0, 3])
  return project
}

const PickerHost = defineComponent({
  props: { project: { type: Object as PropType<Project | null>, default: null } },
  setup(props) {
    const editor = useEditorStore()
    return () =>
      h(UnifiedColorPicker, {
        modelValue: editor.activePaletteIndex,
        project: props.project,
        'onUpdate:modelValue': (paletteIndex: number) => editor.selectPaletteIndex(paletteIndex),
      })
  },
})

function mountPicker(project: Project | null = createProjectFixture()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(PickerHost, {
    props: { project },
    global: { plugins: [pinia] },
  })
  return { wrapper, editor: useEditorStore(pinia) }
}

describe('TASK-051–055 UnifiedColorPicker', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => setActivePinia(undefined))

  it('opens with all 291 colors in family mode, includes white, and reopens in family mode', async () => {
    const { wrapper, editor } = mountPicker()
    expect(wrapper.find('[data-testid="unified-color-picker-dialog"]').exists()).toBe(false)
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    await flushPromises()

    expect(
      wrapper.get('[data-testid="unified-color-picker-dialog"]').attributes('data-browse-mode'),
    ).toBe('family')
    expect(wrapper.findAll('.picker-results .palette-color-button')).toHaveLength(291)
    expect(wrapper.findAll('[data-color-index="0"]')).toHaveLength(0)
    const whiteEntry = MARD_291_PALETTE.entries.find(
      (entry) => entry.rgb.r === 255 && entry.rgb.g === 255 && entry.rgb.b === 255,
    )!
    expect(wrapper.find(`[data-testid="picker-color-${whiteEntry.paletteIndex}"]`).exists()).toBe(
      true,
    )
    expect(
      wrapper
        .findAll('.picker-results .palette-color-button')
        .some((button) => button.text().includes('ZG')),
    ).toBe(true)

    await wrapper.get('[data-testid="picker-mode-code"]').trigger('click')
    expect(
      wrapper.get('[data-testid="unified-color-picker-dialog"]').attributes('data-browse-mode'),
    ).toBe('code')
    await wrapper.get('[data-testid="picker-close"]').trigger('click')
    expect(editor.activePaletteIndex).toBeNull()
    expect(editor.recentPaletteIndexes).toEqual([])
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="unified-color-picker-dialog"]').attributes('data-browse-mode'),
    ).toBe('family')
    wrapper.unmount()
  })

  it('filters all formal search fields without selecting results and preserves search across manual mode changes', async () => {
    const { wrapper, editor } = mountPicker()
    editor.selectPaletteIndex(17)
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    const search = wrapper.get('[data-testid="picker-search"]')
    await search.setValue('  mard:a26  ')
    await flushPromises()
    expect(wrapper.findAll('.picker-results .palette-color-button')).toHaveLength(1)
    expect(wrapper.find('[data-testid="picker-color-26"]').exists()).toBe(true)
    expect(editor.activePaletteIndex).toBe(17)
    expect(editor.recentPaletteIndexes).toEqual([17])

    await wrapper.get('[data-testid="picker-mode-code"]').trigger('click')
    expect((wrapper.get('[data-testid="picker-search"]').element as HTMLInputElement).value).toBe(
      '  mard:a26  ',
    )
    expect(wrapper.findAll('.picker-results .palette-color-button')).toHaveLength(1)
    await wrapper.get('[data-testid="picker-clear-search"]').trigger('click')
    expect(wrapper.findAll('.picker-results .palette-color-button')).toHaveLength(291)

    await wrapper.get('[data-testid="picker-search"]').setValue('not-a-color')
    expect(wrapper.get('[data-testid="picker-no-results"]').text()).toContain('没有找到')
    expect(editor.activePaletteIndex).toBe(17)
    wrapper.unmount()
  })

  it('routes every user selection through the Store and records recent colors as MRU', async () => {
    const { wrapper, editor } = mountPicker()
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    await wrapper.get('[data-testid="picker-mode-code"]').trigger('click')
    await wrapper.get('[data-testid="picker-color-1"]').trigger('click')
    await wrapper.get('[data-testid="picker-color-2"]').trigger('click')
    expect(editor.activePaletteIndex).toBe(2)
    expect(editor.recentPaletteIndexes).toEqual([2, 1])

    await wrapper.get('[data-testid="picker-recent-1"]').trigger('click')
    expect(editor.activePaletteIndex).toBe(1)
    expect(editor.recentPaletteIndexes).toEqual([1, 2])

    await wrapper.get('[data-testid="picker-used-2"]').trigger('click')
    expect(editor.activePaletteIndex).toBe(2)
    expect(editor.recentPaletteIndexes).toEqual([2, 1])
    expect(wrapper.findAll('.picker-results .palette-color-button')).toHaveLength(291)
    wrapper.unmount()
  })

  it('derives current-used rows from ProjectStats and updates on immutable Grid replacement', async () => {
    const project = createProjectFixture()
    const { wrapper } = mountPicker(project)
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    const used = wrapper.get('[data-testid="picker-used-list"]')
    expect(used.findAll('.used-color-row').map((row) => row.attributes('data-testid'))).toEqual([
      'picker-used-1',
      'picker-used-2',
      'picker-used-3',
    ])
    expect(used.get('[data-testid="picker-used-2"]').text()).toContain('2')

    const replacement = { ...project, grid: createGrid(3, 1) }
    replacement.grid.cells.set([3, 3, 0])
    await wrapper.setProps({ project: replacement })
    expect(wrapper.findAll('.used-color-row').map((row) => row.attributes('data-testid'))).toEqual([
      'picker-used-3',
    ])
    wrapper.unmount()
  })

  it('retains active and recent Palette state across Project changes', async () => {
    const { wrapper, editor } = mountPicker(createProjectFixture())
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    await wrapper.get('[data-testid="picker-mode-code"]').trigger('click')
    await wrapper.get('[data-testid="picker-color-11"]').trigger('click')
    expect(editor.recentPaletteIndexes).toEqual([11])

    await wrapper.setProps({ project: createProjectFixture() })
    expect(editor.activePaletteIndex).toBe(11)
    expect(editor.recentPaletteIndexes).toEqual([11])
    expect(wrapper.get('[data-testid="picker-recent-11"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('supports Escape and restores keyboard focus after close', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(PickerHost, {
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    const trigger = wrapper.get('[data-testid="unified-color-picker-toggle"]')
    await trigger.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="picker-search"]').element)

    await wrapper.get('[data-testid="unified-color-picker-dialog"]').trigger('keydown', {
      key: 'Escape',
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="unified-color-picker-dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('shows formal details and six ΔE76 recommendations, updating while details stay open', async () => {
    const project = createProjectFixture()
    const { wrapper, editor } = mountPicker(project)
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    expect(
      wrapper.get('[data-testid="picker-details-toggle"]').attributes('disabled'),
    ).toBeDefined()
    editor.setActivePaletteIndex(1)
    await flushPromises()
    expect(
      wrapper.get('[data-testid="picker-details-toggle"]').attributes('disabled'),
    ).toBeUndefined()
    await wrapper.get('[data-testid="picker-details-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="picker-details"]').text()).toContain('A1')
    expect(wrapper.get('[data-testid="picker-details"]').text()).toContain(
      MARD_291_PALETTE.entries[0].name,
    )
    expect(wrapper.get('[data-testid="picker-details"]').text()).toContain(
      MARD_291_PALETTE.entries[0].family,
    )
    expect(wrapper.get('[data-testid="picker-details"]').text()).toContain(
      MARD_291_PALETTE.entries[0].hex,
    )
    expect(wrapper.get('[data-testid="picker-detail-count"]').text()).toBe('2')
    expect(wrapper.findAll('[data-testid="picker-similar-colors"] button')).toHaveLength(6)
    expect(editor.recentPaletteIndexes).toEqual([])

    await wrapper.get('[data-testid="picker-similar-2"]').trigger('click')
    expect(editor.activePaletteIndex).toBe(2)
    expect(editor.recentPaletteIndexes).toEqual([2])
    expect(wrapper.get('[data-testid="picker-details"]').text()).toContain('A2')
    expect(wrapper.get('[data-testid="picker-detail-count"]').text()).toBe('2')
    wrapper.unmount()
  })

  it('has safe empty states without a Project/Grid and never changes Project data', async () => {
    const { wrapper, editor } = mountPicker(null)
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="picker-used-empty"]').text()).toContain('暂无作品')
    const projectWithoutGrid = createProject({
      source: {
        originalImage: new Blob(['empty-project'], { type: 'image/png' }),
        originalFileName: 'empty.png',
        mimeType: 'image/png',
        originalWidth: 20,
        originalHeight: 20,
      },
      crop: { x: 0, y: 0, width: 20, height: 20, rotation: 0, aspectRatio: 1 },
    })
    await wrapper.setProps({ project: projectWithoutGrid })
    expect(wrapper.get('[data-testid="picker-used-empty"]').text()).toContain('暂无作品颜色')
    const project = createProjectFixture()
    const cellsBefore = project.grid!.cells.slice()
    const revisionBefore = project.revision
    const updatedAtBefore = project.updatedAt
    await wrapper.setProps({ project })
    await wrapper.get('[data-testid="picker-color-1"]').trigger('click')
    expect(editor.activePaletteIndex).toBe(1)
    expect(project.grid!.cells).toEqual(cellsBefore)
    expect(project.revision).toBe(revisionBefore)
    expect(project.updatedAt).toBe(updatedAtBefore)
    wrapper.unmount()
  })
})
