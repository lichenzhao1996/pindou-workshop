import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import {
  createGrid,
  createProject,
  DEFAULT_PROJECT_NAME,
  deriveProjectStats,
  normalizeProjectName,
  renameProject,
} from '../../src/domain/project'
import type { GenerationResult } from '../../src/domain/generation'
import type { Project, Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['task069'], { type: 'image/png' }),
  originalFileName: '我的猫咪.jpg',
  mimeType: 'image/png',
  originalWidth: 80,
  originalHeight: 60,
}

function makeProject(withGrid = true): Project {
  const project = createProject({
    source: { ...source },
    crop: { x: 0, y: 0, width: 80, height: 60, rotation: 0, aspectRatio: 4 / 3 },
    now: new Date('2026-10-01T00:00:00.000Z'),
  })
  if (!withGrid) return project
  const grid = createGrid(2, 2)
  grid.cells.set([1, 2, 3, 0])
  return { ...project, grid }
}

describe('TASK-069 Project name domain', () => {
  it('normalizes surrounding whitespace and uses the formal fallback for empty values', () => {
    expect(normalizeProjectName('  我的作品  ')).toBe('我的作品')
    expect(normalizeProjectName('')).toBe(DEFAULT_PROJECT_NAME)
    expect(normalizeProjectName(' \t\n ')).toBe(DEFAULT_PROJECT_NAME)
    expect(normalizeProjectName(null)).toBe(DEFAULT_PROJECT_NAME)
    expect(normalizeProjectName(undefined)).toBe(DEFAULT_PROJECT_NAME)
  })

  it('preserves the existing upload and paste default naming rules', () => {
    expect(makeProject().projectName).toBe('我的猫咪')
    expect(
      createProject({
        source: { ...source, originalFileName: null },
        crop: { x: 0, y: 0, width: 80, height: 60, rotation: 0, aspectRatio: 4 / 3 },
      }).projectName,
    ).toBe(DEFAULT_PROJECT_NAME)
  })

  it('immutably changes only projectName and updatedAt while preserving all formal references', () => {
    const project = makeProject()
    const grid = project.grid!
    const cells = grid.cells
    const renamedAt = new Date('2026-10-02T03:04:05.000Z')

    const renamed = renameProject(project, '  我的作品  ', renamedAt)

    expect(renamed).not.toBe(project)
    expect(renamed).toMatchObject({
      projectId: project.projectId,
      projectName: '我的作品',
      revision: project.revision,
      updatedAt: renamedAt.toISOString(),
    })
    expect(renamed.grid).toBe(grid)
    expect(renamed.grid?.cells).toBe(cells)
    expect(renamed.source).toBe(project.source)
    expect(renamed.crop).toBe(project.crop)
    expect(renamed.generation).toBe(project.generation)
    expect(renamed.schemaVersion).toBe(project.schemaVersion)
    expect(renamed.projectVersion).toBe(project.projectVersion)
    expect(renamed.createdAt).toBe(project.createdAt)
  })

  it.each(['原作品', '  原作品  '])(
    'returns the exact Project for normalized no-op input: %s',
    (name) => {
      const project = { ...makeProject(), projectName: '原作品' }
      const renamed = renameProject(project, name, new Date('2030-01-01T00:00:00.000Z'))
      expect(renamed).toBe(project)
      expect(renamed.updatedAt).toBe(project.updatedAt)
    },
  )

  it('keeps a null Grid renameable without changing revision', () => {
    const project = makeProject(false)
    const renamed = renameProject(project, '裁剪中的作品')
    expect(renamed.projectName).toBe('裁剪中的作品')
    expect(renamed.grid).toBeNull()
    expect(renamed.revision).toBe(project.revision)
  })
})

