import { createActorPoseForPreset } from './actorPosePresets'

export type RationalFrameRate = {
  numerator: number
  denominator: number
}

export type ActorVector3 = [number, number, number]

export type ActorJointName =
  | 'pelvis'
  | 'torso'
  | 'head'
  | 'leftShoulder'
  | 'leftElbow'
  | 'rightShoulder'
  | 'rightElbow'
  | 'leftHip'
  | 'leftKnee'
  | 'rightHip'
  | 'rightKnee'

export type ActorPose = Record<ActorJointName, ActorVector3>
export type ActorPosePreset = 'standing' | 'relaxed' | 'walking' | 'sitting' | 'kneeling' | 'crouching' | 'lying' | 'reaching' | 'arms-crossed' | 'hands-on-hips'

export type ActorAppearance = {
  bodyVariant: 'neutral'
  primaryColor: string
}

export type PropShape = 'cube' | 'sphere' | 'cylinder'
export type ScenicPropType = PropShape | 'table' | 'chair' | 'window' | 'door' | 'bicycle' | 'motorbike' | 'car'
export type WallVector3 = [number, number, number]
export type OpeningType = 'door' | 'window'
export type HingeSide = 'left' | 'right'

export type CameraLensType = 'Spherical' | 'Anamorphic'
export type CameraDeliveryFrame = 'sensor' | '16:9' | '1.85' | '2.00' | '2.39'

export type CameraPhysicalSnapshot = {
  manufacturer: string
  model: string
  captureModeName: string
  activeWidthMm: number
  activeHeightMm: number
  recordingWidthPx: number
  recordingHeightPx: number
  sensorFormatLabel: string
  databaseVersionAtSave: number
}

export type FrameGuideLineStyle = 'solid' | 'dashed'

export type FrameGuide = {
  id: string
  name: string
  aspectRatio: number
  enabled: boolean
  lineStyle: FrameGuideLineStyle
  opacity: number
  lineWeight: number
  color: string
  shadeOutside: boolean
  shadeOpacity: number
  safeMarginPercent: number
}

export type TimelineEntityType = 'Actor' | 'Prop' | 'Wall' | 'Opening' | 'Sun' | 'Camera'
export type TimelineProperty = 'position' | 'heading' | 'rotation' | 'focalLengthMm' | 'openAngle' | 'azimuth' | 'elevation' | 'intensity' | 'color'
export type TimelineInterpolation = 'linear' | 'hold'
export type TimelineEasingMode = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
export type TimelineEasing = { easeIn?: boolean; easeOut?: boolean }
export type TimelineValue = number | string | ActorVector3

export type TimelineKeyframe = {
  id: string
  frame: number
  value: TimelineValue
  interpolation: TimelineInterpolation
  /** Optional temporal easing flags. Missing flags preserve legacy linear behavior. */
  easeIn?: boolean
  easeOut?: boolean
}

export type TimelineTrack = {
  id: string
  entityId: string
  entityType: TimelineEntityType
  property: TimelineProperty
  keyframes: TimelineKeyframe[]
}

export type TimelineDocument = {
  currentFrame: number
  startFrame: number
  endFrame: number
  markIn: number
  markOut: number
  frameRate: RationalFrameRate
  tracks: TimelineTrack[]
}

export type CameraDocument = {
  id: string
  name: string
  position: ActorVector3
  rotation: ActorVector3
  cameraDefinitionId: string
  captureModeId: string
  focalLengthMm: number
  lensType: CameraLensType
  anamorphicSqueeze: 1 | 1.3 | 1.33 | 1.5 | 1.6 | 1.8 | 2
  deliveryAspectRatio: CameraDeliveryFrame
  /** Editor-only color for distinguishing camera proxies in Blocking View. */
  proxyColor: string
  frameGuides: FrameGuide[]
  cameraSnapshot?: CameraPhysicalSnapshot
}

export type PropDocument = {
  id: string
  name: string
  type: 'Prop'
  position: ActorVector3
  rotation: ActorVector3
  shape: PropShape
  propType?: ScenicPropType
  primaryColor: string
  dimensions?: ActorVector3
  /** Defaults to one when loading older scene/project files. */
  scale?: ActorVector3
}

export type WallDocument = {
  id: string
  name: string
  type: 'Wall'
  position: ActorVector3
  rotation: ActorVector3
  length: number
  height: number
  thickness: number
  primaryColor: string
}

export type OpeningDocument = {
  id: string
  name: string
  type: 'Opening'
  openingType: OpeningType
  position: ActorVector3
  rotation: ActorVector3
  width: number
  height: number
  depth: number
  sillHeight: number
  hingeSide?: HingeSide
  openAngle?: number
  wallId: string | null
  /** Distance from the wall's start endpoint when wallId is set. */
  offsetAlongWallMeters?: number
  primaryColor: string
}

export type SunDocument = {
  id: string
  name: string
  type: 'Sun'
  azimuth: number
  elevation: number
  intensity: number
  color: string
}

export type ActorDocument = {
  id: string
  name: string
  position: ActorVector3
  rotation: ActorVector3
  scale: ActorVector3
  appearance: ActorAppearance
  pose: ActorPose
  /** Optional for backwards compatibility with older scenes; absent means Standing. */
  posePreset?: ActorPosePreset
}

