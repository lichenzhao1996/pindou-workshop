import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { CELL_SIZE, GRID_AXIS_MARGIN, worldToScreen } from '../../src/rendering/viewport'
import type { Project } from '../../src/domain/project/types'

async function clearSession(page: Page) {
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
                reject(transaction.error ?? new Error('Could not clear active session.'))
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
                reject(transaction.error ?? new Error('Could not seed a damaged session.'))
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

async function hasSessionRecord(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open('pindou-workshop', 1)
        request.addEventListener(
          'success',
          () => {
            const database = request.result
            const get = database
              .transaction('active-session')
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
          },
          { once: true },
        )
        request.addEventListener('error', () => reject(request.error), { once: true })
      }),
  )
}

async function uploadImage(page: Page, fileName = 'task094-large.png') {
  await page.goto('/')
  await expect(page.getByTestId('image-file-input')).toBeAttached()
  await page.evaluate(async (name) => {
    const canvas = document.createElement('canvas')
    canvas.width = 40
    canvas.height = 30
    const context = canvas.getContext('2d')!
    context.fillStyle = '#FAF4C8'
    context.fillRect(0, 0, 20, 30)
    context.fillStyle = '#27523A'
    context.fillRect(20, 0, 20, 30)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) =>
        value ? resolve(value) : reject(new Error('PNG fixture encoding failed')),
      )
    })
    const input = document.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')!
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], name, { type: 'image/png' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, fileName)
  await expect(page).toHaveURL(/\/crop$/)
  await expect(page.getByTestId('crop-confirm')).toBeEnabled()
}

async function generate(page: Page, width = 256) {
  await page.getByTestId('grid-width-input').fill(String(width))
  await expect(page.getByTestId('grid-bead-dimensions')).toContainText(`${width} ×`)
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('generate')).toBeEnabled()
  const startedAt = await page.evaluate(() => performance.now())
  await page.getByTestId('generate').click()
  await expect(page).toHaveURL(/\/editor$/)
  const height = Math.round((width * 30) / 40)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-width', String(width))
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-height', String(height))
  await expect(page.getByTestId('editor-grid')).toHaveAttribute(
    'data-cell-count',
    String(width * height),
  )
  return {
    width,
    height,
    elapsedMs: await page.evaluate((start) => performance.now() - start, startedAt),
  }
}

async function readProject(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<string, { currentProject?: Project; past?: unknown[]; future?: unknown[] }>
            }
          }
        }
      }
    }
    const stores = root.__vue_app__.config.globalProperties.$pinia._s
    const project = stores.get('project')!.currentProject!
    return {
      projectId: project.projectId,
      revision: project.revision,
      updatedAt: project.updatedAt,
      width: project.grid!.width,
      height: project.grid!.height,
      cells: Array.from(project.grid!.cells),
      pastLength: stores.get('project')!.past!.length,
      futureLength: stores.get('project')!.future!.length,
    }
  })
}

async function attachMetrics(testInfo: TestInfo, name: string, metrics: unknown) {
  await testInfo.attach(`${name}.json`, {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  })
  console.log(`[${name}] ${JSON.stringify(metrics)}`)
}

