import {
  getPaletteEntryByIndex,
  MARD_291_PALETTE,
  searchPalette,
  sortPaletteEntries,
  type PaletteEntry,
} from '../../domain/palette'
import { deriveProjectStats } from '../../domain/project/stats'
import type { ProjectStats } from '../../domain/project/stats'
import type { Project } from '../../domain/project/types'

export interface UsedColorRow {
  readonly paletteIndex: number
  readonly entry: PaletteEntry
  readonly count: number
  readonly percentage: number
}

export type UsedColorSort = 'count' | 'displayCode'

export function deriveUsedColorRows(project: Project | null): UsedColorRow[] {
  if (!project?.grid) return []
  return deriveUsedColorRowsFromStats(deriveProjectStats(project))
}

export function deriveUsedColorRowsFromStats(stats: ProjectStats | null): UsedColorRow[] {
  if (!stats) return []
  if (stats.totalBeads === 0) return []

  return stats.usedPaletteIndices
    .map((paletteIndex) => {
      const entry = getPaletteEntryByIndex(MARD_291_PALETTE, paletteIndex)
      const count = stats.usageByPaletteIndex[paletteIndex] ?? 0
      return entry && count > 0
        ? {
            paletteIndex,
            entry,
            count,
            percentage: Math.round((count / stats.totalBeads) * 1000) / 10,
          }
        : null
    })
    .filter((row): row is UsedColorRow => row !== null)
    .sort((left, right) => right.count - left.count || left.paletteIndex - right.paletteIndex)
}

export function filterUsedColorRows<T extends UsedColorRow>(
  rows: readonly T[],
  query: string,
): T[] {
  const entries = rows.map((row) => row.entry)
  const usedPalette = { ...MARD_291_PALETTE, entries }
  const matches = new Set(searchPalette(usedPalette, query).map((entry) => entry.paletteIndex))
  return rows.filter((row) => matches.has(row.paletteIndex))
}

export function sortUsedColorRows<T extends UsedColorRow>(
  rows: readonly T[],
  order: UsedColorSort,
): T[] {
  if (order === 'count') {
    return [...rows].sort(
      (left, right) => right.count - left.count || left.paletteIndex - right.paletteIndex,
    )
  }
  const sortedIndices = sortPaletteEntries(
    rows.map((row) => row.entry),
    'displayCode',
  ).map((entry) => entry.paletteIndex)
  const byIndex = new Map(rows.map((row) => [row.paletteIndex, row]))
  return sortedIndices.flatMap((paletteIndex) => {
    const row = byIndex.get(paletteIndex)
    return row ? [row] : []
  })
}
