<template>
  <main class="generation-result" aria-label="生成结果">
    <template v-if="project?.grid && stats">
      <h1>拼豆生成结果</h1>
      <section
        data-testid="editor-grid"
        :data-project-id="project.projectId"
        :data-width="project.grid.width"
        :data-height="project.grid.height"
        :data-cell-count="project.grid.cells.length"
        :data-grid-encoding="project.grid.cells.constructor.name"
        :data-palette-indices="stats.usedPaletteIndices.join(',')"
        :data-revision="project.revision"
      >
        <p data-testid="editor-dimensions">
          {{ project.grid.width }} × {{ project.grid.height }} 颗
        </p>
        <p data-testid="editor-mode">{{ GENERATION_MODE_LABELS[project.generation.mode] }}</p>
        <p data-testid="editor-beads">
          {{ stats.totalBeads }} 颗拼豆，{{ stats.usedColorCount }} 种颜色
        </p>
        <p v-if="project.generation.mode === 'optimized'">
          已完成轮廓保护、保守碎色合并与基础背景简化。
        </p>
      </section>
      <RouterLink to="/crop">返回裁剪与生成设置</RouterLink>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useProjectStore } from '../../app/stores/projectStore'
import { GENERATION_MODE_LABELS } from '../../domain/generation/mode'
import { deriveProjectStats } from '../../domain/project/stats'

const store = useProjectStore()
const router = useRouter()
const project = computed(() => store.currentProject)
const stats = computed(() => (project.value?.grid ? deriveProjectStats(project.value) : null))

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
.generation-result {
  min-height: 100vh;
  padding: var(--space-6);
  background: var(--color-page-background);
  color: var(--color-text-primary);
}
</style>
