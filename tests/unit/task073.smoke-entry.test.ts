import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error The helper is exported from the standalone Node ESM smoke script.
import { validateBuiltEntrypoint } from '../../scripts/smoke.mjs'

const temporaryDirectories: string[] = []

async function createOutputDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'pindou-task073-smoke-'))
  temporaryDirectories.push(directory)
  return directory
}

function builtHtml(script = '/assets/index-a1b2c3.js') {
  return `<!doctype html><html><body><div id="app"><main>正在恢复当前作品…</main></div><script type="module" crossorigin src="${script}"></script></body></html>`
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('TASK-073 built smoke entry validation', () => {
  it('accepts a unique mount node and a present hashed module asset', async () => {
    const directory = await createOutputDirectory()
    await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, 'assets', 'index-a1b2c3.js'), 'console.log("entry")')

    await expect(validateBuiltEntrypoint(builtHtml(), directory)).resolves.toEqual({
      pathname: '/assets/index-a1b2c3.js',
    })
  })

  it('rejects built HTML with no module entry script', async () => {
    const directory = await createOutputDirectory()

    await expect(validateBuiltEntrypoint('<div id="app"></div>', directory)).rejects.toThrow(
      'exactly one module entry script',
    )
  })

  it('rejects an entry script whose local JavaScript asset is missing', async () => {
    const directory = await createOutputDirectory()

    await expect(validateBuiltEntrypoint(builtHtml(), directory)).rejects.toThrow(
      'Built module entry asset does not exist',
    )
  })

  it('rejects an empty entry asset', async () => {
    const directory = await createOutputDirectory()
    await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, 'assets', 'index-a1b2c3.js'), '')

    await expect(validateBuiltEntrypoint(builtHtml(), directory)).rejects.toThrow(
      'Built module entry asset is empty',
    )
  })

  it('rejects duplicate or non-div application mount nodes', async () => {
    const directory = await createOutputDirectory()

    await expect(
      validateBuiltEntrypoint(
        '<div id="app"></div><div id="app"></div><script type="module" src="/app.js"></script>',
        directory,
      ),
    ).rejects.toThrow('exactly one div#app')
  })
})