test('TASK-094 keeps Chromium responsive during real Worker generation and large Canvas interactions', async ({
  page,
}, testInfo) => {
  const workerUrls: string[] = []
  const pageErrors: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await clearSession(page)
  await uploadImage(page)
  await page.getByTestId('grid-width-input').fill('256')
  await expect(page.getByTestId('grid-bead-dimensions')).toContainText('256 × 192 颗')
  await page.getByTestId('crop-confirm').click()
  await expect(page.getByTestId('generate')).toBeEnabled()
  const generationStartedAt = await page.evaluate(() => performance.now())
  await page.evaluate(() => {
    const view = window as Window & {
      __task094Frames?: number[]
      __task094LongTasks?: number[]
    }
    view.__task094Frames = []
    view.__task094LongTasks = []
    let last = performance.now()
    const sampleFrame = (now: number) => {
      view.__task094Frames!.push(now - last)
      last = now
      requestAnimationFrame(sampleFrame)
    }
    requestAnimationFrame(sampleFrame)
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) view.__task094LongTasks!.push(entry.duration)
      })
      observer.observe({ type: 'longtask', buffered: true })
    }
  })

  await page.getByTestId('generate').click()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-width', '256')
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-height', '192')
  const generation = {
    width: 256,
    height: 192,
    elapsedMs: await page.evaluate((start) => performance.now() - start, generationStartedAt),
  }
  expect(workerUrls.some((url) => url.includes('generation.worker'))).toBe(true)
  const area = page.getByTestId('editor-canvas-area')
  await expect(area).toHaveAttribute('data-rendered-beads', /[1-9]/)
  const canvasBounds = await page.getByTestId('editor-canvas').boundingBox()
  if (!canvasBounds) throw new Error('Expected the large Grid Canvas bounds.')

  const interactionTimes: Record<string, number> = {}
  const timeAction = async (name: string, action: () => Promise<void>) => {
    const started = performance.now()
    await action()
    interactionTimes[name] = Math.round((performance.now() - started) * 100) / 100
  }

  await timeAction('toggle-labels', () => page.getByTestId('editor-label-toggle').click())
  await timeAction('reset-viewport', () => page.getByTestId('viewport-reset').click())
  await expect(area).toHaveAttribute('data-zoom', '1')
  await expect(area).toHaveAttribute('data-labels', /[1-9]/)

  const firstPaletteIndex = await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: { _s: Map<string, { currentProject?: Project }> }
          }
        }
      }
    }
    return root.__vue_app__.config.globalProperties.$pinia._s.get('project')!.currentProject!.grid!
      .cells[0]
  })
  await timeAction('toggle-highlight', () =>
    page.getByTestId(`used-color-highlight-${firstPaletteIndex}`).click(),
  )
  await expect(area).toHaveAttribute('data-highlighted-palette-index', String(firstPaletteIndex))
  await expect(area).toHaveAttribute('data-highlighted-beads', /[1-9]/)

  const dragPoint = { x: canvasBounds.x + canvasBounds.width / 2, y: canvasBounds.y + 120 }
  const panBefore = Number(await area.getAttribute('data-pan-x'))
  await timeAction('middle-button-pan', async () => {
    await page.mouse.move(dragPoint.x, dragPoint.y)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(dragPoint.x + 60, dragPoint.y + 35, { steps: 3 })
    await page.mouse.up({ button: 'middle' })
  })
  await expect.poll(async () => Number(await area.getAttribute('data-pan-x'))).not.toBe(panBefore)

  const canvasMetrics = await page.evaluate(() => {
    const view = window as Window & {
      __task094Frames?: number[]
      __task094LongTasks?: number[]
    }
    const frames = view.__task094Frames ?? []
    const longTasks = view.__task094LongTasks ?? []
    return {
      frameSamples: frames.length,
      maxFrameGapMs: frames.length ? Math.round(Math.max(...frames) * 100) / 100 : null,
      longTaskCount: longTasks.length,
      longestLongTaskMs: longTasks.length ? Math.round(Math.max(...longTasks) * 100) / 100 : null,
      renderedVisibleBeads: Number(
        document
          .querySelector('[data-testid="editor-canvas-area"]')
          ?.getAttribute('data-rendered-beads'),
      ),
      renderedLabels: Number(
        document.querySelector('[data-testid="editor-canvas-area"]')?.getAttribute('data-labels'),
      ),
      dimmedBeads: Number(
        document
          .querySelector('[data-testid="editor-canvas-area"]')
          ?.getAttribute('data-dimmed-beads'),
      ),
    }
  })
  expect(canvasMetrics.frameSamples).toBeGreaterThan(0)
  expect(canvasMetrics.renderedVisibleBeads).toBeLessThan(generation.width * generation.height)
  expect(pageErrors).toEqual([])
  const metrics = {
    browser: await page.evaluate(() => navigator.userAgent),
    hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
    grid: `${generation.width}x${generation.height}`,
    gridCells: generation.width * generation.height,
    gridBytes: generation.width * generation.height * Uint16Array.BYTES_PER_ELEMENT,
    generationElapsedMs: Math.round(generation.elapsedMs * 100) / 100,
    interactionMs: interactionTimes,
    canvas: canvasMetrics,
    browserProcessPeakMemory: 'unavailable; not inferred from JS heap',
    runtimeErrors: pageErrors,
  }
  await attachMetrics(testInfo, 'TASK-094-worker-canvas-performance', metrics)
})

