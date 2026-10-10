import { expect, test, type Page } from '@playwright/test'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { DEFAULT_ALGORITHM_VERSION } from '../../src/domain/project/constants'
import type { Project } from '../../src/domain/project/types'
import { CELL_SIZE, GRID_AXIS_MARGIN, worldToScreen } from '../../src/rendering/viewport'
import { createDefaultPdfLayoutInput } from '../../src/features/export/pdf/layout'
import { recommendPdfPagination } from '../../src/features/export/pdf/pagination'

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function clearActiveSessionDatabase(page: Page) {
  await page.goto('/')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pindou-workshop', 1)
        request.addEventListener(
          'upgradeneeded',
          () => {
            if (!request.result.objectStoreNames.contains('active-session')) {
              request.result.createObjectStore('active-session', { keyPath: 'id' })
            }
          },
          { once: true },
        )
        request.addEventListener(
          'success',
          () => {
            const database = request.result
            const transaction = database.transaction('active-session', 'readwrite')
            transaction.objectStore('active-session').delete('current')
            transaction.addEventListener(
              'complete',
              () => {
                database.close()
                resolve()
              },
              { once: true },
            )
            transaction.addEventListener(
              'abort',
              () => {
                database.close()
                reject(transaction.error ?? new Error('IDB cleanup failed.'))
              },
              { once: true },
            )
          },
          { once: true },
        )
        request.addEventListener('error', () => reject(request.error), { once: true })
      }),
  )
}

async function readActiveSessionRecord(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        schemaVersion: number
        project: null | {
          projectId: string
          projectName: string
          revision: number
          updatedAt: string
          generationMode: string
          generationWidth: number
          generationHeight: number
          cropRotation: number
          width: number | null
          height: number | null
          cells: number[] | null
          cellsAreUint16Array: boolean
          sourceFileName: string | null
          sourceMimeType: string
          sourceBytes: number
        }
        pendingUpload: null | { uploadId: string; fileName: string | null; bytes: number }
        generationIntent: unknown
        extraKeys: string[]
      } | null>((resolve, reject) => {
        const request = indexedDB.open('pindou-workshop', 1)
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('Could not open active-session database.')),
          { once: true },
        )
        request.addEventListener(
          'success',
          () => {
            const database = request.result
            const transaction = database.transaction('active-session', 'readonly')
            const getRequest = transaction.objectStore('active-session').get('current')
            getRequest.addEventListener(
              'success',
              () => {
                const record = getRequest.result
                const project = record?.project
                const grid = project?.grid
                resolve(
                  record
                    ? {
                        schemaVersion: record.schemaVersion,
                        project: project
                          ? {
                              projectId: project.projectId,
                              projectName: project.projectName,
                              revision: project.revision,
                              updatedAt: project.updatedAt,
                              generationMode: project.generation.mode,
                              generationWidth: project.generation.widthBeads,
                              generationHeight: project.generation.heightBeads,
                              cropRotation: project.crop.rotation,
                              width: grid?.width ?? null,
                              height: grid?.height ?? null,
                              cells: grid?.cells ? Array.from(grid.cells as Uint16Array) : null,
                              cellsAreUint16Array: grid?.cells instanceof Uint16Array,
                              sourceFileName: project.source.originalFileName,
                              sourceMimeType: project.source.mimeType,
                              sourceBytes: project.source.originalImage.size,
                            }
                          : null,
                        pendingUpload: record.pendingUpload
                          ? {
                              uploadId: record.pendingUpload.uploadId,
                              fileName: record.pendingUpload.source.originalFileName,
                              bytes: record.pendingUpload.source.originalImage.size,
                            }
                          : null,
                        generationIntent: record.generationIntent,
                        extraKeys: Object.keys(record).sort(),
                      }
                    : null,
                )
                database.close()
              },
              { once: true },
            )
            getRequest.addEventListener(
              'error',
              () => {
                database.close()
                reject(getRequest.error ?? new Error('Could not read active-session record.'))
              },
              { once: true },
            )
          },
          { once: true },
        )
      }),
  )
}

async function seedLegacyGenerationIntent(
  page: Page,
  options: { attempted?: boolean; clearGrid?: boolean } = {},
) {
  return page.evaluate(
    ({ attempted, clearGrid }) =>
      new Promise<{ intentId: string; attempted: boolean }>((resolve, reject) => {
        const request = indexedDB.open('pindou-workshop', 1)
        request.addEventListener(
          'success',
          () => {
            const database = request.result
            const transaction = database.transaction('active-session', 'readwrite')
            const objectStore = transaction.objectStore('active-session')
            const get = objectStore.get('current')
            get.addEventListener(
              'success',
              () => {
                const record = get.result
                const project = record?.project
                if (!project) {
                  database.close()
                  reject(new Error('Cannot seed an intent without a persisted Project.'))
                  return
                }
                const intentId = `resume-${project.projectId}`
                if (clearGrid) project.grid = null
                const source = project.source
                record.generationIntent = {
                  intentId,
                  projectId: project.projectId,
                  sourceIdentity: JSON.stringify([
                    project.projectId,
                    source.originalFileName,
                    source.mimeType,
                    source.originalWidth,
                    source.originalHeight,
                    source.originalImage.type,
                    source.originalImage.size,
                  ]),
                  crop: { ...project.crop },
                  generation: { ...project.generation },
                  startedAt: new Date().toISOString(),
                  ...(attempted ? { autoRecoveryAttempted: true } : {}),
                }
                objectStore.put(record)
                transaction.addEventListener(
                  'complete',
                  () => {
                    database.close()
                    resolve({ intentId, attempted: Boolean(attempted) })
                  },
                  { once: true },
                )
              },
              { once: true },
            )
            get.addEventListener(
              'error',
              () => {
                database.close()
                reject(get.error ?? new Error('Could not load Project for intent seed.'))
              },
              { once: true },
            )
          },
          { once: true },
        )
        request.addEventListener('error', () => reject(request.error), { once: true })
      }),
    options,
  )
}

async function seedCorruptedSession(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pindou-workshop', 1)
        request.addEventListener(
          'success',
          () => {
            const database = request.result
            const transaction = database.transaction('active-session', 'readwrite')
            transaction.objectStore('active-session').put({
              id: 'current',
              schemaVersion: 2,
              project: { malformed: true },
              pendingUpload: null,
              generationIntent: null,
            })
            transaction.addEventListener(
              'complete',
              () => {
                database.close()
                resolve()
              },
              { once: true },
            )
            transaction.addEventListener(
              'abort',
              () => {
                database.close()
                reject(transaction.error ?? new Error('Could not seed corrupted session.'))
              },
              { once: true },
            )
          },
          { once: true },
        )
        request.addEventListener('error', () => reject(request.error), { once: true })
      }),
  )
}

async function hasActiveSessionRecord(page: Page) {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
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
                database.close()
                resolve(get.result !== undefined)
              },
              { once: true },
            )
            get.addEventListener(
              'error',
              () => {
                database.close()
                reject(get.error)
              },
              { once: true },
            )
          },
          { once: true },
        )
        request.addEventListener('error', () => reject(request.error), { once: true })
      }),
  )
}

async function uploadCanvasImage(page: Page, fileName: string, color = '#FAF4C8') {
  await expect(page.getByTestId('image-file-input')).toBeAttached()
  await page.evaluate(
    async ({ name, fill }) => {
      const canvas = document.createElement('canvas')
      canvas.width = 40
      canvas.height = 30
      const context = canvas.getContext('2d')!
      context.fillStyle = fill
      context.fillRect(0, 0, canvas.width / 2, canvas.height)
      context.fillStyle = '#27523A'
      context.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) =>
          value ? resolve(value) : reject(new Error('PNG encoding failed')),
        )
      })
      const input = document.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')!
      const transfer = new DataTransfer()
      transfer.items.add(new File([blob], name, { type: 'image/png' }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { name: fileName, fill: color },
  )
}
const routeCases = [
  { path: '/', heading: '把你的图片，变成可以直接制作的拼豆图纸' },
  { path: '/crop', heading: '把你的图片，变成可以直接制作的拼豆图纸' },
  { path: '/editor', heading: '把你的图片，变成可以直接制作的拼豆图纸' },
  { path: '/unknown-route', heading: '把你的图片，变成可以直接制作的拼豆图纸' },
]

for (const routeCase of routeCases) {
  test(`loads ${routeCase.path} without application errors`, async ({ page }) => {
    const runtimeErrors: string[] = []

    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        runtimeErrors.push(message.text())
      }
    })

    await page.goto(routeCase.path)
    await expect(page.getByRole('heading', { name: routeCase.heading })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: routeCase.heading })).toBeVisible()
    expect(runtimeErrors).toEqual([])
  })
}

test('uploads a supported JPG through the home entry and opens the crop route', async ({
  page,
}) => {
  await page.goto('/')
  await page.setInputFiles('[data-testid="image-file-input"]', {
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: ONE_PIXEL_PNG,
  })

  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByRole('heading', { name: '确认图片范围' })).toBeVisible()
  await expect(page.locator('.cropper-container')).toBeVisible()
  await expect(page.locator('.cropper-crop-box')).toBeVisible()
})

test('allows the crop box to resize and move without a fixed aspect ratio', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('[data-testid="image-file-input"]', {
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: ONE_PIXEL_PNG,
  })

  const cropBox = page.locator('.cropper-crop-box')
  const resizeHandle = page.locator('.cropper-point.point-se')
  await expect(cropBox).toBeVisible()
  await expect(resizeHandle).toBeVisible()

  const initialBox = await cropBox.boundingBox()
  const handleBox = await resizeHandle.boundingBox()
  if (!initialBox || !handleBox) {
    throw new Error('expected Cropper crop box geometry')
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 - 24,
    handleBox.y + handleBox.height / 2 - 12,
  )
  await page.mouse.up()

  await expect
    .poll(async () => (await cropBox.boundingBox())?.width ?? 0)
    .toBeLessThan(initialBox.width)

  const resizedBox = await cropBox.boundingBox()
  if (!resizedBox) {
    throw new Error('expected resized Cropper crop box geometry')
  }

  await page.mouse.move(resizedBox.x + resizedBox.width / 2, resizedBox.y + resizedBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(resizedBox.x + resizedBox.width / 2 + 16, resizedBox.y + 8)
  await page.mouse.up()

  await expect.poll(async () => (await cropBox.boundingBox())?.x ?? 0).not.toBe(resizedBox.x)
})

test('rotates the crop view by 90 degrees without leaving the crop route', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('[data-testid="image-file-input"]', {
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: ONE_PIXEL_PNG,
  })

  const canvasImage = page.locator('.cropper-canvas img')
  await expect(page.locator('.cropper-container')).toBeVisible()
  await expect(page.locator('.cropper-crop-box')).toBeVisible()
  await expect(canvasImage).toBeVisible()
  const initialTransform = await canvasImage.evaluate(
    (element) => getComputedStyle(element).transform,
  )

  await page.getByRole('button', { name: '向右旋转 90°' }).click()
  await expect
    .poll(async () => {
      return canvasImage.evaluate((element) => getComputedStyle(element).transform)
    })
    .not.toBe(initialTransform)
  await expect(page).toHaveURL(/\/crop$/)
})

test('uploads a supported PNG by dragging it to the home entry', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('upload-dropzone').evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([bytes], 'dragged.png', { type: 'image/png' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }))
  }, ONE_PIXEL_PNG.toString('base64'))

  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByRole('heading', { name: '确认图片范围' })).toBeVisible()
})

test('pastes a supported PNG through the home entry', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
    document.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, clipboardData: dataTransfer }),
    )
  }, ONE_PIXEL_PNG.toString('base64'))

  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByRole('heading', { name: '确认图片范围' })).toBeVisible()
})

test('TASK-023/091 continues to crop while showing a non-blocking low-resolution warning', async ({
  page,
}) => {
  await page.goto('/')
  await page.setInputFiles('[data-testid="image-file-input"]', {
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  })

  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByRole('status', { name: '图片提示' })).toContainText(
    '图片分辨率较低，生成后细节可能不足，但仍可继续。',
  )
})

test('shows the default 64x48 generation size for a 4:3 crop', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('image-file-input')).toBeAttached()
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 3
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('expected a 2D canvas context')
    }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('PNG encoding failed'))))
    })
    const input = document.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')
    if (!input) {
      throw new Error('expected image file input')
    }
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([blob], 'landscape.png', { type: 'image/png' }))
    input.files = dataTransfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })

  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByTestId('grid-bead-dimensions')).toContainText('64 × 48 颗')
  await expect(page.getByTestId('physical-dimensions')).toContainText('16.64cm × 12.48cm')
})

test('shows optimized as the default generation mode', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('[data-testid="image-file-input"]', {
    name: 'mode.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  })

  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByTestId('generation-mode-optimized')).toBeChecked()
  await expect(page.getByTestId('generation-mode-high-fidelity')).not.toBeChecked()
})

test('confirms the crop and restores the confirmed range when returning to crop', async ({
  page,
}) => {
  await page.goto('/')
  await page.setInputFiles('[data-testid="image-file-input"]', {
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  })

  await expect(page.getByTestId('crop-confirm')).toBeEnabled()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('crop-confirmation-status')).toContainText('裁剪已确认')

  await page.goBack()
  await expect(
    page.getByRole('heading', { name: '把你的图片，变成可以直接制作的拼豆图纸' }),
  ).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.locator('.cropper-container')).toBeVisible()
  await expect(page.locator('.cropper-crop-box')).toBeVisible()
  await expect(page.getByTestId('crop-confirm')).toBeEnabled()
})

async function uploadGenerationFixture(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('image-file-input')).toBeAttached()
  // Local deterministic 4:3 PNG, using two exact reference Palette colors.
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 40
    canvas.height = 30
    const context = canvas.getContext('2d')!
    context.fillStyle = '#FAF4C8'
    context.fillRect(0, 0, 20, 30)
    context.fillStyle = '#27523A'
    context.fillRect(20, 0, 20, 30)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('PNG encoding failed'))))
    })
    const input = document.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')!
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'task037-local.png', { type: 'image/png' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.getByTestId('crop-confirm')).toBeEnabled()
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('generate')).toBeEnabled()
}

