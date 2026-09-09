import { expect, test } from '@playwright/test'

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const routeCases = [
  { path: '/', heading: '把你的图片，变成可以直接制作的拼豆图纸' },
  { path: '/crop', heading: '确认图片范围' },
  { path: '/editor', heading: '编辑页路由占位' },
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
