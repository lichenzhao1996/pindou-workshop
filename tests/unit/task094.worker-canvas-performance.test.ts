import { describe, expect, it } from 'vitest'
import {
  createGenerationWorkerClient,
  GenerationRequestCancelledError,
  type GenerationWorkerLike,
} from '../../src/domain/generation'
import { createGrid } from '../../src/domain/project/grid'
import { getVisibleGridRange } from '../../src/rendering/viewport'

class PendingWorker implements GenerationWorkerLike {
  readonly posted: Parameters<GenerationWorkerLike['postMessage']>[0][] = []
  terminated = false

  private readonly listeners = {
    message: new Set<(event: unknown) => void>(),
    error: new Set<(event: unknown) => void>(),
  }

  addEventListener(type: 'message' | 'error', listener: (event: unknown) => void): void {
    this.listeners[type].add(listener)
  }

  removeEventListener(type: 'message' | 'error', listener: (event: unknown) => void): void {
    this.listeners[type].delete(listener)
  }

  postMessage(message: Parameters<GenerationWorkerLike['postMessage']>[0]): void {
    this.posted.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  emitMessage(data: unknown): void {
    this.listeners.message.forEach((listener) => listener({ data }))
  }
}

describe('TASK-094 Worker and Canvas performance boundaries', () => {
  it('keeps a 256 × 192 Grid draw range bounded by the CSS viewport', () => {
    const grid = createGrid(256, 192)
    const visible = getVisibleGridRange(
      grid,
      { width: 960, height: 640 },
      { zoom: 1, panX: -1200, panY: -900 },
    )

    const visibleCellCount =
      (visible.endColumn - visible.startColumn) * (visible.endRow - visible.startRow)

    expect(visible.startColumn).toBeGreaterThanOrEqual(0)
    expect(visible.startRow).toBeGreaterThanOrEqual(0)
    expect(visible.endColumn).toBeLessThanOrEqual(grid.width)
    expect(visible.endRow).toBeLessThanOrEqual(grid.height)
    expect(visibleCellCount).toBeGreaterThan(0)
    expect(visibleCellCount).toBeLessThan(grid.width * grid.height)
  })

  it('cancels a pending Worker request without waiting for a response', async () => {
    const workers: PendingWorker[] = []
    const client = createGenerationWorkerClient(() => {
      const worker = new PendingWorker()
      workers.push(worker)
      return worker
    })
    const request = {
      originalImage: new Blob(['task-094'], { type: 'image/png' }),
      crop: { x: 0, y: 0, width: 4, height: 3, rotation: 0, aspectRatio: 4 / 3 },
      widthBeads: 256,
      mode: 'optimized' as const,
      paletteVersion: 'palette-v1',
      algorithmVersion: 'algorithm-v1',
    }
    const pending = client.generate(request)

    client.cancel()

    await expect(pending).rejects.toBeInstanceOf(GenerationRequestCancelledError)
    expect(workers).toHaveLength(1)
    expect(workers[0]!.posted).toHaveLength(1)
    expect(workers[0]!.terminated).toBe(true)

    const nextPending = client.generate(request)
    expect(workers).toHaveLength(2)
    workers[1]!.emitMessage({ type: 'success', requestId: 2, result: { accepted: true } })
    await expect(nextPending).resolves.toEqual({ accepted: true })
    client.dispose()
    expect(workers[1]!.terminated).toBe(true)
  })
})
