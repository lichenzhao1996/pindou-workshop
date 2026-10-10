import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const port = 4173
const viteCli = resolve('node_modules/vite/bin/vite.js')

function readAttribute(tag, name) {
  const match = tag.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  )
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

export async function validateBuiltEntrypoint(html, distDirectory) {
  if (!html.trim()) throw new Error('Vite build HTML is missing or empty.')

  const tags = [...html.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)]
  const appNodes = tags.filter((match) => readAttribute(match[0], 'id') === 'app')
  if (appNodes.length !== 1 || appNodes[0]?.[1].toLowerCase() !== 'div') {
    throw new Error('Built HTML must contain exactly one div#app mount node.')
  }

  const moduleScripts = [...html.matchAll(/<script\b[^>]*>/gi)].filter(
    (match) => readAttribute(match[0], 'type')?.toLowerCase() === 'module',
  )
  if (moduleScripts.length !== 1) {
    throw new Error('Built HTML must contain exactly one module entry script.')
  }

  const source = readAttribute(moduleScripts[0][0], 'src')
  if (!source) throw new Error('Built module entry script is missing its src attribute.')

  let entryUrl
  try {
    entryUrl = new URL(source, `http://127.0.0.1:${port}/`)
  } catch {
    throw new Error('Built module entry script has an invalid src URL.')
  }
  if (
    entryUrl.origin !== `http://127.0.0.1:${port}` ||
    !entryUrl.pathname.toLowerCase().endsWith('.js')
  ) {
    throw new Error('Built module entry must reference a local JavaScript asset.')
  }

  let relativeAssetPath
  try {
    relativeAssetPath = decodeURIComponent(entryUrl.pathname.replace(/^\/+/, ''))
  } catch {
    throw new Error('Built module entry path is not valid URL encoding.')
  }
  const outputRoot = resolve(distDirectory)
  const assetPath = resolve(outputRoot, relativeAssetPath)
  const assetRelativePath = relative(outputRoot, assetPath)
  if (
    !assetRelativePath ||
    assetRelativePath === '..' ||
    assetRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(assetRelativePath)
  ) {
    throw new Error('Built module entry must resolve inside the Vite output directory.')
  }

  let assetStat
  try {
    assetStat = await stat(assetPath)
  } catch {
    throw new Error(`Built module entry asset does not exist: ${entryUrl.pathname}`)
  }
  if (!assetStat.isFile() || assetStat.size === 0) {
    throw new Error(`Built module entry asset is empty or not a file: ${entryUrl.pathname}`)
  }

  return { pathname: `${entryUrl.pathname}${entryUrl.search}` }
}

async function runSmoke() {
  const distDirectory = resolve('dist')
  let html
  try {
    html = await readFile(resolve(distDirectory, 'index.html'), 'utf8')
  } catch {
    throw new Error('Vite build HTML is missing: dist/index.html.')
  }
  const entry = await validateBuiltEntrypoint(html, distDirectory)
  const preview = spawn(
    process.execPath,
    [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port)],
    { stdio: 'ignore' },
  )
  const stopPreview = () => {
    if (!preview.killed) preview.kill()
  }
  const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))

  try {
    for (const route of ['/', '/crop', '/editor', '/unknown-route']) {
      let response

      for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
          response = await fetch(`http://127.0.0.1:${port}${route}`)
          break
        } catch {
          await wait(200)
        }
      }

      if (!response || !response.ok) {
        throw new Error(`Vite preview did not return a successful response for ${route}.`)
      }

      const routeHtml = await response.text()
      if (!routeHtml.trim()) throw new Error(`Vite preview returned empty HTML for ${route}.`)
      const tags = [...routeHtml.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)]
      const appNodes = tags.filter((match) => readAttribute(match[0], 'id') === 'app')
      if (appNodes.length !== 1 || appNodes[0]?.[1].toLowerCase() !== 'div') {
        throw new Error(`Vite preview response does not contain a unique div#app for ${route}.`)
      }
    }

    const entryResponse = await fetch(`http://127.0.0.1:${port}${entry.pathname}`)
    if (!entryResponse.ok) {
      throw new Error(`Vite preview could not serve the module entry ${entry.pathname}.`)
    }
    const entryBody = await entryResponse.arrayBuffer()
    if (entryBody.byteLength === 0) {
      throw new Error(`Vite preview returned an empty module entry ${entry.pathname}.`)
    }

    console.log('Smoke check passed for the built entry, mount node, and application routes.')
  } finally {
    stopPreview()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runSmoke()
}
