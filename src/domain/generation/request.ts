import type { CropState, GenerationMode, Project, Source } from '../project/types'
import { deriveGenerationDimensions } from './dimensions'
import { assertValidGenerationMode } from './mode'

export interface GenerationRequest {
  readonly originalImage: Blob
  readonly crop: CropState
  readonly widthBeads: number
  readonly mode: GenerationMode
  readonly paletteVersion: string
  readonly algorithmVersion: string
}

/** Application snapshot identity; not a new Project or persistence schema. */
export interface ProjectGenerationRequest extends GenerationRequest {
  readonly projectId: string
  readonly source: Readonly<Source>
  readonly heightBeads: number
}

/** Builds the generator input from Project facts, never from the current Grid. */
export function createGenerationRequest(project: Project): ProjectGenerationRequest {
  const dimensions = deriveGenerationDimensions(project.generation.widthBeads, project.crop)
  assertValidGenerationMode(project.generation.mode)
  if (project.generation.heightBeads !== dimensions.heightBeads) {
    throw new RangeError('Project generation dimensions do not match its confirmed crop')
  }

  return Object.freeze({
    projectId: project.projectId,
    source: Object.freeze({ ...project.source }),
    originalImage: project.source.originalImage,
    crop: Object.freeze({ ...project.crop }),
    widthBeads: dimensions.widthBeads,
    heightBeads: dimensions.heightBeads,
    mode: project.generation.mode,
    paletteVersion: project.generation.paletteVersion,
    algorithmVersion: project.generation.algorithmVersion,
  })
}
