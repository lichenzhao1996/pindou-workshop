import { vi } from 'vitest'

export function createCanvasContextMock() {
  const state = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  }
  const fills: Array<{ x: number; y: number; width: number; height: number; color: string }> = []
  const fillAlphas: number[] = []
  const strokes: Array<{ color: string; from: [number, number]; to: [number, number] }> = []
  const labels: string[] = []
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement
  const alphaStack: number[] = []
  let point: [number, number] = [0, 0]

  const context = {
    canvas,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(() => alphaStack.push(state.globalAlpha)),
    restore: vi.fn(() => {
      state.globalAlpha = alphaStack.pop() ?? 1
    }),
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      fills.push({ x, y, width, height, color: state.fillStyle })
      fillAlphas.push(state.globalAlpha)
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
    drawImage: vi.fn(),
    fillText: vi.fn((text: string) => labels.push(text)),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
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
    get globalAlpha() {
      return state.globalAlpha
    },
    set globalAlpha(value: number) {
      state.globalAlpha = value
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

  return { context, fills, fillAlphas, strokes, labels }
}

export function installCanvasContext(mock: ReturnType<typeof createCanvasContextMock>) {
  const auxiliaryFills: Array<{ canvas: HTMLCanvasElement; color: string; alpha: number }> = []
  const auxiliaryContexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    if ((this as HTMLCanvasElement).dataset.testid !== 'editor-canvas') {
      const element = this as HTMLCanvasElement
      let context = auxiliaryContexts.get(element)
      if (!context) {
        const state = { fillStyle: '', globalAlpha: 1 }
        const alphaStack: number[] = []
        context = {
          canvas: element,
          setTransform: vi.fn(),
          clearRect: vi.fn(),
          save: vi.fn(() => alphaStack.push(state.globalAlpha)),
          restore: vi.fn(() => {
            state.globalAlpha = alphaStack.pop() ?? 1
          }),
          fillRect: vi.fn(() => {
            auxiliaryFills.push({
              canvas: element,
              color: state.fillStyle,
              alpha: state.globalAlpha,
            })
          }),
          drawImage: vi.fn(),
          getImageData(_x: number, _y: number, width: number, height: number) {
            return { data: new Uint8ClampedArray(width * height * 4) }
          },
          createImageData(width: number, height: number) {
            return { width, height, data: new Uint8ClampedArray(width * height * 4) }
          },
          putImageData: vi.fn(),
          get fillStyle() {
            return state.fillStyle
          },
          set fillStyle(value: string) {
            state.fillStyle = value
          },
          get globalAlpha() {
            return state.globalAlpha
          },
          set globalAlpha(value: number) {
            state.globalAlpha = value
          },
        } as unknown as CanvasRenderingContext2D
        auxiliaryContexts.set(element, context)
      }
      return context
    }
    Object.defineProperty(mock.context, 'canvas', { configurable: true, value: this })
    return mock.context
  })
  return { auxiliaryFills }
}

export function installCanvasLayout(width = 320, height = 240, dpr = 1, left = 0, top = 0) {
  const size = { width, height, left, top }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        width: size.width,
        height: size.height,
        top: size.top,
        right: size.left + size.width,
        bottom: size.top + size.height,
        left: size.left,
        x: size.left,
        y: size.top,
        toJSON: () => ({}),
      }) as DOMRect,
  )
  vi.stubGlobal('devicePixelRatio', dpr)

  return {
    setSize(
      nextWidth: number,
      nextHeight: number,
      nextDpr = dpr,
      nextLeft = size.left,
      nextTop = size.top,
    ) {
      size.width = nextWidth
      size.height = nextHeight
      size.left = nextLeft
      size.top = nextTop
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
