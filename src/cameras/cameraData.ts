import type { FrameRate } from '../domain/types'

/** Independent from the .ndblock project format version. */
export const CAMERA_DATASET_VERSION = '1.0.0' as const
export type CameraDatasetVersion = typeof CAMERA_DATASET_VERSION

export type CameraManufacturer = {
  id: string
  displayName: string
}

export type CameraSourceType =
  | 'manufacturer-specification'
  | 'manufacturer-manual'
  | 'firmware-documentation'
  | 'test-fixture'

export type CameraVerificationStatus = 'verified' | 'fixture' | 'unverified'

export type CameraProvenance = {
  id: string
  sourceType: CameraSourceType
  manufacturerId?: string
  documentTitle: string
  url?: string
  documentRevision?: string
  publicationDate?: string
  firmwareRelevance?: string
  accessedAt?: string
  notes?: string
  verificationStatus: CameraVerificationStatus
}

export type PhysicalSensor = {
  id: string
  name?: string
  family?: string
  widthMm?: number
  heightMm?: number
  nativeWidthPx?: number
  nativeHeightPx?: number
  sourceIds: string[]
  notes?: string
}

export type RecordingWindowKind =
  | 'full-sensor'
  | 'crop'
  | 'window'
  | 'anamorphic-oriented'
  | 'super-35-window'
  | 'super-16-window'
  | 'other'

export type FrameRateCondition = {
  codec?: string
  resolution?: string
  sensorModeId?: string
  projectRate?: FrameRate
  firmware?: string
  media?: string
  cameraConfiguration?: string
  license?: string
  notes?: string
}

export type FrameRateRange = {
  minimum: FrameRate
  maximum: FrameRate
  step?: FrameRate
  conditions?: FrameRateCondition
}

export type RecordingFrameRates = {
  explicit?: Array<{ rate: FrameRate; conditions?: FrameRateCondition }>
  ranges?: FrameRateRange[]
}

export type AnamorphicModeMetadata = {
  orientation: 'horizontal' | 'vertical' | 'unknown'
  notes?: string
}

/**
 * A file-resolution/codec variant of one sensor readout. The container and
 * image-content dimensions are separate because ARRI documents sometimes
 * describe padding/container dimensions alongside the recorded image.
 */
export type RecordingOutput = {
  id: string
  displayName: string
  codec: string
  containerWidthPx: number
  containerHeightPx: number
  imageContentWidthPx: number
  imageContentHeightPx: number
  frameRates: RecordingFrameRates
  sourceIds: string[]
  notes?: string
}

export type RecordingMode = {
  id: string
  displayName: string
  /** Active sensor photosites for this mode, distinct from file resolution. */
  activeWidthPx?: number
  activeHeightPx?: number
  activeWidthMm?: number
  activeHeightMm?: number
  /** Retained for the foundation API; production data uses recordingOutputs. */
  recordedWidthPx?: number
  recordedHeightPx?: number
  windowKind: RecordingWindowKind
  frameRates: RecordingFrameRates
  recordingOutputs?: RecordingOutput[]
  anamorphic?: AnamorphicModeMetadata
  sourceIds: string[]
  notes?: string
}

export type CameraDatasetStatus = 'verified' | 'fixture' | 'unverified'

export type CameraModel = {
  id: string
  manufacturerId: string
  manufacturerDisplayName?: string
  displayName: string
  family?: string
  physicalSensor: PhysicalSensor
  recordingModes: RecordingMode[]
  sourceIds: string[]
  status: CameraDatasetStatus
  notes?: string
}

export type CameraDataset = {
  version: CameraDatasetVersion
  manufacturers: CameraManufacturer[]
  cameras: CameraModel[]
  sources: CameraProvenance[]
}

/**
 * Resolved factual capture data for a future CameraDocument. Derived values
 * are intentionally absent so a project can retain the exact aperture facts
 * used when the shot was authored.
 */
export type ResolvedCaptureSelection = {
  datasetVersion: CameraDatasetVersion
  cameraId: string
  recordingModeId: string
  physicalSensorId: string
  activeWidthMm: number
  activeHeightMm: number
  recordingOutputId?: string
  recordedWidthPx?: number
  recordedHeightPx?: number
  imageContentWidthPx?: number
  imageContentHeightPx?: number
}

