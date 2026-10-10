<template>
  <div class="app-shell">
    <RouterView />
    <PersistenceNotice />
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import PersistenceNotice from './app/components/PersistenceNotice.vue'
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: var(--color-page-background);
  color: var(--color-text-primary);
}
</style>
