import { assertValidGridCellValue } from '../project/grid'
import type { Project } from '../project/types'
import type { ProjectGenerationRequest } from './request'
import { deriveGenerationDimensions } from './dimensions'
import type { GenerationResult } from './pipeline'

function hasSameCrop(left: Project['crop'], right: ProjectGenerationRequest['crop']): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.rotation === right.rotation &&
    left.aspectRatio === right.aspectRatio
  )
}

/** Rechecks formal inputs at commit time, independently of Worker communication ids. */
export function generationRequestMatchesProject(
  project: Project,
  request: ProjectGenerationRequest,
): boolean {
  const dimensions = deriveGenerationDimensions(project.generation.widthBeads, project.crop)
  return !(
    request.projectId !== project.projectId ||
    request.originalImage !== project.source.originalImage ||
    request.source.originalImage !== project.source.originalImage ||
    request.source.originalFileName !== project.source.originalFileName ||
    request.source.mimeType !== project.source.mimeType ||
    request.source.originalWidth !== project.source.originalWidth ||
    request.source.originalHeight !== project.source.originalHeight ||
    !hasSameCrop(project.crop, request.crop) ||
    request.widthBeads !== project.generation.widthBeads ||
    request.heightBeads !== project.generation.heightBeads ||
    request.heightBeads !== dimensions.heightBeads ||
    request.mode !== project.generation.mode ||
    request.paletteVersion !== project.generation.paletteVersion ||
    request.algorithmVersion !== project.generation.algorithmVersion
  )
}

function assertResultMatchesRequest(
  request: ProjectGenerationRequest,
  result: GenerationResult,
): void {
  if (
    result.grid.width !== request.widthBeads ||
    result.grid.height !== request.heightBeads ||
    result.heightBeads !== result.grid.height ||
    result.paletteVersion !== request.paletteVersion ||
    result.algorithmVersion !== request.algorithmVersion ||
    result.grid.cells.length !== result.grid.width * result.grid.height ||
    !(result.grid.cells instanceof Uint16Array)
  ) {
    throw new RangeError('Generation result does not match the current GenerationRequest')
  }

  result.grid.cells.forEach(assertValidGridCellValue)
}

/** Commits a validated generation result as the new immutable Grid baseline. */
export function commitGenerationResultToProject(
  project: Project,
  request: ProjectGenerationRequest,
  result: GenerationResult,
  now: Date = new Date(),
): Project {
  if (!generationRequestMatchesProject(project, request)) {
    throw new RangeError('Generation request does not match the current Project')
  }
  assertResultMatchesRequest(request, result)

  return {
    ...project,
    updatedAt: now.toISOString(),
    grid: {
      ...result.grid,
      cells: result.grid.cells.slice(),
    },
    revision: 0,
  }
}
