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
import { useUploadStore } from '../../app/stores/uploadStore'
import { createFullImageCropState, type CropState } from '../../domain/project'
import { createCropperAdapter } from './cropperAdapter'

const uploadStore = useUploadStore()
const imageElement = ref<HTMLImageElement | null>(null)
const cropper = shallowRef<ReturnType<typeof createCropperAdapter> | null>(null)
const cropState = shallowRef<CropState | null>(null)
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

async function initializeCropper(inputToken: number) {
  await nextTick()
  if (inputToken !== initializationToken || !imageElement.value) {
    return
  }

  const dimensions = uploadStore.pendingDimensions
  if (!dimensions) {
    return
  }

  const initialCrop = createFullImageCropState(dimensions.width, dimensions.height)
  cropper.value = createCropperAdapter(imageElement.value, initialCrop, (nextCropState) => {
    cropState.value = nextCropState
  })
}

watch(
  () => uploadStore.pendingInput,
  (input) => {
    initializationToken += 1
    destroyCropper()
    releaseSourceImageUrl()
    cropState.value = null

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

defineExpose({ cropState, sourceImageUrl })
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
