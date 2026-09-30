import { deriveGenerationDimensions } from './dimensions'
import type { Project } from '../project/types'

/** Changes formal dimensions and invalidates the old Grid without resetting revision. */
export function updateProjectGenerationSize(
  project: Project,
  widthBeads: number,
  now: Date = new Date(),
): Project {
  const dimensions = deriveGenerationDimensions(widthBeads, project.crop)
  if (
    project.generation.widthBeads === dimensions.widthBeads &&
    project.generation.heightBeads === dimensions.heightBeads
  ) {
    return project
  }

  return {
    ...project,
    updatedAt: now.toISOString(),
    generation: {
      ...project.generation,
      widthBeads: dimensions.widthBeads,
      heightBeads: dimensions.heightBeads,
    },
    grid: null,
  }
}
