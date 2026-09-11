import { assertValidGridCellValue } from '../project/grid'
import type { Project } from '../project/types'
import type { GenerationRequest } from './request'
import type { GenerationResult } from './pipeline'

function hasSameCrop(left: Project['crop'], right: GenerationRequest['crop']): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.rotation === right.rotation &&
    left.aspectRatio === right.aspectRatio
  )
}

function assertRequestMatchesProject(project: Project, request: GenerationRequest): void {
  if (
    request.originalImage !== project.source.originalImage ||
    !hasSameCrop(project.crop, request.crop) ||
    request.widthBeads !== project.generation.widthBeads ||
    request.mode !== project.generation.mode ||
    request.paletteVersion !== project.generation.paletteVersion ||
    request.algorithmVersion !== project.generation.algorithmVersion
  ) {
    throw new RangeError('Generation request does not match the current Project')
  }
}

function assertResultMatchesRequest(
  project: Project,
  request: GenerationRequest,
  result: GenerationResult,
): void {
  if (
    result.grid.width !== request.widthBeads ||
    result.grid.height !== project.generation.heightBeads ||
    result.heightBeads !== result.grid.height ||
    result.paletteVersion !== request.paletteVersion ||
    result.algorithmVersion !== request.algorithmVersion ||
    result.grid.cells.length !== result.grid.width * result.grid.height
  ) {
    throw new RangeError('Generation result does not match the current GenerationRequest')
  }

  result.grid.cells.forEach(assertValidGridCellValue)
}

/** Commits a validated generation result as the new immutable Grid baseline. */
export function commitGenerationResultToProject(
  project: Project,
  request: GenerationRequest,
  result: GenerationResult,
  now: Date = new Date(),
): Project {
  assertRequestMatchesProject(project, request)
  assertResultMatchesRequest(project, request, result)

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