export type CameraDatasetValidationIssue = {
  path: string
  message: string
}

export type CameraDatasetValidationResult =
  | { valid: true; value: CameraDataset }
  | { valid: false; errors: CameraDatasetValidationIssue[] }

export function resolveCaptureSelection(
  dataset: CameraDataset,
  cameraId: string,
  recordingModeId: string,
  recordingOutputId?: string,
): ResolvedCaptureSelection {
  const camera = dataset.cameras.find((candidate) => candidate.id === cameraId)
  if (!camera) throw new RangeError(`Unknown camera: ${cameraId}`)
  const mode = camera.recordingModes.find((candidate) => candidate.id === recordingModeId)
  if (!mode) throw new RangeError(`Unknown recording mode: ${cameraId}/${recordingModeId}`)
  if (!isPositiveFinite(mode.activeWidthMm) || !isPositiveFinite(mode.activeHeightMm)) {
    throw new RangeError(`Recording mode has no resolved active aperture: ${cameraId}/${recordingModeId}`)
  }
  const output = recordingOutputId === undefined
    ? undefined
    : mode.recordingOutputs?.find((candidate) => candidate.id === recordingOutputId)
  if (recordingOutputId !== undefined && !output) {
    throw new RangeError(`Unknown recording output: ${cameraId}/${recordingModeId}/${recordingOutputId}`)
  }
  return {
    datasetVersion: dataset.version,
    cameraId,
    recordingModeId,
    physicalSensorId: camera.physicalSensor.id,
    activeWidthMm: mode.activeWidthMm,
    activeHeightMm: mode.activeHeightMm,
    ...(output === undefined ? {} : {
      recordingOutputId: output.id,
      recordedWidthPx: output.containerWidthPx,
      recordedHeightPx: output.containerHeightPx,
      imageContentWidthPx: output.imageContentWidthPx,
      imageContentHeightPx: output.imageContentHeightPx,
    }),
    ...(output !== undefined ? {} : { ...(mode.recordedWidthPx === undefined ? {} : { recordedWidthPx: mode.recordedWidthPx }) }),
    ...(output !== undefined ? {} : { ...(mode.recordedHeightPx === undefined ? {} : { recordedHeightPx: mode.recordedHeightPx }) }),
  }
}

export function validateCameraDataset(dataset: unknown): CameraDatasetValidationResult {
  const errors: CameraDatasetValidationIssue[] = []
  if (!isRecord(dataset)) return invalid('$', 'Camera dataset must be an object.')
  if (dataset.version !== CAMERA_DATASET_VERSION) errors.push({ path: 'version', message: `Dataset version must be ${CAMERA_DATASET_VERSION}.` })
  const manufacturers = validateManufacturers(dataset.manufacturers, errors)
  const sources = validateSources(dataset.sources, errors)
  const cameras = validateCameras(dataset.cameras, errors, manufacturers, sources)
  if (errors.length > 0 || !manufacturers || !sources || !cameras) return { valid: false, errors }
  return { valid: true, value: { version: CAMERA_DATASET_VERSION, manufacturers, cameras, sources } }
}

export function assertValidCameraDataset(dataset: unknown): asserts dataset is CameraDataset {
  const result = validateCameraDataset(dataset)
  if (!result.valid) throw new Error(result.errors.map((error) => `${error.path}: ${error.message}`).join('\n'))
}

function validateManufacturers(input: unknown, errors: CameraDatasetValidationIssue[]): CameraManufacturer[] | undefined {
  if (!Array.isArray(input)) {
    errors.push({ path: 'manufacturers', message: 'manufacturers must be an array.' })
    return undefined
  }
  const seen = new Set<string>()
  const result: CameraManufacturer[] = []
  input.forEach((entry, index) => {
    const path = `manufacturers[${index}]`
    if (!isRecord(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.displayName)) {
      errors.push({ path, message: 'Manufacturer requires a stable id and displayName.' })
      return
    }
    if (seen.has(entry.id)) errors.push({ path: `${path}.id`, message: `Duplicate manufacturer id: ${entry.id}.` })
    seen.add(entry.id)
    result.push({ id: entry.id, displayName: entry.displayName })
  })
  return result
}

