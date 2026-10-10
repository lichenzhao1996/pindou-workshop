import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, createProject, deriveProjectStats } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import EditorCanvasArea from '../../src/features/editor/components/EditorCanvasArea.vue'
import EditorColorManagement from '../../src/features/editor/components/EditorColorManagement.vue'
import { deriveMaterialStatsView } from '../../src/features/editor/materials/material-stats-view'
import { GRID_AXIS_MARGIN } from '../../src/rendering/viewport'
import {
  createCanvasContextMock,
  installAnimationFrames,
  installCanvasContext,
  installCanvasLayout,
  installResizeObserver,
} from './canvas-test-helpers'

const source: Source = {
  originalImage: new Blob(['task065-068-component'], { type: 'image/png' }),
  originalFileName: 'colors.png',
  mimeType: 'image/png',
  originalWidth: 80,
  originalHeight: 40,
}

function projectWithGrid(values: readonly number[] = [1, 1, 2, 0]): Project {
  const project = createProject({
    source: { ...source },
    crop: { x: 0, y: 0, width: 80, height: 40, rotation: 0, aspectRatio: 2 },
  })
  const grid = createGrid(values.length, 1)
  grid.cells.set(values)
  return { ...project, grid }
}

function mountColorManagement(project: Project) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const projects = useProjectStore(pinia)
  projects.setCurrentProject(project)
  const Host = defineComponent({
    setup() {
      return () =>
        h(EditorColorManagement, {
          project: projects.currentProject,
          materialView: projects.currentProject?.grid
            ? deriveMaterialStatsView(deriveProjectStats(projects.currentProject))
            : null,
        })
    },
  })
  const wrapper = mount(Host, { global: { plugins: [pinia] } })
  return { wrapper, projects, editor: useEditorStore(pinia) }
}

describe('TASK-065/066 color management component', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows ProjectStats-backed counts and percentages, filters only used colors, and leaves editor state untouched', async () => {
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const project = projectWithGrid([1, 1, 2, white.paletteIndex, 0])
    const { wrapper, projects, editor } = mountColorManagement(project)
    editor.setActivePaletteIndex(8)
    editor.setHighlightedPaletteIndex(2)
    editor.recordRecentPaletteIndex(7)
    const originalGrid = projects.currentProject!.grid

    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('3 / 291')
    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('4 颗')
    expect(wrapper.get('[data-testid="used-color-row-1"]').text()).toContain('50.0%')
    expect(wrapper.get(`[data-testid="used-color-row-${white.paletteIndex}"]`).text()).toContain(
      '25.0%',
    )
    expect(wrapper.find('[data-testid="used-color-row-0"]').exists()).toBe(false)

    await wrapper.get('[data-testid="used-color-search"]').setValue(' MARD:A1 ')
    await flushPromises()
    expect(wrapper.findAll('[data-testid^="used-color-row-"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="used-color-row-1"]').exists()).toBe(true)
    await wrapper.get('[data-testid="used-color-search"]').setValue('not-a-color')
    await flushPromises()
    expect(wrapper.get('[data-testid="used-color-no-results"]').exists()).toBe(true)
    await wrapper.get('[data-testid="used-color-search"]').setValue('')
    await wrapper.get('[data-testid="used-color-sort"]').setValue('displayCode')
    expect(
      wrapper
        .findAll('[data-testid^="used-color-row-"]')
        .map((row) => row.attributes('data-testid')),
    ).toEqual(['used-color-row-1', 'used-color-row-2', `used-color-row-${white.paletteIndex}`])
    expect(editor.activePaletteIndex).toBe(8)
    expect(editor.highlightedPaletteIndex).toBe(2)
    expect(editor.recentPaletteIndexes).toEqual([7])
    expect(projects.currentProject!.grid).toBe(originalGrid)
    expect(projects.currentProject!.revision).toBe(project.revision)
    wrapper.unmount()
  })
})

