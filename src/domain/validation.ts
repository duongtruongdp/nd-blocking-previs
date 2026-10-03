import {
  CURRENT_PROJECT_FORMAT_VERSION,
  type ActorDocument,
  type CameraDocument,
  type EulerRotation,
  type FrameRate,
  type FrameSettings,
  type Keyframe,
  type LightDocument,
  type Placement,
  type ProjectDocument,
  type ProjectFile,
  type PropDocument,
  type SensorPresetId,
  type SensorFormat,
  type ShotDocument,
  type TimelineTrack,
  type Vec3,
} from './types'
import { isValidFrameRate } from '../math/frameRate'
import { validateMarkRange } from './timeline'

export type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; code: 'invalid-format' | 'unsupported-version' | 'validation-failed'; errors: ValidationIssue[] }

export type ValidationIssue = {
  path: string
  message: string
}

export function validateProjectFile(input: unknown): ValidationResult<ProjectFile> {
  const issues: ValidationIssue[] = []
  if (!isRecord(input)) {
    return invalid('invalid-format', [{ path: '$', message: 'Project file must be an object.' }])
  }

  onlyKeys(input, ['format', 'formatVersion', 'generator', 'project'], '$', issues)
  if (input.format !== 'nd-blocking-previs') {
    issues.push({ path: '$.format', message: 'Expected format "nd-blocking-previs".' })
  }

  if (!isInteger(input.formatVersion)) {
    issues.push({ path: '$.formatVersion', message: 'formatVersion must be an integer.' })
  } else if (input.formatVersion !== CURRENT_PROJECT_FORMAT_VERSION) {
    return invalid('unsupported-version', [
      {
        path: '$.formatVersion',
        message: `Only formatVersion ${CURRENT_PROJECT_FORMAT_VERSION} is supported.`,
      },
    ])
  }

  if (!isRecord(input.generator)) {
    issues.push({ path: '$.generator', message: 'generator must be an object.' })
  } else {
    onlyKeys(input.generator, ['application', 'version'], '$.generator', issues)
    if (input.generator.application !== 'ND Blocking & Previs') {
      issues.push({
        path: '$.generator.application',
        message: 'Expected application "ND Blocking & Previs".',
      })
    }
    if (!isNonEmptyString(input.generator.version)) {
      issues.push({ path: '$.generator.version', message: 'Generator version is required.' })
    }
  }

  const project = validateProject(input.project, '$.project', issues)
  if (issues.length > 0 || !project || !isRecord(input.generator)) {
    return invalid('validation-failed', issues)
  }

  return {
    valid: true,
    value: {
      format: 'nd-blocking-previs',
      formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
      generator: {
        application: 'ND Blocking & Previs',
        version: input.generator.version as string,
      },
      project,
    },
  }
}

function validateProject(
  input: unknown,
  path: string,
  issues: ValidationIssue[],
): ProjectDocument | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Project must be an object.' })
    return undefined
  }

  onlyKeys(
    input,
    ['schemaVersion', 'id', 'name', 'createdAt', 'updatedAt', 'unitSystem', 'frameRate', 'shots', 'activeShotId'],
    path,
    issues,
  )
  if (input.schemaVersion !== 1) issues.push({ path: `${path}.schemaVersion`, message: 'Project schemaVersion must be 1.' })
  requireId(input.id, `${path}.id`, issues)
  requireNonEmptyString(input.name, `${path}.name`, issues)
  requireNonEmptyString(input.createdAt, `${path}.createdAt`, issues)
  requireNonEmptyString(input.updatedAt, `${path}.updatedAt`, issues)
  if (input.unitSystem !== 'metric') issues.push({ path: `${path}.unitSystem`, message: 'Only metric units are supported.' })

  const frameRate = validateFrameRate(input.frameRate, `${path}.frameRate`, issues)
  const shots = Array.isArray(input.shots) ? input.shots : undefined
  if (!shots) issues.push({ path: `${path}.shots`, message: 'shots must be an array.' })

  const validatedShots = (shots ?? [])
    .map((shot, index) => validateShot(shot, `${path}.shots[${index}]`, issues))
    .filter((shot): shot is ShotDocument => shot !== undefined)

  requireId(input.activeShotId, `${path}.activeShotId`, issues)
  if (!validatedShots.some((shot) => shot.id === input.activeShotId)) {
    issues.push({ path: `${path}.activeShotId`, message: 'activeShotId must reference a shot in this project.' })
  }

  if (!frameRate || !shots) return undefined

  return {
    schemaVersion: 1,
    id: input.id as string,
    name: input.name as string,
    createdAt: input.createdAt as string,
    updatedAt: input.updatedAt as string,
    unitSystem: 'metric',
    frameRate,
    shots: validatedShots,
    activeShotId: input.activeShotId as string,
  }
}

