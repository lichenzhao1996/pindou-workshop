<template>
  <main class="recovery-page" aria-labelledby="recovery-title">
    <section class="recovery-card">
      <p class="eyebrow">本地作品恢复</p>
      <h1 id="recovery-title">暂时无法恢复当前作品</h1>
      <p class="recovery-message" role="alert">{{ recovery.errorMessage }}</p>
      <p class="recovery-help">原本地记录未被自动删除。你可以重试读取，或明确确认放弃本地会话。</p>
      <div class="recovery-actions">
        <button type="button" :disabled="recovery.status === 'loading'" @click="retry">
          {{ recovery.status === 'loading' ? '正在重试…' : '重试恢复' }}
        </button>
        <button type="button" class="secondary" @click="confirmingDiscard = true">
          放弃本地会话
        </button>
      </div>

      <section
        v-if="confirmingDiscard"
        class="discard-confirmation"
        role="alertdialog"
        aria-labelledby="discard-title"
        aria-describedby="discard-warning"
      >
        <h2 id="discard-title">确认删除本地作品？</h2>
        <p id="discard-warning">
          此操作会清除当前浏览器保存的本地作品，可能导致作品永久丢失。只有清除成功后才会返回首页。
        </p>
        <div class="recovery-actions">
          <button type="button" :disabled="recovery.discarding" @click="discard">
            {{ recovery.discarding ? '正在清除…' : '确认放弃并清除' }}
          </button>
          <button type="button" class="secondary" @click="confirmingDiscard = false">
            保留作品
          </button>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  discardLocalSession,
  resolveInitialSessionRoute,
  retrySessionRecovery,
  sessionRecoveryState as recovery,
} from '../session-recovery'

const router = useRouter()
const confirmingDiscard = ref(false)

async function retry() {
  const restored = await retrySessionRecovery()
  if (restored) {
    await router.replace(resolveInitialSessionRoute(window.location.pathname, recovery.session))
  }
}

async function discard() {
  if (await discardLocalSession()) {
    confirmingDiscard.value = false
    await router.replace({ name: 'home' })
  }
}
</script>

<style scoped>
.recovery-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  background: var(--color-page-background);
  color: var(--color-text-primary);
}

.recovery-card {
  width: min(560px, 100%);
  padding: 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-panel-background);
  box-shadow: var(--shadow-md);
}

.eyebrow {
  color: var(--color-action);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

h1 {
  margin-top: 8px;
  font-size: var(--font-size-heading);
}

.recovery-message,
.recovery-help {
  margin-top: 16px;
  line-height: 1.6;
}

.recovery-message {
  color: var(--color-danger);
}

.recovery-help {
  color: var(--color-text-secondary);
}

.recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}

button {
  padding: 9px 14px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--color-action);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

button.secondary {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-primary);
}

.discard-confirmation {
  margin-top: 24px;
  padding: 18px;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
}

.discard-confirmation h2 {
  font-size: var(--font-size-body);
}

.discard-confirmation p {
  margin-top: 8px;
  line-height: 1.6;
}
</style>