async function assertCommittedGrid(
  page: Page,
  width: number,
  height: number,
  generationStartedAt: number,
) {
  await expect(page).toHaveURL(/\/editor$/)
  const result = page.getByTestId('editor-grid')
  await expect(result).toHaveAttribute('data-width', String(width))
  await expect(result).toHaveAttribute('data-height', String(height))
  await expect(result).toHaveAttribute('data-cell-count', String(width * height))
  await expect(result).toHaveAttribute('data-grid-encoding', 'Uint16Array')
  await expect(result).toHaveAttribute('data-revision', '0')
  const indices = (await result.getAttribute('data-palette-indices'))!.split(',').map(Number)
  expect(indices.length).toBeGreaterThanOrEqual(2)
  expect(indices.every((index) => index >= 1 && index <= 291)).toBe(true)
  const actual = await page.evaluate(() => {
    const element = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } } }
      }
    }
    const project =
      element.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
    const grid = project.grid!
    return {
      width: grid.width,
      height: grid.height,
      typed: grid.cells instanceof Uint16Array,
      length: grid.cells.length,
      legal: grid.cells.every((value) => value >= 0 && value <= 291),
      first: grid.cells[0],
      last: grid.cells[grid.width - 1],
      projectId: project.projectId,
      mode: project.generation.mode,
      algorithmVersion: project.generation.algorithmVersion,
      paletteVersion: project.generation.paletteVersion,
      revision: project.revision,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      observedAt: Date.now(),
    }
  })
  expect(actual.width).toBe(width)
  expect(actual.height).toBe(height)
  expect(actual.typed).toBe(true)
  expect(actual.length).toBe(width * height)
  expect(actual.legal).toBe(true)
  expect(actual.first).toBe(1)
  expect(actual.last).toBe(35)
  expect(actual.algorithmVersion).toBe(DEFAULT_ALGORITHM_VERSION)
  expect(actual.paletteVersion).toBe(MARD_291_PALETTE_VERSION)
  expect(actual.revision).toBe(0)
  expect(Date.parse(actual.updatedAt)).toBeGreaterThanOrEqual(generationStartedAt)
  expect(Date.parse(actual.updatedAt)).toBeGreaterThanOrEqual(Date.parse(actual.createdAt))
  expect(Date.parse(actual.updatedAt)).toBeLessThanOrEqual(actual.observedAt)
  await expect(result).toHaveAttribute('data-project-id', actual.projectId)
  return actual
}

async function readCurrentGridCells(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const element = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } } }
      }
    }
    const project =
      element.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
    if (!project.grid) throw new Error('Expected the current Project to contain a Grid')
    return Array.from(project.grid.cells)
  })
}

for (const mode of ['optimized', 'high-fidelity'] as const) {
  test(`TASK-037 generates a real ${mode} Grid through the browser Worker before Editor`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    await uploadGenerationFixture(page)
    await page.getByTestId('grid-width-preset-32').click()
    await page.getByTestId(`generation-mode-${mode}`).check()
    const generationStartedAt = await page.evaluate(() => Date.now())
    await page.getByTestId('generate').click()
    const committed = await assertCommittedGrid(page, 32, 24, generationStartedAt)
    expect(committed.mode).toBe(mode)
    await expect(page.getByTestId('editor-mode')).toHaveText(
      mode === 'optimized' ? '拼豆优化' : '高清还原',
    )
    expect(workers.some((url) => url.includes('generation.worker'))).toBe(true)
    expect(errors).toEqual([])
  })
}

test('TASK-037/091 mode confirmation preserves edits on cancel and regenerates from the original PNG on confirm', async ({
  page,
}) => {
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const initialGenerationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const initial = await assertCommittedGrid(page, 32, 24, initialGenerationStartedAt)
  const projectId = await page.getByTestId('editor-grid').getAttribute('data-project-id')

  // Editing tools are TASK-043+. Seed one immutable manual edit through the real
  // existing Store, only as test setup; generation itself is never mocked.
  await page.evaluate(() => {
    const element = document.querySelector('#app') as HTMLElement & {
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
    const store = element.__vue_app__.config.globalProperties.$pinia._s.get('project')!
    const project = store.currentProject
    const cells = project.grid!.cells.slice()
    cells[0] = 35
    store.setCurrentProject({
      ...project,
      grid: { ...project.grid!, cells },
      revision: project.revision + 1,
    })
  })
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  await page.getByRole('link', { name: '返回裁剪与生成设置' }).click()
  await page.getByTestId('generation-mode-high-fidelity').check()
  await expect(page.getByTestId('generation-mode-confirmation')).toBeVisible()
  await page.getByTestId('generation-mode-cancel').click()
  await page.goBack()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  await expect(page.getByTestId('editor-mode')).toHaveText('拼豆优化')
  await page.getByRole('link', { name: '返回裁剪与生成设置' }).click()
  await page.getByTestId('generation-mode-high-fidelity').check()
  const regenerationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generation-mode-confirm').click()
  const regenerated = await assertCommittedGrid(page, 32, 24, regenerationStartedAt)
  expect(regenerated.projectId).toBe(initial.projectId)
  expect(regenerated.createdAt).toBe(initial.createdAt)
  expect(regenerated.mode).toBe('high-fidelity')
  await expect(page.getByTestId('editor-mode')).toHaveText('高清还原')
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-project-id', projectId!)
})

test('TASK-043–047 renders a real Worker Grid and supports viewport, grid and pan interactions', async ({
  page,
}) => {
  const errors: string[] = []
  const workers: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('worker', (worker) => workers.push(worker.url()))

  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const committed = await assertCommittedGrid(page, 32, 24, generationStartedAt)
  expect(committed.mode).toBe('optimized')
  expect(workers.some((url) => url.includes('generation.worker'))).toBe(true)

  const shell = page.getByTestId('editor-shell')
  const tools = page.getByTestId('editor-tools')
  const canvasArea = page.getByTestId('editor-canvas-area')
  await expect(shell).toBeVisible()
  await expect(tools).toBeVisible()
  await expect(page.getByTestId('editor-toolbar')).toBeVisible()
  await expect(page.getByTestId('editor-sidebar')).toBeVisible()
  await expect(page.getByTestId('editor-canvas')).toBeVisible()
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-rendered-beads')))
    .toBeGreaterThan(0)
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-major-lines')))
    .toBeGreaterThan(0)
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-coordinates')))
    .toBeGreaterThan(0)

  const originalCells = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } } }
      }
    }
    const project =
      root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
    return Array.from(project.grid!.cells)
  })
  const initialZoom = Number(await canvasArea.getAttribute('data-zoom'))
  expect(initialZoom).toBeGreaterThanOrEqual(0.1)
  expect(initialZoom).toBeLessThan(1)

  await page.getByTestId('viewport-zoom-in').click()
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-zoom')))
    .toBeGreaterThan(initialZoom)
  const canvasBox = await canvasArea.boundingBox()
  if (!canvasBox) throw new Error('expected canvas area geometry')
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
  const zoomBeforeWheel = Number(await canvasArea.getAttribute('data-zoom'))
  await page.mouse.wheel(0, -120)
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-zoom')))
    .toBeGreaterThan(zoomBeforeWheel)

  await page.getByTestId('viewport-reset').click()
  await expect(canvasArea).toHaveAttribute('data-zoom', '1')
  await page.getByTestId('viewport-center').click()
  const centered = {
    x: Number(await canvasArea.getAttribute('data-pan-x')),
    y: Number(await canvasArea.getAttribute('data-pan-y')),
  }
  await page.getByTestId('viewport-center').click()
  await expect(canvasArea).toHaveAttribute('data-pan-x', String(centered.x))
  await expect(canvasArea).toHaveAttribute('data-pan-y', String(centered.y))
  await page.getByTestId('viewport-fit').click()
  await expect.poll(async () => Number(await canvasArea.getAttribute('data-zoom'))).toBeLessThan(1)

  const panBefore = Number(await canvasArea.getAttribute('data-pan-x'))
  await page.getByTestId('editor-canvas').click()
  await page.keyboard.down('Space')
  await page.mouse.move(canvasBox.x + 200, canvasBox.y + 180)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + 240, canvasBox.y + 210, { steps: 2 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-pan-x')))
    .toBe(panBefore + 40)

  const finalState = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } } }
      }
    }
    const project =
      root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
    return { cells: Array.from(project.grid!.cells), revision: project.revision }
  })
  expect(finalState.cells).toEqual(originalCells)
  expect(finalState.revision).toBe(0)
  expect(errors).toEqual([])
})

test('TASK-048–050 labels, hit testing, pan priority, and source compare use the real Worker Project', async ({
  page,
}) => {
  const errors: string[] = []
  const workers: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('worker', (worker) => workers.push(worker.url()))

  await page.goto('/')
  await expect(page.getByTestId('image-file-input')).toBeAttached()
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 20
    canvas.height = 15
    const context = canvas.getContext('2d')!
    context.fillStyle = '#e80bf2'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('PNG encoding failed'))))
    })
    const input = document.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')!
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'task048-050.png', { type: 'image/png' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByTestId('crop-confirm')).toBeEnabled()
  await page.getByTestId('crop-confirm').click()
  await page.getByTestId('grid-width-preset-32').click()
  await page.getByTestId('generate').click()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-grid-encoding', 'Uint16Array')
  expect(workers.some((url) => url.includes('generation.worker'))).toBe(true)

  const canvasArea = page.getByTestId('editor-canvas-area')
  const canvas = page.getByTestId('editor-canvas')
  const labelToggle = page.getByTestId('editor-label-toggle')
  await expect(labelToggle).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('viewport-reset').click()
  await page.getByTestId('viewport-center').click()
  await labelToggle.click()
  await expect(labelToggle).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-labels')))
    .toBeGreaterThan(0)

  await page.getByTestId('viewport-zoom-out').click()
  await page.getByTestId('viewport-zoom-out').click()
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-zoom')))
    .toBeLessThan(0.75)
  await expect(labelToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(canvasArea).toHaveAttribute('data-labels', '0')
  await page.getByTestId('viewport-zoom-in').click()
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-labels')))
    .toBeGreaterThan(0)

  const clickCell = async (row: number, column: number) => {
    const geometry = await page.evaluate(() => {
      const area = document.querySelector('[data-testid="editor-canvas-area"]')!
      return {
        zoom: Number(area.getAttribute('data-zoom')),
        panX: Number(area.getAttribute('data-pan-x')),
        panY: Number(area.getAttribute('data-pan-y')),
      }
    })
    const screen = worldToScreen(
      {
        x: GRID_AXIS_MARGIN + (column + 0.5) * CELL_SIZE,
        y: GRID_AXIS_MARGIN + (row + 0.5) * CELL_SIZE,
      },
      geometry,
    )
    const box = await canvas.boundingBox()
    if (!box) throw new Error('expected Canvas geometry')
    await page.mouse.click(box.x + screen.x, box.y + screen.y)
  }

  await clickCell(4, 4)
  await expect(canvasArea).toHaveAttribute('data-selected-cell', '4,4')
  await page.mouse.move((await canvas.boundingBox())!.x - 4, (await canvas.boundingBox())!.y - 4)
  await expect(canvasArea).toHaveAttribute('data-hovered-cell', '')
  await expect(canvasArea).toHaveAttribute('data-selected-cell', '4,4')

  const selectedBeforePan = await canvasArea.getAttribute('data-selected-cell')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('expected Canvas geometry')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(box.x + box.width / 2 + 28, box.y + box.height / 2 + 16)
  await page.mouse.up({ button: 'middle' })
  await expect(canvasArea).toHaveAttribute('data-selected-cell', selectedBeforePan!)

  await page.keyboard.down('Space')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 19, box.y + box.height / 2 + 11)
  await page.mouse.up()
  await page.keyboard.up('Space')
  await expect(canvasArea).toHaveAttribute('data-selected-cell', selectedBeforePan!)
  await clickCell(6, 7)
  await expect(canvasArea).toHaveAttribute('data-selected-cell', '6,7')

  const projectBeforeCompare = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } } }
      }
    }
    const project =
      root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
    const editor = root.__vue_app__.config.globalProperties.$pinia._s.get('editor')!
    return {
      projectId: project.projectId,
      revision: project.revision,
      updatedAt: project.updatedAt,
      cells: Array.from(project.grid!.cells),
      selectedCell: editor.selectedCell,
    }
  })
  const pixelAt = async (row: number, column: number) =>
    page.evaluate(
      ({ row, column }) => {
        const area = document.querySelector('[data-testid="editor-canvas-area"]')!
        const canvas = document.querySelector('[data-testid="editor-canvas"]') as HTMLCanvasElement
        const context = canvas.getContext('2d')!
        const zoom = Number(area.getAttribute('data-zoom'))
        const panX = Number(area.getAttribute('data-pan-x'))
        const panY = Number(area.getAttribute('data-pan-y'))
        const rect = canvas.getBoundingClientRect()
        const screenX = (24 + (column + 0.5) * 24) * zoom + panX
        const screenY = (24 + (row + 0.5) * 24) * zoom + panY
        const x = Math.floor((screenX * canvas.width) / rect.width)
        const y = Math.floor((screenY * canvas.height) / rect.height)
        return Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3)
      },
      { row, column },
    )

  const sourceButton = page.getByTestId('editor-source-compare')
  const sourceButtonBox = await sourceButton.boundingBox()
  if (!sourceButtonBox) throw new Error('expected source compare control')
  await page.mouse.move(
    sourceButtonBox.x + sourceButtonBox.width / 2,
    sourceButtonBox.y + sourceButtonBox.height / 2,
  )
  await page.mouse.down()
  await expect(canvasArea).toHaveAttribute('data-comparing-source', 'true')
  await expect.poll(async () => pixelAt(12, 12)).toEqual([232, 11, 242])
  await page.mouse.up()
  await expect(canvasArea).toHaveAttribute('data-comparing-source', 'false')
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-rendered-beads')))
    .toBeGreaterThan(0)
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-labels')))
    .toBeGreaterThan(0)

  const projectAfterCompare = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } } }
      }
    }
    const project =
      root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
    const editor = root.__vue_app__.config.globalProperties.$pinia._s.get('editor')!
    return {
      projectId: project.projectId,
      revision: project.revision,
      updatedAt: project.updatedAt,
      cells: Array.from(project.grid!.cells),
      selectedCell: editor.selectedCell,
    }
  })
  expect(projectAfterCompare).toEqual(projectBeforeCompare)
  expect(errors).toEqual([])
})

