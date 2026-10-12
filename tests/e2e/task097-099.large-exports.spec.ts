import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { deriveEffectPreviewLayout } from '../../src/features/export/png/effect-preview'
import { deriveReferencePngLayout } from '../../src/features/export/png/reference-guide'
import { createDefaultPdfLayoutInput } from '../../src/features/export/pdf/layout'
import { recommendPdfPagination } from '../../src/features/export/pdf/pagination'

type ProjectDebug = {
  projectId: string
  projectName: string
  revision: number
  updatedAt: string
  grid: { width: number; height: number; cells: Uint16Array } | null
}

type StoreDebug = {
  currentProject?: ProjectDebug | null
  past?: unknown[]
  future?: unknown[]
}

type ProjectSummary = {
  projectId: string
  projectName: string
  revision: number
  updatedAt: string
  width: number
  height: number
  totalBeads: number
  usedColorCount: number
  emptyCount: number
  historyPast: number
  historyFuture: number
  gridHash: number
  sampleCells: number[]
}

type UploadOptions = {
  readonly fileName: string
  readonly width: number
  readonly height: number
  readonly pattern: 'four-zones' | 'solid'
}

async function uploadCanvasImage(page: Page, options: UploadOptions) {
  await page.goto('/')
  await expect(page.getByTestId('image-file-input')).toBeAttached()
  await page.evaluate(async ({ fileName, width, height, pattern }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    if (pattern === 'four-zones') {
      const image = context.createImageData(width, height)
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const rgba =
            x < width / 4
              ? [0, 0, 0, 0]
              : x < width / 2
                ? [255, 255, 255, 255]
                : x < (width * 3) / 4
                  ? [208, 32, 48, 255]
                  : [39, 82, 58, 255]
          image.data.set(rgba, (y * width + x) * 4)
        }
      }
      context.putImageData(image, 0, 0)
    } else {
      context.fillStyle = '#27523A'
      context.fillRect(0, 0, width, height)
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) =>
        value ? resolve(value) : reject(new Error('PNG fixture encoding failed')),
      )
    })
    canvas.width = 0
    canvas.height = 0
    const input = document.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')!
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], fileName, { type: 'image/png' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, options)
  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByTestId('crop-confirm')).toBeEnabled()
}

async function generateGrid(page: Page, width: number, expectedHeight: number) {
  await page.getByTestId('grid-width-input').fill(String(width))
  await expect(page.getByTestId('grid-bead-dimensions')).toContainText(
    `${width} × ${expectedHeight} 颗`,
  )
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('generate')).toBeEnabled()
  const startedAt = performance.now()
  await page.getByTestId('generate').click()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toBeVisible()
  const elapsedMs = performance.now() - startedAt
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-width', String(width))
  await expect(page.getByTestId('editor-grid')).toHaveAttribute(
    'data-height',
    String(expectedHeight),
  )
  return elapsedMs
}

async function readProjectSummary(page: Page): Promise<ProjectSummary> {
  return page.evaluate(() => {
    const root = document.querySelector('#app') as
      | (HTMLElement & {
          __vue_app__?: {
            config: {
              globalProperties: {
                $pinia: { _s: Map<string, StoreDebug> }
              }
            }
          }
        })
      | null
    const projectStore = root?.__vue_app__?.config.globalProperties.$pinia._s.get('project')
    const project = projectStore?.currentProject
    const grid = project?.grid
    if (!project || !grid) throw new Error('Expected a committed Project and Grid in Pinia.')

    let gridHash = 2_166_136_261
    let totalBeads = 0
    let emptyCount = 0
    const usedColors = new Set<number>()
    for (const value of grid.cells) {
      gridHash = Math.imul(gridHash ^ value, 16_777_619)
      if (value === 0) emptyCount += 1
      else {
        totalBeads += 1
        usedColors.add(value)
      }
    }
    const centerRow = Math.floor(grid.height / 2)
    return {
      projectId: project.projectId,
      projectName: project.projectName,
      revision: project.revision,
      updatedAt: project.updatedAt,
      width: grid.width,
      height: grid.height,
      totalBeads,
      usedColorCount: usedColors.size,
      emptyCount,
      historyPast: projectStore?.past?.length ?? 0,
      historyFuture: projectStore?.future?.length ?? 0,
      gridHash: gridHash >>> 0,
      sampleCells: [32, 96, 160, 224].map((column) => grid.cells[centerRow * grid.width + column]!),
    }
  })
}

