import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const port = 4173
const viteCli = resolve('node_modules/vite/bin/vite.js')
const preview = spawn(
  process.execPath,
  [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port)],
  {
    stdio: 'ignore',
  },
)

const stopPreview = () => {
  if (!preview.killed) {
    preview.kill()
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

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

    const html = await response.text()
    if (!html.includes('<div id="app"></div>')) {
      throw new Error(
        `Vite preview response does not contain the application mount node for ${route}.`,
      )
    }
  }

  console.log('Smoke check passed for the application and route paths.')
} finally {
  stopPreview()
}