test('TASK-062–064 real Worker edit Undo/Redo and MiniMap navigation stay on one Grid', async ({
  page,
}) => {
  const workerUrls: string[] = []
  const errors: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await expect(page.getByTestId('image-file-input')).toBeAttached()
  await page.evaluate(async () => {
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = 20
    sourceCanvas.height = 15
    const context = sourceCanvas.getContext('2d')!
    context.fillStyle = '#e80bf2'
    context.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      sourceCanvas.toBlob((value) =>
        value ? resolve(value) : reject(new Error('PNG encoding failed')),
      )
    })
    const input = document.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')!
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'task062-064.png', { type: 'image/png' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page).toHaveURL(/\/crop$/)
  await page.getByTestId('crop-confirm').click()
  await page.getByTestId('grid-width-preset-32').click()
  await page.getByTestId('generate').click()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-grid-encoding', 'Uint16Array')
  expect(workerUrls.some((url) => url.includes('generation.worker'))).toBe(true)

  const readState = () =>
    page.evaluate(() => {
      const root = document.querySelector('#app') as HTMLElement & {
        __vue_app__: {
          config: {
            globalProperties: {
              $pinia: {
                _s: Map<
                  string,
                  { currentProject?: Project; zoom?: number; panX?: number; panY?: number }
                >
              }
            }
          }
        }
      }
      const stores = root.__vue_app__.config.globalProperties.$pinia._s
      const project = stores.get('project')!.currentProject!
      const editor = stores.get('editor')!
      return {
        projectId: project.projectId,
        revision: project.revision,
        updatedAt: project.updatedAt,
        cells: Array.from(project.grid!.cells),
        width: project.grid!.width,
        height: project.grid!.height,
        zoom: editor.zoom,
        panX: editor.panX,
        panY: editor.panY,
        selectedCell: editor.selectedCell,
      }
    })
  const clickCell = async (row: number, column: number) => {
    const viewport = await page.evaluate(() => {
      const area = document.querySelector('[data-testid="editor-canvas-area"]')!
      return {
        zoom: Number(area.getAttribute('data-zoom')),
        panX: Number(area.getAttribute('data-pan-x')),
        panY: Number(area.getAttribute('data-pan-y')),
      }
    })
    const point = worldToScreen(
      {
        x: GRID_AXIS_MARGIN + (column + 0.5) * CELL_SIZE,
        y: GRID_AXIS_MARGIN + (row + 0.5) * CELL_SIZE,
      },
      viewport,
    )
    const box = await page.getByTestId('editor-canvas').boundingBox()
    if (!box) throw new Error('expected main Canvas bounds')
    await page.mouse.click(box.x + point.x, box.y + point.y)
  }

  const initial = await readState()
  const firstCellBefore = initial.cells[0]!
  const firstColor = firstCellBefore === 1 ? 2 : 1
  await page.getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId(`picker-color-${firstColor}`).click()
  await page.getByTestId('picker-close').click()
  await clickCell(0, 0)
  await page.getByTestId('apply-current-color').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  let edited = await readState()
  expect(edited.cells[0]).toBe(firstColor)
  expect(edited.projectId).toBe(initial.projectId)

  await page.waitForTimeout(5)
  await page.getByTestId('editor-undo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
  await expect(page.getByTestId('editor-redo')).toBeEnabled()
  const undone = await readState()
  expect(undone.cells).toEqual(initial.cells)
  expect(undone.updatedAt).not.toBe(edited.updatedAt)
  await expect(page.getByTestId('editor-minimap-canvas')).toHaveAttribute(
    'data-rendered-beads',
    String(initial.cells.filter((value) => value !== 0).length),
  )

  await page.getByTestId('editor-redo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  edited = await readState()
  expect(edited.cells[0]).toBe(firstColor)

  await page.getByTestId('editor-undo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
  const branchColor = initial.cells[1] === 3 ? 4 : 3
  await page.getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId(`picker-color-${branchColor}`).click()
  await page.getByTestId('picker-close').click()
  await clickCell(0, 1)
  await page.getByTestId('apply-current-color').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  await expect(page.getByTestId('editor-redo')).toBeDisabled()
  const branched = await readState()
  expect(branched.cells[1]).toBe(branchColor)

  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
  await page.keyboard.press('Control+y')
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  const branch = await readState()

  await page.getByTestId('viewport-zoom-in').click()
  await page.getByTestId('viewport-zoom-in').click()
  const miniMapCanvas = page.getByTestId('editor-minimap-canvas')
  const miniMapBox = await miniMapCanvas.boundingBox()
  if (!miniMapBox) throw new Error('expected MiniMap Canvas bounds')
  const beforeJump = await readState()
  await page.mouse.click(
    miniMapBox.x + miniMapBox.width * 0.08,
    miniMapBox.y + miniMapBox.height * 0.03,
  )
  await expect.poll(async () => (await readState()).panX).not.toBe(beforeJump.panX)
  const afterJump = await readState()
  expect(afterJump.zoom).toBe(beforeJump.zoom)
  expect(afterJump.projectId).toBe(branch.projectId)
  expect(afterJump.revision).toBe(branch.revision)
  expect(afterJump.updatedAt).toBe(branch.updatedAt)
  expect(afterJump.cells).toEqual(branch.cells)
  expect(afterJump.selectedCell).toEqual(branch.selectedCell)

  const viewportFrame = page.getByTestId('editor-minimap-viewport')
  const frameBox = await viewportFrame.boundingBox()
  if (!frameBox) throw new Error('expected MiniMap viewport frame')
  const beforeDrag = await readState()
  await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(frameBox.x + frameBox.width / 2 + 12, frameBox.y + frameBox.height / 2 + 8)
  await page.mouse.up()
  await expect.poll(async () => (await readState()).panX).not.toBe(beforeDrag.panX)
  const afterDrag = await readState()
  expect(afterDrag.zoom).toBe(beforeDrag.zoom)
  expect(afterDrag.projectId).toBe(branch.projectId)
  expect(afterDrag.revision).toBe(branch.revision)
  expect(afterDrag.updatedAt).toBe(branch.updatedAt)
  expect(afterDrag.cells).toEqual(branch.cells)
  expect(afterDrag.selectedCell).toEqual(branch.selectedCell)
  await expect(page.getByTestId('editor-minimap-canvas')).toHaveAttribute(
    'data-rendered-beads',
    String(branch.cells.filter((value) => value !== 0).length),
  )

  await page.getByTestId('editor-minimap-toggle').click()
  await expect(page.getByTestId('editor-minimap')).toHaveAttribute('data-collapsed', 'true')
  await page.getByTestId('editor-minimap-toggle').click()
  await expect(page.getByTestId('editor-minimap')).toHaveAttribute('data-collapsed', 'false')
  expect(errors).toEqual([])
})

test('TASK-065–068 manages used colors, synchronizes highlight, and replaces through one undoable operation', async ({
  page,
}) => {
  const errors: string[] = []
  const workerUrls: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('worker', (worker) => workerUrls.push(worker.url()))

  await page.goto('/')
  await expect(page.getByTestId('image-file-input')).toBeAttached()
  await page.evaluate(async () => {
    const imageCanvas = document.createElement('canvas')
    imageCanvas.width = 20
    imageCanvas.height = 15
    const context = imageCanvas.getContext('2d')!
    context.fillStyle = '#e80bf2'
    context.fillRect(0, 0, imageCanvas.width, imageCanvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      imageCanvas.toBlob((value) =>
        value ? resolve(value) : reject(new Error('PNG encoding failed')),
      )
    })
    const input = document.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')!
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'task065-068.png', { type: 'image/png' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page).toHaveURL(/\/crop$/)
  await page.getByTestId('crop-confirm').click()
  await page.getByTestId('grid-width-preset-32').click()
  await page.getByTestId('generate').click()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-grid-encoding', 'Uint16Array')
  expect(workerUrls.some((url) => url.includes('generation.worker'))).toBe(true)

  const readState = () =>
    page.evaluate(() => {
      const root = document.querySelector('#app') as HTMLElement & {
        __vue_app__: {
          config: {
            globalProperties: {
              $pinia: {
                _s: Map<
                  string,
                  {
                    currentProject?: Project
                    activePaletteIndex?: number | null
                    recentPaletteIndexes?: number[]
                    highlightedPaletteIndex?: number | null
                    past?: unknown[]
                    future?: unknown[]
                  }
                >
              }
            }
          }
        }
      }
      const stores = root.__vue_app__.config.globalProperties.$pinia._s
      const project = stores.get('project')!.currentProject!
      const editor = stores.get('editor')!
      return {
        projectId: project.projectId,
        revision: project.revision,
        updatedAt: project.updatedAt,
        cells: Array.from(project.grid!.cells),
        width: project.grid!.width,
        height: project.grid!.height,
        activePaletteIndex: editor.activePaletteIndex,
        recentPaletteIndexes: editor.recentPaletteIndexes,
        highlightedPaletteIndex: editor.highlightedPaletteIndex,
        pastLength: stores.get('project')!.past!.length,
        futureLength: stores.get('project')!.future!.length,
      }
    })

  const firstState = await readState()
  const sourcePaletteIndex = firstState.cells.find((value) => value !== 0)!
  const sourceCount = firstState.cells.filter((value) => value === sourcePaletteIndex).length
  const sourceEntry = MARD_291_PALETTE.entries.find(
    (entry) => entry.paletteIndex === sourcePaletteIndex,
  )!
  const used = new Set(firstState.cells.filter((value) => value !== 0))
  const replacementTarget = MARD_291_PALETTE.entries
    .filter((entry) => !used.has(entry.paletteIndex))
    .sort((left, right) => {
      const leftDistance =
        (left.rgb.r - sourceEntry.rgb.r) ** 2 +
        (left.rgb.g - sourceEntry.rgb.g) ** 2 +
        (left.rgb.b - sourceEntry.rgb.b) ** 2
      const rightDistance =
        (right.rgb.r - sourceEntry.rgb.r) ** 2 +
        (right.rgb.g - sourceEntry.rgb.g) ** 2 +
        (right.rgb.b - sourceEntry.rgb.b) ** 2
      return rightDistance - leftDistance || left.paletteIndex - right.paletteIndex
    })[0]!
  const activeIndex = sourcePaletteIndex === 1 ? 2 : 1
  await page.getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId(`picker-color-${activeIndex}`).click()
  await page.getByTestId('picker-close').click()
  const activeBefore = await readState()
  expect(activeBefore.activePaletteIndex).toBe(activeIndex)

  const sourceRow = page.getByTestId(`used-color-row-${sourcePaletteIndex}`)
  await expect(sourceRow).toContainText(sourceEntry.displayCode)
  await expect(sourceRow).toContainText(
    `${((sourceCount / firstState.cells.filter((value) => value !== 0).length) * 100).toFixed(1)}%`,
  )
  await page.getByTestId('used-color-search').fill(sourceEntry.displayCode.toLowerCase())
  await expect(page.getByTestId(`used-color-row-${sourcePaletteIndex}`)).toBeVisible()
  await page.getByTestId('used-color-search').fill('not-a-used-color')
  await expect(page.getByTestId('used-color-no-results')).toBeVisible()
  expect((await readState()).highlightedPaletteIndex).toBeNull()
  await page.getByTestId('used-color-search').fill('')

  const sourceHighlight = page.getByTestId(`used-color-highlight-${sourcePaletteIndex}`)
  await sourceHighlight.click()
  const canvasArea = page.getByTestId('editor-canvas-area')
  const miniMapCanvas = page.getByTestId('editor-minimap-canvas')
  await expect(canvasArea).toHaveAttribute(
    'data-highlighted-palette-index',
    String(sourcePaletteIndex),
  )
  await expect(miniMapCanvas).toHaveAttribute(
    'data-highlighted-palette-index',
    String(sourcePaletteIndex),
  )
  await expect(canvasArea).toHaveAttribute('data-highlighted-beads', String(sourceCount))
  await expect(miniMapCanvas).toHaveAttribute('data-highlighted-beads', String(sourceCount))
  const mapFrameStyleBefore = await page
    .getByTestId('editor-minimap-viewport')
    .getAttribute('style')

  const miniMapPixelAt = (row: number, column: number) =>
    page.evaluate(
      ({ row, column }) => {
        const canvas = document.querySelector(
          '[data-testid="editor-minimap-canvas"]',
        ) as HTMLCanvasElement
        const rect = canvas.getBoundingClientRect()
        const grid = document.querySelector('[data-testid="editor-grid"]')!
        const width = Number(grid.getAttribute('data-width'))
        const height = Number(grid.getAttribute('data-height'))
        const cell = 24
        const scale = Math.min(rect.width / (width * cell), rect.height / (height * cell))
        const artworkLeft = (rect.width - width * cell * scale) / 2
        const artworkTop = (rect.height - height * cell * scale) / 2
        const cssX = artworkLeft + (column + 0.5) * cell * scale
        const cssY = artworkTop + (row + 0.5) * cell * scale
        const context = canvas.getContext('2d')!
        const x = Math.min(canvas.width - 1, Math.floor((cssX * canvas.width) / rect.width))
        const y = Math.min(canvas.height - 1, Math.floor((cssY * canvas.height) / rect.height))
        return Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3)
      },
      { row, column },
    )

  const canvasPixelAt = (row: number, column: number) =>
    page.evaluate(
      ({ row, column }) => {
        const area = document.querySelector('[data-testid="editor-canvas-area"]')!
        const canvas = document.querySelector('[data-testid="editor-canvas"]') as HTMLCanvasElement
        const zoom = Number(area.getAttribute('data-zoom'))
        const panX = Number(area.getAttribute('data-pan-x'))
        const panY = Number(area.getAttribute('data-pan-y'))
        const rect = canvas.getBoundingClientRect()
        const screenX = (24 + (column + 0.5) * 24) * zoom + panX
        const screenY = (24 + (row + 0.5) * 24) * zoom + panY
        const x = Math.floor((screenX * canvas.width) / rect.width)
        const y = Math.floor((screenY * canvas.height) / rect.height)
        return Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data).slice(0, 3)
      },
      { row, column },
    )

  const selectedCellIndex = firstState.cells.findIndex((value) => value === sourcePaletteIndex)
  const sampleRow = Math.floor(selectedCellIndex / firstState.width)
  const sampleColumn = selectedCellIndex % firstState.width
  const miniMapPixelBeforePreview = await miniMapPixelAt(sampleRow, sampleColumn)
  const mainPixelBeforePreview = await canvasPixelAt(sampleRow, sampleColumn)

  const compareButton = page.getByTestId('editor-source-compare')
  const compareBox = await compareButton.boundingBox()
  if (!compareBox) throw new Error('expected source compare button')
  await page.mouse.move(compareBox.x + compareBox.width / 2, compareBox.y + compareBox.height / 2)
  await page.mouse.down()
  await expect(canvasArea).toHaveAttribute('data-comparing-source', 'true')
  await expect(miniMapCanvas).toHaveAttribute('data-highlighted-beads', String(sourceCount))
  await expect
    .poll(async () => Number(await canvasArea.getAttribute('data-highlighted-beads')))
    .toBe(0)
  await page.mouse.up()
  await expect(canvasArea).toHaveAttribute('data-comparing-source', 'false')

  const beforeNoop = await readState()
  await page.getByTestId(`used-color-replace-${sourcePaletteIndex}`).click()
  await page.getByTestId('replacement-panel').getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId(`picker-color-${sourcePaletteIndex}`).click()
  await expect(page.getByTestId('replacement-preview')).toContainText('无需替换')
  await expect(page.getByTestId('replacement-confirm')).toBeDisabled()
  await page.getByTestId('replacement-cancel').click()
  expect(await readState()).toMatchObject({
    revision: beforeNoop.revision,
    cells: beforeNoop.cells,
    pastLength: beforeNoop.pastLength,
    futureLength: beforeNoop.futureLength,
  })

  const beforePreview = await readState()
  await page.getByTestId(`used-color-replace-${sourcePaletteIndex}`).click()
  await page.getByTestId('replacement-panel').getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId(`picker-color-${replacementTarget.paletteIndex}`).click()
  await expect(page.getByTestId('replacement-preview')).toContainText(`${sourceCount} 颗拼豆`)
  const previewState = await readState()
  expect(previewState).toMatchObject({
    projectId: beforePreview.projectId,
    revision: beforePreview.revision,
    updatedAt: beforePreview.updatedAt,
    cells: beforePreview.cells,
    activePaletteIndex: activeIndex,
    highlightedPaletteIndex: sourcePaletteIndex,
  })
  expect(previewState.recentPaletteIndexes?.[0]).toBe(replacementTarget.paletteIndex)
  await expect(canvasArea).toHaveAttribute(
    'data-replacement-preview',
    `${sourcePaletteIndex}:${replacementTarget.paletteIndex}`,
  )
  await expect(canvasArea).toHaveAttribute('data-replacement-beads', String(sourceCount))
  const miniMapPixelDuringPreview = await miniMapPixelAt(sampleRow, sampleColumn)
  const mainPixelDuringPreview = await canvasPixelAt(sampleRow, sampleColumn)
  expect(miniMapPixelDuringPreview).toEqual(miniMapPixelBeforePreview)
  expect(mainPixelDuringPreview).not.toEqual(mainPixelBeforePreview)
  expect(await page.getByTestId('editor-minimap-viewport').getAttribute('style')).toBe(
    mapFrameStyleBefore,
  )

  await page.getByTestId('replacement-confirm').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  const replaced = await readState()
  expect(replaced.cells.filter((value) => value === sourcePaletteIndex)).toHaveLength(0)
  expect(replaced.cells.filter((value) => value === replacementTarget.paletteIndex)).toHaveLength(
    sourceCount,
  )
  expect(replaced.pastLength).toBe(beforePreview.pastLength + 1)
  expect(replaced.activePaletteIndex).toBe(activeIndex)
  expect(replaced.highlightedPaletteIndex).toBe(sourcePaletteIndex)
  await expect(canvasArea).toHaveAttribute(
    'data-highlighted-palette-index',
    String(sourcePaletteIndex),
  )

  await page.getByTestId('editor-undo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
  expect((await readState()).cells).toEqual(beforePreview.cells)
  await page.getByTestId('editor-redo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  expect((await readState()).cells).toEqual(replaced.cells)
  expect(errors).toEqual([])
})

test('TASK-051–055 uses the shared color picker on the real Worker Project without editing its Grid', async ({
  page,
}) => {
  const errors: string[] = []
  const workers: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('worker', (worker) => workers.push(worker.url()))

  await page.goto('/')
  await expect(page.getByTestId('image-file-input')).toBeAttached()
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 20
    canvas.height = 15
    const context = canvas.getContext('2d')!
    context.fillStyle = '#e80bf2'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('PNG encoding failed'))))
    })
    const input = document.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')!
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'task051-055.png', { type: 'image/png' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page).toHaveURL(/\/crop$/)
  await page.getByTestId('crop-confirm').click()
  await page.getByTestId('grid-width-preset-32').click()
  await page.getByTestId('generate').click()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-grid-encoding', 'Uint16Array')
  expect(workers.some((url) => url.includes('generation.worker'))).toBe(true)

  const before = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } } }
      }
    }
    const project =
      root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
    return {
      projectId: project.projectId,
      revision: project.revision,
      updatedAt: project.updatedAt,
      cells: Array.from(project.grid!.cells),
    }
  })

  await page.getByTestId('unified-color-picker-toggle').click()
  const dialog = page.getByTestId('unified-color-picker-dialog')
  await expect(dialog).toHaveAttribute('data-browse-mode', 'family')
  await expect(page.locator('.picker-results .palette-color-button')).toHaveCount(291)

  const search = page.getByTestId('picker-search')
  await search.fill(' A26 ')
  await expect(page.locator('.picker-results .palette-color-button')).toHaveCount(1)
  await page.getByTestId('picker-mode-code').click()
  await expect(dialog).toHaveAttribute('data-browse-mode', 'code')
  await expect(search).toHaveValue(' A26 ')
  await page.getByTestId('picker-color-26').click()
  await expect(page.getByTestId('picker-color-26')).toHaveAttribute('aria-pressed', 'true')

  const selectedState = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<string, { activePaletteIndex: number | null; recentPaletteIndexes: number[] }>
            }
          }
        }
      }
    }
    const editor = root.__vue_app__.config.globalProperties.$pinia._s.get('editor')!
    return { active: editor.activePaletteIndex, recent: [...editor.recentPaletteIndexes] }
  })
  expect(selectedState.active).toBe(26)
  expect(selectedState.recent[0]).toBe(26)

  await page.getByTestId('picker-clear-search').click()
  await expect(page.locator('.used-color-row').first()).toBeVisible()
  const currentUsedId = await page.locator('.used-color-row').first().getAttribute('data-testid')
  if (!currentUsedId) throw new Error('expected a color derived from the generated Grid')
  const usedIndex = Number(currentUsedId.replace('picker-used-', ''))
  await page.getByTestId(currentUsedId).click()
  await expect(page.getByTestId(`picker-used-${usedIndex}`)).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('picker-details-toggle').click()
  await expect(page.getByTestId('picker-details')).toBeVisible()
  await expect(page.getByTestId('picker-detail-count')).not.toHaveText('0')
  const similar = page.locator('.picker-detail-content button[data-testid^="picker-similar-"]')
  await expect(similar).toHaveCount(6)
  const similarId = await similar.first().getAttribute('data-testid')
  if (!similarId) throw new Error('expected a formal similar Palette color')
  const similarIndex = Number(similarId.replace('picker-similar-', ''))
  await similar.first().click()
  await expect(page.getByTestId('picker-details')).toBeVisible()
  const afterSimilarSelection = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<string, { activePaletteIndex: number | null; recentPaletteIndexes: number[] }>
            }
          }
        }
      }
    }
    const editor = root.__vue_app__.config.globalProperties.$pinia._s.get('editor')!
    return { active: editor.activePaletteIndex, recent: [...editor.recentPaletteIndexes] }
  })
  expect(afterSimilarSelection.active).toBe(similarIndex)
  expect(afterSimilarSelection.recent[0]).toBe(similarIndex)

  await page.getByTestId('picker-close').click()
  await page.getByTestId('unified-color-picker-toggle').click()
  await expect(dialog).toHaveAttribute('data-browse-mode', 'family')
  await expect(search).toHaveValue('')

  const after = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<
                string,
                {
                  currentProject: Project
                  activePaletteIndex: number | null
                  recentPaletteIndexes: number[]
                }
              >
            }
          }
        }
      }
    }
    const stores = root.__vue_app__.config.globalProperties.$pinia._s
    const project = stores.get('project')!.currentProject
    const editor = stores.get('editor')!
    return {
      projectId: project.projectId,
      revision: project.revision,
      updatedAt: project.updatedAt,
      cells: Array.from(project.grid!.cells),
      active: editor.activePaletteIndex,
      recent: [...editor.recentPaletteIndexes],
    }
  })
  expect(after.projectId).toBe(before.projectId)
  expect(after.revision).toBe(before.revision)
  expect(after.updatedAt).toBe(before.updatedAt)
  expect(after.cells).toEqual(before.cells)
  expect(after.active).toBe(similarIndex)
  expect(after.recent[0]).toBe(similarIndex)
  expect(errors).toEqual([])
})

