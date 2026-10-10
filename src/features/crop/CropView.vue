<template>
  <main class="crop-page" aria-labelledby="crop-title">
    <header class="crop-header">
      <p class="eyebrow">图片裁剪</p>
      <h1 id="crop-title">确认图片范围</h1>
    </header>

    <section v-if="sourceImageUrl" class="crop-stage" aria-label="图片裁剪区域">
      <img
        ref="imageElement"
        class="crop-image"
        :src="sourceImageUrl"
        alt="待裁剪的原始图片"
        data-testid="crop-source-image"
      />

      <div class="crop-controls" aria-label="裁剪调整工具">
        <button
          type="button"
          data-testid="crop-zoom-out"
          :disabled="!cropper || isGenerating"
          @click="zoomOut"
        >
          缩小
        </button>
        <button
          type="button"
          data-testid="crop-zoom-in"
          :disabled="!cropper || isGenerating"
          @click="zoomIn"
        >
          放大
        </button>
        <button
          type="button"
          data-testid="crop-rotate-left"
          :disabled="!cropper || isGenerating"
          @click="rotateLeft"
        >
          向左旋转 90°
        </button>
        <button
          type="button"
          data-testid="crop-rotate-right"
          :disabled="!cropper || isGenerating"
          @click="rotateRight"
        >
          向右旋转 90°
        </button>
      </div>

      <div class="crop-actions" aria-label="裁剪确认操作">
        <button
          type="button"
          data-testid="crop-confirm"
          :disabled="!cropState || widthError !== null || pendingMode !== null || isGenerating"
          @click="confirmCurrentCrop"
        >
          确认裁剪
        </button>
        <button
          type="button"
          data-testid="crop-cancel"
          :disabled="!cropState || isGenerating"
          @click="cancelCrop"
        >
          取消
        </button>
        <button
          v-if="isNewUnconfirmedUpload"
          type="button"
          data-testid="crop-cancel-upload"
          :disabled="isGenerating"
          @click="cancelNewUpload"
        >
          取消新图片
        </button>
      </div>

      <p v-if="confirmationMessage" data-testid="crop-confirmation-status" role="status">
        {{ confirmationMessage }}
      </p>
    </section>

    <section v-else class="crop-empty" data-testid="crop-empty-state" aria-live="polite">
      <h2>还没有可裁剪的图片</h2>
      <p>请先从首页上传一张图片。</p>
      <RouterLink to="/">返回首页</RouterLink>
    </section>

    <section
      v-if="cropState"
      class="generation-settings"
      aria-labelledby="generation-settings-title"
    >
      <header>
        <p class="eyebrow">生成设置</p>
        <h2 id="generation-settings-title">设置作品尺寸</h2>
      </header>
      <div class="width-setting">
        <label for="grid-width-input">作品宽度（颗）</label>
        <input
          id="grid-width-input"
          data-testid="grid-width-input"
          :value="widthInput"
          inputmode="numeric"
          type="text"
          :disabled="isGenerating"
          aria-describedby="grid-width-help"
          @input="handleWidthInput"
        />
        <p id="grid-width-help" class="field-help">
          可输入 {{ MIN_GRID_WIDTH }}～{{ MAX_GRID_WIDTH }} 颗，高度将根据裁剪比例自动计算。
        </p>
        <p v-if="widthError" data-testid="grid-width-error" class="field-error" role="alert">
          {{ widthError }}
        </p>
      </div>

      <div class="width-presets" aria-label="宽度快捷值">
        <button
          v-for="preset in QUICK_GRID_WIDTHS"
          :key="preset"
          type="button"
          :data-testid="`grid-width-preset-${preset}`"
          :aria-pressed="validWidthBeads === preset"
          :disabled="isGenerating"
          @click="applyWidth(preset)"
        >
          {{ preset }}
        </button>
      </div>

      <fieldset
        class="mode-setting"
        data-testid="generation-mode-selector"
        :disabled="isGenerating"
      >
        <legend>生成模式</legend>
        <label v-for="mode in GENERATION_MODES" :key="mode">
          <input
            :data-testid="`generation-mode-${mode}`"
            type="radio"
            name="generation-mode"
            :value="mode"
            :checked="selectedMode === mode"
            @change="selectMode(mode)"
          />
          {{ GENERATION_MODE_LABELS[mode] }}
        </label>
        <p class="field-help">默认使用拼豆优化模式；切换后将按所选模式请求生成。</p>
        <div
          v-if="pendingMode"
          class="mode-confirmation"
          data-testid="generation-mode-confirmation"
          role="dialog"
          aria-label="确认切换生成模式"
        >
          <p>切换模式会重新生成作品，当前手动修改会被清除。</p>
          <button type="button" data-testid="generation-mode-cancel" @click="cancelModeChange">
            取消
          </button>
          <button type="button" data-testid="generation-mode-confirm" @click="confirmModeChange">
            重新生成
          </button>
        </div>
      </fieldset>

      <dl v-if="generationDimensions" class="dimension-summary" data-testid="generation-dimensions">
        <div>
          <dt>拼豆尺寸</dt>
          <dd data-testid="grid-bead-dimensions">
            {{ generationDimensions.widthBeads }} × {{ generationDimensions.heightBeads }} 颗
          </dd>
        </div>
        <div>
          <dt>实际成品尺寸</dt>
          <dd data-testid="physical-dimensions">
            {{ formatCentimeters(generationDimensions.physical.widthCm) }}cm ×
            {{ formatCentimeters(generationDimensions.physical.heightCm) }}cm
          </dd>
        </div>
      </dl>

      <div
        v-if="generationDimensions?.warnings.length"
        class="generation-warnings"
        data-testid="generation-warnings"
        role="status"
        aria-label="尺寸风险提示"
      >
        <p v-for="warning in generationDimensions.warnings" :key="warning.code">
          {{ warning.message }}
        </p>
      </div>
      <div class="crop-actions" aria-label="生成操作">
        <button
          type="button"
          data-testid="generate"
          :disabled="!canGenerate || isGenerating"
          @click="generate"
        >
          {{ isGenerating ? '生成中…' : '生成拼豆图' }}
        </button>
        <button
          v-if="isGenerating"
          type="button"
          data-testid="generation-cancel"
          @click="projectStore.cancelGeneration()"
        >
          取消生成
        </button>
      </div>
      <p v-if="isGenerating" data-testid="generation-pending" role="status">正在生成拼豆图…</p>
      <p v-if="projectStore.generationError" data-testid="generation-error" role="alert">
        {{ projectStore.generationError }}
      </p>
    </section>

    <div
      v-if="uploadStore.pendingWarnings.length"
      class="image-warnings"
      role="status"
      aria-label="图片提示"
    >
      <p v-for="warning in uploadStore.pendingWarnings" :key="warning.code">
        {{ warning.message }}
      </p>
    </div>
  </main>
