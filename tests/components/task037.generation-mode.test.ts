import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { useUploadStore } from '../../src/app/stores/uploadStore'
import {
  updateProjectGenerationMode,
  updateProjectGenerationSize,
  type GenerationResult,
  type ProjectGenerationRequest,
} from '../../src/domain/generation'
import type { GenerationWorkerAcceptedResult } from '../../src/domain/generation/worker-client'
import type { RgbaImage } from '../../src/domain/generation/rasterize'
import {
  applyGridOperation,
  confirmProjectCrop,
  createGrid,
  createProject,
} from '../../src/domain/project'
import CropView from '../../src/features/crop/CropView.vue'
import HomeView from '../../src/features/home/HomeView.vue'
import { createImageInput } from '../../src/features/upload'

const generationMock = vi.hoisted(() => ({
  rasterizeCrop: vi.fn(),
  generateGrid: vi.fn(),
  cancel: vi.fn(),
}))

const cropperMock = vi.hoisted(() => ({ instances: [] as { emitCrop(data: object): void }[] }))

vi.mock('../../src/domain/generation/rasterize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/domain/generation/rasterize')>()),
  rasterizeCrop: generationMock.rasterizeCrop,
}))

vi.mock('../../src/domain/generation/worker-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/domain/generation/worker-client')>()),
  createGenerationWorkerClient: vi.fn(() => ({
    generateGrid: generationMock.generateGrid,
    cancel: generationMock.cancel,
  })),
}))

vi.mock('cropperjs', () => ({
  default: class MockCropper {
    constructor(
      _imageElement: HTMLImageElement,
      private readonly options: {
        data: object
        ready?: (event: unknown) => void
        crop?: (event: unknown) => void
      },
    ) {
      cropperMock.instances.push(this)
      options.ready?.({ currentTarget: { cropper: this } })
    }

    destroy() {}
    disable() {}
    enable() {}

    getData() {
      return this.options.data
    }

    emitCrop(data: object) {
      this.options.crop?.({ detail: data })
    }
  },
}))

