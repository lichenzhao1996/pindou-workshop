import type { CropState, GenerationMode, Project } from '../project/types'

export interface GenerationRequest {
  readonly originalImage: Blob
  readonly crop: CropState
  readonly widthBeads: number
  readonly mode: GenerationMode
  readonly paletteVersion: string
  readonly algorithmVersion: string
}

/** Builds the generator input from Project facts, never from the current Grid. */
export function createGenerationRequest(project: Project): GenerationRequest {
  return {
    originalImage: project.source.originalImage,
    crop: project.crop,
    widthBeads: project.generation.widthBeads,
    mode: project.generation.mode,
    paletteVersion: project.generation.paletteVersion,
    algorithmVersion: project.generation.algorithmVersion,
  }
}
