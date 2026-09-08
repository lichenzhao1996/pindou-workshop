export type PaletteSource = 'MARD'
export type PaletteVersion = string

export interface RgbColor {
  readonly r: number
  readonly g: number
  readonly b: number
}

export interface LabColor {
  readonly l: number
  readonly a: number
  readonly b: number
}

export interface PaletteEntry {
  /** Runtime index stored by Grid. It is distinct from colorId and displayCode. */
  readonly paletteIndex: number
  /** Stable business identifier for one MARD color. */
  readonly colorId: string
  /** MARD color code shown to users. */
  readonly displayCode: string
  readonly name: string
  /** Display and color matching metadata; never a Grid cell value. */
  readonly rgb: RgbColor
  readonly hex: string
  readonly lab: LabColor
  readonly family: string
}

export interface Palette {
  readonly source: PaletteSource
  readonly paletteVersion: PaletteVersion
  /** The formal MARD Palette contains 291 entries; fixtures may contain fewer entries. */
  readonly entries: readonly PaletteEntry[]
  readonly byColorId: ReadonlyMap<string, PaletteEntry>
}
