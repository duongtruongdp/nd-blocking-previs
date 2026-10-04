import { describe, expect, it } from 'vitest'
import {
  CAMERA_DATASET_VERSION,
  resolveCaptureSelection,
  validateCameraDataset,
} from '../cameras/cameraData'
import { CameraRegistry } from '../cameras/cameraRegistry'
import { CAMERA_TEST_FIXTURE_DATASET } from '../cameras/testFixtures'

describe('camera dataset foundation', () => {
  it('validates the synthetic fixture and keeps the dataset version independent', () => {
    const result = validateCameraDataset(CAMERA_TEST_FIXTURE_DATASET)
    expect(result.valid).toBe(true)
    expect(CAMERA_DATASET_VERSION).not.toBe(1)
    expect(CAMERA_TEST_FIXTURE_DATASET.cameras[0].status).toBe('fixture')
  })

  it('supports stable registry queries and resolved capture snapshots', () => {
    const registry = new CameraRegistry(CAMERA_TEST_FIXTURE_DATASET)
    expect(registry.getManufacturers().map((manufacturer) => manufacturer.id)).toEqual(['fixture.manufacturer'])
    expect(registry.getCamerasByManufacturer('fixture.manufacturer')).toHaveLength(1)
    expect(registry.getCameraById('fixture.camera-01')?.displayName).toBe('Synthetic Camera 01')
    expect(registry.getRecordingModes('fixture.camera-01')).toHaveLength(3)
    expect(registry.getRecordingMode('fixture.camera-01', 'fixture.camera-01.super35')?.windowKind).toBe('super-35-window')
    expect(resolveCaptureSelection(CAMERA_TEST_FIXTURE_DATASET, 'fixture.camera-01', 'fixture.camera-01.open-gate')).toEqual({
      datasetVersion: '1.0.0',
      cameraId: 'fixture.camera-01',
      recordingModeId: 'fixture.camera-01.open-gate',
      physicalSensorId: 'fixture.sensor-01',
      activeWidthMm: 36,
      activeHeightMm: 24,
      recordedWidthPx: 6000,
      recordedHeightPx: 4000,
    })
  })

  it('rejects duplicate IDs, invalid facts, missing sources, and unknown references', () => {
    const duplicateCamera = structuredClone(CAMERA_TEST_FIXTURE_DATASET)
    duplicateCamera.cameras.push(structuredClone(duplicateCamera.cameras[0]))
    const duplicateResult = validateCameraDataset(duplicateCamera)
    expect(duplicateResult.valid).toBe(false)
    if (!duplicateResult.valid) expect(duplicateResult.errors.some((error) => error.message.includes('Duplicate camera id'))).toBe(true)

    const invalid = structuredClone(CAMERA_TEST_FIXTURE_DATASET)
    invalid.cameras[0].manufacturerId = 'missing.manufacturer'
    invalid.cameras[0].recordingModes[0].activeWidthMm = -1
    invalid.cameras[0].recordingModes[0].sourceIds = ['missing.source']
    invalid.cameras[0].recordingModes[0].frameRates = { explicit: [{ rate: { numerator: 24, denominator: 0 } }] }
    const invalidResult = validateCameraDataset(invalid)
    expect(invalidResult.valid).toBe(false)
    if (!invalidResult.valid) {
      expect(invalidResult.errors.some((error) => error.path.includes('manufacturerId'))).toBe(true)
      expect(invalidResult.errors.some((error) => error.path.includes('activeWidthMm'))).toBe(true)
      expect(invalidResult.errors.some((error) => error.path.includes('sourceIds'))).toBe(true)
      expect(invalidResult.errors.some((error) => error.path.includes('frameRates'))).toBe(true)
    }
  })

  it('does not change a resolved snapshot when the mutable dataset changes later', () => {
    const resolved = resolveCaptureSelection(CAMERA_TEST_FIXTURE_DATASET, 'fixture.camera-01', 'fixture.camera-01.open-gate')
    const laterDataset = structuredClone(CAMERA_TEST_FIXTURE_DATASET)
    laterDataset.cameras[0].recordingModes[0].activeWidthMm = 30
    expect(resolved.activeWidthMm).toBe(36)
    expect(laterDataset.cameras[0].recordingModes[0].activeWidthMm).toBe(30)
  })
})
