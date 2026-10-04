import type { CameraDataset, CameraModel, CameraProvenance, RecordingMode, RecordingOutput } from './cameraData'

function formatPixels(width: number | undefined, height: number | undefined): string {
  return width === undefined || height === undefined ? 'unknown' : `${width} × ${height}`
}

function formatMillimetres(width: number | undefined, height: number | undefined): string {
  return width === undefined || height === undefined ? 'unknown' : `${width} × ${height} mm`
}

function formatRates(output: RecordingOutput): string {
  const ranges = output.frameRates.ranges ?? []
  return ranges.map((range) => {
    const minimum = range.minimum.numerator / range.minimum.denominator
    const maximum = range.maximum.numerator / range.maximum.denominator
    const condition = range.conditions
    const media = condition?.media === undefined ? '' : `; ${condition.media}`
    return `${minimum}–${maximum} fps${media}`
  }).join(', ')
}

function formatProvenance(sourceIds: string[], sourceMap: Map<string, CameraProvenance>): string {
  return sourceIds.map((sourceId) => {
    const source = sourceMap.get(sourceId)
    return source === undefined || source.documentRevision === undefined
      ? sourceId
      : `${sourceId} (${source.documentRevision})`
  }).join(', ')
}

function auditMode(mode: RecordingMode, sourceMap: Map<string, CameraProvenance>): string[] {
  const lines = [
    `  Sensor mode: ${mode.displayName}`,
    `    Active area: ${formatMillimetres(mode.activeWidthMm, mode.activeHeightMm)}`,
    `    Photosites: ${formatPixels(mode.activeWidthPx, mode.activeHeightPx)}`,
    `    Window: ${mode.windowKind}`,
  ]
  if (mode.anamorphic) lines.push(`    Anamorphic metadata: ${mode.anamorphic.orientation}${mode.anamorphic.notes === undefined ? '' : ` — ${mode.anamorphic.notes}`}`)
  for (const recordingOutput of mode.recordingOutputs ?? []) {
    lines.push(`    Output: ${recordingOutput.displayName} [${recordingOutput.codec}]`)
    lines.push(`      Container: ${formatPixels(recordingOutput.containerWidthPx, recordingOutput.containerHeightPx)}; image content: ${formatPixels(recordingOutput.imageContentWidthPx, recordingOutput.imageContentHeightPx)}`)
    lines.push(`      FPS conditions: ${formatRates(recordingOutput)}`)
    lines.push(`      Provenance: ${formatProvenance(recordingOutput.sourceIds, sourceMap)}`)
  }
  lines.push(`    Provenance: ${formatProvenance(mode.sourceIds, sourceMap)}`)
  return lines
}

function auditCamera(camera: CameraModel, sourceMap: Map<string, CameraProvenance>): string[] {
  const firmwareContexts = [...new Set(camera.sourceIds
    .map((sourceId) => sourceMap.get(sourceId)?.firmwareRelevance)
    .filter((context): context is string => context !== undefined))]
  return [
    `Camera: ${camera.displayName} (${camera.id})`,
    `  Firmware/SUP context: ${firmwareContexts.length === 0 ? 'not specified' : firmwareContexts.join('; ')}`,
    `  Physical sensor: ${camera.physicalSensor.name ?? camera.physicalSensor.id}`,
    `    Geometry: ${formatMillimetres(camera.physicalSensor.widthMm, camera.physicalSensor.heightMm)}`,
    `    Native photosites: ${formatPixels(camera.physicalSensor.nativeWidthPx, camera.physicalSensor.nativeHeightPx)}`,
    `    Provenance: ${formatProvenance(camera.physicalSensor.sourceIds, sourceMap)}`,
    ...camera.recordingModes.flatMap((mode) => auditMode(mode, sourceMap)),
  ]
}

/** Deterministic development report for factual review before UI consumption. */
export function formatCameraDatasetAudit(dataset: CameraDataset): string {
  const sourceMap = new Map(dataset.sources.map((source) => [source.id, source]))
  return [
    `Camera dataset ${dataset.version}`,
    ...dataset.cameras.flatMap((camera) => auditCamera(camera, sourceMap)),
    'Sources:',
    ...dataset.sources.map((source) => `  ${source.id}: ${source.documentTitle} — ${source.url ?? 'no URL'}`),
  ].join('\n')
}
