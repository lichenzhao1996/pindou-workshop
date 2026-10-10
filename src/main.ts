import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './app/routes'
import './styles/globals.css'
import {
  initializeSessionRecovery,
  resolveInitialSessionRoute,
  resumeDeferredGenerationIntent,
  sessionRecoveryState,
} from './app/session-recovery'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
await initializeSessionRecovery(pinia)
app.use(router)
await router.isReady()

if (sessionRecoveryState.status === 'ready') {
  const initialPath = router.currentRoute.value.path
  const targetPath = resolveInitialSessionRoute(initialPath, sessionRecoveryState.session)
  if (targetPath !== initialPath) await router.replace(targetPath)
}

app.mount('#app')

if (
  sessionRecoveryState.status === 'ready' &&
  sessionRecoveryState.session?.generationIntent &&
  !sessionRecoveryState.session.pendingUpload &&
  !sessionRecoveryState.session.generationIntent.autoRecoveryAttempted
) {
  void resumeDeferredGenerationIntent(() => router.replace({ name: 'editor' }))
}
