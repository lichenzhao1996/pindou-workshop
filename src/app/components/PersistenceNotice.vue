<template>
  <aside
    v-if="status.isDirty || status.isSaving || status.errorMessage"
    class="persistence-notice"
    :class="{ 'has-error': status.errorMessage }"
    :role="status.errorMessage ? 'alert' : 'status'"
    aria-live="polite"
    data-testid="persistence-notice"
  >
    <span v-if="status.errorMessage">{{ status.errorMessage }}</span>
    <span v-else-if="status.isSaving">正在保存作品…</span>
    <span v-else>有更改尚未保存。</span>
    <button v-if="status.errorMessage" type="button" @click="retryAutoSave">重试保存</button>
  </aside>
</template>

<script setup lang="ts">
import { autoSaveStatus, retryAutoSave } from '../../storage/auto-save-coordinator'

const status = autoSaveStatus
</script>

<style scoped>
.persistence-notice {
  position: fixed;
  z-index: 1000;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(640px, calc(100vw - 32px));
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-panel-background);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-md);
  font-size: var(--font-size-sm);
}

.persistence-notice.has-error {
  border-color: var(--color-danger);
}

.persistence-notice button {
  flex: 0 0 auto;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--color-action);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}
</style>
