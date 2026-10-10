import type { Grid } from '../../../domain/project/grid'
import {
  createDefaultPdfLayoutInput,
  derivePdfLabelFontSizePt,
  derivePdfPageGeometry,
  type PdfLayoutInput,
  type PdfOrientation,
} from './layout'

export interface PdfGridRange {
  /** 1-based PDF page number including the overview page. */
  readonly pageNumber: number
  /** 0-based page row and column within the paginated Grid. */
  readonly pageRow: number
  readonly pageColumn: number
  /** Half-open, 0-based Grid coordinates. */
  readonly rowStart: number
  readonly rowEndExclusive: number
  readonly columnStart: number
  readonly columnEndExclusive: number
}

export interface PdfPaginationPlan {
  readonly orientation: Exclude<PdfOrientation, 'auto'>
  readonly pageWidthMm: number
  readonly pageHeightMm: number
  readonly marginsMm: number
  readonly contentWidthMm: number
  readonly contentHeightMm: number
  readonly gridAreaWidthMm: number
  readonly gridAreaHeightMm: number
  readonly coordinateGutterMm: number
  readonly headerMm: number
  readonly coordinateHeaderMm: number
  readonly footerMm: number
  readonly targetCellMm: number
  readonly cellSizeMm: number
  readonly labelFontSizePt: number
  readonly columnsPerPage: number
  readonly rowsPerPage: number
  readonly pageColumns: number
  readonly pageRows: number
  readonly estimatedPageCount: number
  readonly readability: 'within-range' | 'below-range' | 'above-range'
  readonly diagnostics: readonly string[]
  readonly pages: readonly PdfGridRange[]
}

interface PaginationCandidate extends Omit<PdfPaginationPlan, 'pages'> {
  readonly aspectRatioError: number
}

function createCandidate(
  grid: Pick<Grid, 'width' | 'height'>,
  input: PdfLayoutInput,
  orientation: Exclude<PdfOrientation, 'auto'>,
): PaginationCandidate {
  const geometry = derivePdfPageGeometry(input, orientation)
  const coordinateGutterMm = input.showCoordinates ? 7 : 0
  const headerMm = 25
  const coordinateHeaderMm = input.showCoordinates ? 5 : 0
  const footerMm = 5
  const gridAreaWidthMm = geometry.contentWidthMm - coordinateGutterMm
  const gridAreaHeightMm = geometry.contentHeightMm - headerMm - coordinateHeaderMm - footerMm
  if (gridAreaWidthMm <= 0 || gridAreaHeightMm <= 0) {
    throw new RangeError('PDF chart annotations leave no printable Grid area')
  }
  const columnsPerPage =
    input.manualCells?.columns ?? Math.floor(gridAreaWidthMm / input.targetCellMm)
  const rowsPerPage = input.manualCells?.rows ?? Math.floor(gridAreaHeightMm / input.targetCellMm)
  if (columnsPerPage < 1 || rowsPerPage < 1) {
    throw new RangeError('PDF target cell size does not fit inside the A4 printable area')
  }

  const cellSizeMm = Math.min(gridAreaWidthMm / columnsPerPage, gridAreaHeightMm / rowsPerPage)
  const pageColumns = Math.ceil(grid.width / columnsPerPage)
  const pageRows = Math.ceil(grid.height / rowsPerPage)
  const estimatedPageCount = pageColumns * pageRows
  if (!Number.isSafeInteger(estimatedPageCount) || estimatedPageCount < 1) {
    throw new RangeError('PDF page count is outside the supported numeric range')
  }

  const { min, max } = input.readableCellMmRange
  const readability =
    cellSizeMm < min ? 'below-range' : cellSizeMm > max ? 'above-range' : 'within-range'
  const diagnostics =
    readability === 'within-range'
      ? []
      : [
          readability === 'below-range'
            ? `推荐单格尺寸 ${cellSizeMm.toFixed(2)}mm 小于 ${min}mm 可读范围。`
            : `推荐单格尺寸 ${cellSizeMm.toFixed(2)}mm 大于 ${max}mm 可读范围。`,
        ]

  return {
    orientation,
    pageWidthMm: geometry.pageWidthMm,
    pageHeightMm: geometry.pageHeightMm,
    marginsMm: input.marginsMm,
    contentWidthMm: geometry.contentWidthMm,
    contentHeightMm: geometry.contentHeightMm,
    gridAreaWidthMm,
    gridAreaHeightMm,
    coordinateGutterMm,
    headerMm,
    coordinateHeaderMm,
    footerMm,
    targetCellMm: input.targetCellMm,
    cellSizeMm,
    labelFontSizePt: derivePdfLabelFontSizePt(cellSizeMm),
    columnsPerPage,
    rowsPerPage,
    pageColumns,
    pageRows,
    estimatedPageCount,
    readability,
    diagnostics,
    aspectRatioError: Math.abs(
      Math.log(grid.width / grid.height / (geometry.pageWidthMm / geometry.pageHeightMm)),
    ),
  }
}