async function waitForSavedProject(page: Page, width: number, height: number) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<{ width: number; height: number; revision: number }>((resolve, reject) => {
            const request = indexedDB.open('pindou-workshop', 1)
            request.addEventListener(
              'success',
              () => {
                const database = request.result
                const get = database
                  .transaction('active-session', 'readonly')
                  .objectStore('active-session')
                  .get('current')
                get.addEventListener(
                  'success',
                  () => {
                    const grid = get.result?.project?.grid
                    database.close()
                    resolve({
                      width: grid?.width ?? 0,
                      height: grid?.height ?? 0,
                      revision: get.result?.project?.revision ?? -1,
                    })
                  },
                  { once: true },
                )
                get.addEventListener('error', () => reject(get.error), { once: true })
              },
              { once: true },
            )
            request.addEventListener('error', () => reject(request.error), { once: true })
          }),
      ),
    )
    .toMatchObject({ width, height })
}

async function installObjectUrlTracker(page: Page) {
  await page.addInitScript(() => {
    const tracker = { created: [] as string[], revoked: [] as string[] }
    Object.defineProperty(window, '__task097ObjectUrls', { value: tracker, configurable: false })
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (value: Blob | MediaSource) => {
      const url = create(value)
      tracker.created.push(url)
      return url
    }
    URL.revokeObjectURL = (url: string) => {
      tracker.revoked.push(url)
      revoke(url)
    }
  })
}

async function readObjectUrlCounts(page: Page) {
  return page.evaluate(() => {
    const tracker = (
      window as Window & {
        __task097ObjectUrls?: { created: string[]; revoked: string[] }
      }
    ).__task097ObjectUrls
    return { created: tracker?.created.length ?? 0, revoked: tracker?.revoked.length ?? 0 }
  })
}

async function downloadFile(page: Page, testId: string, suggestedName: string) {
  const startedAt = performance.now()
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId(testId).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(suggestedName)
  const path = await download.path()
  if (!path) throw new Error(`Expected a completed download for ${suggestedName}.`)
  return { bytes: await readFile(path), elapsedMs: performance.now() - startedAt }
}

