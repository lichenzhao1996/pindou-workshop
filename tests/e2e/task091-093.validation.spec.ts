import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
import type { Project } from '../../src/domain/project/types'

type UploadOptions = {
  readonly fileName: string
  readonly width: number
  readonly height: number
  readonly kind?: 'solid' | 'alpha-fixture'
  readonly color?: string
}

async function uploadCanvasImage(page: Page, options: UploadOptions) {
  await page.goto('/')
  await expect(page.getByTestId('image-file-input')).toBeAttached()
  await page.evaluate(async ({ fileName, width, height, kind, color }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    if (kind === 'alpha-fixture') {
      const image = context.createImageData(width, height)
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const channel =
            x < width / 4
              ? [5, 10, 15, 0]
              : x < width / 2
                ? [210, 20, 30, 128]
                : x < (width * 3) / 4
                  ? [255, 255, 255, 255]
                  : [39, 82, 58, 255]
          image.data.set(channel, (y * width + x) * 4)
        }
      }
      context.putImageData(image, 0, 0)
    } else {
      context.fillStyle = color ?? '#FAF4C8'
      context.fillRect(0, 0, width, height)
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) =>
        value ? resolve(value) : reject(new Error('PNG fixture encoding failed')),
      )
    })
    const input = document.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')!
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], fileName, { type: 'image/png' }))
    input.files = transfer.files
    ;(window as Window & { __task093UploadStartedAt?: number }).__task093UploadStartedAt =
      performance.now()
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, options)
  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByTestId('crop-confirm')).toBeEnabled()
}

async function generateCurrentCrop(page: Page) {
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('generate')).toBeEnabled()
  await page.getByTestId('generate').click()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toBeVisible()
}

async function readCurrentProject(page: Page) {
  return page.evaluate(() => {
    const app = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<
                string,
                {
                  currentProject?: Project
                }
              >
            }
          }
        }
      }
    }
    const project =
      app.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject!
    return {
      projectId: project.projectId,
      revision: project.revision,
      updatedAt: project.updatedAt,
      paletteVersion: project.generation.paletteVersion,
      sourceWidth: project.source.originalWidth,
      sourceHeight: project.source.originalHeight,
      gridWidth: project.grid!.width,
      gridHeight: project.grid!.height,
      cells: Array.from(project.grid!.cells),
    }
  })
}

test('TASK-091 rejects unsupported formats with a recoverable message', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('[data-testid="image-file-input"]', {
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  })
  await expect(page.getByRole('alert')).toContainText(
    '文件格式不支持，请选择 JPG、PNG 或 WEBP 图片。',
  )
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('upload-cta')).toBeVisible()
})

test('TASK-091 preserves EMPTY, translucent color and opaque MARD white through a real Worker', async ({
  page,
}) => {
  await uploadCanvasImage(page, {
    fileName: 'alpha-boundaries.png',
    width: 32,
    height: 4,
    kind: 'alpha-fixture',
  })
  await page.getByTestId('grid-width-input').fill('8')
  await page.getByTestId('generation-mode-high-fidelity').check()
  await expect(page.getByTestId('grid-bead-dimensions')).toContainText('8 × 1 颗')
  const workerUrls: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  await generateCurrentCrop(page)

  const project = await readCurrentProject(page)
  const white = MARD_291_PALETTE.entries.find(
    ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
  )!
  expect(project.gridWidth).toBe(8)
  expect(project.gridHeight).toBe(1)
  expect(project.cells[0]).toBe(0)
  expect(project.cells[2]).not.toBe(0)
  expect(project.cells[2]).not.toBe(white.paletteIndex)
  expect(project.cells[4]).toBe(white.paletteIndex)
  expect(
    project.cells.every(
      (value) => value === 0 || MARD_291_PALETTE.entries.some((e) => e.paletteIndex === value),
    ),
  ).toBe(true)
  expect(workerUrls.some((url) => url.includes('generation.worker'))).toBe(true)
})

