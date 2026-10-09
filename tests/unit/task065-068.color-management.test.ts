import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { getPaletteEntryByIndex, MARD_291_PALETTE } from '../../src/domain/palette'
import { createPaletteReplacementPlan } from '../../src/domain/project/color-replacement'
import { createGrid, createProject, deriveProjectStats } from '../../src/domain/project'
import { applyGridOperation } from '../../src/domain/project/operations'
import type { Project, Source } from '../../src/domain/project/types'
import {
  deriveUsedColorRows,
  filterUsedColorRows,
  sortUsedColorRows,
} from '../../src/features/editor/color-management'

const source: Source = {
  originalImage: new Blob(['task065-068'], { type: 'image/png' }),
  originalFileName: 'colors.png',
  mimeType: 'image/png',
  originalWidth: 80,
  originalHeight: 40,
}

function projectWithGrid(values: readonly number[] = [0, 1, 1, 2, 2]): Project {
  const project = createProject({
    source: { ...source },
    crop: { x: 0, y: 0, width: 80, height: 40, rotation: 0, aspectRatio: 2 },
  })
  const grid = createGrid(values.length, 1)
  grid.cells.set(values)
  return { ...project, grid }
}

describe('TASK-065/066 used color derivation and search', () => {
  it('matches formal ProjectStats, excludes EMPTY, includes white, and sorts deterministically', () => {
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const project = projectWithGrid([0, 1, 1, 2, 2, white.paletteIndex])
    const rows = deriveUsedColorRows(project)
    const stats = deriveProjectStats(project)

    expect(rows.map(({ paletteIndex, count }) => [paletteIndex, count])).toEqual([
      [1, 2],
      [2, 2],
      [white.paletteIndex, 1],
    ])
    expect(rows.reduce((sum, row) => sum + row.percentage, 0)).toBe(100)
    expect(rows.map(({ percentage }) => percentage)).toEqual([40, 40, 20])
    expect(rows.map(({ paletteIndex }) => paletteIndex)).toEqual(stats.usedPaletteIndices)
    expect(rows.every((row) => row.count === stats.usageByPaletteIndex[row.paletteIndex])).toBe(
      true,
    )
    expect(rows.every((row) => row.entry.paletteIndex === row.paletteIndex)).toBe(true)
    expect(rows.some((row) => row.paletteIndex === 0)).toBe(false)
    expect(rows.find((row) => row.paletteIndex === white.paletteIndex)?.count).toBe(1)
  })

  it('returns safe empty rows and derives again after immutable Grid updates', () => {
    const allEmpty = projectWithGrid([0, 0, 0])
    expect(deriveUsedColorRows(null)).toEqual([])
    expect(deriveUsedColorRows({ ...allEmpty, grid: null })).toEqual([])
    expect(deriveUsedColorRows(allEmpty)).toEqual([])

    const changed = applyGridOperation(allEmpty, {
      type: 'setCell',
      row: 0,
      column: 1,
      value: 9,
    })
    expect(changed.changed).toBe(true)
    expect(changed.project.grid).not.toBe(allEmpty.grid)
    expect(deriveUsedColorRows(changed.project)).toMatchObject([
      { paletteIndex: 9, count: 1, percentage: 100 },
    ])
  })

  it('searches only used MARD entries by colorId, displayCode and name with normalization', () => {
    const rows = deriveUsedColorRows(projectWithGrid([1, 1, 2, 3]))
    expect(filterUsedColorRows(rows, '  MARD:A1 ').map((row) => row.paletteIndex)).toEqual([1])
    expect(filterUsedColorRows(rows, ' a2 ').map((row) => row.paletteIndex)).toEqual([2])
    expect(filterUsedColorRows(rows, ' A3 ').map((row) => row.paletteIndex)).toEqual([3])
    expect(filterUsedColorRows(rows, '').map((row) => row.paletteIndex)).toEqual([1, 2, 3])
    expect(filterUsedColorRows(rows, 'not-present')).toEqual([])
    expect(sortUsedColorRows(rows, 'displayCode').map((row) => row.paletteIndex)).toEqual([1, 2, 3])
  })
})

