import { expect, test } from '@playwright/test'

const routeCases = [
  { path: '/', heading: '首页路由占位' },
  { path: '/crop', heading: '裁剪页路由占位' },
  { path: '/editor', heading: '编辑页路由占位' },
  { path: '/unknown-route', heading: '首页路由占位' },
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