test('TASK-056–061 applies, paints, erases, eyedrops and fills the real Worker Grid', async ({
  page,
}) => {
  const errors: string[] = []
  const workers: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('worker', (worker) => workers.push(worker.url()))

  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  await assertCommittedGrid(page, 32, 24, generationStartedAt)
  expect(workers.some((url) => url.includes('generation.worker'))).toBe(true)
  await page.getByTestId('viewport-reset').click()
  await page.getByTestId('viewport-center').click()

  const editorState = () =>
    page.evaluate(() => {
      const root = document.querySelector('#app') as HTMLElement & {
        __vue_app__: {
          config: {
            globalProperties: {
              $pinia: {
                _s: Map<
                  string,
                  {
                    currentProject?: Project
                    activePaletteIndex?: number | null
                    selectedCell?: { row: number; column: number; index: number } | null
                    isComparingSource?: boolean
                  }
                >
              }
            }
          }
        }
      }
      const stores = root.__vue_app__.config.globalProperties.$pinia._s
      const project = stores.get('project')!.currentProject!
      const editor = stores.get('editor')!
      return {
        cells: Array.from(project.grid!.cells),
        revision: project.revision,
        updatedAt: project.updatedAt,
        projectId: project.projectId,
        activePaletteIndex: editor.activePaletteIndex,
        selectedCell: editor.selectedCell,
        isComparingSource: editor.isComparingSource,
      }
    })

  const selectColor = async (index: number) => {
    if (!(await page.getByTestId('unified-color-picker-dialog').isVisible())) {
      await page.getByTestId('unified-color-picker-toggle').click()
    }
    await page.getByTestId('picker-search').fill(`A${index}`)
    await page.getByTestId(`picker-color-${index}`).click()
    await page.getByTestId('picker-close').click()
  }

  const clickCell = async (row: number, column: number) => {
    const geometry = await page.evaluate(() => {
      const area = document.querySelector('[data-testid="editor-canvas-area"]')!
      return {
        zoom: Number(area.getAttribute('data-zoom')),
        panX: Number(area.getAttribute('data-pan-x')),
        panY: Number(area.getAttribute('data-pan-y')),
      }
    })
    const screen = worldToScreen(
      {
        x: GRID_AXIS_MARGIN + (column + 0.5) * CELL_SIZE,
        y: GRID_AXIS_MARGIN + (row + 0.5) * CELL_SIZE,
      },
      geometry,
    )
    const canvas = await page.getByTestId('editor-canvas').boundingBox()
    if (!canvas) throw new Error('expected Editor Canvas bounds')
    await page.mouse.click(canvas.x + screen.x, canvas.y + screen.y)
  }

  await selectColor(26)
  const beforeSingle = await editorState()
  await clickCell(0, 0)
  await expect(page.getByTestId('editor-selected-cell')).toContainText('第 1 行、第 1 列')
  await page.getByTestId('apply-current-color').click()
  const afterSingle = await editorState()
  expect(afterSingle.cells[0]).toBe(26)
  expect(afterSingle.revision).toBe(beforeSingle.revision + 1)

  await page.getByTestId('editor-tool-brush').click()
  const beforeBrush = await editorState()
  const brushStart = await page.getByTestId('editor-canvas').boundingBox()
  if (!brushStart) throw new Error('expected Editor Canvas bounds')
  const brushGeometry = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="editor-canvas-area"]')!
    return {
      zoom: Number(area.getAttribute('data-zoom')),
      panX: Number(area.getAttribute('data-pan-x')),
      panY: Number(area.getAttribute('data-pan-y')),
    }
  })
  const brushFrom = worldToScreen(
    { x: GRID_AXIS_MARGIN + 17.5 * CELL_SIZE, y: GRID_AXIS_MARGIN + 5.5 * CELL_SIZE },
    brushGeometry,
  )
  const brushTo = worldToScreen(
    { x: GRID_AXIS_MARGIN + 20.5 * CELL_SIZE, y: GRID_AXIS_MARGIN + 5.5 * CELL_SIZE },
    brushGeometry,
  )
  await page.mouse.move(brushStart.x + brushFrom.x, brushStart.y + brushFrom.y)
  await page.mouse.down()
  await page.mouse.move(brushStart.x + brushTo.x, brushStart.y + brushTo.y, { steps: 1 })
  await page.mouse.up()
  const afterBrush = await editorState()
  expect(afterBrush.revision).toBe(beforeBrush.revision + 1)
  expect(afterBrush.cells.slice(5 * 32 + 17, 5 * 32 + 21)).toEqual([26, 26, 26, 26])

  await page.getByTestId('editor-tool-eraser').click()
  const beforeErase = await editorState()
  await clickCell(5, 18)
  const afterErase = await editorState()
  expect(afterErase.cells[5 * 32 + 18]).toBe(0)
  expect(afterErase.revision).toBe(beforeErase.revision + 1)

  await page.getByTestId('editor-tool-eyedropper').click()
  const beforeEyedropper = await editorState()
  await clickCell(5, 30)
  const afterEyedropper = await editorState()
  expect(afterEyedropper.activePaletteIndex).toBe(afterEyedropper.cells[5 * 32 + 30])
  expect(afterEyedropper.revision).toBe(beforeEyedropper.revision)
  expect(afterEyedropper.cells).toEqual(beforeEyedropper.cells)
  expect(afterEyedropper.selectedCell).toEqual(beforeEyedropper.selectedCell)

  await selectColor(26)
  await page.getByTestId('editor-tool-fill').click()
  const beforeFill = await editorState()
  await clickCell(10, 30)
  const afterFill = await editorState()
  expect(afterFill.revision).toBe(beforeFill.revision + 1)
  expect(afterFill.cells.filter((value) => value === 35).length).toBeLessThan(
    beforeFill.cells.filter((value) => value === 35).length,
  )

  await page.getByTestId('editor-tool-brush').click()
  const beforePan = await editorState()
  const canvasBox = await page.getByTestId('editor-canvas').boundingBox()
  if (!canvasBox) throw new Error('expected Editor Canvas bounds')
  await page.getByTestId('editor-canvas').focus()
  await page.keyboard.down('Space')
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2 + 20,
    canvasBox.y + canvasBox.height / 2 + 12,
  )
  await page.mouse.up()
  await page.keyboard.up('Space')
  const afterPan = await editorState()
  expect(afterPan.revision).toBe(beforePan.revision)
  expect(afterPan.cells).toEqual(beforePan.cells)

  const sourceButton = page.getByTestId('editor-source-compare')
  const sourceButtonBox = await sourceButton.boundingBox()
  const canvasBounds = await page.getByTestId('editor-canvas').boundingBox()
  if (!sourceButtonBox || !canvasBounds) throw new Error('expected compare and Canvas bounds')
  await page.mouse.move(
    sourceButtonBox.x + sourceButtonBox.width / 2,
    sourceButtonBox.y + sourceButtonBox.height / 2,
  )
  await page.mouse.down()
  await expect(page.getByTestId('editor-canvas-area')).toHaveAttribute(
    'data-comparing-source',
    'true',
  )
  await page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector('[data-testid="editor-canvas-area"]')!
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          isPrimary: true,
          pointerId: 91,
          clientX: x,
          clientY: y,
        }),
      )
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          button: 0,
          isPrimary: true,
          pointerId: 91,
          clientX: x,
          clientY: y,
        }),
      )
    },
    { x: canvasBounds.x + 36, y: canvasBounds.y + 36 },
  )
  await page.mouse.up()
  await expect(page.getByTestId('editor-canvas-area')).toHaveAttribute(
    'data-comparing-source',
    'false',
  )
  const afterCompare = await editorState()
  expect(afterCompare.revision).toBe(afterPan.revision)
  expect(afterCompare.cells).toEqual(afterPan.cells)
  expect(afterCompare.projectId).toBe(beforeSingle.projectId)
  expect(errors).toEqual([])
})

