import { describe, expect, it } from 'vitest'
import { createExportFileNameBase } from '../../src/features/export/filename'
import { createGrid, createProject } from '../../src/domain/project'
import type { Grid, Project, Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['task070'], { type: 'image/png' }),
  originalFileName: '原图文件.png',
  mimeType: 'image/png',
  originalWidth: 1200,
  originalHeight: 800,
}

function makeProject(
  projectName: string,
  gridWidth = 64,
  gridHeight = 48,
): Project & { grid: Grid } {
  const project = createProject({
    source: { ...source },
    crop: { x: 100, y: 50, width: 600, height: 300, rotation: 0, aspectRatio: 2 },
    projectName,
    widthBeads: 64,
    now: new Date('2026-10-09T00:00:00.000Z'),
  })

  return { ...project, grid: createGrid(gridWidth, gridHeight) }
}

function createBase(project: Project & { grid: Grid }): string {
  return createExportFileNameBase({ projectName: project.projectName, grid: project.grid })
}

describe('TASK-070 export filename base', () => {
  it('creates a shared base for a normal Chinese project name', () => {
    expect(createBase(makeProject('我的猫咪'))).toBe('我的猫咪_64x48')
  })

  it('creates a shared base for a normal English project name', () => {
    expect(createBase(makeProject('My bead art'))).toBe('My bead art_64x48')
  })

  it('removes common filesystem-invalid characters', () => {
    expect(createBase(makeProject('A<B>:C"D/E\\F|G?H*I'))).toBe('ABCDEFGHI_64x48')
  })

  it('removes ASCII and C1 control characters', () => {
    expect(createBase(makeProject('猫\u0000咪\t\r\n\u007F\u0085作品'))).toBe('猫咪作品_64x48')
  })

  it('removes trailing spaces from the project name', () => {
    expect(createBase(makeProject('小猫   '))).toBe('小猫_64x48')
  })

  it('removes trailing periods from the project name', () => {
    expect(createBase(makeProject('小猫...'))).toBe('小猫_64x48')
  })

  it.each([
    ['spaces only', '   '],
    ['periods only', '...'],
    ['mixed spaces and periods', ' . . '],
    ['empty name', ''],
    ['whitespace-only after cleanup', '\u00A0... '],
  ])('falls back to the formal unnamed name for %s', (_description, projectName) => {
    expect(createBase(makeProject(projectName))).toBe('未命名作品_64x48')
  })

  it('uses the final Grid dimensions rather than source, crop, or generation dimensions', () => {
    const project = makeProject('网格', 37, 19)

    expect(project.source.originalWidth).toBe(1200)
    expect(project.source.originalHeight).toBe(800)
    expect(project.generation.widthBeads).toBe(64)
    expect(project.generation.heightBeads).toBe(32)
    expect(createBase(project)).toBe('网格_37x19')
  })

  it('does not modify Project name, Grid, revision, or timestamps', () => {
    const project = makeProject('原始名称', 37, 19)
    const grid = project.grid
    const cells = grid.cells
    const original = {
      projectName: project.projectName,
      width: grid.width,
      height: grid.height,
      revision: project.revision,
      updatedAt: project.updatedAt,
    }

    expect(createBase(project)).toBe('原始名称_37x19')
    expect(project.projectName).toBe(original.projectName)
    expect(project.grid).toBe(grid)
    expect(project.grid.cells).toBe(cells)
    expect(project.grid).toMatchObject({ width: original.width, height: original.height })
    expect(project.revision).toBe(original.revision)
    expect(project.updatedAt).toBe(original.updatedAt)
  })

  it('provides exactly the same extension-free base for PNG and PDF consumers', () => {
    const project = makeProject('格式共用')
    const base = createBase(project)
    const pngName = `${createBase(project)}.png`
    const pdfName = `${createBase(project)}.pdf`

    expect(pngName.slice(0, -'.png'.length)).toBe(base)
    expect(pdfName.slice(0, -'.pdf'.length)).toBe(base)
    expect(base).not.toMatch(/\.(png|pdf)$/i)
  })

  it('returns a deterministic result for identical input', () => {
    const project = makeProject('确定性')

    expect(createBase(project)).toBe(createBase(project))
  })
})
