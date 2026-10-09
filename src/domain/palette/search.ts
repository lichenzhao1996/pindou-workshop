import type { Palette, PaletteEntry } from './types'

export type PaletteSortOrder = 'displayCode' | 'colorId'

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}

function compareDisplayCode(left: PaletteEntry, right: PaletteEntry): number {
  const leftMatch = /^([A-Za-z]+)(\d+)$/.exec(left.displayCode)
  const rightMatch = /^([A-Za-z]+)(\d+)$/.exec(right.displayCode)

  if (leftMatch && rightMatch) {
    const seriesComparison = compareText(leftMatch[1].toUpperCase(), rightMatch[1].toUpperCase())
    if (seriesComparison !== 0) {
      return seriesComparison
    }

    const numberComparison = Number(leftMatch[2]) - Number(rightMatch[2])
    if (numberComparison !== 0) {
      return numberComparison
    }
  } else {
    const textComparison = compareText(
      left.displayCode.toUpperCase(),
      right.displayCode.toUpperCase(),
    )
    if (textComparison !== 0) {
      return textComparison
    }
  }

  return left.paletteIndex - right.paletteIndex
}

export function searchPalette(palette: Palette, query: string): readonly PaletteEntry[] {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) {
    return palette.entries
  }

  return palette.entries.filter((entry) =>
    [entry.colorId, entry.displayCode, entry.name].some((field) =>
      normalizeQuery(field).includes(normalizedQuery),
    ),
  )
}

export function filterPaletteByFamily(palette: Palette, family: string): readonly PaletteEntry[] {
  const normalizedFamily = normalizeQuery(family)
  return palette.entries.filter((entry) => normalizeQuery(entry.family) === normalizedFamily)
}

export function groupPaletteByFamily(
  palette: Palette,
): ReadonlyMap<string, readonly PaletteEntry[]> {
  return groupPaletteEntriesByFamily(palette.entries)
}

/** Groups already-filtered Palette entries, preserving formal display-code order. */
export function groupPaletteEntriesByFamily(
  entries: readonly PaletteEntry[],
): ReadonlyMap<string, readonly PaletteEntry[]> {
  const groups = new Map<string, PaletteEntry[]>()

  for (const entry of sortPaletteEntries(entries, 'displayCode')) {
    const group = groups.get(entry.family)
    if (group) {
      group.push(entry)
    } else {
      groups.set(entry.family, [entry])
    }
  }

  return groups
}

export function sortPaletteEntries(
  entries: readonly PaletteEntry[],
  order: PaletteSortOrder = 'displayCode',
): readonly PaletteEntry[] {
  return [...entries].sort((left, right) => {
    const comparison =
      order === 'displayCode'
        ? compareDisplayCode(left, right)
        : compareText(left.colorId, right.colorId)

    return comparison !== 0 ? comparison : left.paletteIndex - right.paletteIndex
  })
}
