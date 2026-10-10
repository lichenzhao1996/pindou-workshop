import { deriveUsedColorRowsFromStats } from '../color-management'
import type { UsedColorRow } from '../color-management'
import type { ProjectStats } from '../../../domain/project/stats'

export type MaterialColorRow = Readonly<UsedColorRow>

export interface MaterialStatsView {
  readonly totalBeads: number
  readonly usedColorCount: number
  readonly rows: readonly MaterialColorRow[]
}

/** Builds the materials-facing view from the single, already-derived ProjectStats snapshot. */
export function deriveMaterialStatsView(stats: ProjectStats | null): MaterialStatsView | null {
  if (!stats) return null

  return {
    totalBeads: stats.totalBeads,
    usedColorCount: stats.usedColorCount,
    rows: deriveUsedColorRowsFromStats(stats),
  }
}
