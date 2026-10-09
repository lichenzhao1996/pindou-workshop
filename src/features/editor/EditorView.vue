<template>
  <main class="editor-shell" aria-label="生成结果" data-testid="editor-shell">
    <h1>拼豆生成结果</h1>
    <EditorToolbar :grid="project?.grid ?? null" :canvas-size="canvasSize" />
    <p v-if="!project?.grid" data-testid="editor-empty-state">
      暂无可查看的 Grid，请先完成图片生成。
    </p>
    <div class="editor-workspace">
      <aside class="editor-tools" aria-label="编辑工具" data-testid="editor-tools">
        <h2>编辑工具</h2>
        <p>选择颜色后，可使用工具栏中的画笔、橡皮擦、吸管与填充工具编辑拼豆图。</p>
        <UnifiedColorPicker
          :model-value="editor.activePaletteIndex"
          :project="project"
          @update:model-value="selectPaletteIndex"
        />
      </aside>
      <EditorCanvasArea
        :project="project"
        :grid="project?.grid ?? null"
        :project-id="project?.projectId ?? null"
        :source="project?.source ?? null"
        :crop="project?.crop ?? null"
        :replacement-preview="replacementPreview"
        @resize="canvasSize = $event"
      />
      <EditorSidebar :project="project" @replacement-preview="setReplacementPreview" />
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '../../app/stores/projectStore'
import { useEditorStore } from '../../app/stores/editorStore'
import type { CanvasSize } from '../../rendering/viewport'
import type { ReplacementPreview } from './replacement-preview'
import EditorToolbar from './components/EditorToolbar.vue'
import EditorCanvasArea from './components/EditorCanvasArea.vue'
import EditorSidebar from './components/EditorSidebar.vue'
import UnifiedColorPicker from './components/UnifiedColorPicker.vue'

const store = useProjectStore()
const editor = useEditorStore()
const router = useRouter()
const project = computed(() => store.currentProject)
const canvasSize = shallowRef<CanvasSize>({ width: 0, height: 0 })
const replacementPreview = shallowRef<ReplacementPreview | null>(null)

function setReplacementPreview(preview: ReplacementPreview | null) {
  if (!preview) {
    replacementPreview.value = null
    return
  }
  const current = store.currentProject
  replacementPreview.value =
    current?.projectId === preview.projectId && current.grid?.cells === preview.grid.cells
      ? preview
      : null
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  )
}

function handleHistoryShortcut(event: KeyboardEvent) {
  if (isTextEntryTarget(event.target) || !(event.ctrlKey || event.metaKey)) return
  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    if (event.shiftKey) store.redo()
    else store.undo()
  } else if (key === 'y' && !event.shiftKey) {
    event.preventDefault()
    store.redo()
  }
}

function selectPaletteIndex(paletteIndex: number) {
  editor.selectPaletteIndex(paletteIndex)
}

watch(
  () => project.value?.grid,
  (grid) => {
    if (!grid) {
      void router.replace({ name: project.value ? 'crop' : 'home' })
    }
  },
  { immediate: true },
)
watch(
  () => ({ projectId: project.value?.projectId, grid: project.value?.grid }),
  ({ projectId, grid }) => {
    const preview = replacementPreview.value
    if (preview && (preview.projectId !== projectId || preview.grid.cells !== grid?.cells)) {
      replacementPreview.value = null
    }
  },
  { flush: 'sync' },
)

onMounted(() => window.addEventListener('keydown', handleHistoryShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', handleHistoryShortcut))
</script>

<style scoped>
.editor-shell {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100vh;
  min-height: 480px;
  min-width: 960px;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-page-background);
  color: var(--color-text-primary);
}

h1 {
  margin: 0;
  font-size: var(--font-size-heading);
}

.editor-workspace {
  display: grid;
  grid-template-columns: 144px minmax(0, 1fr) 256px;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
}

.editor-tools {
  min-width: 0;
  padding: var(--space-4);
  overflow: auto;
  background: var(--color-panel-background);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
}

.editor-tools h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-body);
}

.editor-tools p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-body);
}

@media (max-width: 1200px) {
  .editor-workspace {
    grid-template-columns: 128px minmax(0, 1fr) 224px;
  }
}
</style>
