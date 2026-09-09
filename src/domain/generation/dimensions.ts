import {
  BEAD_SIZE_MM,
  EXTREME_ASPECT_RATIO_WARNING_THRESHOLD,
  assertValidGridWidth,
} from './config'
import type { CropRotation, CropState, DerivedGridHeight } from '../project/types'

export interface PhysicalDimensions {
  readonly widthMm: number
  readonly heightMm: number
  readonly widthCm: number
  readonly heightCm: number
}

export type GenerationDimensionWarningCode = 'extreme-aspect-ratio'

export interface GenerationDimensionWarning {
  readonly code: GenerationDimensionWarningCode
  readonly message: string
}

export interface GenerationDimensions {
  readonly widthBeads: number
  readonly heightBeads: DerivedGridHeight
  readonly physical: PhysicalDimensions
  readonly warnings: readonly GenerationDimensionWarning[]
}

function assertPositiveFiniteAspectRatio(aspectRatio: number): void {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new RangeError('crop aspectRatio must be a finite number greater than zero')
  }
}

function roundMeasurement(value: number): number {
  return Number(value.toFixed(10))
}

export function deriveVisualCropAspectRatio(
  crop: Pick<CropState, 'aspectRatio' | 'rotation'>,
): number {
  assertPositiveFiniteAspectRatio(crop.aspectRatio)

  const quarterTurn: CropRotation = crop.rotation
  const visualAspectRatio =
    quarterTurn === 90 || quarterTurn === 270 ? 1 / crop.aspectRatio : crop.aspectRatio

  assertPositiveFiniteAspectRatio(visualAspectRatio)
  return visualAspectRatio
}

export function deriveGridHeight(
  widthBeads: number,
  crop: Pick<CropState, 'aspectRatio' | 'rotation'>,
): DerivedGridHeight {
  assertValidGridWidth(widthBeads)
  const height = Math.round(widthBeads / deriveVisualCropAspectRatio(crop))

  if (!Number.isSafeInteger(height) || height < 0) {
    throw new RangeError('derived grid height must be a safe integer')
  }

  // A one-cell minimum keeps the derived Grid dimension valid; it is not a product size limit.
  return Math.max(1, height) as DerivedGridHeight
}

export function derivePhysicalDimensions(
  widthBeads: number,
  heightBeads: number,
): PhysicalDimensions {
  if (!Number.isSafeInteger(widthBeads) || widthBeads <= 0) {
    throw new RangeError('widthBeads must be a positive safe integer')
  }
  if (!Number.isSafeInteger(heightBeads) || heightBeads <= 0) {
    throw new RangeError('heightBeads must be a positive safe integer')
  }

  const widthMm = roundMeasurement(widthBeads * BEAD_SIZE_MM)
  const heightMm = roundMeasurement(heightBeads * BEAD_SIZE_MM)

  return {
    widthMm,
    heightMm,
    widthCm: widthMm / 10,
    heightCm: heightMm / 10,
  }
}

export function deriveGenerationDimensions(
  widthBeads: number,
  crop: Pick<CropState, 'aspectRatio' | 'rotation'>,
): GenerationDimensions {
  const heightBeads = deriveGridHeight(widthBeads, crop)
  const physical = derivePhysicalDimensions(widthBeads, heightBeads)
  const visualAspectRatio = deriveVisualCropAspectRatio(crop)
  const warnings: GenerationDimensionWarning[] = []

  if (Math.max(visualAspectRatio, 1 / visualAspectRatio) > EXTREME_ASPECT_RATIO_WARNING_THRESHOLD) {
    warnings.push({
      code: 'extreme-aspect-ratio',
      message: '作品比例较极端，生成结果可能较狭长，但仍可继续。',
    })
  }

  return {
    widthBeads,
    heightBeads,
    physical,
    warnings,
  }
}