function validateShot(input: unknown, path: string, issues: ValidationIssue[]): ShotDocument | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Shot must be an object.' })
    return undefined
  }

  onlyKeys(
    input,
    ['id', 'name', 'description', 'startFrame', 'endFrame', 'markIn', 'markOut', 'frame', 'actors', 'props', 'cameras', 'lights', 'timeline', 'activeCameraId'],
    path,
    issues,
  )
  requireId(input.id, `${path}.id`, issues)
  requireNonEmptyString(input.name, `${path}.name`, issues)
  if (input.description !== undefined && typeof input.description !== 'string') issues.push({ path: `${path}.description`, message: 'description must be a string.' })
  const startFrame = requireInteger(input.startFrame, `${path}.startFrame`, issues)
  const endFrame = requireInteger(input.endFrame, `${path}.endFrame`, issues)
  const markIn = requireInteger(input.markIn, `${path}.markIn`, issues)
  const markOut = requireInteger(input.markOut, `${path}.markOut`, issues)
  if (startFrame !== undefined && endFrame !== undefined && markIn !== undefined && markOut !== undefined) {
    for (const message of validateMarkRange({ startFrame, endFrame, markIn, markOut })) {
      issues.push({ path: `${path}.markIn`, message })
    }
  }

  const frame = validateFrameSettings(input.frame, `${path}.frame`, issues)
  const actors = validateArray(input.actors, `${path}.actors`, issues, validateActor)
  const props = validateArray(input.props, `${path}.props`, issues, validateProp)
  const cameras = validateArray(input.cameras, `${path}.cameras`, issues, validateCamera)
  const lights = validateArray(input.lights, `${path}.lights`, issues, validateLight)
  const timeline = validateTimeline(input.timeline, `${path}.timeline`, issues)
  requireId(input.activeCameraId, `${path}.activeCameraId`, issues)

  if (cameras && !cameras.some((camera) => camera.id === input.activeCameraId)) {
    issues.push({ path: `${path}.activeCameraId`, message: 'activeCameraId must reference a camera in this shot.' })
  }
  if (timeline && cameras && actors && props && lights) {
    const entityIds = new Set([...actors, ...props, ...cameras, ...lights].map((entity) => entity.id))
    if (entityIds.size !== actors.length + props.length + cameras.length + lights.length) {
      issues.push({ path, message: 'Entity IDs must be unique within a shot.' })
    }
    timeline.tracks.forEach((track, index) => {
      if (!entityIds.has(track.entityId)) issues.push({ path: `${path}.timeline.tracks[${index}].entityId`, message: 'Timeline track must reference an entity in this shot.' })
    })
  }

  if (
    startFrame === undefined || endFrame === undefined || markIn === undefined || markOut === undefined ||
    !frame || !actors || !props || !cameras || !lights || !timeline
  ) return undefined

  return {
    id: input.id as string,
    name: input.name as string,
    ...(input.description === undefined ? {} : { description: input.description as string }),
    startFrame,
    endFrame,
    markIn,
    markOut,
    frame,
    actors,
    props,
    cameras,
    lights,
    timeline,
    activeCameraId: input.activeCameraId as string,
  }
}

