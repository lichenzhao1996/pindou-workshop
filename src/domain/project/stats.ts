import { EMPTY, MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from './constants'
import { assertValidGridCellValue } from './grid'
import type { Project } from './types'

export interface ProjectStats {
  usageByPaletteIndex: Uint32Array
  usedColorCount: number
  totalBeads: number
  productWidthMm: number
  productHeightMm: number
  usedPaletteIndices: number[]
}

export function deriveProjectStats(project: Project): ProjectStats {
  if (!project.grid) {
    throw new RangeError('Project does not contain a Grid')
  }

  const usageByPaletteIndex = new Uint32Array(MAX_PALETTE_INDEX + 1)
  let totalBeads = 0

  project.grid.cells.forEach((paletteIndex) => {
    assertValidGridCellValue(paletteIndex)
    if (paletteIndex === EMPTY) {
      return
    }

    usageByPaletteIndex[paletteIndex] += 1
    totalBeads += 1
  })

  const usedPaletteIndices: number[] = []
  for (let paletteIndex = MIN_PALETTE_INDEX; paletteIndex <= MAX_PALETTE_INDEX; paletteIndex += 1) {
    if (usageByPaletteIndex[paletteIndex] > 0) {
      usedPaletteIndices.push(paletteIndex)
    }
  }

  return {
    usageByPaletteIndex,
    usedColorCount: usedPaletteIndices.length,
    totalBeads,
    productWidthMm: project.grid.width * project.generation.beadSizeMm,
    productHeightMm: project.grid.height * project.generation.beadSizeMm,
    usedPaletteIndices,
  }
}
