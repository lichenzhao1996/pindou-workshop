import { restoreProjectSnapshot, serializeProjectSnapshot } from './serialization'
import type { ProjectSnapshot } from './serialization'

export type HistorySnapshot = ProjectSnapshot

/** Returns a detached snapshot suitable for a future history entry. */
export function cloneProjectSnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return serializeProjectSnapshot(restoreProjectSnapshot(snapshot))
}