function validateActor(input: unknown, path: string, issues: ValidationIssue[]): ActorDocument | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Actor must be an object.' })
    return undefined
  }
  onlyKeys(input, ['id', 'name', 'role', 'appearance', 'placement'], path, issues)
  requireId(input.id, `${path}.id`, issues)
  requireNonEmptyString(input.name, `${path}.name`, issues)
  if (input.role !== undefined && typeof input.role !== 'string') issues.push({ path: `${path}.role`, message: 'role must be a string.' })
  const appearance = validateActorAppearance(input.appearance, `${path}.appearance`, issues)
  const placement = validatePlacement(input.placement, `${path}.placement`, issues)
  if (!appearance || !placement) return undefined
  return { id: input.id as string, name: input.name as string, ...(input.role === undefined ? {} : { role: input.role as string }), appearance, placement }
}

function validateProp(input: unknown, path: string, issues: ValidationIssue[]): PropDocument | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Prop must be an object.' })
    return undefined
  }
  onlyKeys(input, ['id', 'name', 'appearance', 'placement'], path, issues)
  requireId(input.id, `${path}.id`, issues)
  requireNonEmptyString(input.name, `${path}.name`, issues)
  const appearance = validatePropAppearance(input.appearance, `${path}.appearance`, issues)
  const placement = validatePlacement(input.placement, `${path}.placement`, issues)
  if (!appearance || !placement) return undefined
  return { id: input.id as string, name: input.name as string, appearance, placement }
}

function validateCamera(input: unknown, path: string, issues: ValidationIssue[]): CameraDocument | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Camera must be an object.' })
    return undefined
  }
  onlyKeys(input, ['id', 'name', 'placement', 'lens', 'aim'], path, issues)
  requireId(input.id, `${path}.id`, issues)
  requireNonEmptyString(input.name, `${path}.name`, issues)
  const placement = validatePlacement(input.placement, `${path}.placement`, issues)
  const lens = validateLens(input.lens, `${path}.lens`, issues)
  const aim = validateAim(input.aim, `${path}.aim`, issues)
  if (!placement || !lens || !aim) return undefined
  return { id: input.id as string, name: input.name as string, placement, lens, aim }
}

function validateLight(input: unknown, path: string, issues: ValidationIssue[]): LightDocument | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Light must be an object.' })
    return undefined
  }
  onlyKeys(input, ['id', 'name', 'role', 'type', 'color', 'intensity', 'placement', 'target'], path, issues)
  requireId(input.id, `${path}.id`, issues)
  requireNonEmptyString(input.name, `${path}.name`, issues)
  if (!['key', 'fill', 'rim', 'practical'].includes(input.role as string)) issues.push({ path: `${path}.role`, message: 'Invalid light role.' })
  if (!['area', 'point', 'directional'].includes(input.type as string)) issues.push({ path: `${path}.type`, message: 'Invalid light type.' })
  requireNonEmptyString(input.color, `${path}.color`, issues)
  const intensity = requireFinite(input.intensity, `${path}.intensity`, issues)
  const placement = validatePlacement(input.placement, `${path}.placement`, issues)
  const target = input.target === undefined ? undefined : validateVec3(input.target, `${path}.target`, issues)
  if (!placement || intensity === undefined || (input.target !== undefined && !target)) return undefined
  return { id: input.id as string, name: input.name as string, role: input.role as LightDocument['role'], type: input.type as LightDocument['type'], color: input.color as string, intensity, placement, ...(target ? { target } : {}) }
}

function validateFrameRate(input: unknown, path: string, issues: ValidationIssue[]): FrameRate | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'frameRate must be an object with numerator and denominator.' })
    return undefined
  }
  onlyKeys(input, ['numerator', 'denominator'], path, issues)
  const numerator = requireInteger(input.numerator, `${path}.numerator`, issues)
  const denominator = requireInteger(input.denominator, `${path}.denominator`, issues)
  if (numerator === undefined || denominator === undefined || !isValidFrameRate({ numerator, denominator })) {
    issues.push({ path, message: 'frameRate must use positive integer numerator and denominator values.' })
    return undefined
  }
  return { numerator, denominator }
}

