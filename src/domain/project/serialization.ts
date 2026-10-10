import {
  BEAD_SIZE_MM,
  CURRENT_PROJECT_SCHEMA_VERSION,
  MAX_GRID_WIDTH,
  MIN_GRID_WIDTH,
} from './constants'
import { assertValidGridCellValue } from './grid'
import type { CropState, GenerationState, Project, Source } from './types'

export interface GridSnapshot {
  width: number
  height: number
  cells: Uint16Array
}

export type ProjectSnapshot = Omit<Project, 'grid'> & {
  grid: GridSnapshot | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string`)
  }
}

function assertFiniteNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`)
  }
}

function assertInteger(value: unknown, name: string, minimum?: number): asserts value is number {
  if (!Number.isInteger(value) || (minimum !== undefined && (value as number) < minimum)) {
    throw new RangeError(
      `${name} must be an integer${minimum === undefined ? '' : ` >= ${minimum}`}`,
    )
  }
}

function assertSource(value: unknown): asserts value is Source {
  if (!isRecord(value)) {
    throw new TypeError('Project source must be an object')
  }
  if (typeof Blob === 'undefined' || !(value.originalImage instanceof Blob)) {
    throw new TypeError('Project source originalImage must be a Blob')
  }
  if (value.originalFileName !== null) {
    assertString(value.originalFileName, 'Project source originalFileName')
  }
  assertString(value.mimeType, 'Project source mimeType')
  assertInteger(value.originalWidth, 'Project source originalWidth', 1)
  assertInteger(value.originalHeight, 'Project source originalHeight', 1)
}

export function assertValidProjectSource(value: unknown): asserts value is Source {
  assertSource(value)
}

function assertCrop(value: unknown): asserts value is CropState {
  if (!isRecord(value)) {
    throw new TypeError('Project crop must be an object')
  }
  assertFiniteNumber(value.x, 'Project crop x')
  assertFiniteNumber(value.y, 'Project crop y')
  assertFiniteNumber(value.width, 'Project crop width')
  assertFiniteNumber(value.height, 'Project crop height')
  assertFiniteNumber(value.aspectRatio, 'Project crop aspectRatio')
  if (value.width <= 0 || value.height <= 0 || value.aspectRatio <= 0) {
    throw new RangeError('Project crop dimensions and aspectRatio must be greater than zero')
  }
  if (
    value.rotation !== 0 &&
    value.rotation !== 90 &&
    value.rotation !== 180 &&
    value.rotation !== 270
  ) {
    throw new RangeError('Project crop rotation is invalid')
  }
}

function assertGeneration(value: unknown): asserts value is GenerationState {
  if (!isRecord(value)) {
    throw new TypeError('Project generation must be an object')
  }
  assertInteger(value.widthBeads, 'Project generation widthBeads')
  if (value.widthBeads < MIN_GRID_WIDTH || value.widthBeads > MAX_GRID_WIDTH) {
    throw new RangeError(
      `Project generation widthBeads must be from ${MIN_GRID_WIDTH} to ${MAX_GRID_WIDTH}`,
    )
  }
  assertInteger(value.heightBeads, 'Project generation heightBeads', 1)
  if (value.beadSizeMm !== BEAD_SIZE_MM) {
    throw new RangeError(`Project generation beadSizeMm must be ${BEAD_SIZE_MM}`)
  }
  if (value.mode !== 'optimized' && value.mode !== 'high-fidelity') {
    throw new RangeError('Project generation mode is invalid')
  }
  assertString(value.paletteVersion, 'Project generation paletteVersion')
  assertString(value.algorithmVersion, 'Project generation algorithmVersion')
}

function assertGrid(value: unknown): asserts value is GridSnapshot {
  if (!isRecord(value)) {
    throw new TypeError('Project grid must be an object')
  }
  assertInteger(value.width, 'Project grid width', 1)
  assertInteger(value.height, 'Project grid height', 1)
  if (!(value.cells instanceof Uint16Array)) {
    throw new TypeError('Project grid cells must be a Uint16Array')
  }
  const expectedLength = value.width * value.height
  if (!Number.isSafeInteger(expectedLength) || value.cells.length !== expectedLength) {
    throw new RangeError('Project grid cells length does not match its dimensions')
  }
  for (const cell of value.cells) {
    assertValidGridCellValue(cell)
  }
}

export function assertValidProjectSnapshot(value: unknown): asserts value is ProjectSnapshot {
  if (!isRecord(value)) {
    throw new TypeError('Project snapshot must be an object')
  }
  if (value.schemaVersion !== CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new RangeError(`Project snapshot schemaVersion must be ${CURRENT_PROJECT_SCHEMA_VERSION}`)
  }
  assertInteger(value.projectVersion, 'Project snapshot projectVersion', 1)
  assertString(value.projectId, 'Project snapshot projectId')
  assertString(value.projectName, 'Project snapshot projectName')
  assertString(value.createdAt, 'Project snapshot createdAt')
  assertString(value.updatedAt, 'Project snapshot updatedAt')
  assertSource(value.source)
  assertCrop(value.crop)
  assertGeneration(value.generation)
  assertInteger(value.revision, 'Project snapshot revision', 0)
  if (value.grid !== null) {
    assertGrid(value.grid)
  }
}

function copySnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    schemaVersion: snapshot.schemaVersion,
    projectVersion: snapshot.projectVersion,
    projectId: snapshot.projectId,
    projectName: snapshot.projectName,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    source: { ...snapshot.source },
    crop: { ...snapshot.crop },
    generation: { ...snapshot.generation },
    grid: snapshot.grid
      ? {
          width: snapshot.grid.width,
          height: snapshot.grid.height,
          cells: snapshot.grid.cells.slice(),
        }
      : null,
    revision: snapshot.revision,
  }
}

export function serializeProjectSnapshot(project: Project): ProjectSnapshot {
  assertValidProjectSnapshot(project)
  return copySnapshot(project)
}

export function restoreProjectSnapshot(snapshot: ProjectSnapshot): Project {
  assertValidProjectSnapshot(snapshot)
  return copySnapshot(snapshot)
}
