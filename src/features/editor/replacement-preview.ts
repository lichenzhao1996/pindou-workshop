import type { Grid } from '../../domain/project/grid'

/** Component-local, read-only replacement preview bound to one Project/Grid identity. */
export interface ReplacementPreview {
  readonly projectId: string
  readonly grid: Grid
  readonly sourcePaletteIndex: number
  readonly targetPaletteIndex: number
}