function validateSources(input: unknown, errors: CameraDatasetValidationIssue[]): CameraProvenance[] | undefined {
  if (!Array.isArray(input)) {
    errors.push({ path: 'sources', message: 'sources must be an array.' })
    return undefined
  }
  const seen = new Set<string>()
  const result: CameraProvenance[] = []
  input.forEach((entry, index) => {
    const path = `sources[${index}]`
    if (!isRecord(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.documentTitle)) {
      errors.push({ path, message: 'Source requires an id and documentTitle.' })
      return
    }
    if (!['manufacturer-specification', 'manufacturer-manual', 'firmware-documentation', 'test-fixture'].includes(entry.sourceType as string)) {
      errors.push({ path: `${path}.sourceType`, message: 'Unknown source type.' })
      return
    }
    if (!['verified', 'fixture', 'unverified'].includes(entry.verificationStatus as string)) {
      errors.push({ path: `${path}.verificationStatus`, message: 'Unknown verification status.' })
      return
    }
    if (entry.url !== undefined && (!isNonEmptyString(entry.url) || !isHttpUrl(entry.url))) errors.push({ path: `${path}.url`, message: 'url must be a valid http(s) URL when provided.' })
    if (seen.has(entry.id)) errors.push({ path: `${path}.id`, message: `Duplicate source id: ${entry.id}.` })
    seen.add(entry.id)
    result.push(entry as unknown as CameraProvenance)
  })
  return result
}

function validateCameras(
  input: unknown,
  errors: CameraDatasetValidationIssue[],
  manufacturers: CameraManufacturer[] | undefined,
  sources: CameraProvenance[] | undefined,
): CameraModel[] | undefined {
  if (!Array.isArray(input)) {
    errors.push({ path: 'cameras', message: 'cameras must be an array.' })
    return undefined
  }
  const manufacturerIds = new Set((manufacturers ?? []).map((manufacturer) => manufacturer.id))
  const sourceIds = new Set((sources ?? []).map((source) => source.id))
  const cameraIds = new Set<string>()
  const result: CameraModel[] = []
  input.forEach((entry, index) => {
    const path = `cameras[${index}]`
    if (!isRecord(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.manufacturerId) || !isNonEmptyString(entry.displayName)) {
      errors.push({ path, message: 'Camera requires id, manufacturerId, and displayName.' })
      return
    }
    if (cameraIds.has(entry.id)) errors.push({ path: `${path}.id`, message: `Duplicate camera id: ${entry.id}.` })
    cameraIds.add(entry.id)
    if (!manufacturerIds.has(entry.manufacturerId)) errors.push({ path: `${path}.manufacturerId`, message: `Unknown manufacturer: ${entry.manufacturerId}.` })
    if (!['verified', 'fixture', 'unverified'].includes(entry.status as string)) errors.push({ path: `${path}.status`, message: 'Unknown camera dataset status.' })
    validateSourceIds(entry.sourceIds, sourceIds, `${path}.sourceIds`, errors)
    const physicalSensor = validatePhysicalSensor(entry.physicalSensor, sourceIds, `${path}.physicalSensor`, errors)
    const recordingModes = validateRecordingModes(entry.recordingModes, sourceIds, `${path}.recordingModes`, errors)
    if (!physicalSensor || !recordingModes) return
    recordingModes.forEach((mode, modeIndex) => {
      if (mode.activeWidthMm !== undefined && physicalSensor.widthMm !== undefined && mode.activeWidthMm > physicalSensor.widthMm) {
        errors.push({ path: `${path}.recordingModes[${modeIndex}].activeWidthMm`, message: 'Active width cannot exceed physical sensor width.' })
      }
      if (mode.activeHeightMm !== undefined && physicalSensor.heightMm !== undefined && mode.activeHeightMm > physicalSensor.heightMm) {
        errors.push({ path: `${path}.recordingModes[${modeIndex}].activeHeightMm`, message: 'Active height cannot exceed physical sensor height.' })
      }
    })
    result.push(entry as unknown as CameraModel)
  })
  return result
}