describe('TASK-068 palette replacement plan', () => {
  it('builds one immutable batch operation for exact matches only', () => {
    const grid = createGrid(6, 1)
    grid.cells.set([1, 2, 1, 3, 0, 2])
    const original = grid.cells.slice()
    const plan = createPaletteReplacementPlan(grid, 1, 4)!
    expect(plan.count).toBe(2)
    expect(plan.operation).toEqual({
      type: 'setCells',
      changes: [
        { row: 0, column: 0, value: 4 },
        { row: 0, column: 2, value: 4 },
      ],
    })
    expect(grid.cells).toEqual(original)

    const project = projectWithGrid([1, 2, 1, 3, 0, 2])
    const applied = applyGridOperation(project, plan.operation!)
    expect(applied.changed).toBe(true)
    expect(Array.from(applied.project.grid!.cells)).toEqual([4, 2, 4, 3, 0, 2])
    expect(applied.project.revision).toBe(project.revision + 1)
    expect(deriveProjectStats(applied.project).usageByPaletteIndex[4]).toBe(2)
  })

  it('returns no operation for equal, missing, EMPTY, or invalid palette indices', () => {
    const grid = createGrid(3, 1)
    grid.cells.set([1, 2, 0])
    expect(createPaletteReplacementPlan(grid, 1, 1)).toMatchObject({ count: 0, operation: null })
    expect(createPaletteReplacementPlan(grid, 3, 4)).toMatchObject({ count: 0, operation: null })
    expect(createPaletteReplacementPlan(grid, 0, 4)).toBeNull()
    expect(createPaletteReplacementPlan(grid, 1, 0)).toBeNull()
    expect(createPaletteReplacementPlan(grid, 1, 292)).toBeNull()
  })
})

describe('TASK-067/068 editor state isolation and lifecycle', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('toggles highlight without changing current color, recents, Grid or revision', () => {
    const editor = useEditorStore()
    const project = projectWithGrid()
    const store = useProjectStore()
    store.setCurrentProject(project)
    editor.setActivePaletteIndex(12)
    editor.recordRecentPaletteIndex(17)
    const grid = store.currentProject!.grid
    const revision = store.currentProject!.revision

    expect(editor.highlightedPaletteIndex).toBeNull()
    expect(editor.toggleHighlightedPaletteIndex(1)).toBe(true)
    expect(editor.highlightedPaletteIndex).toBe(1)
    expect(editor.toggleHighlightedPaletteIndex(2)).toBe(true)
    expect(editor.highlightedPaletteIndex).toBe(2)
    expect(editor.toggleHighlightedPaletteIndex(2)).toBe(true)
    expect(editor.highlightedPaletteIndex).toBeNull()
    expect(editor.activePaletteIndex).toBe(12)
    expect(editor.recentPaletteIndexes).toEqual([17])
    expect(store.currentProject!.grid).toBe(grid)
    expect(store.currentProject!.revision).toBe(revision)
  })

  it('preserves highlight across edits, Undo/Redo and failed/cancelled generation', () => {
    const editor = useEditorStore()
    const store = useProjectStore()
    const project = projectWithGrid([1, 2, 2])
    store.setCurrentProject(project)
    editor.setHighlightedPaletteIndex(1)
    expect(
      store.applyGridOperation(
        { type: 'setCell', row: 0, column: 1, value: 3 },
        project,
        project.grid!,
      ),
    ).toBe(true)
    expect(editor.highlightedPaletteIndex).toBe(1)
    expect(store.undo()).toBe(true)
    expect(editor.highlightedPaletteIndex).toBe(1)
    expect(store.redo()).toBe(true)
    expect(editor.highlightedPaletteIndex).toBe(1)

    const failed = store.beginGeneration()
    expect(store.failGeneration(failed, new Error('expected failure'))).toBe(true)
    expect(editor.highlightedPaletteIndex).toBe(1)
    const cancelled = store.beginGeneration()
    expect(store.cancelGeneration(cancelled)).toBe(true)
    expect(editor.highlightedPaletteIndex).toBe(1)
  })

  it('clears highlight on Project switch, Grid invalidation and successful generation only', () => {
    const editor = useEditorStore()
    const store = useProjectStore()
    const first = projectWithGrid()
    store.setCurrentProject(first)
    editor.setHighlightedPaletteIndex(1)
    store.setCurrentProject(projectWithGrid())
    expect(editor.highlightedPaletteIndex).toBeNull()

    editor.setHighlightedPaletteIndex(2)
    const noGridProject = { ...store.currentProject!, grid: null }
    store.setCurrentProject(noGridProject)
    expect(editor.highlightedPaletteIndex).toBeNull()

    const generatedProject = projectWithGrid([1, 1, 2])
    store.setCurrentProject(generatedProject)
    editor.setHighlightedPaletteIndex(1)
    const requestId = store.beginGeneration()
    const request = store.pendingGenerationRequest!
    expect(
      store.commitGenerationResult(requestId, {
        grid: createGrid(request.widthBeads, request.heightBeads),
        heightBeads: request.heightBeads,
        paletteVersion: request.paletteVersion,
        algorithmVersion: request.algorithmVersion,
        diagnostics: {
          sourceSize: { width: 80, height: 40 },
          cropSize: { width: 80, height: 40 },
          elapsedMs: 0,
        },
      }),
    ).toBe(true)
    expect(editor.highlightedPaletteIndex).toBeNull()
    expect(getPaletteEntryByIndex(MARD_291_PALETTE, 1)?.displayCode).toBe('A1')
  })
})
