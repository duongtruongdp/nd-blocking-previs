import { describe, expect, it } from 'vitest'
import { formatCameraDatasetAudit } from '../cameras/cameraAudit'
import { resolveCaptureSelection, validateCameraDataset } from '../cameras/cameraData'
import { ARRI_BATCH_1_CAMERA_IDS, ARRI_CAMERA_DATASET } from '../cameras/data/arri'
import { CameraRegistry } from '../cameras/cameraRegistry'
import {
  centeredDeliveryAperture,
  captureAspectRatio,
  deliveryFrameFovRadians,
  frameCoverageAtDistance,
  horizontalFovRadians,
  sensorDiagonalMm,
} from '../math/cinematography'

describe('ARRI Batch 1 production camera dataset', () => {
  it('contains exactly the requested verified ARRI cameras and validates', () => {
    const result = validateCameraDataset(ARRI_CAMERA_DATASET)
    expect(result.valid).toBe(true)
    expect(ARRI_CAMERA_DATASET.manufacturers).toEqual([{ id: 'arri', displayName: 'ARRI' }])
    expect(ARRI_CAMERA_DATASET.cameras.map((camera) => camera.id)).toEqual(ARRI_BATCH_1_CAMERA_IDS)
    expect(ARRI_CAMERA_DATASET.cameras.every((camera) => camera.status === 'verified')).toBe(true)
  })

  it('provides registry lookup, unique modes, output links, and resolvable provenance', () => {
    const registry = new CameraRegistry(ARRI_CAMERA_DATASET)
    expect(registry.getCamerasByManufacturer('arri')).toHaveLength(2)
    expect(registry.getCameraById('arri.alexa-mini-lf')?.displayName).toBe('ALEXA Mini LF')
    expect(registry.getCameraById('arri.alexa-35')?.displayName).toBe('ALEXA 35')

    const sourceIds = new Set(ARRI_CAMERA_DATASET.sources.map((source) => source.id))
    const modeIds = new Set<string>()
    for (const camera of ARRI_CAMERA_DATASET.cameras) {
      expect(camera.physicalSensor.sourceIds.every((sourceId) => sourceIds.has(sourceId))).toBe(true)
      for (const mode of camera.recordingModes) {
        expect(modeIds.has(mode.id)).toBe(false)
        modeIds.add(mode.id)
        expect(mode.activeWidthPx).toBeGreaterThan(0)
        expect(mode.activeHeightPx).toBeGreaterThan(0)
        expect(mode.sourceIds.every((sourceId) => sourceIds.has(sourceId))).toBe(true)
        expect(mode.recordingOutputs?.length).toBeGreaterThan(0)
        for (const output of mode.recordingOutputs ?? []) {
          expect(registry.getRecordingOutput(camera.id, mode.id, output.id)).toEqual(output)
          expect(output.sourceIds.every((sourceId) => sourceIds.has(sourceId))).toBe(true)
          expect(output.frameRates.ranges?.length).toBeGreaterThan(0)
        }
      }
    }
    expect(modeIds.size).toBe(ARRI_CAMERA_DATASET.cameras.reduce((total, camera) => total + camera.recordingModes.length, 0))
  })

  it('keeps sensor modes separate from recording outputs and preserves media conditions', () => {
    const mini = new CameraRegistry(ARRI_CAMERA_DATASET)
    const miniLfMode = mini.getRecordingMode('arri.alexa-mini-lf', 'arri.alexa-mini-lf.4_3k-lf-16_9')
    expect(miniLfMode?.activeWidthPx).toBe(4320)
    expect(miniLfMode?.recordingOutputs?.map((output) => [output.containerWidthPx, output.containerHeightPx])).toEqual([[3840, 2160], [1920, 1080]])

    const a35Mode = mini.getRecordingMode('arri.alexa-35', 'arri.alexa-35.4k-16_9')
    expect(a35Mode?.recordingOutputs).toHaveLength(5)
    const rawRates = a35Mode?.recordingOutputs?.[0].frameRates.ranges ?? []
    expect(rawRates.map((range) => range.maximum.numerator)).toEqual([55, 120])
    expect(rawRates.map((range) => range.conditions?.media)).toEqual(['Compact Drive 1TB', 'Compact Drive 2TB'])
    expect(a35Mode?.recordingOutputs?.[2].imageContentWidthPx).toBe(3840)
  })

  it('locks the reconciled Mini LF inventory and omits the unverified 1.89:1 claim', () => {
    const mini = ARRI_CAMERA_DATASET.cameras.find((camera) => camera.id === 'arri.alexa-mini-lf')!
    expect(mini.recordingModes).toHaveLength(9)
    expect(mini.recordingModes.map((mode) => mode.displayName)).toEqual([
      '4.5K LF 3:2 Open Gate',
      '4.5K LF 2.39:1',
      '4.3K LF 16:9',
      '3.8K LF 16:9',
      '2.8K LF 1:1',
      '3.4K S35 3:2',
      '3.2K S35 16:9',
      '2.8K S35 4:3',
      '2.8K S35 16:9',
    ])
    expect(mini.recordingModes.some((mode) => /1\.89/i.test(`${mode.id} ${mode.displayName}`))).toBe(false)
  })

  it('separates original ALEXA35 sensor modes from Xtreme-only or output-only records', () => {
    const a35 = ARRI_CAMERA_DATASET.cameras.find((camera) => camera.id === 'arri.alexa-35')!
    expect(a35.recordingModes).toHaveLength(9)
    expect(a35.recordingModes.find((mode) => mode.id.includes('3_8k-2_39'))).toBeUndefined()
    expect(a35.recordingModes.find((mode) => mode.id.includes('hd-s16'))).toBeUndefined()
    expect(a35.recordingModes.find((mode) => mode.id === 'arri.alexa-35.2k-s16-16_9')).toBeDefined()
    expect(a35.recordingModes.find((mode) => mode.id === 'arri.alexa-35.3_3k-6_5')?.recordingOutputs?.map((output) => output.displayName)).toContain('Apple ProRes 3.8K 2.39:1 Ana 2x')
    expect(a35.recordingModes.every((mode) => mode.sourceIds.includes('arri.alexa-35.product') && mode.sourceIds.includes('arri.alexa-35.sup-6-1.manual') && mode.sourceIds.includes('arri.formats-overview-v6-3.alexa-35'))).toBe(true)
    expect(a35.recordingModes.every((mode) => (mode.recordingOutputs ?? []).every((output) => output.sourceIds.includes('arri.alexa-35.product') && output.sourceIds.includes('arri.alexa-35.sup-6-1.manual') && output.sourceIds.includes('arri.formats-overview-v6-3.alexa-35')))).toBe(true)
    expect(ARRI_CAMERA_DATASET.sources.every((source) => !/Xtreme/i.test(`${source.documentTitle} ${source.url ?? ''}`))).toBe(true)
  })

  it('resolves a production output snapshot without changing when the dataset later changes', () => {
    const resolved = resolveCaptureSelection(
      ARRI_CAMERA_DATASET,
      'arri.alexa-mini-lf',
      'arri.alexa-mini-lf.4_3k-lf-16_9',
      'arri.alexa-mini-lf.4_3k-lf-16_9.prores-uhd',
    )
    expect(resolved).toMatchObject({
      datasetVersion: '1.0.0',
      cameraId: 'arri.alexa-mini-lf',
      recordingModeId: 'arri.alexa-mini-lf.4_3k-lf-16_9',
      recordingOutputId: 'arri.alexa-mini-lf.4_3k-lf-16_9.prores-uhd',
      activeWidthMm: 35.64,
      activeHeightMm: 20.05,
      recordedWidthPx: 3840,
      recordedHeightPx: 2160,
      imageContentWidthPx: 3840,
      imageContentHeightPx: 2160,
    })

    const laterDataset = structuredClone(ARRI_CAMERA_DATASET)
    laterDataset.cameras[0].recordingModes[2].activeWidthMm = 1
    laterDataset.cameras[0].recordingModes[2].recordingOutputs![0].containerWidthPx = 1
    expect(resolved.activeWidthMm).toBe(35.64)
    expect(resolved.recordedWidthPx).toBe(3840)
  })

  it('cross-checks independent cinematography math for verified modes', () => {
    const registry = new CameraRegistry(ARRI_CAMERA_DATASET)
    const selections = [
      ['arri.alexa-mini-lf', 'arri.alexa-mini-lf.4_5k-lf-open-gate'],
      ['arri.alexa-mini-lf', 'arri.alexa-mini-lf.3_4k-s35-3_2'],
      ['arri.alexa-35', 'arri.alexa-35.4_6k-open-gate'],
      ['arri.alexa-35', 'arri.alexa-35.3_3k-6_5'],
      ['arri.alexa-35', 'arri.alexa-35.2k-s16-16_9'],
    ] as const

    for (const [cameraId, modeId] of selections) {
      const mode = registry.getRecordingMode(cameraId, modeId)!
      const geometry = { activeWidthMm: mode.activeWidthMm!, activeHeightMm: mode.activeHeightMm! }
      const focalLengthMm = 50
      const deliveryAspect = 2.39
      const distanceM = 4
      expect(captureAspectRatio(geometry)).toBeCloseTo(geometry.activeWidthMm / geometry.activeHeightMm, 12)
      expect(sensorDiagonalMm(geometry)).toBeCloseTo(Math.hypot(geometry.activeWidthMm, geometry.activeHeightMm), 12)
      expect(horizontalFovRadians(geometry, focalLengthMm)).toBeCloseTo(2 * Math.atan(geometry.activeWidthMm / (2 * focalLengthMm)), 12)
      expect(centeredDeliveryAperture(geometry, deliveryAspect).activeWidthMm).toBeGreaterThan(0)
      const delivery = deliveryFrameFovRadians(geometry, focalLengthMm, deliveryAspect)
      expect(delivery.horizontal).toBeCloseTo(2 * Math.atan(delivery.aperture.activeWidthMm / (2 * focalLengthMm)), 12)
      expect(frameCoverageAtDistance(geometry, focalLengthMm, distanceM)).toEqual({
        widthM: distanceM * geometry.activeWidthMm / focalLengthMm,
        heightM: distanceM * geometry.activeHeightMm / focalLengthMm,
      })
    }
  })

  it('produces a deterministic human-readable review report without fixture records', () => {
    const report = formatCameraDatasetAudit(ARRI_CAMERA_DATASET)
    expect(report).toContain('Camera: ALEXA Mini LF')
    expect(report).toContain('Physical sensor: Large Format ARRI ALEV III (A2X)')
    expect(report).toContain('Sensor mode: 4K 16:9')
    expect(report).toContain('Output: Apple ProRes UHD [Apple ProRes]')
    expect(report).toContain('FPS conditions: 0.75–120 fps; Compact Drive 1TB or 2TB')
    expect(report).toContain('Camera: ALEXA 35')
    expect(report).toContain('Firmware/SUP context: Original ALEXA 35')
    expect(report).toContain('arri.alexa-mini-lf.sup-7-3.manual (SUP 7.3)')
    expect(report).not.toContain('fixture.')
  })
})
