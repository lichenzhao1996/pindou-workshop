import { describe, expect, it } from 'vitest'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import {
  derivePdfOverviewFacts,
  derivePdfOverviewImagePlacement,
} from '../../src/features/export/pdf/overview'
import { createExportSnapshot } from '../../src/features/export/snapshot'

const source: Source = {
  originalImage: new Blob(['task082'], { type: 'image/png' }),
  originalFileName: 'overview.png',
  mimeType: 'image/png',
  originalWidth: 100,
  originalHeight: 50,
}

function makeSnapshot(): ReturnType<typeof createExportSnapshot> {
  const project = createProject({
    source: { ...source },
    projectName: '总览作品',
    crop: { x: 0, y: 0, width: 100, height: 50, rotation: 0, aspectRatio: 2 },
  })
  const grid = createGrid(2, 2)
  grid.cells.set([1, 0, 35, 1])
  return createExportSnapshot({ ...project, grid, revision: 7 } satisfies Project)
}

describe('TASK-082 PDF overview inputs', () => {
  it('maps every overview fact from the formal ExportSnapshot and ProjectStats', () => {
    const snapshot = makeSnapshot()
    expect(derivePdfOverviewFacts(snapshot)).toEqual({
      projectName: '总览作品',
      gridWidth: 2,
      gridHeight: 2,
      beadSizeMm: 2.6,
      productWidthMm: 5.2,
      productHeightMm: 5.2,
      usedColorCount: 2,
      totalBeads: 3,
    })
  })

  it('fits the complete effect image inside the printable overview area without distortion', () => {
    const placement = derivePdfOverviewImagePlacement(595.28, 841.89, 1600, 800, 700)
    expect(placement.x).toBeGreaterThanOrEqual(0)
    expect(placement.y).toBeGreaterThanOrEqual(0)
    expect(placement.x + placement.width).toBeLessThanOrEqual(595.28)
    expect(placement.y + placement.height).toBeLessThanOrEqual(700)
    expect(placement.width / placement.height).toBeCloseTo(2)
  })

  it('rejects an image placement with no printable area', () => {
    expect(() => derivePdfOverviewImagePlacement(100, 100, 50, 50, 5)).toThrow(RangeError)
  })
})
