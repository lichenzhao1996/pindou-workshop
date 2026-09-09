export const MIN_GRID_WIDTH = 8
export const MAX_GRID_WIDTH = 256
export const DEFAULT_GRID_WIDTH = 64
export const QUICK_GRID_WIDTHS = [32, 48, 64, 96] as const
export const BEAD_SIZE_MM = 2.6

/** The product-wide extreme aspect warning is non-blocking. */
export const EXTREME_ASPECT_RATIO_WARNING_THRESHOLD = 4

export function isValidGridWidth(widthBeads: number): boolean {
  return (
    Number.isInteger(widthBeads) && widthBeads >= MIN_GRID_WIDTH && widthBeads <= MAX_GRID_WIDTH
  )
}

export function assertValidGridWidth(widthBeads: number): void {
  if (!isValidGridWidth(widthBeads)) {
    throw new RangeError(
      `widthBeads must be an integer from ${MIN_GRID_WIDTH} to ${MAX_GRID_WIDTH}`,
    )
  }
}
