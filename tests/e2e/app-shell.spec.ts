import { expect, test, type Page } from '@playwright/test'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { DEFAULT_ALGORITHM_VERSION } from '../../src/domain/project/constants'
import type { Project } from '../../src/domain/project/types'
import { CELL_SIZE, GRID_AXIS_MARGIN, worldToScreen } from '../../src/rendering/viewport'

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const routeCases = [
  { path: '/', heading: '把你的图片，变成可以直接制作的拼豆图纸' },
  { path: '/crop', heading: '确认图片范围' },
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

test('continues to the crop route while showing a low-resolution warning', async ({ page }) => {
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

test('TASK-037 mode confirmation preserves edits on cancel and regenerates from the original PNG on confirm', async ({
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