test('TASK-069 renames the real Worker Project without breaking Grid history', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await uploadGenerationFixture(page)

  const readState = () =>
    page.evaluate(() => {
      const root = document.querySelector('#app') as HTMLElement & {
        __vue_app__: {
          config: {
            globalProperties: {
              $pinia: {
                _s: Map<
                  string,
                  {
                    currentProject: Project | null
                    past: unknown[]
                    future: unknown[]
                    canUndo: boolean
                    canRedo: boolean
                  }
                >
              }
            }
          }
        }
      }
      const stores = root.__vue_app__.config.globalProperties.$pinia._s
      const projectStore = stores.get('project')!
      const editor = stores.get('editor')!
      const project = projectStore.currentProject!
      return {
        projectName: project.projectName,
        projectId: project.projectId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        revision: project.revision,
        cells: Array.from(project.grid!.cells),
        activeTool: editor.activeTool,
        activePaletteIndex: editor.activePaletteIndex,
        selectedCell: editor.selectedCell,
        highlightedPaletteIndex: editor.highlightedPaletteIndex,
        showLabels: editor.showLabels,
        zoom: editor.zoom,
        panX: editor.panX,
        panY: editor.panY,
        pastLength: projectStore.past.length,
        futureLength: projectStore.future.length,
        canUndo: projectStore.canUndo,
        canRedo: projectStore.canRedo,
      }
    })

  const initialName = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } } }
      }
    }
    return root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
      .projectName
  })
  expect(initialName).toBe('task037-local')

  await page.getByTestId('grid-width-preset-32').click()
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const generated = await assertCommittedGrid(page, 32, 24, generationStartedAt)
  expect(workers.some((url) => url.includes('generation.worker'))).toBe(true)
  expect(generated.projectId).toBeTruthy()

  await page.getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId('picker-search').fill('A26')
  await page.getByTestId('picker-color-26').click()
  await page.getByTestId('picker-close').click()
  await page.getByTestId('viewport-reset').click()
  await page.getByTestId('viewport-center').click()

  const canvasBox = await page.getByTestId('editor-canvas').boundingBox()
  if (!canvasBox) throw new Error('expected Editor Canvas bounds')
  const viewport = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="editor-canvas-area"]')!
    return {
      zoom: Number(area.getAttribute('data-zoom')),
      panX: Number(area.getAttribute('data-pan-x')),
      panY: Number(area.getAttribute('data-pan-y')),
    }
  })
  const firstCell = worldToScreen(
    { x: GRID_AXIS_MARGIN + CELL_SIZE / 2, y: GRID_AXIS_MARGIN + CELL_SIZE / 2 },
    viewport,
  )
  await page.mouse.click(canvasBox.x + firstCell.x, canvasBox.y + firstCell.y)
  await expect(page.getByTestId('editor-selected-cell')).toContainText('第 1 行、第 1 列')
  const beforeEdit = await readState()
  await page.getByTestId('apply-current-color').click()
  const edited = await readState()
  expect(edited.cells[0]).toBe(26)
  expect(edited.revision).toBe(beforeEdit.revision + 1)
  expect(edited.pastLength).toBe(beforeEdit.pastLength + 1)

  await page.getByTestId('used-color-highlight-26').click()
  await page.getByTestId('editor-label-toggle').click()
  await page.getByTestId('editor-tool-brush').click()
  const beforeCancel = await readState()
  await page.getByTestId('project-name-rename').click()
  await page.getByTestId('project-name-input').fill('取消的名字')
  await page.getByTestId('project-name-cancel').click()
  const afterCancel = await readState()
  expect(afterCancel.projectName).toBe('task037-local')
  expect(afterCancel.updatedAt).toBe(beforeCancel.updatedAt)
  expect(afterCancel.revision).toBe(beforeCancel.revision)
  expect(afterCancel.cells).toEqual(beforeCancel.cells)

  await page.getByTestId('project-name-rename').click()
  const nameInput = page.getByTestId('project-name-input')
  await nameInput.fill('  我的作品  ')
  const draft = await readState()
  expect(draft.projectName).toBe('task037-local')
  expect(draft.updatedAt).toBe(beforeCancel.updatedAt)
  await nameInput.press('Enter')
  await expect(page.getByTestId('editor-project-name')).toHaveText('我的作品')
  const renamed = await readState()
  expect(renamed.projectId).toBe(generated.projectId)
  expect(renamed.createdAt).toBe(generated.createdAt)
  expect(renamed.revision).toBe(edited.revision)
  expect(renamed.cells).toEqual(edited.cells)
  expect(renamed.pastLength).toBe(edited.pastLength)
  expect(renamed.futureLength).toBe(edited.futureLength)
  expect(renamed).toMatchObject({
    activeTool: 'brush',
    activePaletteIndex: 26,
    selectedCell: edited.selectedCell,
    highlightedPaletteIndex: 26,
    showLabels: true,
    zoom: beforeCancel.zoom,
    panX: beforeCancel.panX,
    panY: beforeCancel.panY,
  })

  await page.getByTestId('editor-undo').click()
  const undone = await readState()
  expect(undone.projectName).toBe('我的作品')
  expect(undone.cells).toEqual(beforeEdit.cells)
  expect(undone.revision).toBe(beforeEdit.revision)
  expect(undone.canRedo).toBe(true)

  await page.getByTestId('editor-redo').click()
  const redone = await readState()
  expect(redone.projectName).toBe('我的作品')
  expect(redone.cells).toEqual(edited.cells)
  expect(redone.revision).toBe(edited.revision)
  expect(redone.canUndo).toBe(true)

  await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: { _s: Map<string, { currentProject: Project | null }> }
          }
        }
      }
    }
    const project =
      root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject!
    ;(window as Window & { __task069Project?: Project }).__task069Project = project
  })
  const beforeSameName = await readState()
  await page.getByTestId('project-name-rename').click()
  const sameNameInput = page.getByTestId('project-name-input')
  await sameNameInput.fill(' 我的作品 ')
  await sameNameInput.press('Enter')
  const sameName = await readState()
  const sameProjectReference = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: { _s: Map<string, { currentProject: Project | null }> }
          }
        }
      }
    }
    return (
      (window as Window & { __task069Project?: Project }).__task069Project ===
      root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
    )
  })
  expect(sameProjectReference).toBe(true)
  expect(sameName.updatedAt).toBe(beforeSameName.updatedAt)
  expect(sameName.revision).toBe(beforeSameName.revision)
  expect(sameName.cells).toEqual(beforeSameName.cells)
  expect(sameName.pastLength).toBe(beforeSameName.pastLength)
  expect(sameName.futureLength).toBe(beforeSameName.futureLength)

  await page.getByTestId('project-name-rename').click()
  await page.getByTestId('project-name-input').fill('   ')
  await page.getByTestId('project-name-confirm').click()
  await expect(page.getByTestId('editor-project-name')).toHaveText('未命名作品')
  const fallback = await readState()
  expect(fallback.revision).toBe(sameName.revision)
  expect(fallback.cells).toEqual(sameName.cells)
})

test('TASK-072 keeps an old formal Project while a second real upload is pending and cancelled', async ({
  page,
}) => {
  const workerUrls: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  await clearActiveSessionDatabase(page)

  await uploadCanvasImage(page, 'first-project.png', '#FAF4C8')
  await expect(page).toHaveURL(/\/crop$/)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      schemaVersion: 2,
      project: null,
      pendingUpload: { fileName: 'first-project.png', bytes: expect.any(Number) },
      generationIntent: null,
    })

  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('crop-confirmation-status')).toContainText('裁剪已确认')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { sourceFileName: 'first-project.png' }, pendingUpload: null })
  await page.getByTestId('grid-width-preset-32').click()
  const startedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const generated = await assertCommittedGrid(page, 32, 24, startedAt)
  expect(workerUrls.some((url) => url.includes('generation.worker'))).toBe(true)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: {
        projectId: generated.projectId,
        revision: 0,
        width: 32,
        height: 24,
        cellsAreUint16Array: true,
      },
      pendingUpload: null,
      generationIntent: null,
    })

  const savedOldProject = await readActiveSessionRecord(page)
  expect(savedOldProject?.project?.cells).toHaveLength(32 * 24)
  expect(savedOldProject?.project?.cells?.every((value) => value >= 1 && value <= 291)).toBe(true)

  await page.goBack()
  await expect(page).toHaveURL(/\/crop$/)
  await page.goBack()
  await expect(page).toHaveURL('/')
  await uploadCanvasImage(page, 'replacement.png', '#27523A')
  await expect(page).toHaveURL(/\/crop$/)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: { projectId: generated.projectId, revision: 0 },
      pendingUpload: { fileName: 'replacement.png' },
    })

  await page.getByTestId('crop-cancel-upload').click()
  await expect(page).toHaveURL(/\/editor$/)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: { projectId: generated.projectId, revision: 0 },
      pendingUpload: null,
      generationIntent: null,
    })
  const runtimeProjectId = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } } }
      }
    }
    return root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
      .projectId
  })
  expect(runtimeProjectId).toBe(generated.projectId)
})

test('TASK-072 persists real Chromium Grid edits and the latest Undo/Redo state', async ({
  page,
}) => {
  const workerUrls: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  await clearActiveSessionDatabase(page)
  await uploadCanvasImage(page, 'editable.png')
  await expect(page).toHaveURL(/\/crop$/)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      pendingUpload: { fileName: 'editable.png' },
      project: null,
    })

  await page.getByTestId('crop-confirm').click()
  await page.getByTestId('grid-width-preset-32').click()
  const startedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  await assertCommittedGrid(page, 32, 24, startedAt)
  expect(workerUrls.some((url) => url.includes('generation.worker'))).toBe(true)

  const generatedRecord = await readActiveSessionRecord(page)
  expect(generatedRecord?.project?.cellsAreUint16Array).toBe(true)
  expect(generatedRecord?.project?.revision).toBe(0)
  expect(generatedRecord?.generationIntent).toBeNull()
  const originalCells = generatedRecord?.project?.cells
  if (!originalCells) throw new Error('Expected persisted Grid cells after Worker success.')

  await page.getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId('picker-color-26').click()
  await page.getByTestId('picker-close').click()
  await page.getByTestId('viewport-reset').click()
  await page.getByTestId('viewport-center').click()
  const canvasBox = await page.getByTestId('editor-canvas').boundingBox()
  if (!canvasBox) throw new Error('Expected editor Canvas bounds.')
  await page.keyboard.down('Space')
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2 + 18,
    canvasBox.y + canvasBox.height / 2 + 10,
  )
  await page.mouse.up()
  await page.keyboard.up('Space')
  const afterNavigation = await readActiveSessionRecord(page)
  expect(afterNavigation?.project?.updatedAt).toBe(generatedRecord.project?.updatedAt)
  expect(afterNavigation?.project?.revision).toBe(generatedRecord.project?.revision)
  expect(afterNavigation?.project?.cells).toEqual(originalCells)
  await page.getByTestId('viewport-reset').click()
  await page.getByTestId('viewport-center').click()
  const viewport = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="editor-canvas-area"]')!
    return {
      zoom: Number(area.getAttribute('data-zoom')),
      panX: Number(area.getAttribute('data-pan-x')),
      panY: Number(area.getAttribute('data-pan-y')),
    }
  })
  const point = worldToScreen(
    { x: GRID_AXIS_MARGIN + CELL_SIZE / 2, y: GRID_AXIS_MARGIN + CELL_SIZE / 2 },
    viewport,
  )
  await page.mouse.click(canvasBox.x + point.x, canvasBox.y + point.y)
  await expect(page.getByTestId('editor-selected-cell')).toContainText('第 1 行、第 1 列')
  await page.getByTestId('apply-current-color').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  const editedCells = [...originalCells]
  editedCells[0] = 26
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { revision: 1, cells: editedCells } })

  await page.getByTestId('editor-undo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { revision: 0, cells: originalCells } })

  await page.getByTestId('editor-redo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { revision: 1, cells: editedCells } })

  await page.getByTestId('editor-tool-brush').click()
  const brushCanvas = await page.getByTestId('editor-canvas').boundingBox()
  if (!brushCanvas) throw new Error('Expected editor Canvas bounds for brush stroke.')
  const brushViewport = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="editor-canvas-area"]')!
    return {
      zoom: Number(area.getAttribute('data-zoom')),
      panX: Number(area.getAttribute('data-pan-x')),
      panY: Number(area.getAttribute('data-pan-y')),
    }
  })
  const brushStart = worldToScreen(
    { x: GRID_AXIS_MARGIN + CELL_SIZE * 1.5, y: GRID_AXIS_MARGIN + CELL_SIZE / 2 },
    brushViewport,
  )
  const brushEnd = worldToScreen(
    { x: GRID_AXIS_MARGIN + CELL_SIZE * 2.5, y: GRID_AXIS_MARGIN + CELL_SIZE / 2 },
    brushViewport,
  )
  await page.mouse.move(brushCanvas.x + brushStart.x, brushCanvas.y + brushStart.y)
  await page.mouse.down()
  await page.mouse.move(brushCanvas.x + brushEnd.x, brushCanvas.y + brushEnd.y)
  await page.mouse.up()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '2')
  const brushedCells = [...editedCells]
  brushedCells[1] = 26
  brushedCells[2] = 26
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { revision: 2, cells: brushedCells } })

  await page.getByTestId('editor-undo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { revision: 1, cells: editedCells } })
  await page.getByTestId('editor-redo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '2')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { revision: 2, cells: brushedCells } })

  await page.getByTestId('project-name-rename').click()
  await page.getByTestId('project-name-input').fill('自动保存改名')
  await page.getByTestId('project-name-confirm').click()
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { projectName: '自动保存改名', revision: 2, cells: brushedCells } })
  const finalRecord = await readActiveSessionRecord(page)
  expect(finalRecord?.extraKeys).toEqual([
    'generationIntent',
    'id',
    'pendingUpload',
    'project',
    'schemaVersion',
  ])
  expect(finalRecord?.project?.cellsAreUint16Array).toBe(true)
})

test('TASK-072 saves only confirmed Crop, width, and generation-mode settings', async ({
  page,
}) => {
  await clearActiveSessionDatabase(page)
  await uploadCanvasImage(page, 'confirmed-settings.png')
  await expect(page).toHaveURL(/\/crop$/)
  await page.getByTestId('crop-rotate-right').click()
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: null,
      pendingUpload: { fileName: 'confirmed-settings.png' },
    })

  await page.getByTestId('crop-confirm').click()
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: {
        cropRotation: 90,
        generationWidth: 64,
        revision: 0,
      },
      pendingUpload: null,
    })

  await page.getByTestId('grid-width-preset-48').click()
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: {
        generationWidth: 48,
        cropRotation: 90,
        revision: 0,
        width: null,
        height: null,
      },
      generationIntent: null,
    })

  await page.getByTestId('generation-mode-high-fidelity').check()
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { generationMode: 'high-fidelity', generationWidth: 48 } })
  expect((await readActiveSessionRecord(page))?.pendingUpload).toBeNull()
})

