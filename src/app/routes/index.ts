import { createRouter, createWebHistory } from 'vue-router'
import CropView from '../../features/crop/CropView.vue'
import EditorView from '../../features/editor/EditorView.vue'
import HomeView from '../../features/home/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/crop',
      name: 'crop',
      component: CropView,
    },
    {
      path: '/editor',
      name: 'editor',
      component: EditorView,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'home' },
    },
  ],
})

export default router
