import { describe, expect, it } from 'vitest'
import {
  BEAD_SIZE_MM,
  DEFAULT_GRID_WIDTH,
  EXTREME_ASPECT_RATIO_WARNING_THRESHOLD,
  MAX_GRID_WIDTH,
  MIN_GRID_WIDTH,
  QUICK_GRID_WIDTHS,
  assertValidGridWidth,
  deriveGenerationDimensions,
  deriveGridHeight,
  derivePhysicalDimensions,
  deriveVisualCropAspectRatio,
  isValidGridWidth,
} from '../../src/domain/generation'
import type { CropState } from '../../src/domain/project'

function crop(aspectRatio: number, rotation: CropState['rotation'] = 0): CropState {
  return {
    x: 0,
    y: 0,
    width: aspectRatio * 100,
    height: 100,
    rotation,
    aspectRatio,
  }
}

describe('TASK-028 generation dimensions', () => {
  it('keeps the V1 width defaults, presets and range in one configuration', () => {
    expect(DEFAULT_GRID_WIDTH).toBe(64)
    expect(QUICK_GRID_WIDTHS).toEqual([32, 48, 64, 96])
    expect(MIN_GRID_WIDTH).toBe(8)
    expect(MAX_GRID_WIDTH).toBe(256)
    expect(isValidGridWidth(8)).toBe(true)
    expect(isValidGridWidth(256)).toBe(true)
    expect(isValidGridWidth(7)).toBe(false)
    expect(isValidGridWidth(257)).toBe(false)
    expect(isValidGridWidth(64.5)).toBe(false)
    expect(isValidGridWidth(Number.NaN)).toBe(false)
    expect(() => assertValidGridWidth(7)).toThrow(RangeError)
  })

  it('derives 48 beads from a 4:3 crop and width 64', () => {
    expect(deriveGridHeight(64, crop(4 / 3))).toBe(48)
  })

  it('updates the derived height for every recommended width', () => {
    expect(QUICK_GRID_WIDTHS.map((width) => deriveGridHeight(width, crop(4 / 3)))).toEqual([
      24, 36, 48, 72,
    ])
  })

  it('swaps the visual aspect for quarter-turn rotations only', () => {
    expect(deriveVisualCropAspectRatio(crop(4 / 3, 0))).toBe(4 / 3)
    expect(deriveVisualCropAspectRatio(crop(4 / 3, 90))).toBe(3 / 4)
    expect(deriveVisualCropAspectRatio(crop(4 / 3, 180))).toBe(4 / 3)
    expect(deriveVisualCropAspectRatio(crop(4 / 3, 270))).toBe(3 / 4)
    expect(deriveGridHeight(64, crop(4 / 3, 90))).toBe(85)
    expect(deriveGridHeight(64, crop(4 / 3, 270))).toBe(85)
  })

  it('derives physical dimensions from bead counts and the fixed bead size', () => {
    const dimensions = derivePhysicalDimensions(64, 48)

    expect(dimensions.widthMm).toBeCloseTo(166.4)
    expect(dimensions.heightMm).toBeCloseTo(124.8)
    expect(dimensions.widthCm).toBeCloseTo(16.64)
    expect(dimensions.heightCm).toBeCloseTo(12.48)
    expect(BEAD_SIZE_MM).toBe(2.6)
  })

  it('keeps derived height positive without adding a total-cell warning threshold', () => {
    expect(deriveGridHeight(8, crop(100))).toBe(1)

    const manyCells = deriveGenerationDimensions(256, crop(1 / 5000))
    expect(manyCells.heightBeads).toBe(1_280_000)
    expect(manyCells.warnings.map(({ code }) => code)).toEqual(['extreme-aspect-ratio'])
  })

  it('reports extreme aspect ratio as a warning only', () => {
    const warning = deriveGenerationDimensions(
      64,
      crop(EXTREME_ASPECT_RATIO_WARNING_THRESHOLD + 0.01),
    )
    const boundary = deriveGenerationDimensions(64, crop(EXTREME_ASPECT_RATIO_WARNING_THRESHOLD))

    expect(warning.warnings.map(({ code }) => code)).toContain('extreme-aspect-ratio')
    expect(boundary.warnings.map(({ code }) => code)).not.toContain('extreme-aspect-ratio')
  })
})