function validateFrameSettings(input: unknown, path: string, issues: ValidationIssue[]): FrameSettings | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Frame settings must be an object.' })
    return undefined
  }
  onlyKeys(input, ['aspectRatio', 'guideOptions', 'safeAreaPercent'], path, issues)
  const aspectRatio = isRecord(input.aspectRatio) ? input.aspectRatio : undefined
  if (!aspectRatio) issues.push({ path: `${path}.aspectRatio`, message: 'aspectRatio must be an object.' })
  const width = aspectRatio ? requireFinite(aspectRatio.width, `${path}.aspectRatio.width`, issues) : undefined
  const height = aspectRatio ? requireFinite(aspectRatio.height, `${path}.aspectRatio.height`, issues) : undefined
  if (width !== undefined && width <= 0) issues.push({ path: `${path}.aspectRatio.width`, message: 'Aspect ratio width must be greater than zero.' })
  if (height !== undefined && height <= 0) issues.push({ path: `${path}.aspectRatio.height`, message: 'Aspect ratio height must be greater than zero.' })
  const guideOptions = isRecord(input.guideOptions) ? input.guideOptions : undefined
  if (!guideOptions) issues.push({ path: `${path}.guideOptions`, message: 'guideOptions must be an object.' })
  const booleans = ['showSafeAreas', 'showCenterMarks', 'showThirds', 'showHorizon'] as const
  booleans.forEach((key) => {
    if (guideOptions && typeof guideOptions[key] !== 'boolean') issues.push({ path: `${path}.guideOptions.${key}`, message: `${key} must be a boolean.` })
  })
  const safeAreaPercent = requireFinite(input.safeAreaPercent, `${path}.safeAreaPercent`, issues)
  if (safeAreaPercent !== undefined && (safeAreaPercent <= 0 || safeAreaPercent > 100)) issues.push({ path: `${path}.safeAreaPercent`, message: 'safeAreaPercent must be greater than 0 and no greater than 100.' })
  if (!width || !height || !guideOptions || safeAreaPercent === undefined) return undefined
  return { aspectRatio: { width, height }, guideOptions: { showSafeAreas: guideOptions.showSafeAreas as boolean, showCenterMarks: guideOptions.showCenterMarks as boolean, showThirds: guideOptions.showThirds as boolean, showHorizon: guideOptions.showHorizon as boolean }, safeAreaPercent }
}

function validateTimeline(input: unknown, path: string, issues: ValidationIssue[]): { tracks: TimelineTrack[] } | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'timeline must be an object.' })
    return undefined
  }
  onlyKeys(input, ['tracks'], path, issues)
  if (!Array.isArray(input.tracks)) {
    issues.push({ path: `${path}.tracks`, message: 'tracks must be an array.' })
    return undefined
  }
  const tracks = input.tracks.map((track, index) => validateTrack(track, `${path}.tracks[${index}]`, issues)).filter((track): track is TimelineTrack => track !== undefined)
  return { tracks }
}

function validateTrack(input: unknown, path: string, issues: ValidationIssue[]): TimelineTrack | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Timeline track must be an object.' })
    return undefined
  }
  onlyKeys(input, ['id', 'entityId', 'property', 'keyframes'], path, issues)
  requireId(input.id, `${path}.id`, issues)
  requireId(input.entityId, `${path}.entityId`, issues)
  if (!['position', 'rotation', 'focalLengthMm', 'focusDistanceM'].includes(input.property as string)) {
    issues.push({ path: `${path}.property`, message: 'Invalid timeline property.' })
    return undefined
  }
  if (!Array.isArray(input.keyframes)) {
    issues.push({ path: `${path}.keyframes`, message: 'keyframes must be an array.' })
    return undefined
  }
  const keyframes = input.keyframes.map((keyframe, index) => validateKeyframe(keyframe, input.property as string, `${path}.keyframes[${index}]`, issues)).filter((keyframe): keyframe is Keyframe<unknown> => keyframe !== undefined)
  const seenFrames = new Set<number>()
  keyframes.forEach((keyframe, index) => {
    if (seenFrames.has(keyframe.frame)) issues.push({ path: `${path}.keyframes[${index}].frame`, message: 'Duplicate keyframe frames are not valid in a project file.' })
    seenFrames.add(keyframe.frame)
  })
  return { id: input.id as string, entityId: input.entityId as string, property: input.property as TimelineTrack['property'], keyframes: keyframes as never }
}