function compareCandidates(left: PaginationCandidate, right: PaginationCandidate): number {
  const readabilityRank = (candidate: PaginationCandidate) =>
    candidate.readability === 'within-range' ? 0 : candidate.readability === 'below-range' ? 1 : 2
  const rankDifference = readabilityRank(left) - readabilityRank(right)
  if (rankDifference !== 0) return rankDifference
  if (left.labelFontSizePt !== right.labelFontSizePt) {
    return right.labelFontSizePt - left.labelFontSizePt
  }
  if (left.estimatedPageCount !== right.estimatedPageCount) {
    return left.estimatedPageCount - right.estimatedPageCount
  }
  if (left.aspectRatioError !== right.aspectRatioError) {
    return left.aspectRatioError - right.aspectRatioError
  }
  return left.orientation === 'portrait' ? -1 : 1
}

function createPageRanges(
  grid: Pick<Grid, 'width' | 'height'>,
  candidate: PaginationCandidate,
): PdfGridRange[] {
  const pages: PdfGridRange[] = []
  for (let pageRow = 0; pageRow < candidate.pageRows; pageRow += 1) {
    for (let pageColumn = 0; pageColumn < candidate.pageColumns; pageColumn += 1) {
      const rowStart = pageRow * candidate.rowsPerPage
      const columnStart = pageColumn * candidate.columnsPerPage
      pages.push({
        pageNumber: pages.length + 2,
        pageRow,
        pageColumn,
        rowStart,
        rowEndExclusive: Math.min(rowStart + candidate.rowsPerPage, grid.height),
        columnStart,
        columnEndExclusive: Math.min(columnStart + candidate.columnsPerPage, grid.width),
      })
    }
  }
  return pages
}

/** Plans only page geometry and Grid ranges; it never reads or rewrites Grid.cells. */
export function recommendPdfPagination(
  grid: Pick<Grid, 'width' | 'height'>,
  input: PdfLayoutInput = createDefaultPdfLayoutInput(),
): PdfPaginationPlan {
  if (!Number.isSafeInteger(grid.width) || grid.width <= 0) {
    throw new RangeError('PDF pagination requires a positive safe Grid width')
  }
  if (!Number.isSafeInteger(grid.height) || grid.height <= 0) {
    throw new RangeError('PDF pagination requires a positive safe Grid height')
  }

  const candidates =
    input.orientation === 'auto'
      ? [createCandidate(grid, input, 'portrait'), createCandidate(grid, input, 'landscape')]
      : [createCandidate(grid, input, input.orientation)]
  const selected = [...candidates].sort(compareCandidates)[0]!
  return {
    orientation: selected.orientation,
    pageWidthMm: selected.pageWidthMm,
    pageHeightMm: selected.pageHeightMm,
    marginsMm: selected.marginsMm,
    contentWidthMm: selected.contentWidthMm,
    contentHeightMm: selected.contentHeightMm,
    gridAreaWidthMm: selected.gridAreaWidthMm,
    gridAreaHeightMm: selected.gridAreaHeightMm,
    coordinateGutterMm: selected.coordinateGutterMm,
    headerMm: selected.headerMm,
    coordinateHeaderMm: selected.coordinateHeaderMm,
    footerMm: selected.footerMm,
    targetCellMm: selected.targetCellMm,
    cellSizeMm: selected.cellSizeMm,
    labelFontSizePt: selected.labelFontSizePt,
    columnsPerPage: selected.columnsPerPage,
    rowsPerPage: selected.rowsPerPage,
    pageColumns: selected.pageColumns,
    pageRows: selected.pageRows,
    estimatedPageCount: selected.estimatedPageCount,
    readability: selected.readability,
    diagnostics: selected.diagnostics,
    pages: createPageRanges(grid, selected),
  }
}
