import fontkit from '@pdf-lib/fontkit'
import type { PDFDocument, PDFFont } from 'pdf-lib'

export const PDF_CJK_FONT_ASSET = `${import.meta.env.BASE_URL}fonts/NotoSansCJKsc-Regular.otf`

export class PdfChineseFontError extends Error {
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'PdfChineseFontError'
    this.cause = cause
  }
}

export type PdfFontBytesLoader = () => Promise<Uint8Array>

export async function loadChineseFontBytes(fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  let response: Response
  try {
    response = await fetcher(PDF_CJK_FONT_ASSET)
  } catch (error) {
    throw new PdfChineseFontError('PDF 中文字体资源无法加载。', error)
  }
  if (!response.ok) {
    throw new PdfChineseFontError(`PDF 中文字体资源加载失败（HTTP ${response.status}）。`)
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    throw new PdfChineseFontError('PDF 中文字体资源无法读取。', error)
  }
  if (
    bytes.length < 4 ||
    bytes[0] !== 0x4f ||
    bytes[1] !== 0x54 ||
    bytes[2] !== 0x54 ||
    bytes[3] !== 0x4f
  ) {
    throw new PdfChineseFontError('PDF 中文字体资源无效或不完整。')
  }
  return bytes
}

export async function embedChineseFont(
  document: PDFDocument,
  loadBytes: PdfFontBytesLoader = loadChineseFontBytes,
): Promise<PDFFont> {
  try {
    const bytes = await loadBytes()
    document.registerFontkit(fontkit)
    // Keep the original CFF outlines intact; pdf-lib's CFF subset stream is not reliably
    // accepted by common PDF readers. The font is loaded only on PDF export.
    return await document.embedFont(bytes, { subset: false })
  } catch (error) {
    if (error instanceof PdfChineseFontError) throw error
    throw new PdfChineseFontError('PDF 中文字体无法嵌入，请检查字体文件并重试。', error)
  }
}
