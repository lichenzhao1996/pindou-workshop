<template>
  <aside class="editor-sidebar" aria-label="作品信息与输出" data-testid="editor-sidebar">
    <h2>作品信息</h2>
    <section
      v-if="project?.grid && stats"
      data-testid="editor-grid"
      :data-project-id="project.projectId"
      :data-width="project.grid.width"
      :data-height="project.grid.height"
      :data-cell-count="project.grid.cells.length"
      :data-grid-encoding="project.grid.cells.constructor.name"
      :data-palette-indices="stats.usedPaletteIndices.join(',')"
      :data-revision="project.revision"
    >
      <p>{{ project.projectName }}</p>
      <p data-testid="editor-dimensions">{{ project.grid.width }} × {{ project.grid.height }} 颗</p>
      <p data-testid="editor-mode">{{ GENERATION_MODE_LABELS[project.generation.mode] }}</p>
      <p data-testid="editor-beads">
        {{ stats.totalBeads }} 颗拼豆，{{ stats.usedColorCount }} 种颜色
      </p>
      <p v-if="project.generation.mode === 'optimized'" class="editor-note">
        已完成轮廓保护、保守碎色合并与基础背景简化。
      </p>
    </section>
    <p v-else data-testid="editor-info-empty">暂无生成作品信息。</p>
    <h2>颜色与输出</h2>
    <p class="editor-note">颜色管理与导出尚未接入。</p>
    <RouterLink to="/crop">返回裁剪与生成设置</RouterLink>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { GENERATION_MODE_LABELS } from '../../../domain/generation/mode'
import { deriveProjectStats } from '../../../domain/project/stats'
import type { Project } from '../../../domain/project/types'

const props = defineProps<{ project: Project | null }>()
const stats = computed(() => (props.project?.grid ? deriveProjectStats(props.project) : null))
</script>

<style scoped>
.editor-sidebar {
  min-width: 0;
  overflow: auto;
  padding: var(--space-4);
  background: var(--color-panel-background);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
}

h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-body);
}

section + h2,
p + h2 {
  margin-top: var(--space-6);
}

p {
  margin: 0 0 var(--space-3);
  overflow-wrap: anywhere;
}

.editor-note {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-body);
}

a {
  display: inline-block;
  margin-top: var(--space-4);
  color: var(--color-action);
}
</style>