const EditorResult = {
  setup() {
    return { projectStore: useProjectStore() }
  },
  template:
    '<p data-testid="editor-committed-cell">{{ projectStore.currentProject.grid.cells[0] }}</p>',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function workerResult(request: ProjectGenerationRequest, color = 1): GenerationResult {
  const grid = createGrid(request.widthBeads, request.heightBeads)
  grid.cells.fill(color)
  return {
    grid,
    heightBeads: request.heightBeads,
    paletteVersion: request.paletteVersion,
    algorithmVersion: request.algorithmVersion,
    diagnostics: {
      sourceSize: { width: 640, height: 480 },
      cropSize: { width: request.crop.width, height: request.crop.height },
      elapsedMs: 1,
    },
  }
}

function pendingWorker() {
  const response = deferred<GenerationWorkerAcceptedResult>()
  generationMock.generateGrid.mockReturnValueOnce(response.promise)
  return response
}

function setImageInput(pinia: ReturnType<typeof createPinia>, name = 'task037.png') {
  const input = createImageInput(new Blob(['image'], { type: 'image/png' }), name)
  if (!input) {
    throw new Error('expected image input fixture')
  }

  useUploadStore(pinia).setPendingInput(input, [], { width: 640, height: 480 })
  return input
}

function projectFixture(options: { withGrid?: boolean; edited?: boolean } = {}) {
  const pinia = createPinia()
  const input = setImageInput(pinia)
  const projectStore = useProjectStore(pinia)
  let project = createProject({
    source: {
      originalImage: input.originalImage,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      originalWidth: 640,
      originalHeight: 480,
    },
    crop: {
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      rotation: 0,
      aspectRatio: 4 / 3,
    },
  })
  if (options.withGrid || options.edited) {
    project = { ...project, grid: createGrid(64, 48) }
    project.grid!.cells.fill(1)
  }
  if (options.edited) {
    project = applyGridOperation(project, {
      type: 'setCell',
      row: 0,
      column: 0,
      value: 2,
    }).project
  }
  projectStore.setCurrentProject(project)
  return { pinia, input, projectStore, project }
}

async function mountCropView(pinia: ReturnType<typeof createPinia>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/crop', name: 'crop', component: CropView },
      { path: '/editor', name: 'editor', component: EditorResult },
    ],
  })
  await router.push('/crop')
  await router.isReady()
  const wrapper = mount(defineComponent({ template: '<RouterView />' }), {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  cropperMock.instances.length = 0
  generationMock.rasterizeCrop.mockReset()
  generationMock.generateGrid.mockReset()
  generationMock.cancel.mockReset()
  generationMock.rasterizeCrop.mockResolvedValue({
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]),
  })
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:task037'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TASK-037 Crop generation flow', () => {
  it('requires a confirmed Project before enabling the formal Generate entry', async () => {
    const pinia = createPinia()
    setImageInput(pinia)
    const { wrapper } = await mountCropView(pinia)

    expect(wrapper.get('[data-testid="generate"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="generate"]').trigger('click')
    expect(generationMock.rasterizeCrop).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="crop-confirm"]').trigger('click')
    expect(useProjectStore(pinia).currentProject).not.toBeNull()
    expect(wrapper.get('[data-testid="generate"]').attributes('disabled')).toBeUndefined()
  })

  it('does not offer Generate without an uploaded source', async () => {
    const { wrapper } = await mountCropView(createPinia())
    expect(wrapper.get('[data-testid="crop-empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="generate"]').exists()).toBe(false)
    expect(generationMock.rasterizeCrop).not.toHaveBeenCalled()
  })

  it('rejects invalid width input without mutating the confirmed Project', async () => {
    const { pinia, projectStore, project } = projectFixture()
    const { wrapper } = await mountCropView(pinia)
    await wrapper.get('[data-testid="grid-width-input"]').setValue('invalid')

    expect(wrapper.get('[data-testid="grid-width-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="generate"]').attributes('disabled')).toBeDefined()
    expect(projectStore.currentProject).toBe(project)
    expect(generationMock.rasterizeCrop).not.toHaveBeenCalled()
  })

  it('runs rasterize and Worker generation with a snapshot of the formal Project', async () => {
    const { pinia, input, projectStore, project } = projectFixture()
    const { wrapper, router } = await mountCropView(pinia)
    const response = pendingWorker()
    await wrapper.get('[data-testid="grid-width-input"]').setValue('96')
    const configuredProject = projectStore.currentProject
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()

    const request = projectStore.pendingGenerationRequest!
    expect(request).toMatchObject({
      projectId: project.projectId,
      originalImage: input.originalImage,
      source: project.source,
      crop: project.crop,
      widthBeads: 96,
      heightBeads: 72,
      mode: 'optimized',
    })
    expect(generationMock.rasterizeCrop).toHaveBeenCalledExactlyOnceWith(request)
    expect(generationMock.generateGrid).toHaveBeenCalledExactlyOnceWith(
      request,
      await generationMock.rasterizeCrop.mock.results[0]!.value,
    )
    expect(projectStore.currentProject).toBe(configuredProject)
    expect(router.currentRoute.value.name).toBe('crop')

    response.resolve({ accepted: true, generationResult: workerResult(request) })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('editor')
  })

  it('shows pending and prevents repeated UI submission without touching the old Grid', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    const response = pendingWorker()
    const generate = wrapper.get('[data-testid="generate"]')
    const button = generate.element as HTMLButtonElement
    button.click()
    button.click()
    await flushPromises()

    expect(projectStore.generationStatus).toBe('generating')
    expect(wrapper.get('[data-testid="generation-pending"]').text()).toContain('正在生成')
    expect(generate.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="grid-width-input"]').attributes('disabled')).toBeDefined()
    expect(
      wrapper.get('[data-testid="generation-mode-selector"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.get('[data-testid="crop-confirm"]').attributes('disabled')).toBeDefined()
    expect(generationMock.generateGrid).toHaveBeenCalledTimes(1)
    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.currentProject?.revision).toBe(project.revision)
    expect(projectStore.currentProject?.updatedAt).toBe(project.updatedAt)
    expect(router.currentRoute.value.name).toBe('crop')

    response.reject(new Error('pending fixture completed'))
    await flushPromises()
  })

  it('shows Worker failure, keeps Project untouched and enables retry without navigation', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    const response = pendingWorker()
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()
    response.reject(new Error('Worker calculation failed'))
    await flushPromises()

    expect(projectStore.generationStatus).toBe('error')
    expect(wrapper.get('[data-testid="generation-error"]').text()).toBe('Worker calculation failed')
    expect(wrapper.find('[data-testid="generation-pending"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="generate"]').attributes('disabled')).toBeUndefined()
    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.currentProject?.grid).toBe(project.grid)
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('commits the real Grid before routing and the result view reads that committed Grid', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    const response = pendingWorker()
    const atEditorNavigation = vi.fn()
    router.beforeEach((to) => {
      if (to.name === 'editor') {
        expect(projectStore.currentProject?.grid?.cells[0]).toBe(3)
        expect(projectStore.currentProject?.grid?.width).toBe(64)
        expect(projectStore.currentProject?.grid?.height).toBe(48)
        expect(projectStore.currentProject?.revision).toBe(0)
        expect(projectStore.generationStatus).toBe('success')
        atEditorNavigation()
      }
    })
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()
    const result = workerResult(projectStore.pendingGenerationRequest!, 3)
    expect(atEditorNavigation).not.toHaveBeenCalled()
    response.resolve({ accepted: true, generationResult: result })
    await flushPromises()

    expect(atEditorNavigation).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe('editor')
    expect(wrapper.get('[data-testid="editor-committed-cell"]').text()).toBe('3')
    expect(projectStore.currentProject).not.toBe(project)
    expect(projectStore.currentProject?.projectId).toBe(project.projectId)
    expect(projectStore.currentProject?.grid?.cells).not.toBe(result.grid.cells)
    expect(project.grid?.cells[0]).toBe(2)
  })

  it('does not navigate for a Worker acknowledgement without a generated Grid', async () => {
    const { pinia, projectStore, project } = projectFixture()
    const { wrapper, router } = await mountCropView(pinia)
    generationMock.generateGrid.mockResolvedValueOnce({ accepted: true })
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()

    expect(projectStore.generationStatus).toBe('error')
    expect(wrapper.get('[data-testid="generation-error"]').text()).toContain('真实 Grid')
    expect(projectStore.currentProject).toBe(project)
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('cancels generation and ignores a late result without replacing the Project', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    const response = pendingWorker()
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()
    const result = workerResult(projectStore.pendingGenerationRequest!)
    await wrapper.get('[data-testid="generation-cancel"]').trigger('click')

    expect(projectStore.generationStatus).toBe('idle')
    expect(generationMock.cancel).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="generation-pending"]').exists()).toBe(false)
    response.resolve({ accepted: true, generationResult: result })
    await flushPromises()
    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.generationError).toBeNull()
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it.each(['width', 'crop', 'mode'] as const)(
    'ignores the old result after a formal %s change without rolling the setting back',
    async (setting) => {
      const { pinia, projectStore, project } = projectFixture({ edited: true })
      const { wrapper, router } = await mountCropView(pinia)
      const response = pendingWorker()
      await wrapper.get('[data-testid="generate"]').trigger('click')
      await flushPromises()
      const result = workerResult(projectStore.pendingGenerationRequest!)
      const changed =
        setting === 'width'
          ? updateProjectGenerationSize(project, 96)
          : setting === 'mode'
            ? updateProjectGenerationMode(project, 'high-fidelity')
            : confirmProjectCrop(project, {
                ...project.crop,
                width: 480,
                aspectRatio: 1,
              })
      projectStore.setCurrentProject(changed)
      await flushPromises()

      expect(changed.grid).toBeNull()
      expect(changed.revision).toBe(project.revision)
      response.resolve({ accepted: true, generationResult: result })
      await flushPromises()
      expect(projectStore.currentProject).toBe(changed)
      expect(projectStore.currentProject?.updatedAt).toBe(changed.updatedAt)
      expect(projectStore.generationStatus).toBe('idle')
      expect(router.currentRoute.value.name).toBe('crop')
    },
  )

  it('ignores an old result after a Project switch even when both revisions match', async () => {
    const { pinia, projectStore, project } = projectFixture()
    const { wrapper, router } = await mountCropView(pinia)
    const response = pendingWorker()
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()
    const result = workerResult(projectStore.pendingGenerationRequest!)
    const replacement = createProject({ source: project.source, crop: project.crop })
    expect(replacement.projectId).not.toBe(project.projectId)
    expect(replacement.revision).toBe(project.revision)
    projectStore.setCurrentProject(replacement)
    response.resolve({ accepted: true, generationResult: result })
    await flushPromises()

    expect(projectStore.currentProject).toBe(replacement)
    expect(replacement.grid).toBeNull()
    expect(projectStore.generationStatus).toBe('idle')
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it.each(['width', 'crop', 'mode'] as const)(
    'keeps a pending request valid for a same-value %s no-op',
    async (setting) => {
      const { pinia, projectStore, project } = projectFixture({ edited: true })
      const { wrapper, router } = await mountCropView(pinia)
      const response = pendingWorker()
      await wrapper.get('[data-testid="generate"]').trigger('click')
      await flushPromises()
      const request = projectStore.pendingGenerationRequest!
      const same =
        setting === 'width'
          ? updateProjectGenerationSize(project, project.generation.widthBeads)
          : setting === 'mode'
            ? updateProjectGenerationMode(project, project.generation.mode)
            : confirmProjectCrop(project, { ...project.crop })
      expect(same).toBe(project)
      projectStore.setCurrentProject(same)
      expect(projectStore.generationStatus).toBe('generating')
      expect(projectStore.pendingGenerationRequest).toBe(request)
      expect(projectStore.currentProject?.updatedAt).toBe(project.updatedAt)
      expect(generationMock.cancel).not.toHaveBeenCalled()

      response.resolve({ accepted: true, generationResult: workerResult(request) })
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('editor')
    },
  )

  it('lets only the latest Store request commit even when the UI request resolves late', async () => {
    const { pinia, projectStore, project } = projectFixture()
    const { wrapper, router } = await mountCropView(pinia)
    const first = pendingWorker()
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()
    const firstRequest = projectStore.pendingGenerationRequest!
    const latest = pendingWorker()
    const latestAttempt = projectStore.generateCurrentProject()
    await flushPromises()
    const latestRequest = projectStore.pendingGenerationRequest!
    expect(generationMock.generateGrid).toHaveBeenCalledTimes(2)
    expect(latestRequest).not.toBe(firstRequest)
    latest.resolve({ accepted: true, generationResult: workerResult(latestRequest, 4) })
    await expect(latestAttempt).resolves.toBe(true)
    const committedProject = projectStore.currentProject

    first.resolve({ accepted: true, generationResult: workerResult(firstRequest, 5) })
    await flushPromises()
    expect(projectStore.currentProject).toBe(committedProject)
    expect(projectStore.currentProject?.projectId).toBe(project.projectId)
    expect(projectStore.currentProject?.grid?.cells[0]).toBe(4)
    expect(projectStore.generationStatus).toBe('success')
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('does not overwrite the latest error with a superseded UI request failure', async () => {
    const { pinia, projectStore, project } = projectFixture()
    const { wrapper, router } = await mountCropView(pinia)
    const first = pendingWorker()
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()
    const latest = pendingWorker()
    const latestAttempt = projectStore.generateCurrentProject()
    await flushPromises()
    latest.reject(new Error('latest request error'))
    await expect(latestAttempt).resolves.toBe(false)
    first.reject(new Error('stale request error'))
    await flushPromises()

    expect(projectStore.generationError).toBe('latest request error')
    expect(wrapper.get('[data-testid="generation-error"]').text()).toBe('latest request error')
    expect(projectStore.currentProject).toBe(project)
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('shows decode errors without sending Worker work, mutating Project or navigating', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    generationMock.rasterizeCrop.mockRejectedValueOnce(new Error('original image decode failed'))
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="generation-error"]').text()).toBe(
      'original image decode failed',
    )
    expect(generationMock.generateGrid).not.toHaveBeenCalled()
    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.generationStatus).toBe('error')
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('cancels during decode and does not start Worker generation when decode finishes', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    const decode = deferred<RgbaImage>()
    generationMock.rasterizeCrop.mockReturnValueOnce(decode.promise)
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await wrapper.get('[data-testid="generation-cancel"]').trigger('click')
    decode.resolve({ width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) })
    await flushPromises()

    expect(generationMock.generateGrid).not.toHaveBeenCalled()
    expect(projectStore.generationStatus).toBe('idle')
    expect(projectStore.currentProject).toBe(project)
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('does not let a late old decode supersede the latest Worker request', async () => {
    const { pinia, projectStore } = projectFixture()
    const { wrapper, router } = await mountCropView(pinia)
    const oldDecode = deferred<RgbaImage>()
    const latestDecode = deferred<RgbaImage>()
    generationMock.rasterizeCrop.mockReturnValueOnce(oldDecode.promise)
    generationMock.rasterizeCrop.mockReturnValueOnce(latestDecode.promise)
    const response = pendingWorker()
    await wrapper.get('[data-testid="generate"]').trigger('click')
    const latestAttempt = projectStore.generateCurrentProject()
    const latestRequest = projectStore.pendingGenerationRequest!
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 255, 255]) }
    latestDecode.resolve(pixels)
    await flushPromises()
    expect(generationMock.generateGrid).toHaveBeenCalledExactlyOnceWith(latestRequest, pixels)

    oldDecode.resolve({ width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) })
    await flushPromises()
    expect(generationMock.generateGrid).toHaveBeenCalledOnce()
    expect(projectStore.pendingGenerationRequest).toBe(latestRequest)
    expect(projectStore.generationStatus).toBe('generating')
    response.resolve({ accepted: true, generationResult: workerResult(latestRequest, 7) })
    await expect(latestAttempt).resolves.toBe(true)
    expect(projectStore.currentProject?.grid?.cells[0]).toBe(7)
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('rejects invalid Grid cells through the real commit validator without navigation', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    const response = pendingWorker()
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()
    const result = workerResult(projectStore.pendingGenerationRequest!)
    result.grid.cells[0] = 65535
    response.resolve({ accepted: true, generationResult: result })
    await flushPromises()

    expect(projectStore.generationStatus).toBe('error')
    expect(wrapper.get('[data-testid="generation-error"]').text()).not.toBe('')
    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.currentProject?.revision).toBe(project.revision)
    expect(projectStore.currentProject?.updatedAt).toBe(project.updatedAt)
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('cancels on page disposal and does not route for a later result', async () => {
    const { pinia, projectStore, project } = projectFixture()
    const { wrapper, router } = await mountCropView(pinia)
    const response = pendingWorker()
    const editorNavigation = vi.fn()
    router.beforeEach((to) => {
      if (to.name === 'editor') {
        editorNavigation()
      }
    })
    await wrapper.get('[data-testid="generate"]').trigger('click')
    await flushPromises()
    const result = workerResult(projectStore.pendingGenerationRequest!)
    wrapper.unmount()
    response.resolve({ accepted: true, generationResult: result })
    await flushPromises()

    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.generationStatus).toBe('idle')
    expect(generationMock.cancel).toHaveBeenCalled()
    expect(editorNavigation).not.toHaveBeenCalled()
  })
})