function validatePhysicalSensor(input: unknown, sourceIds: Set<string>, path: string, errors: CameraDatasetValidationIssue[]): PhysicalSensor | undefined {
  if (!isRecord(input) || !isNonEmptyString(input.id)) {
    errors.push({ path, message: 'Physical sensor requires a stable id.' })
    return undefined
  }
  validateOptionalPositive(input.widthMm, `${path}.widthMm`, errors)
  validateOptionalPositive(input.heightMm, `${path}.heightMm`, errors)
  validateOptionalPositiveInteger(input.nativeWidthPx, `${path}.nativeWidthPx`, errors)
  validateOptionalPositiveInteger(input.nativeHeightPx, `${path}.nativeHeightPx`, errors)
  validateSourceIds(input.sourceIds, sourceIds, `${path}.sourceIds`, errors)
  return input as unknown as PhysicalSensor
}

function validateRecordingModes(input: unknown, sourceIds: Set<string>, path: string, errors: CameraDatasetValidationIssue[]): RecordingMode[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push({ path, message: 'A camera requires at least one recording mode.' })
    return undefined
  }
  const seen = new Set<string>()
  const result: RecordingMode[] = []
  input.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`
    if (!isRecord(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.displayName)) {
      errors.push({ path: entryPath, message: 'Recording mode requires id and displayName.' })
      return
    }
    if (seen.has(entry.id)) errors.push({ path: `${entryPath}.id`, message: `Duplicate recording mode id: ${entry.id}.` })
    seen.add(entry.id)
    validateOptionalPositive(entry.activeWidthMm, `${entryPath}.activeWidthMm`, errors)
    validateOptionalPositive(entry.activeHeightMm, `${entryPath}.activeHeightMm`, errors)
    validateOptionalPositiveInteger(entry.activeWidthPx, `${entryPath}.activeWidthPx`, errors)
    validateOptionalPositiveInteger(entry.activeHeightPx, `${entryPath}.activeHeightPx`, errors)
    validateOptionalPositiveInteger(entry.recordedWidthPx, `${entryPath}.recordedWidthPx`, errors)
    validateOptionalPositiveInteger(entry.recordedHeightPx, `${entryPath}.recordedHeightPx`, errors)
    if (!['full-sensor', 'crop', 'window', 'anamorphic-oriented', 'super-35-window', 'super-16-window', 'other'].includes(entry.windowKind as string)) {
      errors.push({ path: `${entryPath}.windowKind`, message: 'Unknown recording window classification.' })
    }
    validateSourceIds(entry.sourceIds, sourceIds, `${entryPath}.sourceIds`, errors)
    validateFrameRates(entry.frameRates, `${entryPath}.frameRates`, errors)
    validateRecordingOutputs(entry.recordingOutputs, sourceIds, `${entryPath}.recordingOutputs`, errors)
    result.push(entry as unknown as RecordingMode)
  })
  return result
}

function validateRecordingOutputs(input: unknown, sourceIds: Set<string>, path: string, errors: CameraDatasetValidationIssue[]): void {
  if (input === undefined) return
  if (!Array.isArray(input)) {
    errors.push({ path, message: 'recordingOutputs must be an array when provided.' })
    return
  }
  const seen = new Set<string>()
  input.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`
    if (!isRecord(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.displayName) || !isNonEmptyString(entry.codec)) {
      errors.push({ path: entryPath, message: 'Recording output requires id, displayName, and codec.' })
      return
    }
    if (seen.has(entry.id)) errors.push({ path: `${entryPath}.id`, message: `Duplicate recording output id: ${entry.id}.` })
    seen.add(entry.id)
    validateOptionalPositiveInteger(entry.containerWidthPx, `${entryPath}.containerWidthPx`, errors)
    validateOptionalPositiveInteger(entry.containerHeightPx, `${entryPath}.containerHeightPx`, errors)
    validateOptionalPositiveInteger(entry.imageContentWidthPx, `${entryPath}.imageContentWidthPx`, errors)
    validateOptionalPositiveInteger(entry.imageContentHeightPx, `${entryPath}.imageContentHeightPx`, errors)
    validateSourceIds(entry.sourceIds, sourceIds, `${entryPath}.sourceIds`, errors)
    validateFrameRates(entry.frameRates, `${entryPath}.frameRates`, errors)
  })
}