test('TASK-095 edits a 256 × 192 Grid in one brush history entry and restores Undo/Redo', async ({
  page,
}, testInfo) => {
  await clearSession(page)
  await uploadImage(page, 'task095-large-history.png')
  await generate(page)
  const before = await readProject(page)
  await page.getByTestId('unified-color-picker-toggle').click()
  await page.getByTestId('picker-color-26').click()
  await page.getByTestId('picker-close').click()
  await page.getByTestId('editor-tool-brush').click()

  const canvas = await page.getByTestId('editor-canvas').boundingBox()
  if (!canvas) throw new Error('Expected the history test Canvas bounds.')
  const viewport = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="editor-canvas-area"]')!
    return {
      zoom: Number(area.getAttribute('data-zoom')),
      panX: Number(area.getAttribute('data-pan-x')),
      panY: Number(area.getAttribute('data-pan-y')),
    }
  })
  const row = Math.floor(before.height / 2)
  const firstColumn = Math.floor(before.width / 2) - 2
  const pointFor = (column: number) => {
    const screen = worldToScreen(
      {
        x: GRID_AXIS_MARGIN + (column + 0.5) * CELL_SIZE,
        y: GRID_AXIS_MARGIN + (row + 0.5) * CELL_SIZE,
      },
      viewport,
    )
    return { x: canvas.x + screen.x, y: canvas.y + screen.y }
  }
  const startedAt = performance.now()
  await page.mouse.move(pointFor(firstColumn).x, pointFor(firstColumn).y)
  await page.mouse.down()
  for (let offset = 1; offset < 5; offset += 1) {
    const point = pointFor(firstColumn + offset)
    await page.mouse.move(point.x, point.y, { steps: 1 })
  }
  await page.mouse.up()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  const edited = await readProject(page)
  expect(edited.pastLength).toBe(1)
  expect(edited.cells).not.toEqual(before.cells)
  const editElapsedMs = performance.now() - startedAt

  const undoStartedAt = performance.now()
  await page.getByTestId('editor-undo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '0')
  const undone = await readProject(page)
  expect(undone.cells).toEqual(before.cells)
  expect(undone.futureLength).toBe(1)
  const undoElapsedMs = performance.now() - undoStartedAt

  const redoStartedAt = performance.now()
  await page.getByTestId('editor-redo').click()
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-revision', '1')
  const redone = await readProject(page)
  expect(redone.cells).toEqual(edited.cells)
  expect(redone.pastLength).toBe(1)
  await attachMetrics(testInfo, 'TASK-095-large-grid-history', {
    grid: `${before.width}x${before.height}`,
    gridBytes: before.width * before.height * Uint16Array.BYTES_PER_ELEMENT,
    brushSamples: 5,
    historyEntriesForBrushGesture: edited.pastLength,
    editElapsedMs: Math.round(editElapsedMs * 100) / 100,
    undoElapsedMs: Math.round(undoElapsedMs * 100) / 100,
    redoElapsedMs: Math.round((performance.now() - redoStartedAt) * 100) / 100,
    processPeakMemory: 'unavailable in headless test environment',
  })
})

