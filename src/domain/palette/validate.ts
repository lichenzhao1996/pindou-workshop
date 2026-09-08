import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../constants'
import type { Palette } from './types'

const EXPECTED_ENTRY_COUNT = MAX_PALETTE_INDEX - MIN_PALETTE_INDEX + 1

export interface PaletteValidationIssue {
  readonly path: string
  readonly message: string
}

export interface PaletteValidationResult {
  readonly valid: boolean
  readonly issues: readonly PaletteValidationIssue[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isByte(value: unknown): value is number {
  return isInteger(value) && value >= 0 && value <= 255
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function expectedHex(rgb: Record<string, unknown>): string | undefined {
  const channels = [rgb.r, rgb.g, rgb.b]
  if (!channels.every(isByte)) {
    return undefined
  }

  return `#${channels
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

function addIssue(issues: PaletteValidationIssue[], path: string, message: string): void {
  issues.push({ path, message })
}

export function validatePalette(value: unknown): PaletteValidationResult {
  const issues: PaletteValidationIssue[] = []

  if (!isRecord(value)) {
    addIssue(issues, 'palette', 'must be an object')
    return { valid: false, issues }
  }

  if (value.source !== 'MARD') {
    addIssue(issues, 'source', 'must be MARD')
  }

  if (!isNonEmptyString(value.paletteVersion)) {
    addIssue(issues, 'paletteVersion', 'must be a non-empty string')
  }

  const entries = value.entries
  const entryRecords: Array<{ path: string; value: Record<string, unknown> }> = []
  const seenIndexes = new Set<number>()
  const seenColorIds = new Set<string>()
  const seenDisplayCodes = new Set<string>()

  if (!Array.isArray(entries)) {
    addIssue(issues, 'entries', 'must be an array')
  } else {
    if (entries.length !== EXPECTED_ENTRY_COUNT) {
      addIssue(issues, 'entries', `must contain exactly ${EXPECTED_ENTRY_COUNT} entries`)
    }

    entries.forEach((entry, entryPosition) => {
      const path = `entries[${entryPosition}]`
      if (!isRecord(entry)) {
        addIssue(issues, path, 'must be an object')
        return
      }

      entryRecords.push({ path, value: entry })

      const paletteIndex = entry.paletteIndex
      if (!isInteger(paletteIndex)) {
        addIssue(issues, `${path}.paletteIndex`, 'must be an integer')
      } else if (paletteIndex < MIN_PALETTE_INDEX || paletteIndex > MAX_PALETTE_INDEX) {
        addIssue(
          issues,
          `${path}.paletteIndex`,
          `must be between ${MIN_PALETTE_INDEX} and ${MAX_PALETTE_INDEX}`,
        )
      } else if (seenIndexes.has(paletteIndex)) {
        addIssue(issues, `${path}.paletteIndex`, `duplicates index ${paletteIndex}`)
      } else {
        seenIndexes.add(paletteIndex)
      }

      const colorId = entry.colorId
      if (!isNonEmptyString(colorId)) {
        addIssue(issues, `${path}.colorId`, 'must be a non-empty string')
      } else if (seenColorIds.has(colorId)) {
        addIssue(issues, `${path}.colorId`, `duplicates colorId ${colorId}`)
      } else {
        seenColorIds.add(colorId)
      }

      const displayCode = entry.displayCode
      if (!isNonEmptyString(displayCode)) {
        addIssue(issues, `${path}.displayCode`, 'must be a non-empty string')
      } else if (seenDisplayCodes.has(displayCode)) {
        addIssue(issues, `${path}.displayCode`, `duplicates displayCode ${displayCode}`)
      } else {
        seenDisplayCodes.add(displayCode)
      }

      if (!isNonEmptyString(entry.name)) {
        addIssue(issues, `${path}.name`, 'must be a non-empty string')
      }

      const rgb = entry.rgb
      if (!isRecord(rgb)) {
        addIssue(issues, `${path}.rgb`, 'must be an object')
      } else {
        for (const channel of ['r', 'g', 'b']) {
          const channelValue = rgb[channel]
          if (!isByte(channelValue)) {
            addIssue(issues, `${path}.rgb.${channel}`, 'must be an integer from 0 to 255')
          }
        }
      }

      const hex = entry.hex
      if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        addIssue(issues, `${path}.hex`, 'must use the #RRGGBB format')
      } else if (isRecord(rgb)) {
        const canonicalHex = expectedHex(rgb)
        if (canonicalHex !== undefined && hex !== canonicalHex) {
          addIssue(issues, `${path}.hex`, `must match RGB as ${canonicalHex}`)
        }
      }

      const lab = entry.lab
      if (!isRecord(lab)) {
        addIssue(issues, `${path}.lab`, 'must be an object')
      } else {
        for (const channel of ['l', 'a', 'b']) {
          if (!isFiniteNumber(lab[channel])) {
            addIssue(issues, `${path}.lab.${channel}`, 'must be a finite number')
          }
        }
      }

      if (!isNonEmptyString(entry.family)) {
        addIssue(issues, `${path}.family`, 'must be a non-empty string')
      }
    })

    for (
      let paletteIndex = MIN_PALETTE_INDEX;
      paletteIndex <= MAX_PALETTE_INDEX;
      paletteIndex += 1
    ) {
      if (!seenIndexes.has(paletteIndex)) {
        addIssue(issues, 'entries.paletteIndex', `is missing index ${paletteIndex}`)
      }
    }
  }

  const byColorId = value.byColorId
  if (!(byColorId instanceof Map)) {
    addIssue(issues, 'byColorId', 'must be a Map')
  } else {
    if (byColorId.size !== EXPECTED_ENTRY_COUNT) {
      addIssue(issues, 'byColorId', `must contain exactly ${EXPECTED_ENTRY_COUNT} entries`)
    }

    for (const { path, value: entry } of entryRecords) {
      const colorId = entry.colorId
      if (!isNonEmptyString(colorId)) {
        continue
      }

      if (!byColorId.has(colorId)) {
        addIssue(issues, `byColorId.${colorId}`, `is missing entry for ${colorId}`)
      } else if (byColorId.get(colorId) !== entry) {
        addIssue(issues, `byColorId.${colorId}`, `must point to ${path}`)
      }
    }

    for (const [key, entry] of byColorId.entries()) {
      const path = `byColorId.${String(key)}`
      if (!isNonEmptyString(key)) {
        addIssue(issues, path, 'key must be a non-empty string')
      }

      if (!isRecord(entry)) {
        addIssue(issues, path, 'must point to an entry object')
        continue
      }

      if (entry.colorId !== key) {
        addIssue(issues, path, 'key must match entry.colorId')
      }

      if (!Array.isArray(entries) || !entries.includes(entry)) {
        addIssue(issues, path, 'must point to an entry in entries')
      }
    }
  }

  return { valid: issues.length === 0, issues }
}

export function assertValidPalette(value: unknown): asserts value is Palette {
  const result = validatePalette(value)
  if (!result.valid) {
    const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')
    throw new Error(`Invalid Palette: ${details}`)
  }
}