function validateKeyframe(input: unknown, property: string, path: string, issues: ValidationIssue[]): Keyframe<unknown> | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Keyframe must be an object.' })
    return undefined
  }
  onlyKeys(input, ['id', 'frame', 'value', 'interpolation'], path, issues)
  requireId(input.id, `${path}.id`, issues)
  const frame = requireInteger(input.frame, `${path}.frame`, issues)
  if (!['step', 'linear'].includes(input.interpolation as string)) issues.push({ path: `${path}.interpolation`, message: 'Only step and linear interpolation are supported.' })
  const value = validateTimelineValue(input.value, property, `${path}.value`, issues)
  if (frame === undefined || value === undefined) return undefined
  return { id: input.id as string, frame, value, interpolation: input.interpolation as 'step' | 'linear' }
}

function validateTimelineValue(input: unknown, property: string, path: string, issues: ValidationIssue[]): unknown {
  if (property === 'focalLengthMm' || property === 'focusDistanceM') return requireFinite(input, path, issues)
  if (property === 'position') return validateVec3(input, path, issues)
  if (!isRecord(input)) {
    issues.push({ path, message: 'rotation value must be an object.' })
    return undefined
  }
  onlyKeys(input, ['order', 'radians'], path, issues)
  if (input.order !== 'XYZ') issues.push({ path: `${path}.order`, message: 'Rotation order must be XYZ.' })
  const radians = validateVec3(input.radians, `${path}.radians`, issues)
  return radians ? { order: 'XYZ', radians } : undefined
}

function validateLens(input: unknown, path: string, issues: ValidationIssue[]): CameraDocument['lens'] | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'lens must be an object.' })
    return undefined
  }
  onlyKeys(input, ['focalLengthMm', 'sensorFormat', 'profile', 'focusDistanceM'], path, issues)
  const focalLengthMm = requireFinite(input.focalLengthMm, `${path}.focalLengthMm`, issues)
  const sensorFormat = validateSensorFormat(input.sensorFormat, `${path}.sensorFormat`, issues)
  const profile = validateLensProfile(input.profile, `${path}.profile`, issues)
  const focusDistanceM = requireFinite(input.focusDistanceM, `${path}.focusDistanceM`, issues)
  if (focalLengthMm !== undefined && focalLengthMm <= 0) issues.push({ path: `${path}.focalLengthMm`, message: 'Focal length must be greater than zero.' })
  if (focusDistanceM !== undefined && focusDistanceM <= 0) issues.push({ path: `${path}.focusDistanceM`, message: 'Focus distance must be greater than zero.' })
  if (!sensorFormat || !profile || focalLengthMm === undefined || focusDistanceM === undefined) return undefined
  return { focalLengthMm, sensorFormat, profile, focusDistanceM }
}

function validateSensorFormat(input: unknown, path: string, issues: ValidationIssue[]): SensorFormat | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'sensorFormat must be an object.' })
    return undefined
  }
  if (input.kind === 'preset') {
    onlyKeys(input, ['kind', 'preset'], path, issues)
    if (!['full-frame', 'super-35', 'micro-four-thirds', 'academy'].includes(input.preset as string)) issues.push({ path: `${path}.preset`, message: 'Unknown sensor preset.' })
    return { kind: 'preset', preset: input.preset as SensorPresetId }
  }
  if (input.kind === 'custom') {
    onlyKeys(input, ['kind', 'widthMm', 'heightMm'], path, issues)
    const widthMm = requireFinite(input.widthMm, `${path}.widthMm`, issues)
    const heightMm = requireFinite(input.heightMm, `${path}.heightMm`, issues)
    if (widthMm !== undefined && widthMm <= 0) issues.push({ path: `${path}.widthMm`, message: 'Custom sensor width must be greater than zero.' })
    if (heightMm !== undefined && heightMm <= 0) issues.push({ path: `${path}.heightMm`, message: 'Custom sensor height must be greater than zero.' })
    if (widthMm === undefined || heightMm === undefined) return undefined
    return { kind: 'custom', widthMm, heightMm }
  }
  issues.push({ path: `${path}.kind`, message: 'sensorFormat.kind must be preset or custom.' })
  return undefined
}