describe('TASK-037 generation mode confirmation', () => {
  it('regenerates from the formal crop rather than silently confirming an unconfirmed crop draft', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    cropperMock.instances[0]!.emitCrop({
      x: 0,
      y: 0,
      width: 480,
      height: 480,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="generate"]').attributes('disabled')).toBeDefined()
    const response = pendingWorker()
    await wrapper.get('[data-testid="generation-mode-high-fidelity"]').setValue(true)
    await wrapper.get('[data-testid="generation-mode-confirm"]').trigger('click')
    await flushPromises()

    const request = projectStore.pendingGenerationRequest!
    expect(request.crop).toEqual(project.crop)
    expect(request.widthBeads).toBe(64)
    expect(request.heightBeads).toBe(48)
    expect(request.mode).toBe('high-fidelity')
    expect(projectStore.currentProject?.crop).toBe(project.crop)
    expect(generationMock.rasterizeCrop).toHaveBeenCalledExactlyOnceWith(request)
    response.resolve({ accepted: true, generationResult: workerResult(request) })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('editor')
  })

  it('cancels a mode switch without clearing manually edited Grid or starting a request', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    await wrapper.get('[data-testid="generation-mode-high-fidelity"]').setValue(true)
    expect(wrapper.get('[data-testid="generation-mode-confirmation"]').text()).toContain(
      '切换模式会重新生成作品，当前手动修改会被清除。',
    )
    expect(projectStore.currentProject).toBe(project)
    expect(generationMock.rasterizeCrop).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="generation-mode-cancel"]').trigger('click')

    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.currentProject?.grid).toBe(project.grid)
    expect(wrapper.find('[data-testid="generation-mode-confirmation"]').exists()).toBe(false)
    expect(generationMock.rasterizeCrop).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('confirms mode, invalidates Grid, requests the original crop and keeps settings on failure', async () => {
    const { pinia, input, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    const response = pendingWorker()
    await wrapper.get('[data-testid="generation-mode-high-fidelity"]').setValue(true)
    await wrapper.get('[data-testid="generation-mode-confirm"]').trigger('click')
    await flushPromises()

    const configuredProject = projectStore.currentProject
    expect(configuredProject?.generation.mode).toBe('high-fidelity')
    expect(configuredProject?.grid).toBeNull()
    expect(configuredProject?.projectId).toBe(project.projectId)
    expect(configuredProject?.revision).toBe(project.revision)
    const request = projectStore.pendingGenerationRequest!
    expect(request.originalImage).toBe(input.originalImage)
    expect(request.crop).toEqual(project.crop)
    expect(request.mode).toBe('high-fidelity')
    expect(generationMock.generateGrid).toHaveBeenCalledOnce()
    response.reject(new Error('regeneration failed'))
    await flushPromises()

    expect(projectStore.currentProject).toBe(configuredProject)
    expect(projectStore.currentProject?.updatedAt).toBe(configuredProject?.updatedAt)
    expect(projectStore.generationStatus).toBe('error')
    expect(router.currentRoute.value.name).toBe('crop')
  })

  it('commits confirmed regeneration as a new baseline and only then enters Editor', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper, router } = await mountCropView(pinia)
    const response = pendingWorker()
    await wrapper.get('[data-testid="generation-mode-high-fidelity"]').setValue(true)
    await wrapper.get('[data-testid="generation-mode-confirm"]').trigger('click')
    await flushPromises()
    expect(projectStore.currentProject?.revision).toBe(project.revision)
    expect(router.currentRoute.value.name).toBe('crop')
    response.resolve({
      accepted: true,
      generationResult: workerResult(projectStore.pendingGenerationRequest!, 6),
    })
    await flushPromises()

    expect(projectStore.currentProject?.generation.mode).toBe('high-fidelity')
    expect(projectStore.currentProject?.revision).toBe(0)
    expect(projectStore.currentProject?.grid?.cells[0]).toBe(6)
    expect(router.currentRoute.value.name).toBe('editor')
  })

  it('regenerates an unedited Grid on an actual mode change without a confirmation dialog', async () => {
    const { pinia, projectStore } = projectFixture({ withGrid: true })
    const { wrapper } = await mountCropView(pinia)
    const response = pendingWorker()
    await wrapper.get('[data-testid="generation-mode-high-fidelity"]').setValue(true)
    await flushPromises()

    expect(wrapper.find('[data-testid="generation-mode-confirmation"]').exists()).toBe(false)
    expect(projectStore.currentProject?.generation.mode).toBe('high-fidelity')
    expect(projectStore.currentProject?.grid).toBeNull()
    expect(projectStore.generationStatus).toBe('generating')
    expect(projectStore.pendingGenerationRequest?.mode).toBe('high-fidelity')
    response.reject(new Error('fixture completed'))
    await flushPromises()
  })

  it('does not mutate or regenerate for the same mode', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const { wrapper } = await mountCropView(pinia)
    await wrapper.get('[data-testid="generation-mode-optimized"]').trigger('change')

    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.currentProject?.grid).toBe(project.grid)
    expect(wrapper.find('[data-testid="generation-mode-confirmation"]').exists()).toBe(false)
    expect(generationMock.rasterizeCrop).not.toHaveBeenCalled()
    expect(generationMock.generateGrid).not.toHaveBeenCalled()
  })

  it('preselects a new upload mode without changing the previous Project before crop confirmation', async () => {
    const { pinia, projectStore, project } = projectFixture({ edited: true })
    const newInput = setImageInput(pinia, 'new-upload.png')
    const { wrapper } = await mountCropView(pinia)
    await wrapper.get('[data-testid="generation-mode-high-fidelity"]').setValue(true)

    expect(projectStore.currentProject).toBe(project)
    expect(wrapper.find('[data-testid="generation-mode-confirmation"]').exists()).toBe(false)
    expect(generationMock.rasterizeCrop).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="crop-confirm"]').trigger('click')
    expect(projectStore.currentProject?.projectId).not.toBe(project.projectId)
    expect(projectStore.currentProject?.source.originalImage).toBe(newInput.originalImage)
    expect(projectStore.currentProject?.generation.mode).toBe('high-fidelity')
    expect(projectStore.currentProject?.grid).toBeNull()
    expect(generationMock.rasterizeCrop).not.toHaveBeenCalled()
  })
})