test('TASK-091 enforces width boundaries and keeps valid 8/256 grids usable', async ({ page }) => {
  await uploadCanvasImage(page, { fileName: 'width-boundaries.png', width: 40, height: 30 })
  const widthInput = page.getByTestId('grid-width-input')
  await widthInput.fill('7')
  await expect(page.getByTestId('grid-width-error')).toContainText('8～256')
  await expect(page.getByTestId('generate')).toBeDisabled()

  await widthInput.fill('8')
  await expect(page.getByTestId('grid-bead-dimensions')).toContainText('8 × 6 颗')
  const width8StartedAt = await page.evaluate(() => performance.now())
  await generateCurrentCrop(page)
  const width8ElapsedMs = await page.evaluate(
    (startedAt) => performance.now() - startedAt,
    width8StartedAt,
  )
  await expect(page.getByTestId('editor-dimensions')).toHaveText('8 × 6 颗')
  const width8Memory = await page.evaluate(
    () =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize ?? null,
  )
  console.log(
    `[TASK-093 PERFORMANCE] ${JSON.stringify({ sample: 'width-8', grid: '8x6', generationElapsedMs: width8ElapsedMs, jsHeapAfterGenerationBytes: width8Memory })}`,
  )

  await page.getByRole('link', { name: '返回裁剪与生成设置' }).click()
  await page.getByTestId('grid-width-input').fill('256')
  await expect(page.getByTestId('grid-bead-dimensions')).toContainText('256 × 192 颗')
  const width256StartedAt = await page.evaluate(() => performance.now())
  await generateCurrentCrop(page)
  const width256ElapsedMs = await page.evaluate(
    (startedAt) => performance.now() - startedAt,
    width256StartedAt,
  )
  await expect(page.getByTestId('editor-dimensions')).toHaveText('256 × 192 颗')
  const width256Memory = await page.evaluate(
    () =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize ?? null,
  )
  console.log(
    `[TASK-093 PERFORMANCE] ${JSON.stringify({ sample: 'width-256', grid: '256x192', generationElapsedMs: width256ElapsedMs, jsHeapAfterGenerationBytes: width256Memory })}`,
  )
  const beforeInvalid = await readCurrentProject(page)

  await page.getByRole('link', { name: '返回裁剪与生成设置' }).click()
  await page.getByTestId('grid-width-input').fill('257')
  await expect(page.getByTestId('grid-width-error')).toContainText('8～256')
  await expect(page.getByTestId('generate')).toBeDisabled()
  const afterInvalid = await readCurrentProject(page)
  expect(afterInvalid).toMatchObject({
    projectId: beforeInvalid.projectId,
    revision: beforeInvalid.revision,
    gridWidth: 256,
    gridHeight: 192,
    cells: beforeInvalid.cells,
  })
})

test('TASK-093 warns but generates an extreme crop ratio without imposing a size cap', async ({
  page,
}) => {
  await uploadCanvasImage(page, { fileName: 'extreme-ratio.png', width: 40, height: 4 })
  await page.getByTestId('grid-width-input').fill('64')
  await expect(page.getByTestId('generation-warnings')).toContainText('作品比例较极端')
  await expect(page.getByTestId('crop-confirm')).toBeEnabled()
  const generationStartedAt = await page.evaluate(() => performance.now())
  await generateCurrentCrop(page)
  const generationElapsedMs = await page.evaluate(
    (startedAt) => performance.now() - startedAt,
    generationStartedAt,
  )
  const project = await readCurrentProject(page)
  expect(project.gridWidth).toBe(64)
  expect(project.gridHeight).toBe(6)
  console.log(
    `[TASK-093 PERFORMANCE] ${JSON.stringify({ sample: 'extreme-ratio', source: '40x4', grid: '64x6', generationElapsedMs, warning: true })}`,
  )
})

