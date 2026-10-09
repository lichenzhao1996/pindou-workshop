import { DEFAULT_PROJECT_NAME } from './constants'
import type { Project } from './types'

export function normalizeProjectName(name: string | null | undefined): string {
  return name?.trim() || DEFAULT_PROJECT_NAME
}

/** Renames only Project metadata; an unchanged normalized name preserves identity. */
export function renameProject(
  project: Project,
  name: string | null | undefined,
  now: Date = new Date(),
): Project {
  const normalizedName = normalizeProjectName(name)
  if (normalizedName === project.projectName) return project

  return {
    ...project,
    projectName: normalizedName,
    updatedAt: now.toISOString(),
  }
}
