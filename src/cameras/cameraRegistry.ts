import type {
  CameraDataset,
  CameraManufacturer,
  CameraModel,
  RecordingMode,
  RecordingOutput,
} from './cameraData'

export class CameraRegistry {
  readonly dataset: CameraDataset

  constructor(dataset: CameraDataset) {
    this.dataset = dataset
  }

  getManufacturers(): readonly CameraManufacturer[] {
    return this.dataset.manufacturers
  }

  getCamerasByManufacturer(manufacturerId: string): readonly CameraModel[] {
    return this.dataset.cameras.filter((camera) => camera.manufacturerId === manufacturerId)
  }

  getCameraById(cameraId: string): CameraModel | undefined {
    return this.dataset.cameras.find((camera) => camera.id === cameraId)
  }

  getRecordingModes(cameraId: string): readonly RecordingMode[] {
    return this.getCameraById(cameraId)?.recordingModes ?? []
  }

  getRecordingMode(cameraId: string, modeId: string): RecordingMode | undefined {
    return this.getRecordingModes(cameraId).find((mode) => mode.id === modeId)
  }

  getRecordingOutputs(cameraId: string, modeId: string): readonly RecordingOutput[] {
    return this.getRecordingMode(cameraId, modeId)?.recordingOutputs ?? []
  }

  getRecordingOutput(cameraId: string, modeId: string, outputId: string): RecordingOutput | undefined {
    return this.getRecordingOutputs(cameraId, modeId).find((output) => output.id === outputId)
  }
}

export function createCameraRegistry(dataset: CameraDataset): CameraRegistry {
  return new CameraRegistry(dataset)
}