test('TASK-092 keeps UI stats, reference PNG, and PDF materials aligned to one Grid snapshot', async ({
  page,
}) => {
  await uploadCanvasImage(page, { fileName: 'consistency.png', width: 40, height: 30 })
  await page.getByTestId('grid-width-input').fill('8')
  await generateCurrentCrop(page)

  const white = MARD_291_PALETTE.entries.find(
    ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
  )!
  await page.evaluate((whiteIndex) => {
    const app = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<
                string,
                {
                  currentProject: Project
                  setCurrentProject: (project: Project) => void
                }
              >
            }
          }
        }
      }
    }
    const store = app.__vue_app__.config.globalProperties.$pinia._s.get('project')!
    const project = store.currentProject
    const cells = new Uint16Array(8 * 6)
    cells.fill(0, 0, 12)
    cells.fill(26, 12, 22)
    cells.fill(35, 22, 25)
    cells.fill(whiteIndex, 25, 48)
    store.setCurrentProject({
      ...project,
      grid: { ...project.grid!, cells },
      revision: project.revision + 1,
    })
  }, white.paletteIndex)

  const before = await readCurrentProject(page)
  expect(before.paletteVersion).toBe(MARD_291_PALETTE_VERSION)
  expect(before.cells.filter((value) => value === 0)).toHaveLength(12)
  expect(before.cells.filter((value) => value === 26)).toHaveLength(10)
  expect(before.cells.filter((value) => value === 35)).toHaveLength(3)
  expect(before.cells.filter((value) => value === white.paletteIndex)).toHaveLength(23)
  await expect(page.getByTestId('editor-canvas')).toBeVisible()
  await expect(page.getByTestId('editor-canvas-area')).toHaveAttribute('data-rendered-beads', '36')
  await expect(page.getByTestId('editor-minimap-canvas')).toBeVisible()
  await expect(page.getByTestId('editor-minimap-canvas')).toHaveAttribute(
    'data-rendered-beads',
    '36',
  )
  await expect(page.getByTestId('used-color-summary')).toHaveText('3 / 291 种颜色 · 36 颗拼豆')
  for (const [paletteIndex, count] of [
    [white.paletteIndex, 23],
    [26, 10],
    [35, 3],
  ] as const) {
    await expect(page.getByTestId(`used-color-row-${paletteIndex}`)).toContainText(`${count} 颗`)
  }

  await page.getByTestId('material-list-toggle').click()
  for (const [paletteIndex, count] of [
    [white.paletteIndex, 23],
    [26, 10],
    [35, 3],
  ] as const) {
    await expect(page.getByTestId(`material-list-row-${paletteIndex}`)).toContainText(`${count} 颗`)
  }
  await page.getByTestId('material-list-close').click()

  const pngDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-reference-png').click()
  const pngDownload = await pngDownloadPromise
  const pngPath = await pngDownload.path()
  if (!pngPath) throw new Error('Expected a real reference PNG download.')
  const pngBytes = await readFile(pngPath)
  expect(pngBytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const pngLegend = await page.evaluate(
    async ({ encoded, rows }) => {
      const binary = atob(encoded)
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const output = document.createElement('canvas')
      output.width = bitmap.width
      output.height = bitmap.height
      const context = output.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      const actualRows = rows.map((row, index) => {
        const rowY = 124 + 192 + 42 + index * 26
        const swatch = Array.from(context.getImageData(48, rowY, 1, 1).data).slice(0, 3)
        const actualText = Array.from(context.getImageData(64, rowY - 7, 232, 14).data)
        const expectedCanvas = document.createElement('canvas')
        expectedCanvas.width = 232
        expectedCanvas.height = 14
        const expectedContext = expectedCanvas.getContext('2d')!
        expectedContext.fillStyle = '#ffffff'
        expectedContext.fillRect(0, 0, 232, 14)
        expectedContext.fillStyle = '#292721'
        expectedContext.font = '12px sans-serif'
        expectedContext.textAlign = 'left'
        expectedContext.textBaseline = 'middle'
        expectedContext.fillText(row.text, 0, 7, 232)
        const expectedText = Array.from(expectedContext.getImageData(0, 0, 232, 14).data)
        return {
          swatch,
          expectedRgb: row.rgb,
          textMatchesExpected: actualText.every((value, pixel) => value === expectedText[pixel]),
        }
      })
      bitmap.close()
      return actualRows
    },
    {
      encoded: pngBytes.toString('base64'),
      rows: [white, MARD_291_PALETTE.entries[25]!, MARD_291_PALETTE.entries[34]!].map(
        (entry, index) => ({
          rgb: [entry.rgb.r, entry.rgb.g, entry.rgb.b],
          text: `${entry.displayCode} ${entry.name}  ${[23, 10, 3][index]} 颗`,
        }),
      ),
    },
  )
  expect(pngLegend.map((row) => row.swatch)).toEqual(pngLegend.map((row) => row.expectedRgb))
  expect(pngLegend.every((row) => row.textMatchesExpected)).toBe(true)

  const pdfDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-pdf').click()
  const pdfDownload = await pdfDownloadPromise
  const pdfPath = await pdfDownload.path()
  if (!pdfPath) throw new Error('Expected a real PDF download.')
  const pdfBytes = await readFile(pdfPath)
  expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes) }).promise
  const lastPage = await pdf.getPage(pdf.numPages)
  const pdfText = (await lastPage.getTextContent()).items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
  expect(pdfText).toContain('实际使用 3 色 · 总豆数 36 颗')
  for (const [entry, count] of [
    [white, 23],
    [MARD_291_PALETTE.entries[25]!, 10],
    [MARD_291_PALETTE.entries[34]!, 3],
  ] as const) {
    expect(pdfText).toContain(entry.displayCode)
    expect(pdfText).toContain(entry.name)
    expect(pdfText).toContain(String(count))
    expect(pdfText).toContain(String(count + Math.ceil(count / 20)))
  }

  expect(await readCurrentProject(page)).toEqual(before)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute(
    'data-revision',
    String(before.revision),
  )
})