export type SceneDocument = {
  schemaVersion: 'ndscene-v2'
  metadata: {
    id: string
    name: string
    createdAt: string
    updatedAt: string
  }
  stage: {
    name: string
  }
  actors: ActorDocument[]
  props: PropDocument[]
  walls: WallDocument[]
  openings: OpeningDocument[]
  cameras: CameraDocument[]
  activeCameraId: string | null
  lights: SunDocument[]
  timeline: TimelineDocument
}

export type SceneTransformCommit = {
  entityId: string
  position: ActorVector3
  rotation: ActorVector3
  scale?: ActorVector3
}

export function applySceneEntityTransform(document: SceneDocument, change: SceneTransformCommit): SceneDocument {
  return {
    ...document,
    metadata: { ...document.metadata, updatedAt: new Date().toISOString() },
    actors: document.actors.map((actor) => actor.id === change.entityId ? { ...actor, position: [...change.position], rotation: [...change.rotation] } : actor),
    props: document.props.map((prop) => prop.id === change.entityId ? { ...prop, position: [...change.position], rotation: [...change.rotation], ...(change.scale ? { scale: [...change.scale] as ActorVector3 } : {}) } : prop),
    walls: document.walls.map((wall) => wall.id === change.entityId ? { ...wall, position: [...change.position], rotation: [...change.rotation] } : wall),
    openings: document.openings.map((opening) => opening.id === change.entityId ? { ...opening, position: [...change.position], rotation: [...change.rotation] } : opening),
    cameras: document.cameras.map((camera) => camera.id === change.entityId ? { ...camera, position: [...change.position], rotation: [...change.rotation] } : camera),
  }
}

export function createStandingActorPose(): ActorPose {
  return createActorPoseForPreset('standing')
}

export function createActorDocument(id: string, name: string, position: ActorVector3): ActorDocument {
  return {
    id,
    name,
    position: [...position],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    appearance: { bodyVariant: 'neutral', primaryColor: '#7f72c9' },
    pose: createStandingActorPose(),
    posePreset: 'standing',
  }
}

export function createCameraDocument(id: string, name: string, position: ActorVector3, rotation: ActorVector3, cameraDefinitionId: string, captureModeId: string): CameraDocument {
  return {
    id,
    name,
    position: [...position],
    rotation: [...rotation],
    cameraDefinitionId,
    captureModeId,
    focalLengthMm: 35,
    lensType: 'Spherical',
    anamorphicSqueeze: 1,
    deliveryAspectRatio: '16:9',
    proxyColor: '#4e5665',
    frameGuides: [],
  }
}

export function createPropDocument(id: string, name: string, propType: ScenicPropType, position: ActorVector3, primaryColor: string): PropDocument {
  const shape: PropShape = propType === 'sphere' ? 'sphere' : propType === 'cylinder' ? 'cylinder' : 'cube'
  return { id, name, type: 'Prop', position: [...position], rotation: [0, 0, 0], shape, propType, primaryColor, dimensions: defaultScenicDimensions(propType), scale: [1, 1, 1] }
}

export function createWallDocument(id: string, name: string, position: ActorVector3 = [0, 0, -3]): WallDocument {
  return { id, name, type: 'Wall', position: [...position], rotation: [0, 0, 0], length: 6, height: 3, thickness: 0.18, primaryColor: '#c2ad95' }
}

export function createOpeningDocument(id: string, name: string, openingType: OpeningType, position: ActorVector3): OpeningDocument {
  return { id, name, type: 'Opening', openingType, position: [...position], rotation: [0, 0, 0], width: openingType === 'door' ? 0.9 : 1.4, height: openingType === 'door' ? 2.1 : 1.1, depth: 0.16, sillHeight: openingType === 'door' ? 0 : 1.1, hingeSide: 'left', openAngle: 0, wallId: null, primaryColor: openingType === 'door' ? '#806a55' : '#7ba2b4' }
}

export function createSunDocument(id: string, name: string): SunDocument {
  return { id, name, type: 'Sun', azimuth: 135, elevation: 42, intensity: 2.2, color: '#fff1d2' }
}

function defaultScenicDimensions(propType: ScenicPropType): ActorVector3 {
  if (propType === 'table') return [1.8, 0.78, 1]
  if (propType === 'chair') return [0.55, 1, 0.55]
  if (propType === 'window') return [1.4, 1.1, 0.16]
  if (propType === 'door') return [0.9, 2.1, 0.16]
  // Vehicle dimensions use [width X, height Y, length Z]. Forward is -Z.
  if (propType === 'bicycle') return [0.6, 1.1, 1.25]
  if (propType === 'motorbike') return [0.82, 1.15, 2.15]
  if (propType === 'car') return [1.8, 1.45, 3.8]
  return [1.6, 2, 1.6]
}

export function createEmptySceneDocument(): SceneDocument {
  const now = new Date().toISOString()
  return {
    schemaVersion: 'ndscene-v2',
    metadata: {
      id: 'scene-01',
      name: 'Scene 01',
      createdAt: now,
      updatedAt: now,
    },
    stage: { name: 'Untitled Stage' },
    actors: [],
    props: [],
    walls: [],
    openings: [],
    cameras: [],
    activeCameraId: null,
    lights: [],
    timeline: {
      currentFrame: 0,
      startFrame: 0,
      endFrame: 120,
      markIn: 0,
      markOut: 120,
      frameRate: { numerator: 24, denominator: 1 },
      tracks: [],
    },
  }
}
