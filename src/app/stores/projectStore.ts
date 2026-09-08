import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { Project } from '../../domain/project'

/**
 * Holds the one cross-page current Project reference.
 *
 * Component-only UI state, Grid data, generation rules and persistence actions
 * do not belong here yet. The shallow ref preserves the future boundary where
 * an immutable Project/Grid snapshot can be replaced without deep-proxying a
 * Uint16Array.
 */
export const useProjectStore = defineStore('project', () => {
  const currentProject = shallowRef<Project | null>(null)

  function setCurrentProject(project: Project | null) {
    currentProject.value = project
  }

  function clearCurrentProject() {
    currentProject.value = null
  }

  return {
    currentProject,
    setCurrentProject,
    clearCurrentProject,
  }
})
