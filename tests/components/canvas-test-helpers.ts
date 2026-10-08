import { vi } from 'vitest'

export function createCanvasContextMock() {
  const state = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  }
  const fills: Array<{ x: number; y: number; width: number; height: number; color: string }> = []
  const strokes: Array<{ color: string; from: [number, number]; to: [number, number] }> = []
  const labels: string[] = []
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement
  let point: [number, number] = [0, 0]

  const context = {
    canvas,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      fills.push({ x, y, width, height, color: state.fillStyle })
    }),
    beginPath: vi.fn(() => {
      point = [0, 0]
    }),
    moveTo: vi.fn((x: number, y: number) => {
      point = [x, y]
    }),
    lineTo: vi.fn((x: number, y: number) => {
      strokes.push({ color: state.strokeStyle, from: point, to: [x, y] })
    }),
    stroke: vi.fn(),
    fillText: vi.fn((text: string) => labels.push(text)),
    get fillStyle() {
      return state.fillStyle
    },
    set fillStyle(value: string) {
      state.fillStyle = value
    },
    get strokeStyle() {
      return state.strokeStyle
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value
    },
    get lineWidth() {
      return state.lineWidth
    },
    set lineWidth(value: number) {
      state.lineWidth = value
    },
    get font() {
      return state.font
    },
    set font(value: string) {
      state.font = value
    },
    get textAlign() {
      return state.textAlign
    },
    set textAlign(value: string) {
      state.textAlign = value
    },
    get textBaseline() {
      return state.textBaseline
    },
    set textBaseline(value: string) {
      state.textBaseline = value
    },
  } as unknown as CanvasRenderingContext2D

  return { context, fills, strokes, labels }
}

export function installCanvasContext(mock: ReturnType<typeof createCanvasContextMock>) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    Object.defineProperty(mock.context, 'canvas', { configurable: true, value: this })
    return mock.context
  })
}

export function installCanvasLayout(width = 320, height = 240, dpr = 1) {
  const size = { width, height }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        width: size.width,
        height: size.height,
        top: 0,
        right: size.width,
        bottom: size.height,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  )
  vi.stubGlobal('devicePixelRatio', dpr)

  return {
    setSize(nextWidth: number, nextHeight: number, nextDpr = dpr) {
      size.width = nextWidth
      size.height = nextHeight
      vi.stubGlobal('devicePixelRatio', nextDpr)
    },
  }
}

export function installAnimationFrames() {
  const frames: Array<(timestamp: number) => void> = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback)
    return frames.length
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

  return {
    flush() {
      let frame = frames.shift()
      while (frame) {
        frame(0)
        frame = frames.shift()
      }
    },
    get count() {
      return frames.length
    },
  }
}

export function installResizeObserver() {
  const observers: Array<{
    callback: ResizeObserverCallback
    disconnected: boolean
    trigger: () => void
  }> = []
  class MockResizeObserver {
    disconnected = false
    target: Element | null = null

    constructor(readonly callback: ResizeObserverCallback) {
      observers.push(this as (typeof observers)[number])
    }

    observe(target: Element) {
      this.target = target
      this.trigger()
    }

    unobserve() {}

    disconnect() {
      this.disconnected = true
    }

    trigger() {
      if (this.target) {
        this.callback(
          [{ target: this.target } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        )
      }
    }
  }

  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  return observers
}

export function pointerEvent(
  type: string,
  options: {
    pointerId: number
    button: number
    clientX: number
    clientY: number
  },
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  for (const [key, value] of Object.entries(options)) {
    Object.defineProperty(event, key, { value })
  }
  return event
}
