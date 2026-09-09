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
        <button type="button" data-testid="crop-zoom-out" :disabled="!cropper" @click="zoomOut">
          缩小
        </button>
        <button type="button" data-testid="crop-zoom-in" :disabled="!cropper" @click="zoomIn">
          放大
        </button>
        <button
          type="button"
          data-testid="crop-rotate-left"
          :disabled="!cropper"
          @click="rotateLeft"
        >
          向左旋转 90°
        </button>
        <button
          type="button"
          data-testid="crop-rotate-right"
          :disabled="!cropper"
          @click="rotateRight"
        >
          向右旋转 90°
        </button>
      </div>

      <div class="crop-actions" aria-label="裁剪确认操作">
        <button
          type="button"
          data-testid="crop-confirm"
          :disabled="!cropState"
          @click="confirmCurrentCrop"
        >
          确认裁剪
        </button>
        <button type="button" data-testid="crop-cancel" :disabled="!cropState" @click="cancelCrop">
          取消
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
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useProjectStore } from '../../app/stores/projectStore'
import { useUploadStore } from '../../app/stores/uploadStore'
import {
  confirmCrop as confirmCropState,
  confirmProjectCrop,
  createFullImageCropState,
  createProject,
  type CropState,
  type CropPreviewInput,
  type Source,
} from '../../domain/project'
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
const imageElement = ref<HTMLImageElement | null>(null)
const cropper = shallowRef<ReturnType<typeof createCropperAdapter> | null>(null)
const cropState = shallowRef<CropState | null>(null)
const confirmedPreviewInput = shallowRef<CropPreviewInput | null>(null)
const confirmationMessage = shallowRef<string | null>(null)
const sourceImageUrl = shallowRef<string | null>(null)
let initializationToken = 0

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

function confirmCurrentCrop() {
  const input = uploadStore.pendingInput
  const dimensions = uploadStore.pendingDimensions
  const currentCrop = cropState.value
  if (!input || !dimensions || !currentCrop) {
    return
  }

  const source = createSource(input, dimensions)
  const confirmation = confirmCropState({ source, crop: currentCrop }, dimensions)
  const currentProject = projectStore.currentProject

  const nextProject =
    currentProject && sourcesMatch(currentProject.source, source)
      ? confirmProjectCrop(currentProject, confirmation.crop)
      : createProject({ source, crop: confirmation.crop })

  projectStore.setCurrentProject(nextProject)
  confirmedPreviewInput.value = {
    originalImage: nextProject.source.originalImage,
    crop: nextProject.crop,
  }
  cropState.value = nextProject.crop
  confirmationMessage.value = '裁剪已确认。'
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

    if (!input) {
      return
    }

    sourceImageUrl.value = URL.createObjectURL(input.originalImage)
    void initializeCropper(initializationToken)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  initializationToken += 1
  destroyCropper()
  releaseSourceImageUrl()
})

defineExpose({ cropState, confirmedPreviewInput, sourceImageUrl, confirmationMessage })
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
