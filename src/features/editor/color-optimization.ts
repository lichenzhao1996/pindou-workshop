import { deltaE76, getPaletteEntryByIndex, MARD_291_PALETTE } from '../../domain/palette'
import type { PaletteEntry } from '../../domain/palette'
import type { UsedColorRow } from './color-management'

export const LOW_USAGE_BEAD_THRESHOLD = 10

export interface ColorMergeSuggestion {
  readonly source: PaletteEntry
  readonly target: PaletteEntry
  readonly sourceCount: number
  readonly targetCount: number
  readonly distance: number
}

export type LowUsageColorSuggestion = ColorMergeSuggestion

function compareNearest(source: UsedColorRow, left: UsedColorRow, right: UsedColorRow): number {
  const leftEntry = getPaletteEntryByIndex(MARD_291_PALETTE, left.paletteIndex)
  const rightEntry = getPaletteEntryByIndex(MARD_291_PALETTE, right.paletteIndex)
  if (!leftEntry || !rightEntry) return left.paletteIndex - right.paletteIndex
  const sourceEntry = getPaletteEntryByIndex(MARD_291_PALETTE, source.paletteIndex)
  if (!sourceEntry) return left.paletteIndex - right.paletteIndex
  return (
    deltaE76(sourceEntry.lab, leftEntry.lab) - deltaE76(sourceEntry.lab, rightEntry.lab) ||
    left.paletteIndex - right.paletteIndex
  )
}

function createMergeSuggestion(
  first: UsedColorRow,
  second: UsedColorRow,
): ColorMergeSuggestion | null {
  const firstEntry = getPaletteEntryByIndex(MARD_291_PALETTE, first.paletteIndex)
  const secondEntry = getPaletteEntryByIndex(MARD_291_PALETTE, second.paletteIndex)
  if (!firstEntry || !secondEntry || first.paletteIndex === second.paletteIndex) return null

  const source =
    first.count < second.count ||
    (first.count === second.count && first.paletteIndex > second.paletteIndex)
      ? first
      : second
  const target = source === first ? second : first
  const sourceEntry = source === first ? firstEntry : secondEntry
  const targetEntry = source === first ? secondEntry : firstEntry
  return {
    source: sourceEntry,
    target: targetEntry,
    sourceCount: source.count,
    targetCount: target.count,
    distance: deltaE76(sourceEntry.lab, targetEntry.lab),
  }
}

function findNearestUsedColor(
  source: UsedColorRow,
  rows: readonly UsedColorRow[],
  preferAtLeastSourceCount: boolean,
): UsedColorRow | undefined {
  const otherRows = rows.filter((row) => row.paletteIndex !== source.paletteIndex)
  const preferredRows = preferAtLeastSourceCount
    ? otherRows.filter((row) => row.count >= source.count)
    : otherRows
  const candidates = preferredRows.length > 0 ? preferredRows : otherRows
  return [...candidates].sort((left, right) => compareNearest(source, left, right))[0]
}

/** Builds bounded nearest-used-color merge candidates from the existing ProjectStats rows. */
export function deriveColorOptimizationSuggestions(rows: readonly UsedColorRow[]): {
  readonly similarColors: readonly ColorMergeSuggestion[]
  readonly lowUsageColors: readonly LowUsageColorSuggestion[]
} {
  const validRows = rows.filter(
    (row) =>
      Number.isInteger(row.paletteIndex) &&
      row.paletteIndex > 0 &&
      row.count > 0 &&
      getPaletteEntryByIndex(MARD_291_PALETTE, row.paletteIndex),
  )
  const pairs = new Map<string, ColorMergeSuggestion>()
  for (const source of validRows) {
    const nearest = findNearestUsedColor(source, validRows, false)
    if (!nearest) continue
    const candidate = createMergeSuggestion(source, nearest)
    if (!candidate) continue
    const key = [source.paletteIndex, nearest.paletteIndex].sort((a, b) => a - b).join(':')
    pairs.set(key, candidate)
  }

  const similarColors = [...pairs.values()].sort(
    (left, right) =>
      left.distance - right.distance ||
      left.source.paletteIndex - right.source.paletteIndex ||
      left.target.paletteIndex - right.target.paletteIndex,
  )
  const lowUsageColors = validRows
    .filter((row) => row.count < LOW_USAGE_BEAD_THRESHOLD)
    .flatMap((source) => {
      const nearest = findNearestUsedColor(source, validRows, true)
      if (!nearest) return []
      const candidate = createMergeSuggestion(source, nearest)
      return candidate ? [candidate] : []
    })
    .sort(
      (left, right) =>
        left.sourceCount - right.sourceCount ||
        left.distance - right.distance ||
        left.source.paletteIndex - right.source.paletteIndex,
    )

  return { similarColors, lowUsageColors }
}
