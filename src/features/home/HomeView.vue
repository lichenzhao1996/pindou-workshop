<template>
  <main class="home-page" aria-labelledby="home-title">
    <header class="home-header">
      <a class="brand" href="/" aria-label="拼豆工坊首页">拼豆工坊</a>
      <nav class="home-nav" aria-label="主导航">
        <a href="#how-it-works">使用流程</a>
      </nav>
    </header>

    <section class="hero-section">
      <div class="hero-copy">
        <p class="eyebrow">PC Web 拼豆图纸工具</p>
        <h1 id="home-title">把你的图片，变成可以直接制作的拼豆图纸</h1>
        <p class="hero-description">
          图片自动转换为 MARD 291
          色拼豆图纸，并提供清晰的用豆数量统计，帮助你从图片开始完成一件可制作的拼豆作品。
        </p>
        <div
          class="upload-entry"
          :class="{ 'is-dragging': isDragging }"
          data-testid="upload-dropzone"
          aria-label="图片上传入口"
          @dragenter="handleDragEnter"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
        >
          <button class="upload-cta" type="button" data-testid="upload-cta" @click="openFilePicker">
            上传图片
          </button>
          <input
            ref="fileInput"
            class="file-input"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            aria-label="选择图片文件"
            data-testid="image-file-input"
            @change="handleFileChange"
          />
          <p class="drop-hint">也可以将图片拖到这里</p>
          <p v-if="errorMessage" class="upload-error" role="alert">{{ errorMessage }}</p>
          <p class="usage-note">免费使用 · 无需注册</p>
        </div>
      </div>

      <aside class="value-card" aria-label="产品价值">
        <div class="value-card-header">
          <span class="value-card-mark" aria-hidden="true">豆</span>
          <div>
            <p class="value-card-label">从图片到作品</p>
            <h2>一张图，得到一份可以照着制作的图纸</h2>
          </div>
        </div>
        <ul class="value-list">
          <li>基于 MARD 291 色拼豆色卡</li>
          <li>查看每种颜色的用豆数量</li>
          <li>导出拼豆制作参考图纸</li>
        </ul>
      </aside>
    </section>

    <section id="how-it-works" class="steps-section" aria-labelledby="steps-title">
      <div class="section-heading">
        <p class="eyebrow">简单三步</p>
        <h2 id="steps-title">从图片开始，逐步完成你的拼豆图纸</h2>
      </div>
      <ol class="steps-list">
        <li v-for="(step, index) in steps" :key="step.title" class="step-item">
          <span class="step-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
        </li>
      </ol>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUploadStore } from '../../app/stores/uploadStore'
import { autoSaveCoordinator } from '../../storage/auto-save-coordinator'
import { inspectImageInput } from '../upload'

const steps = [
  {
    title: '上传图片',
    description: '选择一张你想制作的普通图片。',
  },
  {
    title: '调整尺寸',
    description: '裁剪画面并设置拼豆作品宽度。',
  },
  {
    title: '下载图纸',
    description: '查看颜色和用豆数量，下载制作图纸。',
  },
] as const

const router = useRouter()
const uploadStore = useUploadStore()
const fileInput = ref<HTMLInputElement | null>(null)
const errorMessage = ref<string | null>(null)
const isDragging = ref(false)
let inspectionSequence = 0
let uploadSequence = 0

function openFilePicker() {
  fileInput.value?.click()
}

async function processSelectedFile(
  selectedFile: Blob | null,
  originalFileNameOverride?: string | null,
) {
  if (!selectedFile) return
  const inspectionToken = ++inspectionSequence
  const inspection = await inspectImageInput(selectedFile, originalFileNameOverride)
  if (inspectionToken !== inspectionSequence) return
  if (!inspection) {
    return
  }

  if (inspection.status === 'invalid') {
    errorMessage.value = inspection.message
    return
  }

  errorMessage.value = null
  const uploadId = `upload-${Date.now()}-${++uploadSequence}`
  uploadStore.setPendingInput(
    inspection.input,
    inspection.warnings,
    inspection.dimensions,
    uploadId,
  )
  await autoSaveCoordinator.stagePendingUpload(uploadId, {
    originalImage: inspection.input.originalImage,
    originalFileName: inspection.input.originalFileName,
    mimeType: inspection.input.mimeType,
    originalWidth: inspection.dimensions.width,
    originalHeight: inspection.dimensions.height,
  })
  if (inspectionToken !== inspectionSequence || uploadStore.pendingUploadId !== uploadId) return
  await router.push({ name: 'crop' })
}

async function handleFileChange(event: Event) {
  const inputElement = event.target as HTMLInputElement
  const selectedFile = inputElement.files?.[0] ?? null
  inputElement.value = ''
  await processSelectedFile(selectedFile)
}

