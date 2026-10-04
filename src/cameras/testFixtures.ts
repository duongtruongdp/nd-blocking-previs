import type { CameraDataset } from './cameraData'

/** Synthetic dimensions used only to exercise the data architecture. */
export const CAMERA_TEST_FIXTURE_DATASET: CameraDataset = {
  version: '1.0.0',
  manufacturers: [{ id: 'fixture.manufacturer', displayName: 'Synthetic Fixture Manufacturer' }],
  sources: [{
    id: 'fixture.camera-sheet',
    sourceType: 'test-fixture',
    manufacturerId: 'fixture.manufacturer',
    documentTitle: 'Synthetic camera data fixture',
    verificationStatus: 'fixture',
    notes: 'Not a real manufacturer specification.',
  }],
  cameras: [{
    id: 'fixture.camera-01',
    manufacturerId: 'fixture.manufacturer',
    displayName: 'Synthetic Camera 01',
    family: 'Foundation Fixture',
    status: 'fixture',
    sourceIds: ['fixture.camera-sheet'],
    physicalSensor: {
      id: 'fixture.sensor-01',
      name: 'Synthetic 36 × 24 mm sensor',
      widthMm: 36,
      heightMm: 24,
      nativeWidthPx: 6000,
      nativeHeightPx: 4000,
      sourceIds: ['fixture.camera-sheet'],
    },
    recordingModes: [
      {
        id: 'fixture.camera-01.open-gate',
        displayName: 'Open Gate',
        activeWidthMm: 36,
        activeHeightMm: 24,
        recordedWidthPx: 6000,
        recordedHeightPx: 4000,
        windowKind: 'full-sensor',
        frameRates: {
          explicit: [
            { rate: { numerator: 24, denominator: 1 } },
            { rate: { numerator: 24_000, denominator: 1_001 } },
            { rate: { numerator: 60, denominator: 1 } },
          ],
        },
        sourceIds: ['fixture.camera-sheet'],
      },
      {
        id: 'fixture.camera-01.super35',
        displayName: 'Super 35 Window',
        activeWidthMm: 24.89,
        activeHeightMm: 18.66,
        recordedWidthPx: 4608,
        recordedHeightPx: 3164,
        windowKind: 'super-35-window',
        frameRates: { ranges: [{ minimum: { numerator: 24, denominator: 1 }, maximum: { numerator: 120, denominator: 1 }, step: { numerator: 1, denominator: 1 } }] },
        sourceIds: ['fixture.camera-sheet'],
      },
      {
        id: 'fixture.camera-01.anamorphic',
        displayName: 'Anamorphic-Oriented Capture',
        activeWidthMm: 36,
        activeHeightMm: 18,
        recordedWidthPx: 6000,
        recordedHeightPx: 3000,
        windowKind: 'anamorphic-oriented',
        anamorphic: { orientation: 'horizontal' },
        frameRates: { explicit: [{ rate: { numerator: 25, denominator: 1 } }] },
        sourceIds: ['fixture.camera-sheet'],
      },
    ],
  }],
}