</template>

<script setup lang="ts">
import 'cropperjs/dist/cropper.css'
import { computed, inject, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave, RouterLink, useRouter } from 'vue-router'
import { useProjectStore } from '../../app/stores/projectStore'
import { useUploadStore } from '../../app/stores/uploadStore'
import { autoSaveCoordinator } from '../../storage/auto-save-coordinator'
import {
  DEFAULT_GRID_WIDTH,
  MAX_GRID_WIDTH,
  MIN_GRID_WIDTH,
  QUICK_GRID_WIDTHS,
  confirmCrop as confirmCropState,
  confirmProjectCrop,
  createFullImageCropState,
  createProject,
  isSameCropState,
  type CropState,
  type CropPreviewInput,
  type Source,
} from '../../domain/project'
import {
  DEFAULT_GENERATION_MODE,
  deriveGenerationDimensions,
  GENERATION_MODE_LABELS,
  GENERATION_MODES,
  isValidGridWidth,
  updateProjectGenerationMode,
  updateProjectGenerationSize,
} from '../../domain/generation'
import type { GenerationMode } from '../../domain/project'
import type { ImageDimensions, ImageInput } from '../upload'
import {
  createCropperAdapter,
  rotateCropperLeft,
  rotateCropperRight,
  zoomCropperIn,
  zoomCropperOut,
} from './cropperAdapter'

const uploadStore = useUploadStore()
const projectStore = useProjectStore()
const router = useRouter()
const imageElement = ref<HTMLImageElement | null>(null)
const cropper = shallowRef<ReturnType<typeof createCropperAdapter> | null>(null)
const cropState = shallowRef<CropState | null>(null)
const confirmedPreviewInput = shallowRef<CropPreviewInput | null>(null)
const confirmationMessage = shallowRef<string | null>(null)
const sourceImageUrl = shallowRef<string | null>(null)
const widthInput = ref(String(DEFAULT_GRID_WIDTH))
const validWidthBeads = ref(DEFAULT_GRID_WIDTH)
const selectedMode = shallowRef<GenerationMode>(DEFAULT_GENERATION_MODE)
const pendingMode = shallowRef<GenerationMode | null>(null)
const widthError = shallowRef<string | null>(null)
let initializationToken = 0
let disposed = false
const isGenerating = computed(() => projectStore.generationStatus === 'generating')
const canGenerate = computed(() => {
  const project = projectStore.currentProject
  const input = uploadStore.pendingInput
  const dimensions = uploadStore.pendingDimensions
  return !!(
    project &&
    input &&
    dimensions &&
    cropState.value &&
    sourceMatchesInput(project.source, input, dimensions) &&
    isSameCropState(project.crop, cropState.value) &&
    widthError.value === null &&
    !pendingMode.value
  )
})
const isNewUnconfirmedUpload = computed(() => {
  const input = uploadStore.pendingInput
  const dimensions = uploadStore.pendingDimensions
  return Boolean(input && dimensions && !findMatchingProject(input, dimensions))
})