test('TASK-073 restores edited Project data after a real browser refresh and starts a fresh History lineage', async ({
  page,
}) => {
  const workerUrls: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const startedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const generated = await assertCommittedGrid(page, 32, 24, startedAt)
  expect(workerUrls.some((url) => url.includes('generation.worker'))).toBe(true)

  await page.getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId('picker-color-26').click()
  await page.getByTestId('picker-close').click()
  const geometry = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="editor-canvas-area"]')!
    return {
      zoom: Number(area.getAttribute('data-zoom')),
      panX: Number(area.getAttribute('data-pan-x')),
      panY: Number(area.getAttribute('data-pan-y')),
    }
  })
  const canvas = await page.getByTestId('editor-canvas').boundingBox()
  if (!canvas) throw new Error('Expected Canvas bounds before the first edit.')
  const initialCell = worldToScreen(
    { x: GRID_AXIS_MARGIN + CELL_SIZE / 2, y: GRID_AXIS_MARGIN + CELL_SIZE / 2 },
    geometry,
  )
  await page.mouse.click(canvas.x + initialCell.x, canvas.y + initialCell.y)
  await page.getByTestId('apply-current-color').click()
  await page.getByTestId('project-name-rename').click()
  await page.getByTestId('project-name-input').fill('刷新恢复作品')
  await page.getByTestId('project-name-confirm').click()

  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: {
        projectId: generated.projectId,
        projectName: '刷新恢复作品',
        revision: 1,
        generationMode: 'optimized',
        generationWidth: 32,
        generationHeight: 24,
        sourceFileName: 'task037-local.png',
        cellsAreUint16Array: true,
      },
      pendingUpload: null,
      generationIntent: null,
    })
  const beforeReload = await readActiveSessionRecord(page)
  await page.reload()

  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute(
    'data-project-id',
    generated.projectId,
  )
  await expect(page.getByTestId('editor-project-name')).toHaveText('刷新恢复作品')
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  await expect(page.getByTestId('editor-undo')).toBeDisabled()
  await expect(page.getByTestId('editor-redo')).toBeDisabled()
  const afterReload = await readActiveSessionRecord(page)
  expect(afterReload?.project).toMatchObject({
    projectId: beforeReload?.project?.projectId,
    projectName: beforeReload?.project?.projectName,
    revision: beforeReload?.project?.revision,
    generationMode: beforeReload?.project?.generationMode,
    generationWidth: beforeReload?.project?.generationWidth,
    generationHeight: beforeReload?.project?.generationHeight,
    cropRotation: beforeReload?.project?.cropRotation,
    cells: beforeReload?.project?.cells,
    cellsAreUint16Array: true,
  })
  const restoredRuntime = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject?: Project }> } } }
      }
    }
    const project =
      root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject!
    return {
      crop: project.crop,
      sourceFileName: project.source.originalFileName,
      sourceMimeType: project.source.mimeType,
      mode: project.generation.mode,
      widthBeads: project.generation.widthBeads,
      heightBeads: project.generation.heightBeads,
      gridCellsAreUint16Array: project.grid?.cells instanceof Uint16Array,
    }
  })
  expect(restoredRuntime).toMatchObject({
    crop: expect.objectContaining({ rotation: afterReload?.project?.cropRotation }),
    sourceFileName: 'task037-local.png',
    sourceMimeType: 'image/png',
    mode: 'optimized',
    widthBeads: 32,
    heightBeads: 24,
    gridCellsAreUint16Array: true,
  })

  await page.getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId('picker-color-26').click()
  await page.getByTestId('picker-close').click()
  const restoredGeometry = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="editor-canvas-area"]')!
    return {
      zoom: Number(area.getAttribute('data-zoom')),
      panX: Number(area.getAttribute('data-pan-x')),
      panY: Number(area.getAttribute('data-pan-y')),
    }
  })
  const restoredCanvas = await page.getByTestId('editor-canvas').boundingBox()
  if (!restoredCanvas) throw new Error('Expected Canvas bounds after restore.')
  const nextCell = worldToScreen(
    { x: GRID_AXIS_MARGIN + CELL_SIZE * 1.5, y: GRID_AXIS_MARGIN + CELL_SIZE / 2 },
    restoredGeometry,
  )
  await page.mouse.click(restoredCanvas.x + nextCell.x, restoredCanvas.y + nextCell.y)
  await page.getByTestId('apply-current-color').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '2')
  await page.getByTestId('editor-undo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  await page.getByTestId('editor-redo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '2')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { revision: 2 }, generationIntent: null })
})

test('TASK-074 derives the visible materials view after real Worker edits, Undo/Redo and refresh', async ({
  page,
}) => {
  const workerUrls: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const generated = await assertCommittedGrid(page, 32, 24, generationStartedAt)
  expect(workerUrls.some((url) => url.includes('generation.worker'))).toBe(true)

  const readGridState = () =>
    page.evaluate(() => {
      const root = document.querySelector('#app') as HTMLElement & {
        __vue_app__: {
          config: {
            globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } }
          }
        }
      }
      const project =
        root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
      return {
        projectId: project.projectId,
        revision: project.revision,
        cells: Array.from(project.grid!.cells),
      }
    })

  const assertMaterialsMatchGrid = async (cells: number[]) => {
    const counts = new Map<number, number>()
    for (const paletteIndex of cells) {
      if (paletteIndex !== 0) counts.set(paletteIndex, (counts.get(paletteIndex) ?? 0) + 1)
    }
    const rows = [...counts.entries()].sort(
      ([leftIndex, leftCount], [rightIndex, rightCount]) =>
        rightCount - leftCount || leftIndex - rightIndex,
    )
    const totalBeads = cells.filter((paletteIndex) => paletteIndex !== 0).length
    const summary = page.getByTestId('used-color-summary')
    await expect(summary).toHaveText(`${rows.length} / 291 种颜色 · ${totalBeads} 颗拼豆`)
    await expect(page.getByTestId('used-color-management')).toBeVisible()
    const visibleRows = page.locator('[data-testid^="used-color-row-"]')
    await expect(visibleRows).toHaveCount(rows.length)
    for (const [paletteIndex, count] of rows) {
      const entry = MARD_291_PALETTE.entries.find(
        (candidate) => candidate.paletteIndex === paletteIndex,
      )
      if (!entry) throw new Error(`Expected formal MARD entry for palette index ${paletteIndex}`)
      const row = page.getByTestId(`used-color-row-${paletteIndex}`)
      await expect(row).toContainText(entry.displayCode)
      await expect(row).toContainText(entry.name)
      await expect(row).toContainText(`${count} 颗`)
      await expect(row).toContainText(`${((count / totalBeads) * 100).toFixed(1)}%`)
    }
    expect(rows.some(([paletteIndex]) => paletteIndex === 0)).toBe(false)
  }

  const initial = await readGridState()
  expect(initial.projectId).toBe(generated.projectId)
  await assertMaterialsMatchGrid(initial.cells)

  const targetPaletteIndex = initial.cells[0] === 291 ? 290 : 291
  await page.getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId(`picker-color-${targetPaletteIndex}`).click()
  await page.getByTestId('picker-close').click()
  const geometry = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="editor-canvas-area"]')!
    return {
      zoom: Number(area.getAttribute('data-zoom')),
      panX: Number(area.getAttribute('data-pan-x')),
      panY: Number(area.getAttribute('data-pan-y')),
    }
  })
  const canvas = await page.getByTestId('editor-canvas').boundingBox()
  if (!canvas) throw new Error('Expected Canvas bounds for materials edit.')
  const firstCell = worldToScreen(
    { x: GRID_AXIS_MARGIN + CELL_SIZE / 2, y: GRID_AXIS_MARGIN + CELL_SIZE / 2 },
    geometry,
  )
  await page.mouse.click(canvas.x + firstCell.x, canvas.y + firstCell.y)
  await page.getByTestId('apply-current-color').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  const edited = await readGridState()
  expect(edited.cells[0]).toBe(targetPaletteIndex)
  await assertMaterialsMatchGrid(edited.cells)

  await page.getByTestId('editor-undo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
  const undone = await readGridState()
  expect(undone.cells).toEqual(initial.cells)
  await assertMaterialsMatchGrid(undone.cells)

  await page.getByTestId('editor-redo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  const redone = await readGridState()
  expect(redone.cells).toEqual(edited.cells)
  await assertMaterialsMatchGrid(redone.cells)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: { projectId: generated.projectId, revision: 1, cells: edited.cells },
    })

  await page.reload()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute(
    'data-project-id',
    generated.projectId,
  )
  const restored = await readGridState()
  expect(restored.revision).toBe(1)
  expect(restored.cells).toEqual(edited.cells)
  await assertMaterialsMatchGrid(restored.cells)
  expect(workerUrls.filter((url) => url.includes('generation.worker'))).toHaveLength(1)
})

test('TASK-073 preserves A while pending B refreshes, cancels to A, and confirmed C replaces A', async ({
  page,
}) => {
  const workerUrls: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  await clearActiveSessionDatabase(page)
  await uploadCanvasImage(page, 'project-A.png')
  await page.getByTestId('crop-confirm').click()
  await page.getByTestId('grid-width-preset-32').click()
  const startedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const projectA = await assertCommittedGrid(page, 32, 24, startedAt)
  const recordA = await readActiveSessionRecord(page)

  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL('/')
  await uploadCanvasImage(page, 'pending-B.png', '#27523A')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: { projectId: projectA.projectId, cells: recordA?.project?.cells },
      pendingUpload: { fileName: 'pending-B.png' },
    })
  await page.reload()
  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByRole('heading', { name: '确认图片范围' })).toBeVisible()
  const restoredAB = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<
                string,
                {
                  currentProject?: Project | null
                  pendingInput?: { originalFileName: string | null } | null
                  pendingUploadId?: string | null
                }
              >
            }
          }
        }
      }
    }
    const stores = root.__vue_app__.config.globalProperties.$pinia._s
    return {
      projectId: stores.get('project')!.currentProject?.projectId,
      pendingName: stores.get('upload')!.pendingInput?.originalFileName,
      uploadId: stores.get('upload')!.pendingUploadId,
    }
  })
  expect(restoredAB).toMatchObject({ projectId: projectA.projectId, pendingName: 'pending-B.png' })
  expect(restoredAB.uploadId).toBeTruthy()

  await page.getByTestId('crop-cancel-upload').click()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute(
    'data-project-id',
    projectA.projectId,
  )
  const afterCancel = await readActiveSessionRecord(page)
  expect(afterCancel?.project).toMatchObject({
    projectId: recordA?.project?.projectId,
    projectName: recordA?.project?.projectName,
    revision: recordA?.project?.revision,
    cells: recordA?.project?.cells,
  })
  expect(afterCancel?.pendingUpload).toBeNull()

  await page.goBack()
  await expect(page).toHaveURL('/')
  await uploadCanvasImage(page, 'confirmed-C.png', '#FAF4C8')
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('crop-confirmation-status')).toContainText('裁剪已确认')
  const replaced = await readActiveSessionRecord(page)
  expect(replaced?.project?.projectId).not.toBe(projectA.projectId)
  expect(replaced?.project?.sourceFileName).toBe('confirmed-C.png')
  expect(replaced?.project?.width).toBeNull()
  expect(replaced?.pendingUpload).toBeNull()
  const workersBeforeRefreshWithoutIntent = workerUrls.length
  await page.reload()
  await expect(page).toHaveURL(/\/crop$/)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: { projectId: replaced?.project?.projectId, sourceFileName: 'confirmed-C.png' },
      pendingUpload: null,
    })
  expect(workerUrls.some((url) => url.includes('generation.worker'))).toBe(true)
  expect(workerUrls).toHaveLength(workersBeforeRefreshWithoutIntent)
})

test('TASK-073 directly confirms restored pending B and never restores it as pending again', async ({
  page,
}) => {
  const workerUrls: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const aStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const projectA = await assertCommittedGrid(page, 32, 24, aStartedAt)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: { projectId: projectA.projectId, sourceFileName: 'task037-local.png' },
      pendingUpload: null,
    })

  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL('/')
  await uploadCanvasImage(page, 'restored-pending-B.png')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: { projectId: projectA.projectId },
      pendingUpload: { fileName: 'restored-pending-B.png' },
    })
  const stagedRecord = await readActiveSessionRecord(page)
  const pendingUploadId = stagedRecord?.pendingUpload?.uploadId
  expect(pendingUploadId).toBeTruthy()

  await page.reload()
  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByRole('heading', { name: '确认图片范围' })).toBeVisible()
  await expect(page.getByTestId('crop-cancel-upload')).toBeVisible()
  const restoredPendingId = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: { _s: Map<string, { pendingUploadId?: string | null }> }
          }
        }
      }
    }
    return root.__vue_app__.config.globalProperties.$pinia._s.get('upload')!.pendingUploadId
  })
  expect(restoredPendingId).toBe(pendingUploadId)

  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('crop-confirmation-status')).toContainText('裁剪已确认')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: {
        sourceFileName: 'restored-pending-B.png',
        width: null,
        height: null,
        cells: null,
      },
      pendingUpload: null,
      generationIntent: null,
    })
  const confirmedB = await readActiveSessionRecord(page)
  expect(confirmedB?.project?.projectId).not.toBe(projectA.projectId)

  await page.reload()
  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByRole('heading', { name: '确认图片范围' })).toBeVisible()
  await expect(page.getByTestId('crop-cancel-upload')).toBeHidden()
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: {
        projectId: confirmedB?.project?.projectId,
        sourceFileName: 'restored-pending-B.png',
        width: null,
        cells: null,
      },
      pendingUpload: null,
    })

  const restoredConfirmedId = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<string, { currentProject?: Project | null; pendingUploadId?: string | null }>
            }
          }
        }
      }
    }
    const stores = root.__vue_app__.config.globalProperties.$pinia._s
    return {
      projectId: stores.get('project')!.currentProject?.projectId,
      pendingUploadId: stores.get('upload')!.pendingUploadId,
    }
  })
  expect(restoredConfirmedId).toEqual({
    projectId: confirmedB?.project?.projectId,
    pendingUploadId: null,
  })

  const bStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const generatedB = await assertCommittedGrid(page, 64, 48, bStartedAt)
  expect(generatedB.projectId).toBe(confirmedB?.project?.projectId)
  expect(workerUrls.filter((url) => url.includes('generation.worker')).length).toBe(2)
  await page.reload()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute(
    'data-project-id',
    generatedB.projectId,
  )
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: { projectId: generatedB.projectId, sourceFileName: 'restored-pending-B.png' },
      pendingUpload: null,
    })
})