function validateLensProfile(input: unknown, path: string, issues: ValidationIssue[]): CameraDocument['lens']['profile'] | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'profile must be an object.' })
    return undefined
  }
  onlyKeys(input, ['type', 'preset', 'squeezeFactor'], path, issues)
  const squeezeFactor = requireFinite(input.squeezeFactor, `${path}.squeezeFactor`, issues)
  if (squeezeFactor === undefined || squeezeFactor <= 0) issues.push({ path: `${path}.squeezeFactor`, message: 'squeezeFactor must be greater than zero.' })
  if (input.type === 'spherical') {
    if (input.preset !== 'spherical') issues.push({ path: `${path}.preset`, message: 'Spherical lenses must use the spherical preset.' })
    if (squeezeFactor !== 1) issues.push({ path: `${path}.squeezeFactor`, message: 'Spherical lenses must use a 1.0x squeeze factor.' })
    return { type: 'spherical', preset: 'spherical', squeezeFactor: 1 }
  }
  if (input.type !== 'anamorphic') {
    issues.push({ path: `${path}.type`, message: 'Lens type must be spherical or anamorphic.' })
    return undefined
  }
  if (!['1.33', '1.5', '1.8', '2.0', 'custom'].includes(input.preset as string)) issues.push({ path: `${path}.preset`, message: 'Unknown anamorphic preset.' })
  if (squeezeFactor === undefined) return undefined
  return { type: 'anamorphic', preset: input.preset as '1.33' | '1.5' | '1.8' | '2.0' | 'custom', squeezeFactor }
}

function validateAim(input: unknown, path: string, issues: ValidationIssue[]): CameraDocument['aim'] | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'aim must be an object.' })
    return undefined
  }
  if (input.mode === 'free') {
    onlyKeys(input, ['mode'], path, issues)
    return { mode: 'free' }
  }
  if (input.mode !== 'look-at') {
    issues.push({ path: `${path}.mode`, message: 'Camera aim mode must be free or look-at.' })
    return undefined
  }
  onlyKeys(input, ['mode', 'targetEntityId', 'targetPoint'], path, issues)
  if (input.targetEntityId !== undefined) requireId(input.targetEntityId, `${path}.targetEntityId`, issues)
  const targetPoint = input.targetPoint === undefined ? undefined : validateVec3(input.targetPoint, `${path}.targetPoint`, issues)
  if (input.targetEntityId === undefined && targetPoint === undefined) issues.push({ path, message: 'Look-at aim requires targetEntityId or targetPoint.' })
  return { mode: 'look-at', ...(input.targetEntityId === undefined ? {} : { targetEntityId: input.targetEntityId as string }), ...(targetPoint ? { targetPoint } : {}) }
}

function validatePlacement(input: unknown, path: string, issues: ValidationIssue[]): Placement | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'placement must be an object.' })
    return undefined
  }
  onlyKeys(input, ['position', 'rotation'], path, issues)
  const position = validateVec3(input.position, `${path}.position`, issues)
  const rotation = validateRotation(input.rotation, `${path}.rotation`, issues)
  if (!position || !rotation) return undefined
  return { position, rotation }
}

function validateRotation(input: unknown, path: string, issues: ValidationIssue[]): EulerRotation | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'rotation must be an object.' })
    return undefined
  }
  onlyKeys(input, ['order', 'radians'], path, issues)
  if (input.order !== 'XYZ') issues.push({ path: `${path}.order`, message: 'Rotation order must be XYZ.' })
  const radians = validateVec3(input.radians, `${path}.radians`, issues)
  return radians ? { order: 'XYZ', radians } : undefined
}

