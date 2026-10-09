import { expect, test, type Page } from '@playwright/test'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
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