describe('TASK-067/068 color interactions', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('toggles one shared highlight and uses the same alpha on Canvas and MiniMap', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const frames = installAnimationFrames()
    installCanvasLayout(320, 240, 2, 10, 20)
    installResizeObserver()
    const mainContext = createCanvasContextMock()
    const auxiliary = installCanvasContext(mainContext)
    const project = projectWithGrid([1, 2, 0, 3])
    const projects = useProjectStore(pinia)
    projects.setCurrentProject(project)
    const editor = useEditorStore(pinia)
    const wrapper = mount(EditorCanvasArea, {
      props: {
        project,
        projectId: project.projectId,
        grid: project.grid,
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    frames.flush()
    await flushPromises()

    editor.setHighlightedPaletteIndex(1)
    await flushPromises()
    frames.flush()
    await flushPromises()
    const main = wrapper.get('[data-testid="editor-canvas-area"]')
    const miniMap = wrapper.get('[data-testid="editor-minimap-canvas"]')
    expect(main.attributes('data-highlighted-palette-index')).toBe('1')
    expect(main.attributes('data-highlighted-beads')).toBe('1')
    expect(main.attributes('data-dimmed-beads')).toBe('2')
    expect(miniMap.attributes('data-highlighted-palette-index')).toBe('1')
    expect(miniMap.attributes('data-highlighted-beads')).toBe('1')
    expect(miniMap.attributes('data-dimmed-beads')).toBe('2')

    const mapCanvas = miniMap.element as HTMLCanvasElement
    const paletteFills = auxiliary.auxiliaryFills.filter(
      (fill) => fill.canvas === mapCanvas && fill.color.startsWith('rgb('),
    )
    expect(paletteFills.some((fill) => fill.alpha === 0.24)).toBe(true)
    expect(paletteFills.some((fill) => fill.alpha === 1)).toBe(true)

    editor.setHighlightedPaletteIndex(2)
    await flushPromises()
    frames.flush()
    await flushPromises()
    expect(main.attributes('data-highlighted-palette-index')).toBe('2')
    expect(miniMap.attributes('data-highlighted-palette-index')).toBe('2')
    editor.setHighlightedPaletteIndex(null)
    await flushPromises()
    frames.flush()
    await flushPromises()
    expect(main.attributes('data-dimmed-beads')).toBe('0')
    expect(miniMap.attributes('data-dimmed-beads')).toBe('0')
    expect(projects.currentProject!.grid).toBe(project.grid)
    expect(projects.currentProject!.revision).toBe(project.revision)
    wrapper.unmount()
  })

  it('previews replacement only on the main Canvas while MiniMap keeps the formal Grid and highlight', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const frames = installAnimationFrames()
    installCanvasLayout(320, 240, 2, 10, 20)
    installResizeObserver()
    const mainContext = createCanvasContextMock()
    const auxiliary = installCanvasContext(mainContext)
    const project = projectWithGrid([1, 2, 1])
    const projects = useProjectStore(pinia)
    projects.setCurrentProject(project)
    const editor = useEditorStore(pinia)
    editor.setHighlightedPaletteIndex(1)
    const snapshotGrid = project.grid!
    const wrapper = mount(EditorCanvasArea, {
      props: {
        project,
        projectId: project.projectId,
        grid: snapshotGrid,
        replacementPreview: {
          projectId: project.projectId,
          grid: snapshotGrid,
          sourcePaletteIndex: 1,
          targetPaletteIndex: 4,
        },
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    frames.flush()
    await flushPromises()

    const main = wrapper.get('[data-testid="editor-canvas-area"]')
    const mapCanvas = wrapper.get('[data-testid="editor-minimap-canvas"]')
      .element as HTMLCanvasElement
    const replacementEntry = MARD_291_PALETTE.entries.find((entry) => entry.paletteIndex === 4)!
    const sourceEntry = MARD_291_PALETTE.entries.find((entry) => entry.paletteIndex === 1)!
    const mainSourceFill = mainContext.fills.find(
      (fill) => fill.x === GRID_AXIS_MARGIN && fill.y === GRID_AXIS_MARGIN,
    )
    expect(mainSourceFill?.color).toBe(
      `rgb(${replacementEntry.rgb.r} ${replacementEntry.rgb.g} ${replacementEntry.rgb.b})`,
    )
    expect(mainContext.fillAlphas[mainContext.fills.indexOf(mainSourceFill!)]).toBe(0.24)
    expect(main.attributes('data-replacement-beads')).toBe('2')

    const mapSourceFill = auxiliary.auxiliaryFills.find(
      (fill) =>
        fill.canvas === mapCanvas &&
        fill.color === `rgb(${sourceEntry.rgb.r} ${sourceEntry.rgb.g} ${sourceEntry.rgb.b})`,
    )
    expect(mapSourceFill?.alpha).toBe(1)
    expect(
      wrapper.get('[data-testid="editor-minimap-canvas"]').attributes('data-dimmed-beads'),
    ).toBe('1')
    expect(projects.currentProject!.grid).toBe(snapshotGrid)
    expect(Array.from(snapshotGrid.cells)).toEqual([1, 2, 1])
    expect(projects.currentProject!.revision).toBe(project.revision)
    wrapper.unmount()
  })
})

describe('TASK-068 replacement workflow', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps replacement target separate from active color, previews read-only, and supports Undo/Redo', async () => {
    const project = projectWithGrid([1, 1, 2, 0])
    const { wrapper, projects, editor } = mountColorManagement(project)
    editor.setActivePaletteIndex(12)
    editor.setHighlightedPaletteIndex(1)
    const originalGrid = projects.currentProject!.grid
    const originalCells = Array.from(originalGrid!.cells)
    const initialUpdatedAt = projects.currentProject!.updatedAt

    await wrapper.get('[data-testid="used-color-replace-1"]').trigger('click')
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    await wrapper.get('[data-testid="picker-mode-code"]').trigger('click')
    await wrapper.get('[data-testid="picker-color-4"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="unified-color-picker-dialog"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="replacement-preview"]').text()).toContain('A1 → A4')
    expect(wrapper.get('[data-testid="replacement-preview"]').text()).toContain('将影响 2 颗')
    expect(editor.activePaletteIndex).toBe(12)
    expect(editor.recentPaletteIndexes).toEqual([4])
    expect(editor.highlightedPaletteIndex).toBe(1)
    expect(projects.currentProject!.grid).toBe(originalGrid)
    expect(Array.from(projects.currentProject!.grid!.cells)).toEqual(originalCells)
    expect(projects.currentProject!.revision).toBe(project.revision)
    expect(projects.currentProject!.updatedAt).toBe(initialUpdatedAt)
    expect(projects.past).toHaveLength(0)
    const previewEvents = wrapper
      .findComponent(EditorColorManagement)
      .emitted('replacement-preview')!
    expect(previewEvents.at(-1)?.[0]).toMatchObject({
      projectId: project.projectId,
      grid: originalGrid,
      sourcePaletteIndex: 1,
      targetPaletteIndex: 4,
    })

    await wrapper.get('[data-testid="replacement-confirm"]').trigger('click')
    await flushPromises()
    expect(Array.from(projects.currentProject!.grid!.cells)).toEqual([4, 4, 2, 0])
    expect(projects.currentProject!.revision).toBe(project.revision + 1)
    expect(projects.past).toHaveLength(1)
    expect(projects.future).toHaveLength(0)
    expect(editor.activePaletteIndex).toBe(12)
    expect(editor.highlightedPaletteIndex).toBe(1)
    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('2 / 291')

    expect(projects.undo()).toBe(true)
    await flushPromises()
    expect(Array.from(projects.currentProject!.grid!.cells)).toEqual(originalCells)
    expect(wrapper.get('[data-testid="used-color-summary"]').text()).toContain('2 / 291')
    expect(projects.redo()).toBe(true)
    await flushPromises()
    expect(Array.from(projects.currentProject!.grid!.cells)).toEqual([4, 4, 2, 0])
    expect(projects.currentProject!.revision).toBe(project.revision + 1)
    wrapper.unmount()
  })

  it('cancels preview and same-color no-op without changing the Grid, History or Redo branch', async () => {
    const project = projectWithGrid([1, 1, 2, 0])
    const { wrapper, projects } = mountColorManagement(project)
    const first = projects.currentProject!
    projects.applyGridOperation(
      { type: 'setCell', row: 0, column: 3, value: 3 },
      first,
      first.grid!,
    )
    expect(projects.undo()).toBe(true)
    const branchProject = projects.currentProject!
    const grid = branchProject.grid
    const cells = Array.from(grid!.cells)
    const revision = branchProject.revision
    const pastLength = projects.past.length
    const futureLength = projects.future.length

    await wrapper.get('[data-testid="used-color-replace-1"]').trigger('click')
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    await wrapper.get('[data-testid="picker-mode-code"]').trigger('click')
    await wrapper.get('[data-testid="picker-color-1"]').trigger('click')
    await flushPromises()
    expect(
      (wrapper.get('[data-testid="replacement-confirm"]').element as HTMLButtonElement).disabled,
    ).toBe(true)
    await wrapper.get('[data-testid="replacement-cancel"]').trigger('click')
    await flushPromises()

    expect(projects.currentProject).toBe(branchProject)
    expect(projects.currentProject!.grid).toBe(grid)
    expect(Array.from(grid!.cells)).toEqual(cells)
    expect(projects.currentProject!.revision).toBe(revision)
    expect(projects.past).toHaveLength(pastLength)
    expect(projects.future).toHaveLength(futureLength)
    expect(projects.canRedo).toBe(true)
    wrapper.unmount()
  })

  it('invalidates a stale preview after an external Grid replacement', async () => {
    const project = projectWithGrid([1, 1, 2, 0])
    const { wrapper, projects } = mountColorManagement(project)
    await wrapper.get('[data-testid="used-color-replace-1"]').trigger('click')
    await wrapper.get('[data-testid="unified-color-picker-toggle"]').trigger('click')
    await wrapper.get('[data-testid="picker-mode-code"]').trigger('click')
    await wrapper.get('[data-testid="picker-color-4"]').trigger('click')
    await flushPromises()

    const current = projects.currentProject!
    projects.applyGridOperation(
      { type: 'setCell', row: 0, column: 2, value: 3 },
      current,
      current.grid!,
    )
    await flushPromises()

    expect(wrapper.find('[data-testid="replacement-panel"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="replacement-message"]').text()).toContain('作品已变化')
    expect(Array.from(projects.currentProject!.grid!.cells)).toEqual([1, 1, 3, 0])
    expect(projects.currentProject!.grid!.cells.includes(4)).toBe(false)
    wrapper.unmount()
  })
})