function validateVec3(input: unknown, path: string, issues: ValidationIssue[]): Vec3 | undefined {
  if (!Array.isArray(input) || input.length !== 3) {
    issues.push({ path, message: 'Expected a three-number vector.' })
    return undefined
  }
  const values = input.map((value, index) => requireFinite(value, `${path}[${index}]`, issues))
  if (values.some((value): value is undefined => value === undefined)) return undefined
  return values as Vec3
}

function validateActorAppearance(input: unknown, path: string, issues: ValidationIssue[]): ActorDocument['appearance'] | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Actor appearance must be an object.' })
    return undefined
  }
  onlyKeys(input, ['color', 'heightM', 'representation'], path, issues)
  requireNonEmptyString(input.color, `${path}.color`, issues)
  const heightM = requireFinite(input.heightM, `${path}.heightM`, issues)
  if (heightM !== undefined && heightM <= 0) issues.push({ path: `${path}.heightM`, message: 'Actor height must be greater than zero.' })
  if (!['person-proxy', 'box-proxy'].includes(input.representation as string)) issues.push({ path: `${path}.representation`, message: 'Invalid actor representation.' })
  if (heightM === undefined) return undefined
  return { color: input.color as string, heightM, representation: input.representation as ActorDocument['appearance']['representation'] }
}

function validatePropAppearance(input: unknown, path: string, issues: ValidationIssue[]): PropDocument['appearance'] | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Prop appearance must be an object.' })
    return undefined
  }
  onlyKeys(input, ['color', 'dimensionsM', 'representation'], path, issues)
  requireNonEmptyString(input.color, `${path}.color`, issues)
  const dimensionsM = validateVec3(input.dimensionsM, `${path}.dimensionsM`, issues)
  if (dimensionsM && dimensionsM.some((dimension) => dimension <= 0)) issues.push({ path: `${path}.dimensionsM`, message: 'Prop dimensions must be greater than zero.' })
  if (!['box-proxy', 'cylinder-proxy', 'plane-proxy'].includes(input.representation as string)) issues.push({ path: `${path}.representation`, message: 'Invalid prop representation.' })
  if (!dimensionsM) return undefined
  return { color: input.color as string, dimensionsM, representation: input.representation as PropDocument['appearance']['representation'] }
}

function validateArray<T>(input: unknown, path: string, issues: ValidationIssue[], validate: (value: unknown, path: string, issues: ValidationIssue[]) => T | undefined): T[] | undefined {
  if (!Array.isArray(input)) {
    issues.push({ path, message: 'Expected an array.' })
    return undefined
  }
  return input.map((value, index) => validate(value, `${path}[${index}]`, issues)).filter((value): value is T => value !== undefined)
}

function onlyKeys(input: Record<string, unknown>, keys: string[], path: string, issues: ValidationIssue[]): void {
  const allowed = new Set(keys)
  Object.keys(input).filter((key) => !allowed.has(key)).forEach((key) => issues.push({ path: `${path}.${key}`, message: 'Unexpected field.' }))
}

function requireId(input: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(input) || input.includes('/') || input.includes('\\')) issues.push({ path, message: 'ID must be a non-empty portable identifier.' })
}

function requireNonEmptyString(input: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(input)) issues.push({ path, message: 'Expected a non-empty string.' })
}

function requireFinite(input: unknown, path: string, issues: ValidationIssue[]): number | undefined {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    issues.push({ path, message: 'Expected a finite number.' })
    return undefined
  }
  return input
}

function requireInteger(input: unknown, path: string, issues: ValidationIssue[]): number | undefined {
  const value = requireFinite(input, path, issues)
  if (value !== undefined && !Number.isInteger(value)) {
    issues.push({ path, message: 'Expected an integer.' })
    return undefined
  }
  return value
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0
}

function isInteger(input: unknown): input is number {
  return typeof input === 'number' && Number.isInteger(input)
}

function invalid<T>(code: Exclude<ValidationResult<T>, { valid: true }>['code'], errors: ValidationIssue[]): ValidationResult<T> {
  return { valid: false, code, errors }
}
