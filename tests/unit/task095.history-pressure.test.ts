import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createGrid, createProject, MAX_GRID_HISTORY_ENTRIES } from '../../src/domain/project'

const samples = [
  { label: 'small', width: 8, height: 6 },
  { label: 'medium', width: 64, height: 48 },
  { label: 'large V1 4:3 maximum width', width: 256, height: 192 },
] as const

describe('TASK-095 full Grid snapshot pressure', () => {
  afterEach(() => setActivePinia(createPinia()))

  it.each(samples)('retains bounded, detached snapshots for a $label Grid', (sample) => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useProjectStore(pinia)
    const base = createProject({
      source: {
        originalImage: new Blob(['history-pressure'], { type: 'image/png' }),
        originalFileName: 'history-pressure.png',
        mimeType: 'image/png',
        originalWidth: sample.width,
        originalHeight: sample.height,
      },
      crop: {
        x: 0,
        y: 0,
        width: sample.width,
        height: sample.height,
        rotation: 0,
        aspectRatio: sample.width / sample.height,
      },
    })
    base.grid = createGrid(sample.width, sample.height)
    store.setCurrentProject(base)

    const startedAt = performance.now()
    const operationCount = MAX_GRID_HISTORY_ENTRIES + 2
    for (let step = 0; step < operationCount; step += 1) {
      const current = store.currentProject!
      const index = step % current.grid!.cells.length
      const row = Math.floor(index / sample.width)
      const column = index % sample.width
      const previous = current.grid!.cells[index]!
      const next = previous === 1 ? 2 : 1
      expect(
        store.applyGridOperation(
          { type: 'setCell', row, column, value: next },
          current,
          current.grid!,
        ),
      ).toBe(true)
    }
    const elapsedMs = performance.now() - startedAt
    const current = store.currentProject!
    const retainedHistoryGridBytes = store.past.reduce(
      (total, entry) =>
        total +
        entry.beforeProject.grid.cells.byteLength +
        entry.afterProject.grid.cells.byteLength,
      0,
    )
    const oneGridBytes = sample.width * sample.height * Uint16Array.BYTES_PER_ELEMENT

    expect(store.past).toHaveLength(MAX_GRID_HISTORY_ENTRIES)
    expect(current.grid!.cells).toBeInstanceOf(Uint16Array)
    expect(current.grid!.cells.length).toBe(sample.width * sample.height)
    expect(retainedHistoryGridBytes).toBe(MAX_GRID_HISTORY_ENTRIES * 2 * oneGridBytes)
    expect(store.canUndo).toBe(true)
    expect(store.undo()).toBe(true)
    expect(store.currentProject!.grid!.cells).toBeInstanceOf(Uint16Array)
    expect(store.redo()).toBe(true)
    expect(store.currentProject!.grid!.cells).toEqual(current.grid!.cells)
    expect(store.currentProject!.revision).toBe(current.revision)

    console.info(
      `TASK095_SAMPLE ${JSON.stringify({
        ...sample,
        operations: operationCount,
        retainedEntries: store.past.length,
        currentGridBytes: oneGridBytes,
        retainedHistoryGridBytes,
        elapsedMs: Number(elapsedMs.toFixed(2)),
      })}`,
    )
  })
})