function validateFrameRates(input: unknown, path: string, errors: CameraDatasetValidationIssue[]): void {
  if (!isRecord(input) || (!Array.isArray(input.explicit) && !Array.isArray(input.ranges))) {
    errors.push({ path, message: 'Frame rates require explicit rates and/or ranges.' })
    return
  }
  const explicit = Array.isArray(input.explicit) ? input.explicit as unknown[] : []
  const ranges = Array.isArray(input.ranges) ? input.ranges as unknown[] : []
  if (explicit.length === 0 && ranges.length === 0) errors.push({ path, message: 'Frame rates require at least one explicit rate or range.' })
  explicit.forEach((entry: unknown, index: number) => validateRateEntry(entry, `${path}.explicit[${index}]`, errors))
  ranges.forEach((entry: unknown, index: number) => {
    if (!isRecord(entry)) {
      errors.push({ path: `${path}.ranges[${index}]`, message: 'Frame-rate range must be an object.' })
      return
    }
    validateRate(entry.minimum, `${path}.ranges[${index}].minimum`, errors)
    validateRate(entry.maximum, `${path}.ranges[${index}].maximum`, errors)
    if (entry.step !== undefined) validateRate(entry.step, `${path}.ranges[${index}].step`, errors)
    if (isFrameRate(entry.minimum) && isFrameRate(entry.maximum) && compareRates(entry.minimum, entry.maximum) > 0) {
      errors.push({ path: `${path}.ranges[${index}]`, message: 'Frame-rate range minimum cannot exceed maximum.' })
    }
  })
}

function validateRateEntry(input: unknown, path: string, errors: CameraDatasetValidationIssue[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: 'Frame-rate entry must be an object.' })
    return
  }
  validateRate(input.rate, `${path}.rate`, errors)
}

function validateRate(input: unknown, path: string, errors: CameraDatasetValidationIssue[]): void {
  if (!isRecord(input) || typeof input.numerator !== 'number' || typeof input.denominator !== 'number' || !Number.isInteger(input.numerator) || !Number.isInteger(input.denominator) || input.numerator <= 0 || input.denominator <= 0) {
    errors.push({ path, message: 'Frame rate must use positive integer numerator and denominator values.' })
  }
}

function validateSourceIds(input: unknown, available: Set<string>, path: string, errors: CameraDatasetValidationIssue[]): void {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push({ path, message: 'At least one provenance source is required.' })
    return
  }
  input.forEach((sourceId, index) => {
    if (!isNonEmptyString(sourceId)) errors.push({ path: `${path}[${index}]`, message: 'Source id must be a non-empty string.' })
    else if (!available.has(sourceId)) errors.push({ path: `${path}[${index}]`, message: `Unknown provenance source: ${sourceId}.` })
  })
}

function validateOptionalPositive(value: unknown, path: string, errors: CameraDatasetValidationIssue[]): void {
  if (value !== undefined && (!isPositiveFinite(value))) errors.push({ path, message: 'Value must be finite and greater than zero when provided.' })
}

function validateOptionalPositiveInteger(value: unknown, path: string, errors: CameraDatasetValidationIssue[]): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)) errors.push({ path, message: 'Value must be a positive integer when provided.' })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isFrameRate(value: unknown): value is { numerator: number; denominator: number } {
  return isRecord(value)
    && typeof value.numerator === 'number'
    && typeof value.denominator === 'number'
    && Number.isInteger(value.numerator)
    && Number.isInteger(value.denominator)
    && value.numerator > 0
    && value.denominator > 0
}

function compareRates(left: { numerator: number; denominator: number }, right: { numerator: number; denominator: number }): number {
  return left.numerator * right.denominator - right.numerator * left.denominator
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function invalid(path: string, message: string): CameraDatasetValidationResult {
  return { valid: false, errors: [{ path, message }] }
}
