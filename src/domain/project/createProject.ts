import {
  BEAD_SIZE_MM,
  CURRENT_PROJECT_SCHEMA_VERSION,
  DEFAULT_ALGORITHM_VERSION,
  DEFAULT_GRID_WIDTH,
  DEFAULT_PALETTE_VERSION,
  DEFAULT_PROJECT_NAME,
  INITIAL_PROJECT_REVISION,
  INITIAL_PROJECT_VERSION,
  MAX_GRID_WIDTH,
  MIN_GRID_WIDTH,
} from './constants'
import type { CreateProjectInput, DerivedGridHeight, Project, Source } from './types'

function createProjectId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `project-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function projectNameFromSource(source: Source): string {
  if (!source.originalFileName) {
    return DEFAULT_PROJECT_NAME
  }

  return source.originalFileName.replace(/\.[^/.]+$/, '') || DEFAULT_PROJECT_NAME
}

function deriveGridHeight(widthBeads: number, aspectRatio: number): DerivedGridHeight {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new RangeError('crop aspectRatio must be greater than zero')
  }

  return Math.round(widthBeads / aspectRatio) as DerivedGridHeight
}

function assertGridWidth(widthBeads: number): void {
  if (!Number.isInteger(widthBeads) || widthBeads < MIN_GRID_WIDTH || widthBeads > MAX_GRID_WIDTH) {
    throw new RangeError(
      `widthBeads must be an integer from ${MIN_GRID_WIDTH} to ${MAX_GRID_WIDTH}`,
    )
  }
}

export function createProject(input: CreateProjectInput): Project {
  const widthBeads = input.widthBeads ?? DEFAULT_GRID_WIDTH
  assertGridWidth(widthBeads)

  const timestamp = (input.now ?? new Date()).toISOString()

  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    projectVersion: INITIAL_PROJECT_VERSION,
    projectId: createProjectId(),
    projectName: input.projectName ?? projectNameFromSource(input.source),
    createdAt: timestamp,
    updatedAt: timestamp,
    source: input.source,
    crop: input.crop,
    generation: {
      widthBeads,
      heightBeads: deriveGridHeight(widthBeads, input.crop.aspectRatio),
      beadSizeMm: BEAD_SIZE_MM,
      mode: input.mode ?? 'optimized',
      paletteVersion: input.paletteVersion ?? DEFAULT_PALETTE_VERSION,
      algorithmVersion: input.algorithmVersion ?? DEFAULT_ALGORITHM_VERSION,
    },
    grid: null,
    revision: INITIAL_PROJECT_REVISION,
  }
}
