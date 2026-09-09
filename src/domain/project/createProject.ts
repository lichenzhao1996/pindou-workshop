import {
  BEAD_SIZE_MM,
  CURRENT_PROJECT_SCHEMA_VERSION,
  DEFAULT_ALGORITHM_VERSION,
  DEFAULT_GRID_WIDTH,
  DEFAULT_PALETTE_VERSION,
  DEFAULT_PROJECT_NAME,
  INITIAL_PROJECT_REVISION,
  INITIAL_PROJECT_VERSION,
} from './constants'
import {
  assertValidGenerationMode,
  assertValidGridWidth,
  DEFAULT_GENERATION_MODE,
  deriveGenerationDimensions,
} from '../generation'
import type { CreateProjectInput, Project, Source } from './types'

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

export function createProject(input: CreateProjectInput): Project {
  const widthBeads = input.widthBeads ?? DEFAULT_GRID_WIDTH
  assertValidGridWidth(widthBeads)
  const dimensions = deriveGenerationDimensions(widthBeads, input.crop)
  const mode = input.mode ?? DEFAULT_GENERATION_MODE
  assertValidGenerationMode(mode)

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
      heightBeads: dimensions.heightBeads,
      beadSizeMm: BEAD_SIZE_MM,
      mode,
      paletteVersion: input.paletteVersion ?? DEFAULT_PALETTE_VERSION,
      algorithmVersion: input.algorithmVersion ?? DEFAULT_ALGORITHM_VERSION,
    },
    grid: null,
    revision: INITIAL_PROJECT_REVISION,
  }
}