test.describe('TASK-093 performance baselines', () => {
  test.describe.configure({ mode: 'serial' })

  for (const sample of [
    {
      name: '4096px-regular',
      width: 4096,
      height: 2048,
      expectedInputWidth: 4096,
      expectedInputHeight: 2048,
    },
    {
      name: '5000px-preprocessed',
      width: 5000,
      height: 5000,
      expectedInputWidth: 64,
      expectedInputHeight: 64,
    },
  ]) {
    test(`records Chromium processing baseline for ${sample.name}`, async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      await page.addInitScript(() => {
        const monitored = window as Window & {
          __task093WorkerInputs?: Array<{
            width: number | null
            height: number | null
            bytes: number | null
          }>
        }
        monitored.__task093WorkerInputs = []
        const postMessage = Worker.prototype.postMessage
        Worker.prototype.postMessage = function (
          message: unknown,
          transfer?: Transferable[] | StructuredSerializeOptions,
        ) {
          if (typeof message === 'object' && message !== null && 'type' in message) {
            const generation = message as {
              type?: unknown
              rgbaImage?: { width?: unknown; height?: unknown; data?: { byteLength?: unknown } }
            }
            if (generation.type === 'generate') {
              monitored.__task093WorkerInputs!.push({
                width:
                  typeof generation.rgbaImage?.width === 'number'
                    ? generation.rgbaImage.width
                    : null,
                height:
                  typeof generation.rgbaImage?.height === 'number'
                    ? generation.rgbaImage.height
                    : null,
                bytes:
                  typeof generation.rgbaImage?.data?.byteLength === 'number'
                    ? generation.rgbaImage.data.byteLength
                    : null,
              })
            }
          }
          return postMessage.call(this, message, transfer)
        }
      })
      const workerUrls: string[] = []
      const pageErrors: string[] = []
      page.on('worker', (worker) => workerUrls.push(worker.url()))
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await uploadCanvasImage(page, {
        fileName: `${sample.name}.png`,
        width: sample.width,
        height: sample.height,
        color: '#27523A',
      })
      const imageWarnings = await page.evaluate(() => document.body.innerText)
      const largeWarningVisible = imageWarnings.includes('图片尺寸较大')
      const uploadReadyElapsedMs = await page.evaluate(() => {
        const startedAt = (window as Window & { __task093UploadStartedAt?: number })
          .__task093UploadStartedAt
        return startedAt === undefined ? null : performance.now() - startedAt
      })
      const memoryAfterUpload = await page.evaluate(() => {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        return memory?.usedJSHeapSize ?? null
      })
      const generationStartedAt = await page.evaluate(() => performance.now())
      await generateCurrentCrop(page)
      const generationFinishedAt = await page.evaluate(() => performance.now())
      const memoryAfterGeneration = await page.evaluate(() => {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        return memory?.usedJSHeapSize ?? null
      })
      const workerInputs = await page.evaluate(() => {
        const monitored = window as Window & {
          __task093WorkerInputs?: Array<{
            width: number | null
            height: number | null
            bytes: number | null
          }>
        }
        return monitored.__task093WorkerInputs ?? []
      })
      const project = await readCurrentProject(page)
      const elapsed = generationFinishedAt - generationStartedAt
      expect(elapsed).toBeGreaterThanOrEqual(0)
      expect(project.gridWidth).toBe(64)
      expect(project.gridHeight).toBe(Math.round((64 * sample.height) / sample.width))
      expect(workerInputs.at(-1)).toMatchObject({
        width: sample.expectedInputWidth,
        height: sample.expectedInputHeight,
      })
      expect(workerUrls.some((url) => url.includes('generation.worker'))).toBe(true)
      expect(pageErrors).toEqual([])

      const report = {
        sample: sample.name,
        browser: await page.evaluate(() => navigator.userAgent),
        hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
        deviceMemoryGiB: await page.evaluate(
          () => (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
        ),
        sourcePixels: sample.width * sample.height,
        uploadReadyElapsedMs,
        largeImageWarningVisible: largeWarningVisible,
        generationElapsedMs: Math.round(elapsed * 100) / 100,
        jsHeapAfterUploadBytes: memoryAfterUpload,
        jsHeapAfterGenerationBytes: memoryAfterGeneration,
        workerRgbaInput: workerInputs.at(-1),
        grid: `${project.gridWidth}x${project.gridHeight}`,
        runtimeErrors: pageErrors,
      }
      console.log(`[TASK-093 PERFORMANCE] ${JSON.stringify(report)}`)
      await testInfo.attach(`${sample.name}-performance.json`, {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      })
    })
  }
})