async function generate() {
  await generateProject(true)
}

async function generateProject(requireConfirmedCrop: boolean) {
  const input = uploadStore.pendingInput
  const dimensions = uploadStore.pendingDimensions
  const project = input && dimensions ? findMatchingProject(input, dimensions) : null
  if (!project || isGenerating.value || (requireConfirmedCrop && !canGenerate.value)) {
    return
  }
  const projectId = project.projectId
  const committed = await projectStore.generateCurrentProject()
  if (
    !disposed &&
    committed &&
    projectStore.generationStatus === 'success' &&
    projectStore.currentProject?.projectId === projectId &&
    projectStore.currentProject.grid
  ) {
    await router.push({ name: 'editor' })
  }
}

const generationDimensions = computed(() => {
  if (!cropState.value || !isValidGridWidth(validWidthBeads.value)) {
    return null
  }

  return deriveGenerationDimensions(validWidthBeads.value, cropState.value)
})

function formatCentimeters(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function destroyCropper() {
  cropper.value?.destroy()
  cropper.value = null
}

function releaseSourceImageUrl() {
  if (!sourceImageUrl.value) {
    return
  }

  URL.revokeObjectURL(sourceImageUrl.value)
  sourceImageUrl.value = null
}

function sourceMatchesInput(
  source: Source,
  input: ImageInput,
  dimensions: ImageDimensions,
): boolean {
  return (
    source.originalImage === input.originalImage &&
    source.originalFileName === input.originalFileName &&
    source.mimeType === input.mimeType &&
    source.originalWidth === dimensions.width &&
    source.originalHeight === dimensions.height
  )
}

function sourcesMatch(left: Source, right: Source): boolean {
  return (
    left.originalImage === right.originalImage &&
    left.originalFileName === right.originalFileName &&
    left.mimeType === right.mimeType &&
    left.originalWidth === right.originalWidth &&
    left.originalHeight === right.originalHeight
  )
}

function getLastConfirmedCrop(input: ImageInput, dimensions: ImageDimensions): CropState | null {
  const currentProject = projectStore.currentProject
  if (!currentProject || !sourceMatchesInput(currentProject.source, input, dimensions)) {
    return null
  }

  return currentProject.crop
}

function createSource(input: ImageInput, dimensions: ImageDimensions): Source {
  return {
    originalImage: input.originalImage,
    originalFileName: input.originalFileName,
    mimeType: input.mimeType,
    originalWidth: dimensions.width,
    originalHeight: dimensions.height,
  }
}

function findMatchingProject(input: ImageInput, dimensions: ImageDimensions) {
  const project = projectStore.currentProject
  return project && sourceMatchesInput(project.source, input, dimensions) ? project : null
}

function resetWidth(input: ImageInput | null, dimensions: ImageDimensions | null) {
  const matchingProject = input && dimensions ? findMatchingProject(input, dimensions) : null
  const nextWidth = matchingProject?.generation.widthBeads ?? DEFAULT_GRID_WIDTH
  widthInput.value = String(nextWidth)
  validWidthBeads.value = nextWidth
  widthError.value = null
}

function resetMode(input: ImageInput | null, dimensions: ImageDimensions | null) {
  const matchingProject = input && dimensions ? findMatchingProject(input, dimensions) : null
  selectedMode.value = matchingProject?.generation.mode ?? DEFAULT_GENERATION_MODE
  pendingMode.value = null
}

function selectMode(mode: GenerationMode) {
  const input = uploadStore.pendingInput
  const dimensions = uploadStore.pendingDimensions
  const matchingProject = input && dimensions ? findMatchingProject(input, dimensions) : null
  if (matchingProject?.generation.mode === mode) {
    return
  }
  if (
    matchingProject &&
    matchingProject.generation.mode !== mode &&
    matchingProject.grid !== null &&
    matchingProject.revision > 0
  ) {
    pendingMode.value = mode
    return
  }

  applyMode(mode)
}

function applyMode(mode: GenerationMode, regenerate = false) {
  const input = uploadStore.pendingInput
  const dimensions = uploadStore.pendingDimensions
  const currentProject = input && dimensions ? findMatchingProject(input, dimensions) : null
  const hadGrid = currentProject !== null && currentProject.grid !== null
  selectedMode.value = mode
  if (currentProject) {
    const updatedProject = updateProjectGenerationMode(currentProject, mode)
    if (updatedProject !== currentProject) {
      projectStore.setCurrentProject(updatedProject)
      void projectStore.persistCurrentProject(true)
    }
    if (hadGrid || regenerate) {
      // A mode confirmation regenerates the formal crop, never an unconfirmed Cropper draft.
      void generateProject(false)
    }
  }
}

function cancelModeChange() {
  pendingMode.value = null
  const input = uploadStore.pendingInput
  const dimensions = uploadStore.pendingDimensions
  const matchingProject = input && dimensions ? findMatchingProject(input, dimensions) : null
  selectedMode.value = matchingProject?.generation.mode ?? DEFAULT_GENERATION_MODE
}

function confirmModeChange() {
  if (!pendingMode.value) {
    return
  }

  const nextMode = pendingMode.value
  pendingMode.value = null
  applyMode(nextMode, true)
}

function applyWidth(widthBeads: number) {
  if (!isValidGridWidth(widthBeads)) {
    widthError.value = `作品宽度必须是 ${MIN_GRID_WIDTH}～${MAX_GRID_WIDTH} 之间的整数。`
    return
  }

  widthInput.value = String(widthBeads)
  validWidthBeads.value = widthBeads
  widthError.value = null

  const currentProject = projectStore.currentProject
  const input = uploadStore.pendingInput
  const dimensions = uploadStore.pendingDimensions
  if (
    currentProject &&
    input &&
    dimensions &&
    sourceMatchesInput(currentProject.source, input, dimensions)
  ) {
    const updatedProject = updateProjectGenerationSize(currentProject, widthBeads)
    if (updatedProject !== currentProject) {
      projectStore.setCurrentProject(updatedProject)
      void projectStore.persistCurrentProject(true)
    }
  }
}

function handleWidthInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  widthInput.value = value
  const parsed = Number(value)

  if (!value.trim() || !isValidGridWidth(parsed)) {
    widthError.value = `作品宽度必须是 ${MIN_GRID_WIDTH}～${MAX_GRID_WIDTH} 之间的整数。`
    return
  }

  applyWidth(parsed)
}