function readPngDimensions(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(png.toString('ascii', 12, 16)).toBe('IHDR')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

async function decodePngSamples(
  page: Page,
  png: Buffer,
  points: readonly { x: number; y: number }[],
) {
  return page.evaluate(
    async ({ encoded, samplePoints }) => {
      const binary = atob(encoded)
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d')!
      const pixels = samplePoints.map(({ x, y }) => {
        context.clearRect(0, 0, 1, 1)
        context.drawImage(bitmap, Math.floor(x), Math.floor(y), 1, 1, 0, 0, 1, 1)
        return Array.from(context.getImageData(0, 0, 1, 1).data)
      })
      const dimensions = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      canvas.width = 0
      canvas.height = 0
      return { dimensions, pixels }
    },
    { encoded: png.toString('base64'), samplePoints: points },
  )
}

function rgbForPaletteIndex(index: number) {
  if (index === 0) return [242, 239, 233]
  const entry = MARD_291_PALETTE.entries.find((item) => item.paletteIndex === index)
  if (!entry) throw new Error(`Expected palette index ${index} in the formal MARD Palette.`)
  return [entry.rgb.r, entry.rgb.g, entry.rgb.b]
}

async function parsePdf(bytes: Buffer) {
  expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return getDocument({ data: new Uint8Array(bytes) }).promise
}

async function pdfPageText(pdf: Awaited<ReturnType<typeof parsePdf>>, pageNumber: number) {
  const page = await pdf.getPage(pageNumber)
  const content = await page.getTextContent()
  return content.items
    .filter((item) => 'str' in item)
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
}

function expectRangeCoverage(
  width: number,
  height: number,
  actual: readonly {
    rowStart: number
    rowEndExclusive: number
    columnStart: number
    columnEndExclusive: number
  }[],
) {
  const coverage = new Uint8Array(width * height)
  for (const range of actual) {
    for (let row = range.rowStart; row < range.rowEndExclusive; row += 1) {
      for (let column = range.columnStart; column < range.columnEndExclusive; column += 1) {
        coverage[row * width + column] += 1
      }
    }
  }
  expect(coverage.every((count) => count === 1)).toBe(true)
}

test('TASK-097 exports and decodes repeated maximum-width effect and reference PNGs', async ({
  page,
}, testInfo: TestInfo) => {
  test.setTimeout(180_000)
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  await installObjectUrlTracker(page)
  await uploadCanvasImage(page, {
    fileName: 'task097-large.png',
    width: 256,
    height: 192,
    pattern: 'four-zones',
  })
  const generationMs = await generateGrid(page, 256, 192)
  const before = await readProjectSummary(page)
  expect(before.emptyCount).toBeGreaterThan(0)
  expect(before.sampleCells[0]).toBe(0)
  const white = MARD_291_PALETTE.entries.find(
    (entry) => entry.rgb.r === 255 && entry.rgb.g === 255 && entry.rgb.b === 255,
  )
  if (!white) throw new Error('Expected a real white MARD bead.')
  expect(before.sampleCells[1]).toBe(white.paletteIndex)
  expect(before.usedColorCount).toBeGreaterThanOrEqual(3)

  const outputMetrics: Array<Record<string, unknown>> = []
  for (const output of [
    { testId: 'export-effect-preview-png', kind: 'effect' as const },
    { testId: 'export-reference-png', kind: 'reference' as const },
  ]) {
    const layouts =
      output.kind === 'effect'
        ? deriveEffectPreviewLayout({ width: before.width, height: before.height })
        : deriveReferencePngLayout(
            { width: before.width, height: before.height },
            before.usedColorCount,
          )
    let firstPng: Buffer | null = null
    let outputDimensions: { width: number; height: number } | null = null
    const repeated: Array<{ elapsedMs: number; bytes: number }> = []
    for (let run = 0; run < 2; run += 1) {
      const urlsBefore = await readObjectUrlCounts(page)
      const download = await downloadFile(page, output.testId, 'task097-large_256x192.png')
      const dimensions = readPngDimensions(download.bytes)
      expect(dimensions).toEqual({ width: layouts.canvasWidth, height: layouts.canvasHeight })
      outputDimensions = dimensions
      expect(download.bytes.byteLength).toBeGreaterThan(10_000)
      repeated.push({
        elapsedMs: Math.round(download.elapsedMs * 100) / 100,
        bytes: download.bytes.byteLength,
      })
      if (run === 0) firstPng = download.bytes
      await expect
        .poll(async () => {
          const urlsAfter = await readObjectUrlCounts(page)
          return {
            created: urlsAfter.created - urlsBefore.created,
            revoked: urlsAfter.revoked - urlsBefore.revoked,
            anchors: await page.locator('a[download]').count(),
          }
        })
        .toEqual({ created: 1, revoked: 1, anchors: 0 })
      await expect(page.getByTestId('export-error')).toHaveCount(0)
    }

    if (!firstPng) throw new Error(`Expected the first ${output.kind} PNG.`)
    if (!outputDimensions) throw new Error(`Expected ${output.kind} PNG dimensions.`)
    const gridX = output.kind === 'effect' ? layouts.padding : layouts.gridX
    const gridY = output.kind === 'effect' ? layouts.padding + layouts.headerHeight : layouts.gridY
    const sampleColumns = [32, 96, 160, 224]
    const points = sampleColumns.map((column) => ({
      x:
        output.kind === 'effect'
          ? gridX + (column + 0.5) * layouts.cellSize
          : gridX + (column + 0.15) * layouts.cellSize,
      y:
        output.kind === 'effect'
          ? gridY + (Math.floor(before.height / 2) + 0.5) * layouts.cellSize
          : gridY + (Math.floor(before.height / 2) + 0.15) * layouts.cellSize,
    }))
    const decoded = await decodePngSamples(page, firstPng, points)
    expect(decoded.dimensions).toEqual({ width: layouts.canvasWidth, height: layouts.canvasHeight })
    const expected = before.sampleCells.map((index) =>
      index === 0 && output.kind === 'effect' ? [216, 210, 200] : rgbForPaletteIndex(index),
    )
    for (const [index, pixel] of decoded.pixels.entries()) {
      expect(pixel[3]).toBe(255)
      for (let channel = 0; channel < 3; channel += 1) {
        expect(Math.abs(pixel[channel]! - expected[index]![channel]!)).toBeLessThanOrEqual(3)
      }
    }
    outputMetrics.push({
      kind: output.kind,
      grid: `${before.width}x${before.height}`,
      dimensions: outputDimensions,
      estimatedCanvasRgbaBackingBytes: outputDimensions.width * outputDimensions.height * 4,
      runs: repeated,
    })
  }

  const after = await readProjectSummary(page)
  expect(after).toEqual(before)
  expect(runtimeErrors).toEqual([])
  await testInfo.attach('task097-large-png-results.json', {
    body: JSON.stringify(
      {
        browser: await page.evaluate(() => navigator.userAgent),
        hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
        grid: `${before.width}x${before.height}`,
        gridCells: before.width * before.height,
        gridBytes: before.width * before.height * Uint16Array.BYTES_PER_ELEMENT,
        exportSnapshotGridCopyBytes: before.width * before.height * Uint16Array.BYTES_PER_ELEMENT,
        generationMs: Math.round(generationMs * 100) / 100,
        processPeakRss: 'unavailable in this headless Chromium environment',
        pngs: outputMetrics,
        runtimeErrors,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })
})

test('TASK-098 permits a high-cell-count generated Project, autosaves and restores it without a new warning', async ({
  page,
}, testInfo: TestInfo) => {
  test.setTimeout(180_000)
  const workers: string[] = []
  const runtimeErrors: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  await uploadCanvasImage(page, {
    fileName: 'task098-tall-256x1280.png',
    width: 64,
    height: 320,
    pattern: 'solid',
  })
  await page.getByTestId('grid-width-input').fill('256')
  await expect(page.getByTestId('grid-bead-dimensions')).toContainText('256 × 1280 颗')
  await expect(page.getByTestId('generation-warnings')).toContainText('作品比例较极端')
  expect(await page.locator('body').innerText()).not.toMatch(/总格数|格数上限|性能限制/)
  await expect(page.getByTestId('crop-confirm')).toBeEnabled()

  const generationMs = await generateGrid(page, 256, 1280)
  expect(workers.some((url) => url.includes('generation.worker'))).toBe(true)
  const beforeReload = await readProjectSummary(page)
  expect(beforeReload.width * beforeReload.height).toBe(327_680)
  await waitForSavedProject(page, 256, 1280)

  const reloadStartedAt = performance.now()
  await page.reload()
  await expect(page.getByTestId('editor-grid')).toBeVisible()
  const restoreMs = performance.now() - reloadStartedAt
  const afterReload = await readProjectSummary(page)
  expect(afterReload).toEqual(beforeReload)
  expect(runtimeErrors).toEqual([])

  await testInfo.attach('task098-high-cell-grid-results.json', {
    body: JSON.stringify(
      {
        browser: await page.evaluate(() => navigator.userAgent),
        hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
        grid: `${beforeReload.width}x${beforeReload.height}`,
        totalCells: beforeReload.width * beforeReload.height,
        gridBytes: beforeReload.width * beforeReload.height * Uint16Array.BYTES_PER_ELEMENT,
        estimated50EntryBeforeAfterHistoryArrayBytes:
          beforeReload.width * beforeReload.height * Uint16Array.BYTES_PER_ELEMENT * 100,
        generationMs: Math.round(generationMs * 100) / 100,
        restoreAfterRefreshMs: Math.round(restoreMs * 100) / 100,
        restoredGridHash: afterReload.gridHash,
        processPeakRss: 'unavailable in this headless Chromium environment',
        warnings: ['existing extreme-aspect-ratio warning only; no total-cell-count warning/limit'],
        runtimeErrors,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })
})

test('TASK-099 downloads and parses repeated large color PDFs plus dense manual pagination', async ({
  page,
}, testInfo: TestInfo) => {
  test.setTimeout(240_000)
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  await installObjectUrlTracker(page)
  await uploadCanvasImage(page, {
    fileName: 'task099-large.png',
    width: 256,
    height: 192,
    pattern: 'four-zones',
  })
  const generationMs = await generateGrid(page, 256, 192)
  const before = await readProjectSummary(page)
  const expectedAutomaticPlan = recommendPdfPagination(
    { width: before.width, height: before.height },
    createDefaultPdfLayoutInput(),
  )
  const outputMetrics: Array<Record<string, unknown>> = []
  let firstAutomaticPdfBytes: Buffer | null = null
  let firstAutomaticChartText = ''

  for (let run = 0; run < 2; run += 1) {
    const urlsBefore = await readObjectUrlCounts(page)
    const download = await downloadFile(page, 'export-pdf', 'task099-large_256x192.pdf')
    const pdf = await parsePdf(download.bytes)
    expect(pdf.numPages).toBe(expectedAutomaticPlan.pages.length + 2)
    const overviewPage = await pdf.getPage(1)
    const overviewViewport = overviewPage.getViewport({ scale: 1 })
    expect(overviewViewport.width).toBeCloseTo(595.28, 0)
    expect(overviewViewport.height).toBeCloseTo(841.89, 0)
    const overviewText = await pdfPageText(pdf, 1)
    expect(overviewText).toContain('拼豆作品总览')
    expect(overviewText).toContain('豆数尺寸：256 × 192 颗')
    expect(overviewText).toContain('拼豆规格：2.6mm')
    expect(overviewText).toContain(`使用颜色：${before.usedColorCount} 色`)
    expect(overviewText).toContain(`拼豆总数：${before.totalBeads} 颗`)

    const actualRanges: Array<{
      rowStart: number
      rowEndExclusive: number
      columnStart: number
      columnEndExclusive: number
    }> = []
    const chartTexts: string[] = []
    for (let pageNumber = 2; pageNumber < expectedAutomaticPlan.pages.length + 2; pageNumber += 1) {
      const pageText = await pdfPageText(pdf, pageNumber)
      chartTexts.push(pageText)
      const rangeMatch = pageText.match(/行\s*(\d+)–(\d+)\s*·\s*列\s*(\d+)–(\d+)/)
      expect(rangeMatch, `expected a parseable Grid range on page ${pageNumber}`).not.toBeNull()
      actualRanges.push({
        rowStart: Number(rangeMatch![1]),
        rowEndExclusive: Number(rangeMatch![2]) + 1,
        columnStart: Number(rangeMatch![3]),
        columnEndExclusive: Number(rangeMatch![4]) + 1,
      })
      expect(pageText).toContain('制作图')
      expect(pageText).toContain(`第 ${pageNumber} 页`)
    }
    expect(actualRanges).toEqual(
      expectedAutomaticPlan.pages.map((range) => ({
        rowStart: range.rowStart,
        rowEndExclusive: range.rowEndExclusive,
        columnStart: range.columnStart,
        columnEndExclusive: range.columnEndExclusive,
      })),
    )
    expectRangeCoverage(before.width, before.height, actualRanges)

    const materialText = await pdfPageText(pdf, pdf.numPages)
    expect(materialText).toContain('拼豆材料清单')
    expect(materialText).toContain(`实际使用 ${before.usedColorCount} 色`)
    expect(materialText).toContain(`总豆数 ${before.totalBeads} 颗`)
    for (const paletteIndex of before.sampleCells.filter((value) => value > 0)) {
      const entry = MARD_291_PALETTE.entries.find((item) => item.paletteIndex === paletteIndex)!
      expect(materialText).toContain(entry.displayCode)
    }
    if (run === 0) firstAutomaticPdfBytes = download.bytes
    if (run === 0) firstAutomaticChartText = chartTexts.join(' ')
    outputMetrics.push({
      kind: 'automatic-color',
      run: run + 1,
      elapsedMs: Math.round(download.elapsedMs * 100) / 100,
      bytes: download.bytes.byteLength,
      pages: pdf.numPages,
      chartPages: actualRanges.length,
      gridCoverage: 'all cells exactly once',
    })
    await pdf.cleanup()
    await expect
      .poll(async () => {
        const urlsAfter = await readObjectUrlCounts(page)
        return {
          created: urlsAfter.created - urlsBefore.created,
          revoked: urlsAfter.revoked - urlsBefore.revoked,
          anchors: await page.locator('a[download]').count(),
        }
      })
      .toEqual({ created: 1, revoked: 1, anchors: 0 })
  }

  if (!firstAutomaticPdfBytes) throw new Error('Expected an automatic PDF output.')
  const firstAutoPdf = await parsePdf(firstAutomaticPdfBytes)
  for (const paletteIndex of before.sampleCells.filter((value) => value > 0)) {
    const entry = MARD_291_PALETTE.entries.find((item) => item.paletteIndex === paletteIndex)!
    expect(firstAutomaticChartText).toContain(entry.displayCode)
  }
  await firstAutoPdf.cleanup()

  await page.getByTestId('pdf-manual-columns').fill('128')
  await page.getByTestId('pdf-manual-rows').fill('96')
  await page.getByTestId('pdf-color-mode').selectOption('monochrome')
  await expect(page.getByTestId('pdf-readability-warning')).toBeVisible()
  await expect(page.getByTestId('export-pdf')).toBeEnabled()
  const manualInput = {
    ...createDefaultPdfLayoutInput(),
    colorMode: 'monochrome' as const,
    manualCells: { columns: 128, rows: 96 },
  }
  const expectedManualPlan = recommendPdfPagination(
    { width: before.width, height: before.height },
    manualInput,
  )
  const manualDownload = await downloadFile(page, 'export-pdf', 'task099-large_256x192.pdf')
  const manualPdf = await parsePdf(manualDownload.bytes)
  expect(manualPdf.numPages).toBe(expectedManualPlan.pages.length + 2)
  const manualRanges: Array<{
    rowStart: number
    rowEndExclusive: number
    columnStart: number
    columnEndExclusive: number
  }> = []
  for (let pageNumber = 2; pageNumber < expectedManualPlan.pages.length + 2; pageNumber += 1) {
    const pageText = await pdfPageText(manualPdf, pageNumber)
    const rangeMatch = pageText.match(/行\s*(\d+)–(\d+)\s*·\s*列\s*(\d+)–(\d+)/)
    expect(rangeMatch).not.toBeNull()
    manualRanges.push({
      rowStart: Number(rangeMatch![1]),
      rowEndExclusive: Number(rangeMatch![2]) + 1,
      columnStart: Number(rangeMatch![3]),
      columnEndExclusive: Number(rangeMatch![4]) + 1,
    })
  }
  expect(manualRanges).toEqual(
    expectedManualPlan.pages.map((range) => ({
      rowStart: range.rowStart,
      rowEndExclusive: range.rowEndExclusive,
      columnStart: range.columnStart,
      columnEndExclusive: range.columnEndExclusive,
    })),
  )
  expectRangeCoverage(before.width, before.height, manualRanges)
  const manualMaterials = await pdfPageText(manualPdf, manualPdf.numPages)
  expect(manualMaterials).toContain('拼豆材料清单')
  expect(manualMaterials).toContain(`总豆数 ${before.totalBeads} 颗`)
  outputMetrics.push({
    kind: 'manual-monochrome-dense',
    elapsedMs: Math.round(manualDownload.elapsedMs * 100) / 100,
    bytes: manualDownload.bytes.byteLength,
    pages: manualPdf.numPages,
    chartPages: manualRanges.length,
    readabilityWarningShown: true,
    exportAllowed: true,
    gridCoverage: 'all cells exactly once',
  })
  await manualPdf.cleanup()

  const after = await readProjectSummary(page)
  expect(after).toEqual(before)
  expect(runtimeErrors).toEqual([])
  await testInfo.attach('task099-large-pdf-results.json', {
    body: JSON.stringify(
      {
        browser: await page.evaluate(() => navigator.userAgent),
        hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
        grid: `${before.width}x${before.height}`,
        totalCells: before.width * before.height,
        gridBytes: before.width * before.height * Uint16Array.BYTES_PER_ELEMENT,
        generationMs: Math.round(generationMs * 100) / 100,
        pdfs: outputMetrics,
        autoPlan: {
          orientation: expectedAutomaticPlan.orientation,
          pageColumns: expectedAutomaticPlan.pageColumns,
          pageRows: expectedAutomaticPlan.pageRows,
          cellSizeMm: expectedAutomaticPlan.cellSizeMm,
        },
        manualPlan: {
          orientation: expectedManualPlan.orientation,
          pageColumns: expectedManualPlan.pageColumns,
          pageRows: expectedManualPlan.pageRows,
          cellSizeMm: expectedManualPlan.cellSizeMm,
          readability: expectedManualPlan.readability,
        },
        processPeakRss: 'unavailable in this headless Chromium environment',
        runtimeErrors,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })
})
