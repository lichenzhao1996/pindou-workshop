import { restoreProjectSnapshot, serializeProjectSnapshot } from './serialization'
import type { ProjectSnapshot } from './serialization'
import type { GridOperation } from './operations'
import type { Project } from './types'

export type HistorySnapshot = ProjectSnapshot

export const MAX_GRID_HISTORY_ENTRIES = 50

/** A detached, in-memory Project snapshot used only by the Undo/Redo runtime. */
export interface GridHistoryProjectSnapshot extends Project {
  grid: NonNullable<Project['grid']>
}

export interface GridHistoryEntry {
  readonly projectId: string
  readonly operation: GridOperation
  readonly createdAt: string
  readonly beforeProject: GridHistoryProjectSnapshot
  readonly afterProject: GridHistoryProjectSnapshot
}

function cloneGridProject(project: Project): GridHistoryProjectSnapshot {
  if (!project.grid) throw new RangeError('Grid history requires a Project with a Grid')
  return {
    ...project,
    source: { ...project.source },
    crop: { ...project.crop },
    generation: { ...project.generation },
    grid: { ...project.grid, cells: project.grid.cells.slice() },
  }
}

function cloneOperation(operation: GridOperation): GridOperation {
  return operation.type === 'setCell'
    ? { ...operation }
    : { type: 'setCells', changes: operation.changes.map((change) => ({ ...change })) }
}

/** Captures detached before/after Project snapshots for one committed user operation. */
export function createGridHistoryEntry(
  beforeProject: Project,
  afterProject: Project,
  operation: GridOperation,
  now: Date = new Date(),
): GridHistoryEntry {
  if (beforeProject.projectId !== afterProject.projectId) {
    throw new RangeError('A Grid history entry cannot cross Project identity')
  }
  return {
    projectId: beforeProject.projectId,
    operation: cloneOperation(operation),
    createdAt: now.toISOString(),
    beforeProject: cloneGridProject(beforeProject),
    afterProject: cloneGridProject(afterProject),
  }
}

/** Restores only Grid and revision; current Project metadata remains authoritative. */
export function restoreGridHistorySnapshot(
  currentProject: Project,
  snapshot: GridHistoryProjectSnapshot,
  now: Date = new Date(),
): Project {
  if (currentProject.projectId !== snapshot.projectId || !snapshot.grid) {
    throw new RangeError('Grid history snapshot does not match the current Project')
  }
  return {
    ...currentProject,
    grid: { ...snapshot.grid, cells: snapshot.grid.cells.slice() },
    revision: snapshot.revision,
    updatedAt: now.toISOString(),
  }
}

/** Returns a detached snapshot suitable for a future history entry. */
export function cloneProjectSnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return serializeProjectSnapshot(restoreProjectSnapshot(snapshot))
}