test('TASK-073 resumes one legacy generation intent with the real Worker and never repeats an attempted intent', async ({
  page,
}) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const intent = await seedLegacyGenerationIntent(page)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ generationIntent: { intentId: intent.intentId } })
  const worker = new Promise<string>((resolve) => {
    page.on('worker', (created) => {
      if (!created.url().includes('generation.worker')) return
      resolve(created.url())
    })
  })

  await page.reload()
  // Recovery may finish before the Crop view paints, so assert the durable result
  // of the one-shot resume instead of depending on a transient intermediate route.
  await expect(page).toHaveURL(/\/editor$/, { timeout: 15000 })
  const recoveryDiagnostics = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<
                string,
                {
                  generationStatus?: string
                  generationError?: string | null
                  currentProject?: Project | null
                  pendingUploadId?: string | null
                }
              >
            }
          }
        }
      }
    }
    const stores = root.__vue_app__.config.globalProperties.$pinia._s
    return {
      projectId: stores.get('project')!.currentProject?.projectId,
      generationStatus: stores.get('project')!.generationStatus,
      generationError: stores.get('project')!.generationError,
      pendingUploadId: stores.get('upload')!.pendingUploadId,
    }
  })
  expect(recoveryDiagnostics).toMatchObject({
    projectId: expect.any(String),
    pendingUploadId: null,
  })
  expect(runtimeErrors).toEqual([])
  expect(await worker).toContain('generation.worker')
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-grid-encoding', 'Uint16Array')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { revision: 0, width: 32, height: 24 }, generationIntent: null })

  await seedLegacyGenerationIntent(page, { attempted: true, clearGrid: true })
  const repeatedWorkers: string[] = []
  page.on('worker', (created) => repeatedWorkers.push(created.url()))
  await page.reload()
  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByTestId('generate')).toBeEnabled()
  expect(repeatedWorkers.filter((url) => url.includes('generation.worker'))).toEqual([])
  expect((await readActiveSessionRecord(page))?.generationIntent).toMatchObject({
    autoRecoveryAttempted: true,
  })
})

test('TASK-073 gives pending B priority over A intent and resumes A only after B is cancelled', async ({
  page,
}) => {
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  await page.goBack()
  await expect(page).toHaveURL('/')
  await uploadCanvasImage(page, 'pending-priority-B.png', '#27523A')
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ pendingUpload: { fileName: 'pending-priority-B.png' } })
  const intent = await seedLegacyGenerationIntent(page)
  await page.reload()
  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByTestId('crop-cancel-upload')).toBeVisible()
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ generationIntent: { intentId: intent.intentId } })
  expect((await readActiveSessionRecord(page))?.generationIntent).not.toHaveProperty(
    'autoRecoveryAttempted',
  )
  expect(workers.filter((url) => url.includes('generation.worker'))).toEqual([])

  const resumedWorker = new Promise<string>((resolve) => {
    page.on('worker', (created) => {
      if (!created.url().includes('generation.worker')) return
      resolve(created.url())
    })
  })
  await page.getByTestId('crop-cancel-upload').click()
  expect(await resumedWorker).toContain('generation.worker')
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
  expect(workers.some((url) => url.includes('generation.worker'))).toBe(true)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ project: { revision: 0, width: 32, height: 24 }, pendingUpload: null })
  expect((await readActiveSessionRecord(page))?.generationIntent).toBeNull()
  expect(intent.intentId).toContain('resume-')
})

test('TASK-073 keeps corrupted records until explicit confirmed discard', async ({ page }) => {
  await clearActiveSessionDatabase(page)
  await seedCorruptedSession(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: '暂时无法恢复当前作品' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('原记录未删除')
  expect(await hasActiveSessionRecord(page)).toBe(true)
  await page.getByRole('button', { name: '重试恢复' }).click()
  await expect(page.getByRole('heading', { name: '暂时无法恢复当前作品' })).toBeVisible()
  expect(await hasActiveSessionRecord(page)).toBe(true)

  await page.getByRole('button', { name: '放弃本地会话' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('可能导致作品永久丢失')
  await page.getByRole('button', { name: '保留作品' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: '暂时无法恢复当前作品' })).toBeVisible()
  expect(await hasActiveSessionRecord(page)).toBe(true)

  await page.getByRole('button', { name: '放弃本地会话' }).click()
  await page.getByRole('button', { name: '确认放弃并清除' }).click()
  await expect(page).toHaveURL('/')
  await expect(
    page.getByRole('heading', { name: '把你的图片，变成可以直接制作的拼豆图纸' }),
  ).toBeVisible()
  expect(await hasActiveSessionRecord(page)).toBe(false)
})

test('TASK-073 cancelling a pending-only upload returns Home, while A without Grid returns to Crop A', async ({
  page,
}) => {
  await clearActiveSessionDatabase(page)
  await uploadCanvasImage(page, 'pending-only.png')
  await expect(page).toHaveURL(/\/crop$/)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ pendingUpload: { fileName: 'pending-only.png' } })
  await page.reload()
  await expect(page).toHaveURL(/\/crop$/)
  await page.getByTestId('crop-cancel-upload').click()
  await expect(page).toHaveURL('/')
  await expect(
    page.getByRole('heading', { name: '把你的图片，变成可以直接制作的拼豆图纸' }),
  ).toBeVisible()
  expect(await readActiveSessionRecord(page)).toBeNull()

  await uploadCanvasImage(page, 'project-A-no-grid.png')
  await page.getByTestId('crop-confirm').click()
  const projectA = await readActiveSessionRecord(page)
  expect(projectA?.project?.sourceFileName).toBe('project-A-no-grid.png')
  expect(projectA?.project?.width).toBeNull()
  await page.goBack()
  await expect(page).toHaveURL('/')
  await uploadCanvasImage(page, 'pending-B.png', '#27523A')
  await page.reload()
  await page.getByTestId('crop-cancel-upload').click()
  await expect(page).toHaveURL(/\/crop$/)
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({ pendingUpload: null, project: { sourceFileName: 'project-A-no-grid.png' } })
  const restoredSource = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<string, { pendingInput?: { originalFileName: string | null } | null }>
            }
          }
        }
      }
    }
    return root.__vue_app__.config.globalProperties.$pinia._s.get('upload')!.pendingInput
      ?.originalFileName
  })
  expect(restoredSource).toBe('project-A-no-grid.png')
  await expect(page.getByTestId('grid-width-input')).toHaveValue('64')
  await expect(page.getByTestId('generation-mode-optimized')).toBeChecked()
  await expect
    .poll(async () => readActiveSessionRecord(page))
    .toMatchObject({
      project: { sourceFileName: 'project-A-no-grid.png' },
      pendingUpload: null,
    })
})

test('TASK-076 opens the complete materials list for the real Worker Project', async ({ page }) => {
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  await assertCommittedGrid(page, 32, 24, generationStartedAt)

  const project = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } }
        }
      }
    }
    const current =
      root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
    return {
      projectId: current.projectId,
      width: current.grid!.width,
      height: current.grid!.height,
      cells: Array.from(current.grid!.cells),
    }
  })
  expect(project.projectId).toBeTruthy()

  const counts = new Map<number, number>()
  for (const paletteIndex of project.cells) {
    if (paletteIndex !== 0) counts.set(paletteIndex, (counts.get(paletteIndex) ?? 0) + 1)
  }
  await page.getByTestId('material-list-toggle').click()
  await expect(page.getByTestId('full-material-list')).toBeVisible()
  const rows = page.locator('[data-testid^="material-list-row-"]')
  await expect(rows).toHaveCount(counts.size)
  for (const [paletteIndex, actual] of counts) {
    const entry = MARD_291_PALETTE.entries.find(
      (candidate) => candidate.paletteIndex === paletteIndex,
    )
    if (!entry) throw new Error(`Expected MARD entry for palette index ${paletteIndex}`)
    const row = page.getByTestId(`material-list-row-${paletteIndex}`)
    await expect(row).toContainText(entry.displayCode)
    await expect(row).toContainText(entry.name)
    await expect(row).toContainText(`${actual} 颗`)
    await expect(row).toContainText(`${actual + Math.ceil(actual / 20)} 颗`)
  }
  await page.getByTestId('material-list-close').click()
  await expect(page.getByTestId('full-material-list')).toBeHidden()
})

test('TASK-078 downloads a valid effect preview PNG for the real Worker Project', async ({
  page,
}) => {
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  await assertCommittedGrid(page, 32, 24, generationStartedAt)

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-effect-preview-png').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('task037-local_32x24.png')
  const path = await download.path()
  if (!path) throw new Error('Expected the effect PNG download to have a file path.')
  const { readFile } = await import('node:fs/promises')
  const png = await readFile(path)
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(png.toString('ascii', 12, 16)).toBe('IHDR')
  expect(png.readUInt32BE(16)).toBe(32 * 32 + 32 * 2)
  expect(png.readUInt32BE(20)).toBe(24 * 32 + 32 * 2 + 76)
})

test('TASK-079 downloads a production reference PNG from the real Worker Grid', async ({
  page,
}) => {
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const project = await assertCommittedGrid(page, 32, 24, generationStartedAt)
  const gridBeforeExport = await page
    .getByTestId('editor-grid')
    .getAttribute('data-palette-indices')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-reference-png').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('task037-local_32x24.png')
  const path = await download.path()
  if (!path) throw new Error('Expected the reference PNG download to have a file path.')
  const { readFile } = await import('node:fs/promises')
  const png = await readFile(path)
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(png.toString('ascii', 12, 16)).toBe('IHDR')
  const imageWidth = png.readUInt32BE(16)
  const imageHeight = png.readUInt32BE(20)
  expect(imageWidth).toBeGreaterThan(32 * 32)
  expect(imageHeight).toBeGreaterThan(24 * 32)

  const firstEntry = MARD_291_PALETTE.entries.find((entry) => entry.paletteIndex === project.first)
  const lastEntry = MARD_291_PALETTE.entries.find((entry) => entry.paletteIndex === project.last)
  if (!firstEntry || !lastEntry)
    throw new Error('Expected Worker palette entries in the MARD palette')
  const samplePixels = await page.evaluate(
    async ({ encoded, points }) => {
      const binary = atob(encoded)
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      const pixels = points.map(({ x, y }) => Array.from(context.getImageData(x, y, 1, 1).data))
      bitmap.close()
      return pixels
    },
    {
      encoded: png.toString('base64'),
      points: [
        { x: 44 + 4, y: 88 + 36 + 4 },
        { x: 44 + 31 * 32 + 4, y: 88 + 36 + 4 },
      ],
    },
  )
  const expectedRgb = [firstEntry, lastEntry].map((entry) => [
    entry.rgb.r,
    entry.rgb.g,
    entry.rgb.b,
  ])
  expect(samplePixels.map((pixel) => pixel.slice(0, 3))).toEqual(expectedRgb)
  expect(await page.getByTestId('editor-grid').getAttribute('data-palette-indices')).toBe(
    gridBeforeExport,
  )
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
})

test('TASK-081/082/088 exports a complete PDF with overview, production grid, and materials', async ({
  page,
}) => {
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-32').click()
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  const project = await assertCommittedGrid(page, 32, 24, generationStartedAt)
  const gridBeforeExport = await page
    .getByTestId('editor-grid')
    .getAttribute('data-palette-indices')
  for (const testId of [
    'pdf-show-grid',
    'pdf-show-labels',
    'pdf-show-coordinates',
    'pdf-show-ten-cell-guides',
    'pdf-include-materials',
  ]) {
    await expect(page.getByTestId(testId)).toBeChecked()
  }
  await expect(page.getByTestId('pdf-color-mode')).toHaveValue('color')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-pdf').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('task037-local_32x24.pdf')
  const path = await download.path()
  if (!path) throw new Error('Expected the PDF download to have a file path.')
  const { readFile } = await import('node:fs/promises')
  const pdfBytes = await readFile(path)
  expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-')

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes) }).promise
  const plan = recommendPdfPagination({ width: 32, height: 24 }, createDefaultPdfLayoutInput())
  expect(pdf.numPages).toBe(1 + plan.pages.length + 1)
  const pdfOverviewPage = await pdf.getPage(1)
  const overviewViewport = pdfOverviewPage.getViewport({ scale: 1 })
  expect(overviewViewport.width).toBeCloseTo(595.28, 0)
  expect(overviewViewport.height).toBeCloseTo(841.89, 0)
  const pageText = await pdfOverviewPage.getTextContent()
  const extractedText = pageText.items
    .filter((item) => 'str' in item)
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
  expect(extractedText).toContain('拼豆作品总览')
  expect(extractedText).toContain('作品名称：task037-local')
  expect(extractedText).toContain('豆数尺寸：32 × 24 颗')
  expect(extractedText).toContain('拼豆规格：2.6mm')
  expect(extractedText).toContain('实际成品尺寸：83.2 × 62.4mm')
  const { actualBeads, usedColors } = await page.evaluate(() => {
    const element = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: { globalProperties: { $pinia: { _s: Map<string, { currentProject: Project }> } } }
      }
    }
    const project =
      element.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject
    const values = Array.from(project.grid!.cells)
    const beads = values.filter((paletteIndex) => paletteIndex !== 0)
    return { actualBeads: beads.length, usedColors: new Set(beads).size }
  })
  expect(extractedText).toContain(`使用颜色：${usedColors} 色`)
  expect(extractedText).toContain(`拼豆总数：${actualBeads} 颗`)
  const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const operators = await pdfOverviewPage.getOperatorList()
  expect(operators.fnArray).toContain(OPS.paintImageXObject)
  const chartPage = await pdf.getPage(2)
  const chartText = (await chartPage.getTextContent()).items
    .filter((item) => 'str' in item)
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
  expect(chartText).toContain('制作图')
  expect(chartText).toContain('第 2 页')
  const firstCode = MARD_291_PALETTE.entries.find((entry) => entry.paletteIndex === project.first)!
  expect(chartText).toContain(firstCode.displayCode)
  expect((await chartPage.getOperatorList()).fnArray).toContain(OPS.paintImageXObject)
  const usedColor = MARD_291_PALETTE.entries.find((entry) => entry.paletteIndex === project.first)
  if (!usedColor) throw new Error('Expected a real MARD color in the generated Grid')
  expect(await page.getByTestId('editor-grid').getAttribute('data-palette-indices')).toBe(
    gridBeforeExport,
  )
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')

  await page.getByTestId('pdf-color-mode').selectOption('monochrome')
  await expect(page.getByTestId('pdf-show-labels')).toBeChecked()
  await expect(page.getByTestId('pdf-show-labels')).toBeDisabled()
  const monochromeDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-pdf').click()
  const monochromeDownload = await monochromeDownloadPromise
  const monochromePath = await monochromeDownload.path()
  if (!monochromePath) throw new Error('Expected the monochrome PDF download to have a file path.')
  const monochromeBytes = await readFile(monochromePath)
  const monochromePdf = await getDocument({ data: new Uint8Array(monochromeBytes) }).promise
  expect(monochromePdf.numPages).toBe(1 + plan.pages.length + 1)
  const monochromeChart = await monochromePdf.getPage(2)
  const monochromeText = (await monochromeChart.getTextContent()).items
    .filter((item) => 'str' in item)
    .map((item) => ('str' in item ? item.str : ''))
  const chartGridValues = await readCurrentGridCells(page)
  for (const paletteIndex of new Set(chartGridValues.filter((value) => value !== 0))) {
    const entry = MARD_291_PALETTE.entries.find((item) => item.paletteIndex === paletteIndex)!
    expect(monochromeText.filter((text) => text === entry.displayCode).length).toBeGreaterThan(0)
  }
  expect(await page.getByTestId('editor-grid').getAttribute('data-palette-indices')).toBe(
    gridBeforeExport,
  )
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
})

