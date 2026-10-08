import { rasterizeCrop, type RgbaImage } from '../domain/generation/rasterize'
import type { CropState, Source } from '../domain/project/types'

export interface SourcePreviewInput {
  readonly projectId: string | null
  readonly source: Source | null
  readonly crop: CropState | null
}

export type SourceCropRasterizer = (source: Source, crop: CropState) => Promise<RgbaImage>
export type SourcePreviewCanvasFactory = (image: RgbaImage) => HTMLCanvasElement

interface CacheEntry {
  readonly projectId: string
  readonly sourceImage: Blob
  readonly sourceWidth: number
  readonly sourceHeight: number
  readonly mimeType: string
  readonly crop: CropState
  readonly promise: Promise<HTMLCanvasElement | null>
  canvas: HTMLCanvasElement | null
}

function cropsMatch(left: CropState, right: CropState): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.rotation === right.rotation &&
    left.aspectRatio === right.aspectRatio
  )
}

function defaultCreateCanvas(image: RgbaImage): HTMLCanvasElement {
  if (typeof document === 'undefined') throw new Error('当前环境不支持原图预览')
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境无法创建原图预览')
  const imageData = context.createImageData(image.width, image.height)
  imageData.data.set(image.data)
  context.putImageData(imageData, 0, 0)
  return canvas
}

/** Caches only the current formal Project's cropped source preview. */
export class SourcePreviewCache {
  private entry: CacheEntry | null = null
  private generation = 0

  constructor(
    private readonly rasterize: SourceCropRasterizer = (source, crop) =>
      rasterizeCrop({ originalImage: source.originalImage, crop }),
    private readonly createCanvas: SourcePreviewCanvasFactory = defaultCreateCanvas,
  ) {}

  get(input: SourcePreviewInput): Promise<HTMLCanvasElement | null> {
    const { projectId, source, crop } = input
    if (!projectId || !source || !crop) {
      this.invalidate()
      return Promise.resolve(null)
    }

    const current = this.entry
    if (
      current &&
      current.projectId === projectId &&
      current.sourceImage === source.originalImage &&
      current.sourceWidth === source.originalWidth &&
      current.sourceHeight === source.originalHeight &&
      current.mimeType === source.mimeType &&
      cropsMatch(current.crop, crop)
    ) {
      return current.promise
    }

    this.invalidate()
    const generation = this.generation
    const pendingEntry: { value: CacheEntry | null } = { value: null }
    const promise = this.rasterize(source, crop)
      .then((image) => this.createCanvas(image))
      .then((canvas) => {
        if (this.entry !== pendingEntry.value || this.generation !== generation) {
          this.release(canvas)
          return null
        }
        pendingEntry.value!.canvas = canvas
        return canvas
      })
      .catch((error: unknown) => {
        if (this.entry === pendingEntry.value) this.entry = null
        throw error
      })
    const entry: CacheEntry = {
      projectId,
      sourceImage: source.originalImage,
      sourceWidth: source.originalWidth,
      sourceHeight: source.originalHeight,
      mimeType: source.mimeType,
      crop: { ...crop },
      canvas: null,
      promise,
    }
    pendingEntry.value = entry
    this.entry = entry
    return promise
  }

  invalidate() {
    this.generation += 1
    if (this.entry?.canvas) this.release(this.entry.canvas)
    this.entry = null
  }

  private release(canvas: HTMLCanvasElement) {
    canvas.width = 0
    canvas.height = 0
  }
}
