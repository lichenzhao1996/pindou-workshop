import { mmToPdfPoints, PDF_A4_SIZE_MM } from './units'

export type PdfOrientation = 'auto' | 'portrait' | 'landscape'
export type PdfColorMode = 'color' | 'monochrome'

export interface PdfReadableCellRange {
  readonly min: number
  readonly max: number
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
}

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
})

export function createDefaultPdfLayoutInput(): PdfLayoutInput {
  return {
    ...PDF_DEFAULT_LAYOUT_INPUT,
    readableCellMmRange: { ...PDF_DEFAULT_LAYOUT_INPUT.readableCellMmRange },
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