async function initializeCropper(inputToken: number, preferredCrop?: CropState) {
  await nextTick()
  if (inputToken !== initializationToken || !imageElement.value) {
    return
  }

  const dimensions = uploadStore.pendingDimensions
  const input = uploadStore.pendingInput
  if (!dimensions || !input) {
    return
  }

  const initialCrop =
    preferredCrop ??
    getLastConfirmedCrop(input, dimensions) ??
    createFullImageCropState(dimensions.width, dimensions.height)
  cropper.value = createCropperAdapter(
    imageElement.value,
    initialCrop,
    (nextCropState) => {
      cropState.value = nextCropState
    },
    dimensions,
  )
}

async function confirmCurrentCrop() {
  const input = uploadStore.pendingInput
  const dimensions = uploadStore.pendingDimensions
  const currentCrop = cropState.value
  if (!input || !dimensions || !currentCrop) {
    return
  }

  const source = createSource(input, dimensions)
  const confirmation = confirmCropState({ source, crop: currentCrop }, dimensions)
  const currentProject = projectStore.currentProject

  const projectWithCropAndSize =
    currentProject && sourcesMatch(currentProject.source, source)
      ? updateProjectGenerationSize(
          confirmProjectCrop(currentProject, confirmation.crop),
          validWidthBeads.value,
        )
      : createProject({
          source,
          crop: confirmation.crop,
          widthBeads: validWidthBeads.value,
          mode: selectedMode.value,
        })
  const nextProject = updateProjectGenerationMode(projectWithCropAndSize, selectedMode.value)

  projectStore.setCurrentProject(nextProject)
  await projectStore.persistCurrentProject(true)
  confirmedPreviewInput.value = {
    originalImage: nextProject.source.originalImage,
    crop: nextProject.crop,
  }
  cropState.value = nextProject.crop
  confirmationMessage.value = '裁剪已确认。'
}

async function cancelNewUpload() {
  const uploadId = uploadStore.pendingUploadId
  if (!uploadId) return
  await autoSaveCoordinator.clearPendingUpload(uploadId)
  uploadStore.clearPendingInput(uploadId)
  await router.push({ name: 'home' })
}

