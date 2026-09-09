import type { GenerationMode, Project } from '../project/types'

export const GENERATION_MODES = ['optimized', 'high-fidelity'] as const
export const DEFAULT_GENERATION_MODE: GenerationMode = 'optimized'

export const GENERATION_MODE_LABELS: Readonly<Record<GenerationMode, string>> = {
  optimized: '拼豆优化',
  'high-fidelity': '高清还原',
}

export function isGenerationMode(value: unknown): value is GenerationMode {
  return GENERATION_MODES.includes(value as GenerationMode)
}

export function assertValidGenerationMode(value: unknown): asserts value is GenerationMode {
  if (!isGenerationMode(value)) {
    throw new RangeError('generation mode must be optimized or high-fidelity')
  }
}

/** Updates the persisted mode without changing the Grid-edit revision. */
export function updateProjectGenerationMode(
  project: Project,
  mode: GenerationMode,
  now: Date = new Date(),
): Project {
  assertValidGenerationMode(mode)
  if (project.generation.mode === mode) {
    return project
  }

  return {
    ...project,
    updatedAt: now.toISOString(),
    generation: {
      ...project.generation,
      mode,
    },
    grid: null,
  }
}
