import { mmToPdfPoints, PDF_A4_SIZE_MM } from './units'
import type { ExportSnapshot } from '../snapshot'

export type PdfOrientation = 'auto' | 'portrait' | 'landscape'
export type PdfColorMode = 'color' | 'monochrome'

export interface PdfReadableCellRange {
  readonly min: number
  readonly max: number
}

export interface PdfManualCells {
  readonly columns: number
  readonly rows: number
}

export interface PdfLayoutInput {
  readonly paper: 'A4'
  readonly orientation: PdfOrientation
  readonly marginsMm: number
  readonly targetCellMm: number
  readonly readableCellMmRange: PdfReadableCellRange
  readonly showGrid: boolean
  readonly showLabels: boolean
  readonly showCoordinates: boolean
  readonly showTenCellGuides: boolean
  readonly includeMaterials: boolean
  readonly colorMode: PdfColorMode
  readonly wasteRate: number
  readonly manualCells: PdfManualCells | null
}

export type PdfExportSettings = Pick<
  PdfLayoutInput,
  | 'showGrid'
  | 'showLabels'
  | 'showCoordinates'
  | 'showTenCellGuides'
  | 'includeMaterials'
  | 'colorMode'
>

export interface PdfPageGeometry {
  readonly orientation: Exclude<PdfOrientation, 'auto'>
  readonly pageWidthMm: number
  readonly pageHeightMm: number
  readonly contentWidthMm: number
  readonly contentHeightMm: number
}

export const PDF_DEFAULT_LAYOUT_INPUT: PdfLayoutInput = Object.freeze({
  paper: 'A4',
  orientation: 'auto',
  marginsMm: 10,
  targetCellMm: 6,
  readableCellMmRange: Object.freeze({ min: 5, max: 7 }),
  showGrid: true,
  showLabels: true,
  showCoordinates: true,
  showTenCellGuides: true,
  includeMaterials: true,
  colorMode: 'color',
  wasteRate: 0.05,
  manualCells: null,
})

export const PDF_MANUAL_COLUMNS_EXPORT_OPTION = 'pdfManualColumnsPerPage'
export const PDF_MANUAL_ROWS_EXPORT_OPTION = 'pdfManualRowsPerPage'
export const PDF_SHOW_GRID_EXPORT_OPTION = 'pdfShowGrid'
export const PDF_SHOW_LABELS_EXPORT_OPTION = 'pdfShowLabels'
export const PDF_SHOW_COORDINATES_EXPORT_OPTION = 'pdfShowCoordinates'
export const PDF_SHOW_TEN_CELL_GUIDES_EXPORT_OPTION = 'pdfShowTenCellGuides'
export const PDF_INCLUDE_MATERIALS_EXPORT_OPTION = 'pdfIncludeMaterials'
export const PDF_COLOR_MODE_EXPORT_OPTION = 'pdfColorMode'

export function createDefaultPdfLayoutInput(): PdfLayoutInput {
  return {
    ...PDF_DEFAULT_LAYOUT_INPUT,
    readableCellMmRange: { ...PDF_DEFAULT_LAYOUT_INPUT.readableCellMmRange },
  }
}

export function createDefaultPdfExportSettings(): PdfExportSettings {
  const { showGrid, showLabels, showCoordinates, showTenCellGuides, includeMaterials, colorMode } =
    PDF_DEFAULT_LAYOUT_INPUT
  return { showGrid, showLabels, showCoordinates, showTenCellGuides, includeMaterials, colorMode }
}

export function createPdfExportOptions(
  settings: PdfExportSettings,
  manualCells: PdfManualCells | null,
): Readonly<Record<string, string | number | boolean | null>> {
  return {
    [PDF_MANUAL_COLUMNS_EXPORT_OPTION]: manualCells?.columns ?? null,
    [PDF_MANUAL_ROWS_EXPORT_OPTION]: manualCells?.rows ?? null,
    [PDF_SHOW_GRID_EXPORT_OPTION]: settings.showGrid,
    [PDF_SHOW_LABELS_EXPORT_OPTION]: settings.showLabels,
    [PDF_SHOW_COORDINATES_EXPORT_OPTION]: settings.showCoordinates,
    [PDF_SHOW_TEN_CELL_GUIDES_EXPORT_OPTION]: settings.showTenCellGuides,
    [PDF_INCLUDE_MATERIALS_EXPORT_OPTION]: settings.includeMaterials,
    [PDF_COLOR_MODE_EXPORT_OPTION]: settings.colorMode,
  }
}

