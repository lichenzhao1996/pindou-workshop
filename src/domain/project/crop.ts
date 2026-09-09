import { cropDataToState, cropStateToData } from './cropState'
import { deriveGenerationDimensions } from '../generation'
import type { CropImageBounds } from './cropState'
import type { CropState, Project, Source } from './types'

export interface CropPreviewInput {
  readonly originalImage: Blob
  readonly crop: CropState
}

export interface ConfirmCropInput {
  readonly source: Source
  readonly crop: CropState
}

export interface CropConfirmation {
  readonly crop: CropState
  readonly preview: CropPreviewInput
}

/**
 * Normalizes a source-coordinate CropState and recalculates its aspect ratio.
 * The existing Cropper conversion helpers provide the shared validation and
 * rotation semantics without creating a second crop coordinate model.
 */
export function normalizeCropState(crop: CropState, sourceBounds: CropImageBounds): CropState {
  const cropperData = cropStateToData(crop, sourceBounds)
  return cropDataToState(cropperData, sourceBounds)
}

export function isSameCropState(left: CropState, right: CropState): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.rotation === right.rotation &&
    left.aspectRatio === right.aspectRatio
  )
}

export function confirmCrop(
  input: ConfirmCropInput,
  sourceBounds: CropImageBounds,
): CropConfirmation {
  const crop = normalizeCropState(input.crop, sourceBounds)

  return {
    crop,
    preview: {
      originalImage: input.source.originalImage,
      crop,
    },
  }
}

/**
 * Applies a confirmed crop to an existing Project without changing its
 * identity or Grid-edit revision. A changed crop invalidates the old Grid.
 */
export function confirmProjectCrop(project: Project, crop: CropState, now?: Date): Project {
  const normalizedCrop = normalizeCropState(crop, {
    width: project.source.originalWidth,
    height: project.source.originalHeight,
  })

  if (isSameCropState(project.crop, normalizedCrop)) {
    return project
  }

  const dimensions = deriveGenerationDimensions(project.generation.widthBeads, normalizedCrop)

  return {
    ...project,
    crop: normalizedCrop,
    generation: {
      ...project.generation,
      heightBeads: dimensions.heightBeads,
    },
    grid: null,
    updatedAt: (now ?? new Date()).toISOString(),
  }
}
