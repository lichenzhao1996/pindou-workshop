import { expect, test } from '@playwright/test'

const routeCases = [
  { path: '/', heading: '把你的图片，变成可以直接制作的拼豆图纸' },
  { path: '/crop', heading: '裁剪页路由占位' },
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
    buffer: Buffer.from('test image'),
  })

  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByRole('heading', { name: '裁剪页路由占位' })).toBeVisible()
})

test('uploads a supported PNG by dragging it to the home entry', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('upload-dropzone').evaluate((element) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File(['test image'], 'dragged.png', { type: 'image/png' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }))
  })

  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByRole('heading', { name: '裁剪页路由占位' })).toBeVisible()
})
