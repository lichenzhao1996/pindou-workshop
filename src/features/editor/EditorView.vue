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
        <p>当前支持画布查看、格子定位与平移；改色工具将在后续任务接入。</p>
      </aside>
      <EditorCanvasArea
        :grid="project?.grid ?? null"
        :project-id="project?.projectId ?? null"
        :source="project?.source ?? null"
        :crop="project?.crop ?? null"
        @resize="canvasSize = $event"
      />
      <EditorSidebar :project="project" />
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '../../app/stores/projectStore'
import type { CanvasSize } from '../../rendering/viewport'
import EditorToolbar from './components/EditorToolbar.vue'
import EditorCanvasArea from './components/EditorCanvasArea.vue'
import EditorSidebar from './components/EditorSidebar.vue'

const store = useProjectStore()
const router = useRouter()
const project = computed(() => store.currentProject)
const canvasSize = shallowRef<CanvasSize>({ width: 0, height: 0 })

watch(
  () => project.value?.grid,
  (grid) => {
    if (!grid) {
      void router.replace({ name: project.value ? 'crop' : 'home' })
    }
  },
  { immediate: true },
)
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