function cancelCrop() {
  const input = uploadStore.pendingInput
  const dimensions = uploadStore.pendingDimensions
  if (!input || !dimensions) {
    return
  }

  const lastConfirmedCrop = getLastConfirmedCrop(input, dimensions)
  if (!lastConfirmedCrop) {
    return
  }

  initializationToken += 1
  destroyCropper()
  cropState.value = null
  confirmationMessage.value = null
  void initializeCropper(initializationToken, lastConfirmedCrop)
}

function zoomIn() {
  if (cropper.value) {
    zoomCropperIn(cropper.value)
  }
}

function zoomOut() {
  if (cropper.value) {
    zoomCropperOut(cropper.value)
  }
}

function rotateLeft() {
  if (cropper.value) {
    rotateCropperLeft(cropper.value)
  }
}

function rotateRight() {
  if (cropper.value) {
    rotateCropperRight(cropper.value)
  }
}

watch(
  () => uploadStore.pendingInput,
  (input) => {
    initializationToken += 1
    destroyCropper()
    releaseSourceImageUrl()
    cropState.value = null
    confirmedPreviewInput.value = null
    confirmationMessage.value = null
    resetWidth(null, null)
    resetMode(null, null)

    if (!input) {
      return
    }

    resetWidth(input, uploadStore.pendingDimensions)
    resetMode(input, uploadStore.pendingDimensions)
    sourceImageUrl.value = URL.createObjectURL(input.originalImage)
    void initializeCropper(initializationToken)
  },
  { immediate: true },
)

watch(isGenerating, (pending) => {
  if (pending) {
    cropper.value?.disable?.()
  } else {
    cropper.value?.enable?.()
  }
})

watch(
  () => projectStore.currentProject,
  (project) => {
    if (project) {
      selectedMode.value = project.generation.mode
    }
  },
)

if (inject(matchedRouteKey, undefined)) {
  onBeforeRouteLeave(async () => {
    if (!isNewUnconfirmedUpload.value) return
    const uploadId = uploadStore.pendingUploadId
    if (!uploadId) return
    await autoSaveCoordinator.clearPendingUpload(uploadId)
    uploadStore.clearPendingInput(uploadId)
  })
}

onBeforeUnmount(() => {
  disposed = true
  if (isGenerating.value) {
    projectStore.cancelGeneration()
  }
  initializationToken += 1
  destroyCropper()
  releaseSourceImageUrl()
})

defineExpose({
  cropState,
  confirmedPreviewInput,
  selectedMode,
  sourceImageUrl,
  confirmationMessage,
})
</script>

<style scoped>
.crop-page {
  min-height: 100vh;
  padding: var(--space-6) var(--space-8) var(--space-8);
  background: var(--color-page-background);
  color: var(--color-text-primary);
}

.crop-header,
.crop-stage,
.crop-empty,
.image-warnings {
  width: min(1120px, 100%);
  margin-right: auto;
  margin-left: auto;
}

.crop-header {
  margin-bottom: var(--space-5);
}

.eyebrow {
  margin-bottom: var(--space-2);
  color: var(--color-action);
  font-size: var(--font-size-sm);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  font-size: var(--font-size-heading);
}

.crop-stage {
  min-height: 480px;
  overflow: hidden;
  padding: var(--space-4);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-canvas-background);
}

.crop-image {
  display: block;
  max-width: 100%;
}

.crop-controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.crop-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.crop-actions button {
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--color-action);
  border-radius: var(--radius-sm);
  background: var(--color-action);
  color: var(--color-panel-background);
  cursor: pointer;
}

.crop-actions button + button {
  border-color: var(--color-border);
  background: var(--color-panel-background);
  color: var(--color-text-primary);
}

.crop-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.mode-setting {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding: var(--space-3);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel-background);
}

.mode-setting label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.crop-confirmation-status {
  margin-top: var(--space-3);
  color: var(--color-action);
}

.crop-controls button {
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel-background);
  color: var(--color-text-primary);
  cursor: pointer;
}

.crop-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.crop-empty {
  padding: var(--space-8);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-panel-background);
}

.crop-empty p {
  margin-top: var(--space-2);
  color: var(--color-text-secondary);
}

.crop-empty a {
  display: inline-block;
  margin-top: var(--space-4);
  color: var(--color-action);
}

.image-warnings {
  margin-top: var(--space-4);
  padding: var(--space-4);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-panel-background);
  color: var(--color-text-secondary);
}

.image-warnings p + p {
  margin-top: var(--space-2);
}
</style>
