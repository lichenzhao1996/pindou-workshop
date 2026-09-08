import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const port = 4173
const viteCli = resolve('node_modules/vite/bin/vite.js')
const playwrightCli = resolve('node_modules/@playwright/test/cli.js')
const preview = spawn(
  process.execPath,
  [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port)],
  {
    stdio: 'inherit',
  },
)

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const stopPreview = () => {
  if (!preview.killed) {
    preview.kill()
  }
}

try {
  let ready = false

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      ready = response.ok
      if (ready) {
        break
      }
    } catch {
      await wait(200)
    }
  }

  if (!ready) {
    throw new Error('Vite preview did not become ready for Playwright.')
  }

  const playwright = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  })

  const exitCode = await new Promise((resolve, reject) => {
    playwright.on('error', reject)
    playwright.on('exit', (code) => resolve(code ?? 1))
  })

  process.exitCode = exitCode
} finally {
  stopPreview()
}
