import { flushPromises, mount } from '@vue/test-utils'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import { PdfChineseFontError } from '../../src/features/export/pdf/font'
import { downloadPdfFontSample } from '../../src/features/export/pdf/font-sample'
import { downloadEffectPreviewPng } from '../../src/features/export/png/effect-preview'
import { downloadReferencePng } from '../../src/features/export/png/reference-guide'
import EditorExportActions from '../../src/features/editor/components/EditorExportActions.vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/features/export/png/effect-preview', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/features/export/png/effect-preview')>()
  return { ...actual, downloadEffectPreviewPng: vi.fn() }
})

vi.mock('../../src/features/export/png/reference-guide', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/features/export/png/reference-guide')>()
  return { ...actual, downloadReferencePng: vi.fn() }
})

vi.mock('../../src/features/export/pdf/font-sample', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/features/export/pdf/font-sample')>()
  return { ...actual, downloadPdfFontSample: vi.fn() }
})

const source: Source = {
  originalImage: new Blob(['task078-component'], { type: 'image/png' }),
  originalFileName: 'preview.png',
  mimeType: 'image/png',
  originalWidth: 20,
  originalHeight: 10,
}

function projectWithGrid(values: readonly number[]): Project {
  const project = createProject({
    source: { ...source },
    projectName: 'Component Preview',
    crop: { x: 0, y: 0, width: 20, height: 10, rotation: 0, aspectRatio: 2 },
  })
  const grid = createGrid(values.length, 1)
  grid.cells.set(values)
  return { ...project, grid }
}

describe('TASK-078 export actions component', () => {
  beforeEach(() => {
    vi.mocked(downloadEffectPreviewPng).mockReset().mockResolvedValue()
    vi.mocked(downloadReferencePng).mockReset().mockResolvedValue()
    vi.mocked(downloadPdfFontSample).mockReset().mockResolvedValue()
  })
  afterEach(() => vi.restoreAllMocks())

  it('is disabled without a Grid and exports one snapshot with the shared filename base', async () => {
    const projectWithoutGrid = createProject({
      source: { ...source },
      crop: { x: 0, y: 0, width: 20, height: 10, rotation: 0, aspectRatio: 2 },
    })
    const empty = mount(EditorExportActions, { props: { project: projectWithoutGrid } })
    expect(
      empty.get('[data-testid="export-effect-preview-png"]').attributes('disabled'),
    ).toBeDefined()
    empty.unmount()

    const wrapper = mount(EditorExportActions, { props: { project: projectWithGrid([1, 0, 2]) } })
    await wrapper.get('[data-testid="export-effect-preview-png"]').trigger('click')
    await flushPromises()

    expect(downloadEffectPreviewPng).toHaveBeenCalledTimes(1)
    const snapshot = vi.mocked(downloadEffectPreviewPng).mock.calls[0]![0]
    expect(snapshot.fileNameBase).toBe('Component Preview_3x1')
    expect(snapshot.grid.cells).toEqual(new Uint16Array([1, 0, 2]))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows an observable error and restores the button after export fails', async () => {
    vi.mocked(downloadEffectPreviewPng).mockRejectedValueOnce(new Error('Canvas encoding failed'))
    const wrapper = mount(EditorExportActions, { props: { project: projectWithGrid([1]) } })

    await wrapper.get('[data-testid="export-effect-preview-png"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="export-error"]').text()).toContain('导出失败')
    expect(
      wrapper.get('[data-testid="export-effect-preview-png"]').attributes('disabled'),
    ).toBeUndefined()
    wrapper.unmount()
  })

  it('creates a formal snapshot for reference PNG and displays an observable error on failure', async () => {
    const wrapper = mount(EditorExportActions, { props: { project: projectWithGrid([1, 0, 35]) } })
    await wrapper.get('[data-testid="export-reference-png"]').trigger('click')
    await flushPromises()

    expect(downloadReferencePng).toHaveBeenCalledTimes(1)
    const snapshot = vi.mocked(downloadReferencePng).mock.calls[0]![0]
    expect(snapshot.grid.cells).toEqual(new Uint16Array([1, 0, 35]))
    expect(snapshot.stats.totalBeads).toBe(2)

    vi.mocked(downloadReferencePng).mockRejectedValueOnce(new Error('Canvas unavailable'))
    await wrapper.get('[data-testid="export-reference-png"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('制作参考 PNG 导出失败')
    wrapper.unmount()
  })

  it('uses the same Export Snapshot for PDF and shows an actionable font-load error', async () => {
    const wrapper = mount(EditorExportActions, { props: { project: projectWithGrid([1, 0, 35]) } })
    await wrapper.get('[data-testid="export-pdf-base"]').trigger('click')
    await flushPromises()

    expect(downloadPdfFontSample).toHaveBeenCalledTimes(1)
    const snapshot = vi.mocked(downloadPdfFontSample).mock.calls[0]![0]
    expect(snapshot.project.projectName).toBe('Component Preview')
    expect(snapshot.stats.totalBeads).toBe(2)

    vi.mocked(downloadPdfFontSample).mockRejectedValueOnce(
      new PdfChineseFontError('PDF 中文字体资源加载失败（HTTP 404）。'),
    )
    await wrapper.get('[data-testid="export-pdf-base"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('字体资源加载失败')
    wrapper.unmount()
  })
})
