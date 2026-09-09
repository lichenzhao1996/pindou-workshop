import Cropper from 'cropperjs'
import { cropDataToState, cropStateToData } from '../../domain/project'
import type { CropImageBounds, CropState } from '../../domain/project'

const CROP_ZOOM_STEP = 0.1
const CROP_ROTATION_STEP = 90

export function createCropperAdapter(
  imageElement: HTMLImageElement,
  initialCrop: CropState,
  onCropStateChange: (cropState: CropState) => void,
  sourceBounds: CropImageBounds,
): Cropper {
  const emitCropState = (data: Cropper.Data) => {
    onCropStateChange(cropDataToState(data, sourceBounds))
  }

  return new Cropper(imageElement, {
    viewMode: 1,
    dragMode: 'none',
    autoCropArea: 1,
    cropBoxMovable: true,
    cropBoxResizable: true,
    movable: false,
    scalable: false,
    zoomable: true,
    zoomOnWheel: true,
    toggleDragModeOnDblclick: false,
    rotatable: true,
    data: cropStateToData(initialCrop, sourceBounds),
    ready(event) {
      emitCropState(event.currentTarget.cropper.getData())
    },
    crop(event) {
      emitCropState(event.detail)
    },
  })
}

export function zoomCropperIn(cropper: Cropper): void {
  cropper.zoom(CROP_ZOOM_STEP)
}

export function zoomCropperOut(cropper: Cropper): void {
  cropper.zoom(-CROP_ZOOM_STEP)
}

export function rotateCropperLeft(cropper: Cropper): void {
  cropper.rotate(-CROP_ROTATION_STEP)
}

export function rotateCropperRight(cropper: Cropper): void {
  cropper.rotate(CROP_ROTATION_STEP)
}
