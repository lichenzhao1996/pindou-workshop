import { DEFAULT_PROJECT_NAME } from '../../domain/project/constants'
import type { Grid } from '../../domain/project/grid'

export interface ExportFileNameInput {
  projectName: string
  grid: Pick<Grid, 'width' | 'height'>
}

const INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*]/
const TRAILING_SPACES_AND_PERIODS = /[ .]+$/

function isValidFileNameCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0)
  const isControlCharacter =
    codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))

  return !isControlCharacter && !INVALID_FILE_NAME_CHARACTERS.test(character)
}

function cleanProjectName(projectName: string): string {
  return Array.from(projectName)
    .filter(isValidFileNameCharacter)
    .join('')
    .replace(TRAILING_SPACES_AND_PERIODS, '')
}

/** Creates the shared PNG/PDF filename base from the Project name and final Grid dimensions. */
export function createExportFileNameBase({ projectName, grid }: ExportFileNameInput): string {
  const cleanedName = cleanProjectName(projectName)
  const safeName = cleanedName.trim().length > 0 ? cleanedName : DEFAULT_PROJECT_NAME

  return `${safeName}_${grid.width}x${grid.height}`
}