function hasDraggedFiles(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.files.length || event.dataTransfer?.types.includes('Files'))
}

function handleDragEnter(event: DragEvent) {
  if (!hasDraggedFiles(event)) {
    return
  }

  event.preventDefault()
  isDragging.value = true
}

function handleDragOver(event: DragEvent) {
  if (!hasDraggedFiles(event)) {
    return
  }

  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
  await processSelectedFile(event.dataTransfer?.files[0] ?? null)
}

function getPastedImage(event: ClipboardEvent): Blob | null {
  const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
    item.type.toLowerCase().startsWith('image/'),
  )

  return imageItem?.getAsFile() ?? null
}

async function handlePaste(event: ClipboardEvent) {
  const pastedImage = getPastedImage(event)
  if (!pastedImage) {
    return
  }

  event.preventDefault()
  await processSelectedFile(pastedImage, null)
}

onMounted(() => {
  window.addEventListener('paste', handlePaste)
})

onBeforeUnmount(() => {
  inspectionSequence += 1
  window.removeEventListener('paste', handlePaste)
})
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  padding: var(--space-6) var(--space-8) var(--space-8);
  background: var(--color-page-background);
  color: var(--color-text-primary);
}

.home-header,
.hero-section,
.steps-section {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
}

.brand {
  color: var(--color-text-primary);
  font-size: var(--font-size-title);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-decoration: none;
}

.home-nav a {
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
  text-decoration: none;
}

.home-nav a:hover {
  color: var(--color-action);
}

.hero-section {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: var(--space-8);
  align-items: center;
  padding: clamp(64px, 10vw, 120px) 0 var(--space-8);
}

.hero-copy {
  max-width: 680px;
}

.eyebrow {
  margin-bottom: var(--space-3);
  color: var(--color-action);
  font-size: var(--font-size-sm);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  max-width: 680px;
  font-size: clamp(36px, 5vw, 60px);
  line-height: 1.15;
  letter-spacing: -0.03em;
}

.hero-description {
  max-width: 600px;
  margin-top: var(--space-5);
  color: var(--color-text-secondary);
  font-size: 18px;
  line-height: 1.8;
}

.upload-cta {
  min-width: 144px;
  margin-top: var(--space-6);
  padding: var(--space-3) var(--space-5);
  border: 0;
  border-radius: var(--radius-md);
  background: var(--color-action);
  color: #ffffff;
  cursor: pointer;
  font-weight: 700;
  box-shadow: var(--shadow-sm);
}

.upload-cta:hover {
  background: var(--color-action-hover);
}

.upload-entry {
  width: fit-content;
  min-width: 220px;
  padding: var(--space-3);
  border: var(--border-width) dashed transparent;
  border-radius: var(--radius-md);
}

.upload-entry.is-dragging {
  border-color: var(--color-action);
  background: var(--color-canvas-background);
}

.drop-hint {
  margin-top: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.upload-error {
  margin-top: var(--space-3);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.usage-note {
  margin-top: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.value-card {
  padding: var(--space-6);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-panel-background);
  box-shadow: var(--shadow-md);
}

.value-card-header {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}

.value-card-mark {
  display: grid;
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-canvas-background);
  color: var(--color-action);
  font-size: var(--font-size-title);
  font-weight: 700;
}

.value-card-label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.value-card h2 {
  margin-top: var(--space-2);
  font-size: var(--font-size-heading);
  line-height: 1.4;
}

.value-list {
  display: grid;
  gap: var(--space-3);
  margin: var(--space-6) 0 0;
  padding: var(--space-5) 0 0 var(--space-5);
  border-top: var(--border-width) solid var(--color-border);
  color: var(--color-text-secondary);
}

.steps-section {
  padding: var(--space-8) 0;
}

.section-heading h2 {
  max-width: 620px;
  font-size: 32px;
  line-height: 1.3;
}

.steps-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin: var(--space-6) 0 0;
  padding: 0;
  list-style: none;
}

.step-item {
  display: flex;
  gap: var(--space-4);
  min-height: 132px;
  padding: var(--space-5);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-panel-background);
}

.step-number {
  color: var(--color-action);
  font-size: var(--font-size-title);
  font-weight: 700;
}

.step-item h3 {
  font-size: 18px;
}

.step-item p {
  margin-top: var(--space-2);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

@media (max-width: 800px) {
  .home-page {
    padding-right: var(--space-4);
    padding-left: var(--space-4);
  }

  .hero-section,
  .steps-list {
    grid-template-columns: 1fr;
  }

  .hero-section {
    padding-top: var(--space-8);
  }
}
</style>