test('TASK-096 retries an IndexedDB open failure and then permits a new Project', async ({
  page,
}) => {
  await clearSession(page)
  await page.addInitScript(() => {
    const originalOpen = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name: string, version?: number) {
      if (name === 'pindou-workshop' && sessionStorage.getItem('task096-fail-open') === '1') {
        throw new DOMException('simulated IndexedDB open failure', 'SecurityError')
      }
      return originalOpen.call(this, name, version)
    }
  })
  await page.evaluate(() => sessionStorage.setItem('task096-fail-open', '1'))
  await page.reload()
  await expect(page.getByRole('heading', { name: '暂时无法恢复当前作品' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('本地存储暂时无法使用')
  await page.evaluate(() => sessionStorage.removeItem('task096-fail-open'))
  await page.getByRole('button', { name: '重试恢复' }).click()
  await expect(page).toHaveURL('/')

  await uploadImage(page, 'task096-new-project.png')
  const generated = await generate(page, 32)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-width', '32')
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
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
                    resolve(get.result?.project?.grid?.width ?? 0)
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
    .toBe(generated.width)
})

test('TASK-096 never hydrates a damaged Grid and lets a confirmed new session replace it', async ({
  page,
}) => {
  await clearSession(page)
  await seedCorruptedSession(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: '暂时无法恢复当前作品' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('原记录未删除')
  await expect(page.getByTestId('editor-grid')).toHaveCount(0)
  expect(await hasSessionRecord(page)).toBe(true)

  await page.getByRole('button', { name: '放弃本地会话' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('可能导致作品永久丢失')
  await page.getByRole('button', { name: '确认放弃并清除' }).click()
  await expect(page).toHaveURL('/')
  expect(await hasSessionRecord(page)).toBe(false)

  await uploadImage(page, 'task096-replacement-project.png')
  await generate(page, 32)
  await expect(page.getByTestId('editor-grid')).toHaveAttribute('data-width', '32')
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<{ fileName: string | null; width: number }>((resolve, reject) => {
            const request = indexedDB.open('pindou-workshop', 1)
            request.addEventListener(
              'success',
              () => {
                const database = request.result
                const get = database
                  .transaction('active-session')
                  .objectStore('active-session')
                  .get('current')
                get.addEventListener(
                  'success',
                  () => {
                    database.close()
                    resolve({
                      fileName: get.result.project.source.originalFileName,
                      width: get.result.project.grid.width,
                    })
                  },
                  { once: true },
                )
              },
              { once: true },
            )
            request.addEventListener('error', () => reject(request.error), { once: true })
          }),
      ),
    )
    .toEqual({ fileName: 'task096-replacement-project.png', width: 32 })
})

test('TASK-096 keeps the in-memory Grid on quota failure, retries saving, and preserves the old record', async ({
  page,
}) => {
  await clearSession(page)
  await uploadImage(page, 'task096-quota.png')
  await generate(page, 32)
  const before = await readProject(page)

  await page.evaluate(() => {
    const view = window as Window & { __task096FailWrites?: boolean }
    view.__task096FailWrites = true
    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (
        (window as Window & { __task096FailWrites?: boolean }).__task096FailWrites &&
        this.transaction.db.name === 'pindou-workshop' &&
        this.transaction.mode === 'readwrite'
      ) {
        throw new DOMException('simulated quota exhaustion', 'QuotaExceededError')
      }
      return originalPut.apply(this, args)
    }
  })

  await page.evaluate(() => {
    const root = document.querySelector('#app') as HTMLElement & {
      __vue_app__: {
        config: {
          globalProperties: {
            $pinia: {
              _s: Map<
                string,
                {
                  currentProject: Project
                  applyGridOperation: (
                    operation: unknown,
                    project: Project,
                    grid: Project['grid'],
                  ) => boolean
                }
              >
            }
          }
        }
      }
    }
    const projectStore = root.__vue_app__.config.globalProperties.$pinia._s.get('project')!
    const project = projectStore.currentProject
    const previous = project.grid!.cells[0]
    projectStore.applyGridOperation(
      { type: 'setCell', row: 0, column: 0, value: previous === 26 ? 27 : 26 },
      project,
      project.grid,
    )
  })

  await expect(page.getByTestId('persistence-notice')).toHaveAttribute('role', 'alert')
  const inMemoryAfterFailure = await readProject(page)
  expect(inMemoryAfterFailure.revision).toBe(before.revision + 1)
  expect(inMemoryAfterFailure.cells).not.toEqual(before.cells)
  const savedAfterFailure = await page.evaluate(
    () =>
      new Promise<{ revision: number; cells: number[] }>((resolve, reject) => {
        const request = indexedDB.open('pindou-workshop', 1)
        request.addEventListener(
          'success',
          () => {
            const database = request.result
            const get = database
              .transaction('active-session')
              .objectStore('active-session')
              .get('current')
            get.addEventListener(
              'success',
              () => {
                database.close()
                const grid = get.result.project.grid
                resolve({ revision: get.result.project.revision, cells: Array.from(grid.cells) })
              },
              { once: true },
            )
          },
          { once: true },
        )
        request.addEventListener('error', () => reject(request.error), { once: true })
      }),
  )
  expect(savedAfterFailure.revision).toBe(before.revision)
  expect(savedAfterFailure.cells).toEqual(before.cells)

  await page.evaluate(() => {
    ;(window as Window & { __task096FailWrites?: boolean }).__task096FailWrites = false
  })
  await page.getByRole('button', { name: '重试保存' }).click()
  await expect.poll(async () => (await readProject(page)).revision).toBe(before.revision + 1)
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('pindou-workshop', 1)
            request.addEventListener(
              'success',
              () => {
                const database = request.result
                const get = database
                  .transaction('active-session')
                  .objectStore('active-session')
                  .get('current')
                get.addEventListener(
                  'success',
                  () => {
                    database.close()
                    resolve(get.result.project.revision)
                  },
                  { once: true },
                )
              },
              { once: true },
            )
            request.addEventListener('error', () => reject(request.error), { once: true })
          }),
      ),
    )
    .toBe(before.revision + 1)
  await expect(page.getByTestId('persistence-notice')).toHaveCount(0)
})
