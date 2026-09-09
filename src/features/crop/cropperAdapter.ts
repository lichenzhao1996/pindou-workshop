import Cropper from 'cropperjs'
import { cropDataToState } from '../../domain/project'
import type { CropState } from '../../domain/project'

export function createCropperAdapter(
  imageElement: HTMLImageElement,
  initialCrop: CropState,
  onReady: (cropState: CropState) => void,
): Cropper {
  return new Cropper(imageElement, {
    viewMode: 1,
    dragMode: 'none',
    autoCropArea: 1,
    cropBoxMovable: false,
    cropBoxResizable: false,
    movable: false,
    rotatable: false,
    scalable: false,
    zoomable: false,
    toggleDragModeOnDblclick: false,
    data: {
      x: initialCrop.x,
      y: initialCrop.y,
      width: initialCrop.width,
      height: initialCrop.height,
      rotate: initialCrop.rotation,
      scaleX: 1,
      scaleY: 1,
    },
    ready(event) {
      onReady(cropDataToState(event.currentTarget.cropper.getData(true)))
    },
  })
}
