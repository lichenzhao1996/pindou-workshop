import { deriveUsedColorRowsFromStats } from '../color-management'
import type { UsedColorRow } from '../color-management'
import { calculateSuggestedBeadCount } from '../../../domain/project/materials'
import type { ProjectStats } from '../../../domain/project/stats'

export interface MaterialColorRow extends Readonly<UsedColorRow> {
  /** Suggested procurement quantity; `count` remains the actual Grid-derived quantity. */
  readonly suggestedCount: number
}

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
    rows: deriveUsedColorRowsFromStats(stats).map((row): MaterialColorRow => ({
      ...row,
      suggestedCount: calculateSuggestedBeadCount(row.count),
    })),
  }
}
