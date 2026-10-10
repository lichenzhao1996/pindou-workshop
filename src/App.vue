<template>
  <div class="app-shell">
    <main v-if="recovery.status === 'loading'" class="recovery-loading" role="status">
      正在恢复当前作品…
    </main>
    <SessionRecoveryPanel v-else-if="recovery.status === 'error'" />
    <template v-else>
      <RouterView />
      <PersistenceNotice />
      <p v-if="recovery.generationError" class="generation-recovery-error" role="alert">
        {{ recovery.generationError }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import PersistenceNotice from './app/components/PersistenceNotice.vue'
import SessionRecoveryPanel from './app/components/SessionRecoveryPanel.vue'
import { sessionRecoveryState as recovery } from './app/session-recovery'
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: var(--color-page-background);
  color: var(--color-text-primary);
}

.recovery-loading {
  display: grid;
  min-height: 100vh;
  place-items: center;
  color: var(--color-text-secondary);
}

.generation-recovery-error {
  position: fixed;
  z-index: 1000;
  right: 16px;
  bottom: 16px;
  max-width: min(640px, calc(100vw - 32px));
  padding: 10px 14px;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  background: var(--color-panel-background);
  color: var(--color-text-primary);
}
</style>