function readBooleanExportOption(
  snapshot: ExportSnapshot,
  key: string,
  fallback: boolean,
): boolean {
  const value = snapshot.exportOptions[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new RangeError(`PDF option ${key} must be boolean`)
  return value
}

/** Applies only pagination settings explicitly confirmed into the immutable export snapshot. */
export function createPdfLayoutInputFromSnapshot(snapshot: ExportSnapshot): PdfLayoutInput {
  const input = createDefaultPdfLayoutInput()
  const colorMode = snapshot.exportOptions[PDF_COLOR_MODE_EXPORT_OPTION]
  if (colorMode !== undefined && colorMode !== 'color' && colorMode !== 'monochrome') {
    throw new RangeError('PDF color mode must be color or monochrome')
  }
  const columns = snapshot.exportOptions[PDF_MANUAL_COLUMNS_EXPORT_OPTION]
  const rows = snapshot.exportOptions[PDF_MANUAL_ROWS_EXPORT_OPTION]
  let manualCells = input.manualCells
  if (columns !== undefined || rows !== undefined) {
    if (columns === null && rows === null) {
      manualCells = null
    } else {
      if (
        typeof columns !== 'number' ||
        !Number.isSafeInteger(columns) ||
        columns <= 0 ||
        typeof rows !== 'number' ||
        !Number.isSafeInteger(rows) ||
        rows <= 0
      ) {
        throw new RangeError(
          'Confirmed PDF pagination settings must contain positive integer columns and rows',
        )
      }
      manualCells = { columns, rows }
    }
  }
  const showLabels = readBooleanExportOption(
    snapshot,
    PDF_SHOW_LABELS_EXPORT_OPTION,
    input.showLabels,
  )
  return {
    ...input,
    showGrid: readBooleanExportOption(snapshot, PDF_SHOW_GRID_EXPORT_OPTION, input.showGrid),
    showLabels: colorMode === 'monochrome' ? true : showLabels,
    showCoordinates: readBooleanExportOption(
      snapshot,
      PDF_SHOW_COORDINATES_EXPORT_OPTION,
      input.showCoordinates,
    ),
    showTenCellGuides: readBooleanExportOption(
      snapshot,
      PDF_SHOW_TEN_CELL_GUIDES_EXPORT_OPTION,
      input.showTenCellGuides,
    ),
    includeMaterials: readBooleanExportOption(
      snapshot,
      PDF_INCLUDE_MATERIALS_EXPORT_OPTION,
      input.includeMaterials,
    ),
    colorMode: colorMode === undefined ? input.colorMode : colorMode,
    manualCells,
  }
}

export function assertValidPdfLayoutInput(input: PdfLayoutInput): void {
  if (input.paper !== 'A4') throw new RangeError('PDF paper must be A4')
  if (!Number.isFinite(input.marginsMm) || input.marginsMm < 0) {
    throw new RangeError('PDF margins must be a finite non-negative measurement')
  }
  if (input.marginsMm * 2 >= Math.min(PDF_A4_SIZE_MM.width, PDF_A4_SIZE_MM.height)) {
    throw new RangeError('PDF margins leave no printable area')
  }
  if (!Number.isFinite(input.targetCellMm) || input.targetCellMm <= 0) {
    throw new RangeError('PDF target cell size must be a positive finite measurement')
  }
  const { min, max } = input.readableCellMmRange
  if (!Number.isFinite(min) || min <= 0 || !Number.isFinite(max) || max < min) {
    throw new RangeError('PDF readable cell range is invalid')
  }
  if (!Number.isFinite(input.wasteRate) || input.wasteRate < 0 || input.wasteRate > 1) {
    throw new RangeError('PDF waste rate must be between zero and one')
  }
  if (
    input.manualCells !== null &&
    (!Number.isSafeInteger(input.manualCells.columns) ||
      input.manualCells.columns <= 0 ||
      !Number.isSafeInteger(input.manualCells.rows) ||
      input.manualCells.rows <= 0)
  ) {
    throw new RangeError('Manual PDF cells per page must be positive safe integers')
  }
}

export function derivePdfPageGeometry(
  input: PdfLayoutInput,
  orientation: Exclude<PdfOrientation, 'auto'>,
): PdfPageGeometry {
  assertValidPdfLayoutInput(input)
  if (orientation !== 'portrait' && orientation !== 'landscape') {
    throw new RangeError('PDF page orientation must be portrait or landscape')
  }
  const pageWidthMm = orientation === 'portrait' ? PDF_A4_SIZE_MM.width : PDF_A4_SIZE_MM.height
  const pageHeightMm = orientation === 'portrait' ? PDF_A4_SIZE_MM.height : PDF_A4_SIZE_MM.width
  return {
    orientation,
    pageWidthMm,
    pageHeightMm,
    contentWidthMm: pageWidthMm - input.marginsMm * 2,
    contentHeightMm: pageHeightMm - input.marginsMm * 2,
  }
}

/** Keeps color codes proportional to the physical cell size, with a readable print floor. */
export function derivePdfLabelFontSizePt(cellSizeMm: number): number {
  if (!Number.isFinite(cellSizeMm) || cellSizeMm <= 0) {
    throw new RangeError('PDF cell size must be a positive finite measurement')
  }
  const preferredSize = mmToPdfPoints(cellSizeMm * 0.42)
  return Math.min(12, Math.max(4, preferredSize))
}
