export const PDF_POINTS_PER_INCH = 72
export const MILLIMETERS_PER_INCH = 25.4

export const PDF_A4_SIZE_MM = Object.freeze({
  width: 210,
  height: 297,
})

export interface PdfPageSizeMm {
  readonly width: number
  readonly height: number
}

/** Converts a physical millimeter measurement to the PDF point coordinate unit. */
export function mmToPdfPoints(millimeters: number): number {
  if (!Number.isFinite(millimeters) || millimeters < 0) {
    throw new RangeError('PDF millimeter measurement must be a finite non-negative number')
  }
  return (millimeters * PDF_POINTS_PER_INCH) / MILLIMETERS_PER_INCH
}

export function assertValidPdfPageSizeMm(size: PdfPageSizeMm): void {
  if (
    !Number.isFinite(size.width) ||
    size.width <= 0 ||
    !Number.isFinite(size.height) ||
    size.height <= 0
  ) {
    throw new RangeError('PDF page dimensions must be finite positive millimeter values')
  }
}
