import { describe, expect, it } from 'vitest'
import {
  assertValidPdfLayoutInput,
  createDefaultPdfLayoutInput,
  derivePdfLabelFontSizePt,
  derivePdfPageGeometry,
  PDF_DEFAULT_LAYOUT_INPUT,
} from '../../src/features/export/pdf/layout'

describe('TASK-083 PDF A4 layout input', () => {
  it('defines the confirmed A4, margin, orientation and readable-cell defaults', () => {
    const input = createDefaultPdfLayoutInput()
    expect(input).toMatchObject({
      paper: 'A4',
      orientation: 'auto',
      marginsMm: 10,
      targetCellMm: 6,
      readableCellMmRange: { min: 5, max: 7 },
      showGrid: true,
      showLabels: true,
      showCoordinates: true,
      showTenCellGuides: true,
      includeMaterials: true,
      colorMode: 'color',
      wasteRate: 0.05,
    })
    expect(input.readableCellMmRange).not.toBe(PDF_DEFAULT_LAYOUT_INPUT.readableCellMmRange)
  })

  it('calculates A4 portrait and landscape printable areas after 10mm margins', () => {
    const input = createDefaultPdfLayoutInput()
    expect(derivePdfPageGeometry(input, 'portrait')).toEqual({
      orientation: 'portrait',
      pageWidthMm: 210,
      pageHeightMm: 297,
      contentWidthMm: 190,
      contentHeightMm: 277,
    })
    expect(derivePdfPageGeometry(input, 'landscape')).toEqual({
      orientation: 'landscape',
      pageWidthMm: 297,
      pageHeightMm: 210,
      contentWidthMm: 277,
      contentHeightMm: 190,
    })
  })

  it('derives a larger code font for physically larger cells', () => {
    expect(derivePdfLabelFontSizePt(7)).toBeGreaterThan(derivePdfLabelFontSizePt(5))
    expect(derivePdfLabelFontSizePt(6)).toBeGreaterThan(6)
    expect(() => derivePdfLabelFontSizePt(0)).toThrow(RangeError)
  })

  it('rejects invalid margins and readable ranges', () => {
    const input = createDefaultPdfLayoutInput()
    expect(() => derivePdfPageGeometry(input, 'auto' as never)).toThrow(RangeError)
    expect(() => assertValidPdfLayoutInput({ ...input, marginsMm: 110 })).toThrow(RangeError)
    expect(() =>
      assertValidPdfLayoutInput({
        ...input,
        readableCellMmRange: { min: 8, max: 7 },
      }),
    ).toThrow(RangeError)
  })
})
