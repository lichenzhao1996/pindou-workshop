import { MARD_291_PALETTE_VERSION } from '../../domain/palette/version'
import { createGrid, type Grid } from '../../domain/project/grid'
import { deriveProjectStats } from '../../domain/project/stats'
import type { Project } from '../../domain/project/types'
import type { ProjectStats } from '../../domain/project/stats'
import { createExportFileNameBase } from './filename'

export type ExportOptionValue = string | number | boolean | null
export type ExportOptions = Readonly<Record<string, ExportOptionValue>>

export interface ExportProjectMetadata {
  readonly schemaVersion: Project['schemaVersion']
  readonly projectVersion: Project['projectVersion']
  readonly projectId: Project['projectId']
  readonly projectName: Project['projectName']
  readonly createdAt: Project['createdAt']
  readonly updatedAt: Project['updatedAt']
  readonly revision: Project['revision']
  readonly crop: Readonly<Project['crop']>
  readonly generation: Readonly<Project['generation']>
}

export interface ExportPaletteSnapshot {
  readonly paletteVersion: string
}

export interface ExportSnapshot {
  readonly project: ExportProjectMetadata
  /** Each access returns an isolated copy so consumers cannot mutate snapshot state. */
  readonly grid: Grid
  readonly palette: ExportPaletteSnapshot
  /** Derived once from the private copied Grid; returned as a defensive copy. */
  readonly stats: ProjectStats
  readonly exportOptions: ExportOptions
  readonly fileNameBase: string
}

function cloneStats(stats: ProjectStats): ProjectStats {
  return {
    ...stats,
    usageByPaletteIndex: stats.usageByPaletteIndex.slice(),
    usedPaletteIndices: [...stats.usedPaletteIndices],
  }
}

function copyExportOptions(options: ExportOptions): ExportOptions {
  const copy: Record<string, ExportOptionValue> = {}
  for (const [key, value] of Object.entries(options)) {
    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new TypeError(`Export option ${key} must be a primitive value`)
    }
    copy[key] = value
  }
  return Object.freeze(copy)
}

/** Captures one immutable-by-copy Project/Grid/Stats input shared by export formats. */
export function createExportSnapshot(
  project: Project,
  exportOptions: ExportOptions = {},
): ExportSnapshot {
  const sourceGrid = project.grid
  if (!sourceGrid) throw new RangeError('Export requires a Project with a Grid')
  if (!(sourceGrid.cells instanceof Uint16Array)) {
    throw new RangeError('Export Grid cells must be a Uint16Array')
  }

  const copiedGrid = createGrid(sourceGrid.width, sourceGrid.height)
  if (sourceGrid.cells.length !== copiedGrid.cells.length) {
    throw new RangeError('Export Grid cells length does not match its dimensions')
  }
  copiedGrid.cells.set(sourceGrid.cells)

  const projectForStats: Project = { ...project, grid: copiedGrid }
  const stats = deriveProjectStats(projectForStats)
  const metadata: ExportProjectMetadata = Object.freeze({
    schemaVersion: project.schemaVersion,
    projectVersion: project.projectVersion,
    projectId: project.projectId,
    projectName: project.projectName,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    revision: project.revision,
    crop: Object.freeze({ ...project.crop }),
    generation: Object.freeze({ ...project.generation }),
  })
  const palette = Object.freeze({ paletteVersion: project.generation.paletteVersion })
  const immutableOptions = copyExportOptions(exportOptions)
  const fileNameBase = createExportFileNameBase({
    projectName: metadata.projectName,
    grid: copiedGrid,
  })

  return Object.freeze({
    project: metadata,
    get grid() {
      return { ...copiedGrid, cells: copiedGrid.cells.slice() }
    },
    palette,
    get stats() {
      return cloneStats(stats)
    },
    exportOptions: immutableOptions,
    fileNameBase,
  })
}

/** The effect PNG renderer can only draw the one formal palette version bundled by this build. */
export function assertSupportedExportPalette(snapshot: ExportSnapshot): void {
  if (snapshot.palette.paletteVersion !== MARD_291_PALETTE_VERSION) {
    throw new RangeError('Export snapshot uses an unsupported MARD Palette version')
  }
}