describe('TASK-069 Project store rename', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('safely no-ops without a current Project or for a stale Project identity', () => {
    const store = useProjectStore()
    expect(store.renameProject('作品', 'missing-project')).toBe(false)

    const project = makeProject()
    store.setCurrentProject(project)
    expect(store.renameProject('错误目标', 'another-project')).toBe(false)
    expect(store.currentProject).toBe(project)
  })

  it('preserves Grid stats, runtime editor state, and History arrays on rename', () => {
    const project = makeProject()
    const store = useProjectStore()
    const editor = useEditorStore()
    store.setCurrentProject(project)
    editor.setActiveTool('brush')
    editor.selectPaletteIndex(7)
    editor.setSelectedCell({ row: 1, column: 0, index: 2 })
    editor.setHighlightedPaletteIndex(2)
    editor.toggleLabels()
    editor.setFillTargetMode('empty')
    editor.setViewport({ zoom: 2, panX: 13, panY: -8 })
    editor.toggleMiniMap()
    const beforeStats = deriveProjectStats(project)
    const beforePast = store.past
    const beforeFuture = store.future

    expect(store.renameProject('新版名称', project.projectId)).toBe(true)

    expect(store.currentProject?.projectName).toBe('新版名称')
    expect(store.currentProject?.grid).toBe(project.grid)
    expect(store.currentProject?.revision).toBe(project.revision)
    expect(deriveProjectStats(store.currentProject!)).toEqual(beforeStats)
    expect(store.past).toBe(beforePast)
    expect(store.future).toBe(beforeFuture)
    expect(editor).toMatchObject({
      activeTool: 'brush',
      activePaletteIndex: 7,
      selectedCell: { row: 1, column: 0, index: 2 },
      highlightedPaletteIndex: 2,
      showLabels: true,
      fillTargetMode: 'empty',
      zoom: 2,
      panX: 13,
      panY: -8,
      minimapCollapsed: true,
    })
  })

  it('keeps undo and redo lineage while the latest name survives both restorations', () => {
    const project = makeProject()
    const store = useProjectStore()
    store.setCurrentProject(project)
    expect(
      store.applyGridOperation(
        { type: 'setCell', row: 0, column: 0, value: 9 },
        project,
        project.grid!,
      ),
    ).toBe(true)
    const pastLength = store.past.length

    expect(store.renameProject('我的作品', project.projectId)).toBe(true)
    expect(store.past).toHaveLength(pastLength)
    expect(store.canUndo).toBe(true)
    expect(store.undo()).toBe(true)
    expect(store.currentProject?.projectName).toBe('我的作品')
    expect(store.currentProject?.grid?.cells[0]).toBe(1)
    expect(store.canRedo).toBe(true)

    const redoProject = store.currentProject!
    const futureLength = store.future.length
    expect(store.renameProject('最新名称', redoProject.projectId)).toBe(true)
    expect(store.future).toHaveLength(futureLength)
    expect(store.canRedo).toBe(true)
    expect(store.redo()).toBe(true)
    expect(store.currentProject?.projectName).toBe('最新名称')
    expect(store.currentProject?.grid?.cells[0]).toBe(9)
    expect(store.currentProject?.revision).toBe(project.revision + 1)
  })

  it('keeps consecutive renames in the same Grid lineage and preserves an existing Redo branch', () => {
    const project = makeProject()
    const store = useProjectStore()
    store.setCurrentProject(project)
    store.applyGridOperation(
      { type: 'setCell', row: 0, column: 1, value: 8 },
      project,
      project.grid!,
    )
    expect(store.undo()).toBe(true)
    const undone = store.currentProject!
    const future = store.future
    const revision = undone.revision
    const grid = undone.grid

    expect(store.renameProject('名称 B', undone.projectId)).toBe(true)
    const renamed = store.currentProject!
    expect(store.renameProject('名称 C', renamed.projectId)).toBe(true)
    expect(store.currentProject?.projectName).toBe('名称 C')
    expect(store.currentProject?.grid).toBe(grid)
    expect(store.currentProject?.revision).toBe(revision)
    expect(store.future).toBe(future)
    expect(store.canRedo).toBe(true)
  })

  it('updates the live generation Project token so a later Worker commit retains the renamed metadata', () => {
    const project = makeProject(false)
    const store = useProjectStore()
    store.setCurrentProject(project)
    const requestId = store.beginGeneration()
    const request = store.pendingGenerationRequest!
    expect(store.renameProject('生成期间改名', project.projectId)).toBe(true)
    expect(store.generationStatus).toBe('generating')

    const result: GenerationResult = {
      grid: createGrid(request.widthBeads, request.heightBeads),
      heightBeads: request.heightBeads,
      paletteVersion: request.paletteVersion,
      algorithmVersion: request.algorithmVersion,
      diagnostics: {
        sourceSize: { width: 80, height: 60 },
        cropSize: { width: 80, height: 60 },
        elapsedMs: 0,
      },
    }
    expect(
      store.commitGenerationResult(requestId, result, new Date('2026-10-03T00:00:00.000Z')),
    ).toBe(true)
    expect(store.currentProject?.projectName).toBe('生成期间改名')
  })
})
