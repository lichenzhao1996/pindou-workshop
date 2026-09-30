import { expect, test, type Page } from '@playwright/test'
import type { Project } from '../../src/domain/project/types'

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

async function assertCommittedGrid(page: Page, width: number, height: number) {
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
    }
  })
  expect(actual.width).toBe(width)
  expect(actual.height).toBe(height)
  expect(actual.typed).toBe(true)
  expect(actual.length).toBe(width * height)
  expect(actual.legal).toBe(true)
  expect(actual.first).toBe(1)
  expect(actual.last).toBe(35)
  await expect(result).toHaveAttribute('data-project-id', actual.projectId)
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
    await page.getByTestId('generate').click()
    await assertCommittedGrid(page, 32, 24)
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
  await page.getByTestId('generate').click()
  await assertCommittedGrid(page, 32, 24)
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
  await page.getByTestId('generation-mode-confirm').click()
  await assertCommittedGrid(page, 32, 24)
  await expect(page.getByTestId('editor-mode')).toHaveText('高清还原')
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-project-id', projectId!)
})
