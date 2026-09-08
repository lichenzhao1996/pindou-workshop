import type { BEAD_SIZE_MM, CURRENT_PROJECT_SCHEMA_VERSION } from './constants'

export type ProjectSchemaVersion = typeof CURRENT_PROJECT_SCHEMA_VERSION
export type ProjectVersion = number
export type ProjectRevision = number
export type BeadSizeMm = typeof BEAD_SIZE_MM
export type GenerationMode = 'optimized' | 'high-fidelity'
export type CropRotation = 0 | 90 | 180 | 270

/** A height stored in a Project is derived from width and the confirmed crop ratio. */
export type DerivedGridHeight = number & {
  readonly __derivedGridHeight: unique symbol
}

export interface Source {
  originalImage: Blob
  originalFileName: string | null
  mimeType: string
  originalWidth: number
  originalHeight: number
}

export type ProjectSource = Source

export interface CropState {
  x: number
  y: number
  width: number
  height: number
  rotation: CropRotation
  aspectRatio: number
}

export interface GenerationState {
  widthBeads: number
  heightBeads: DerivedGridHeight
  beadSizeMm: BeadSizeMm
  mode: GenerationMode
  paletteVersion: string
  algorithmVersion: string
}

/** Minimal Project-side metadata; the Uint16Array Grid is implemented in TASK-009. */
export interface GridReference {
  width: number
  height: number
}

export interface Project {
  /** Data shape version used to select future schema migrations. */
  schemaVersion: ProjectSchemaVersion
  /** Logical Project version, distinct from schemaVersion and edit revision. */
  projectVersion: ProjectVersion
  projectId: string
  projectName: string
  createdAt: string
  updatedAt: string
  source: Source
  crop: CropState
  generation: GenerationState
  grid: GridReference | null
  /** Current edit revision; undo/redo history is implemented in a later task. */
  revision: ProjectRevision
}

export interface CreateProjectInput {
  source: Source
  crop: CropState
  projectName?: string
  widthBeads?: number
  mode?: GenerationMode
  paletteVersion?: string
  algorithmVersion?: string
  now?: Date
}