test('TASK-084/086/087/088 exports real production pages, exact ranges, thumbnails, and materials', async ({
  page,
}) => {
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-64').click()
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  await assertCommittedGrid(page, 64, 48, generationStartedAt)
  const gridBeforeExport = await page
    .getByTestId('editor-grid')
    .getAttribute('data-palette-indices')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-pdf').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('task037-local_64x48.pdf')
  const path = await download.path()
  if (!path) throw new Error('Expected the complete PDF download to have a file path.')
  const { readFile } = await import('node:fs/promises')
  const pdfBytes = await readFile(path)
  expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-')

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes) }).promise
  const { derivePdfMaterialsRowsPerPage } = await import('../../src/features/export/pdf/materials')
  const gridValues = await readCurrentGridCells(page)
  const plan = recommendPdfPagination({ width: 64, height: 48 }, createDefaultPdfLayoutInput())
  const usedPaletteIndices = [...new Set(gridValues.filter((paletteIndex) => paletteIndex !== 0))]
  const materialPageCount = Math.max(
    1,
    Math.ceil(usedPaletteIndices.length / derivePdfMaterialsRowsPerPage()),
  )
  expect(pdf.numPages).toBe(1 + plan.pages.length + materialPageCount)
  const overview = await pdf.getPage(1)
  const overviewText = (await overview.getTextContent()).items
    .filter((item) => 'str' in item)
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
  expect(overviewText).toContain('拼豆作品总览')
  expect(overviewText).toContain('豆数尺寸：64 × 48 颗')

  const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  for (let index = 0; index < plan.pages.length; index += 1) {
    const range = plan.pages[index]!
    const pdfPage = await pdf.getPage(index + 2)
    const textItems = (await pdfPage.getTextContent()).items
      .filter((item) => 'str' in item)
      .map((item) => ('str' in item ? item.str : ''))
    const extractedText = textItems.join(' ')
    expect(extractedText).toContain(`制作图 ${index + 1}/${plan.pages.length}`)
    expect(extractedText).toContain(`行 ${range.rowStart}–${range.rowEndExclusive - 1}`)
    expect(extractedText).toContain(`列 ${range.columnStart}–${range.columnEndExclusive - 1}`)
    expect(extractedText).toContain(`第 ${index + 2} 页`)
    const viewport = pdfPage.getViewport({ scale: 1 })
    expect(viewport.width).toBeCloseTo((plan.pageWidthMm * 72) / 25.4, 0)
    expect(viewport.height).toBeCloseTo((plan.pageHeightMm * 72) / 25.4, 0)
    const operators = await pdfPage.getOperatorList()
    expect(operators.fnArray).toContain(OPS.paintImageXObject)
    expect(
      operators.fnArray.filter((operator) => operator === OPS.constructPath).length,
    ).toBeGreaterThanOrEqual(
      (range.rowEndExclusive - range.rowStart) * (range.columnEndExclusive - range.columnStart),
    )
    const expectedPageCodes = new Map<string, number>()
    for (let row = range.rowStart; row < range.rowEndExclusive; row += 1) {
      for (let column = range.columnStart; column < range.columnEndExclusive; column += 1) {
        const paletteIndex = gridValues[row * 64 + column]!
        if (paletteIndex === 0) continue
        const entry = MARD_291_PALETTE.entries.find((item) => item.paletteIndex === paletteIndex)!
        expectedPageCodes.set(
          entry.displayCode,
          (expectedPageCodes.get(entry.displayCode) ?? 0) + 1,
        )
      }
    }
    for (const [code, count] of expectedPageCodes) {
      expect(textItems.filter((text) => text === code)).toHaveLength(count)
    }
  }

  const materialPage = await pdf.getPage(pdf.numPages)
  const materialItems = (await materialPage.getTextContent()).items.filter((item) => 'str' in item)
  const materialText = materialItems.map((item) => ('str' in item ? item.str : '')).join(' ')
  expect(materialText).toContain('材料清单')
  expect(materialText).toContain('色号')
  expect(materialText).toContain('使用数量')
  expect(materialText).toContain('建议准备数量')
  for (const paletteIndex of usedPaletteIndices) {
    const entry = MARD_291_PALETTE.entries.find((item) => item.paletteIndex === paletteIndex)
    if (!entry) throw new Error(`Grid contains unsupported MARD palette index ${paletteIndex}`)
    const actualCount = gridValues.filter((value) => value === paletteIndex).length
    const suggestedCount = actualCount + Math.ceil(actualCount / 20)
    expect(materialText).toContain(entry.displayCode)
    expect(materialText).toContain(entry.name)
    const rowTexts = new Map<number, string[]>()
    for (const item of materialItems) {
      if (!('str' in item) || !item.str.trim() || !('transform' in item)) continue
      const y = Math.round(item.transform[5]!)
      const existing = rowTexts.get(y) ?? []
      existing.push(item.str.trim())
      rowTexts.set(y, existing)
    }
    const matchingRow = [...rowTexts.values()]
      .map((parts) => parts.join('|'))
      .find(
        (rowText) =>
          rowText.includes(entry.displayCode) &&
          rowText.includes(entry.name) &&
          rowText.includes(String(actualCount)) &&
          rowText.includes(String(suggestedCount)),
      )
    expect(
      matchingRow,
      `Expected material row ${entry.displayCode}/${actualCount}/${suggestedCount}; rows: ${JSON.stringify(
        [...rowTexts.values()],
      )}`,
    ).toBeDefined()
  }
  expect(materialText).not.toContain('EMPTY')

  expect(await page.getByTestId('editor-grid').getAttribute('data-palette-indices')).toBe(
    gridBeforeExport,
  )
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
})

test('TASK-085/091 warns about small manually selected cells but still exports with confirmed counts', async ({
  page,
}) => {
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-64').click()
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  await assertCommittedGrid(page, 64, 48, generationStartedAt)
  const gridBeforeExport = await page
    .getByTestId('editor-grid')
    .getAttribute('data-palette-indices')

  await page.getByTestId('pdf-manual-columns').fill('70')
  await page.getByTestId('pdf-manual-rows').fill('60')
  await expect(page.getByTestId('pdf-pagination-estimate')).toContainText('预计 1 页')
  await expect(page.getByTestId('pdf-readability-warning')).toBeVisible()
  const exportButton = page.getByTestId('export-pdf')
  await expect(exportButton).toBeEnabled()

  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('task037-local_64x48.pdf')
  const path = await download.path()
  if (!path) throw new Error('Expected the manually paginated PDF to have a file path.')
  const { readFile } = await import('node:fs/promises')
  const pdfBytes = await readFile(path)
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes) }).promise
  const { derivePdfMaterialsRowsPerPage } = await import('../../src/features/export/pdf/materials')
  const manualGridValues = await readCurrentGridCells(page)
  const manualUsedColors = [
    ...new Set(manualGridValues.filter((paletteIndex) => paletteIndex !== 0)),
  ]
  const manualMaterialsPages = Math.max(
    1,
    Math.ceil(manualUsedColors.length / derivePdfMaterialsRowsPerPage()),
  )
  // One overview + exactly one manually configured range page + the final materials page(s).
  expect(pdf.numPages).toBe(2 + manualMaterialsPages)
  const manualPage = await pdf.getPage(2)
  const manualText = (await manualPage.getTextContent()).items
    .filter((item) => 'str' in item)
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
  expect(manualText).toContain('每页 70 列 × 60 行')
  expect(manualText).toContain('行 0–47')
  expect(manualText).toContain('列 0–63')
  expect(await page.getByTestId('editor-grid').getAttribute('data-palette-indices')).toBe(
    gridBeforeExport,
  )
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
})

test('TASK-090 completes upload, generation, editing, materials, and real PNG/PDF downloads', async ({
  page,
}) => {
  const errors: string[] = []
  const workers: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('worker', (worker) => workers.push(worker.url()))
  await clearActiveSessionDatabase(page)
  await uploadGenerationFixture(page)
  await page.getByTestId('grid-width-preset-64').click()
  await expect(page.getByTestId('generation-mode-optimized')).toBeChecked()
  await expect(page.getByTestId('grid-bead-dimensions')).toContainText('64 × 48 颗')
  const generationStartedAt = await page.evaluate(() => Date.now())
  await page.getByTestId('generate').click()
  await assertCommittedGrid(page, 64, 48, generationStartedAt)
  expect(workers.some((url) => url.includes('generation.worker'))).toBe(true)

  const readState = () =>
    page.evaluate(() => {
      const app = document.querySelector('#app') as HTMLElement & {
        __vue_app__: {
          config: {
            globalProperties: {
              $pinia: {
                _s: Map<
                  string,
                  {
                    currentProject?: Project
                    past?: unknown[]
                    future?: unknown[]
                  }
                >
              }
            }
          }
        }
      }
      const stores = app.__vue_app__.config.globalProperties.$pinia._s
      const project = stores.get('project')!.currentProject!
      return {
        projectId: project.projectId,
        revision: project.revision,
        updatedAt: project.updatedAt,
        cells: Array.from(project.grid!.cells),
        pastLength: stores.get('project')!.past!.length,
        futureLength: stores.get('project')!.future!.length,
      }
    })

  const clickCell = async (row: number, column: number) => {
    const viewport = await page.evaluate(() => {
      const area = document.querySelector('[data-testid="editor-canvas-area"]')!
      return {
        zoom: Number(area.getAttribute('data-zoom')),
        panX: Number(area.getAttribute('data-pan-x')),
        panY: Number(area.getAttribute('data-pan-y')),
      }
    })
    const point = worldToScreen(
      {
        x: GRID_AXIS_MARGIN + (column + 0.5) * CELL_SIZE,
        y: GRID_AXIS_MARGIN + (row + 0.5) * CELL_SIZE,
      },
      viewport,
    )
    const canvas = await page.getByTestId('editor-canvas').boundingBox()
    if (!canvas) throw new Error('Expected the production editor canvas bounds.')
    await page.mouse.click(canvas.x + point.x, canvas.y + point.y)
  }

  await page.getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-search').fill('A26')
  await page.getByTestId('picker-color-26').click()
  await page.getByTestId('picker-close').click()
  const beforeSingle = await readState()
  await clickCell(0, 0)
  await page.getByTestId('apply-current-color').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  const afterSingle = await readState()
  expect(afterSingle.cells[0]).toBe(26)
  expect(afterSingle.projectId).toBe(beforeSingle.projectId)

  await page.getByTestId('editor-tool-eraser').click()
  const beforeErase = await readState()
  await clickCell(0, 1)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '2')
  const afterErase = await readState()
  expect(afterErase.cells[1]).toBe(0)
  expect(afterErase.projectId).toBe(beforeErase.projectId)
  await expect(page.getByTestId('used-color-summary')).toBeVisible()

  const sourcePaletteIndex = 35
  const beforeReplace = await readState()
  await page.getByTestId(`used-color-replace-${sourcePaletteIndex}`).click()
  await page.getByTestId('replacement-panel').getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-mode-code').click()
  await page.getByTestId('picker-color-26').click()
  await expect(page.getByTestId('replacement-preview')).toContainText('→')
  const previewState = await readState()
  expect(previewState.cells).toEqual(beforeReplace.cells)
  expect(previewState.revision).toBe(beforeReplace.revision)
  await page.getByTestId('replacement-confirm').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '3')
  const afterReplace = await readState()
  expect(afterReplace.cells.filter((value) => value === sourcePaletteIndex)).toHaveLength(0)
  expect(afterReplace.pastLength).toBe(beforeReplace.pastLength + 1)

  await page.getByTestId('material-list-toggle').click()
  await expect(page.getByTestId('full-material-list')).toBeVisible()
  const usedColors = new Map<number, number>()
  for (const value of afterReplace.cells) {
    if (value !== 0) usedColors.set(value, (usedColors.get(value) ?? 0) + 1)
  }
  await expect(page.locator('[data-testid^="material-list-row-"]')).toHaveCount(usedColors.size)
  for (const [paletteIndex, count] of usedColors) {
    await expect(page.getByTestId(`material-list-row-${paletteIndex}`)).toContainText(`${count} 颗`)
  }
  await page.getByTestId('material-list-close').click()

  const stateBeforeExports = await readState()
  const { readFile } = await import('node:fs/promises')
  const effectDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-effect-preview-png').click()
  const effectDownload = await effectDownloadPromise
  expect(effectDownload.suggestedFilename()).toBe('task037-local_64x48.png')
  const effectPath = await effectDownload.path()
  if (!effectPath) throw new Error('Expected the effect PNG file to be available.')
  const effectPng = await readFile(effectPath)
  expect(effectPng.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(effectPng.readUInt32BE(16)).toBeGreaterThan(0)

  const referenceDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-reference-png').click()
  const referenceDownload = await referenceDownloadPromise
  const referencePath = await referenceDownload.path()
  if (!referencePath) throw new Error('Expected the reference PNG file to be available.')
  const referencePng = await readFile(referencePath)
  expect(referencePng.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(referencePng.readUInt32BE(16)).toBeGreaterThan(64 * 24)

  const pdfDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-pdf').click()
  const pdfDownload = await pdfDownloadPromise
  expect(pdfDownload.suggestedFilename()).toBe('task037-local_64x48.pdf')
  const pdfPath = await pdfDownload.path()
  if (!pdfPath) throw new Error('Expected the production PDF file to be available.')
  const pdfBytes = await readFile(pdfPath)
  expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes) }).promise
  const plan = recommendPdfPagination({ width: 64, height: 48 }, createDefaultPdfLayoutInput())
  const { derivePdfMaterialsRowsPerPage } = await import('../../src/features/export/pdf/materials')
  const materialsPageCount = Math.max(
    1,
    Math.ceil(usedColors.size / derivePdfMaterialsRowsPerPage()),
  )
  expect(pdf.numPages).toBe(1 + plan.pages.length + materialsPageCount)
  const allPdfText: string[] = []
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const pdfPage = await pdf.getPage(pageIndex)
    allPdfText.push(
      ...(await pdfPage.getTextContent()).items
        .filter((item) => 'str' in item)
        .map((item) => ('str' in item ? item.str : '')),
    )
  }
  expect(allPdfText.join(' ')).toContain('拼豆作品总览')
  expect(allPdfText.join(' ')).toContain('制作图')
  expect(allPdfText.join(' ')).toContain('材料清单')
  for (const [paletteIndex, count] of usedColors) {
    const entry = MARD_291_PALETTE.entries.find((item) => item.paletteIndex === paletteIndex)!
    expect(allPdfText).toContain(entry.displayCode)
    expect(allPdfText.join(' ')).toContain(String(count))
  }
  expect(await readState()).toEqual(stateBeforeExports)
  expect(errors).toEqual([])
})
