/**
 * Encodes a temporary export canvas and drops its backing store after encoding completes.
 * Canvas dimensions are reset only after the browser has produced the Blob.
 */
export function encodeCanvasPngAndRelease(canvas: HTMLCanvasElement, errorMessage: string) {
  return new Promise<Blob>((resolve, reject) => {
    const releaseBackingStore = () => {
      canvas.width = 0
      canvas.height = 0
    }

    try {
      canvas.toBlob((blob) => {
        releaseBackingStore()
        if (!blob) {
          reject(new Error(errorMessage))
          return
        }
        resolve(blob)
      }, 'image/png')
    } catch (error) {
      releaseBackingStore()
      reject(error)
    }
  })
}
