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

export type ActorAppearance = {
  bodyVariant: 'neutral'
  primaryColor: string
}

export type PropShape = 'cube' | 'sphere' | 'cylinder'

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

export type TimelineEntityType = 'Actor' | 'Prop' | 'Camera'
export type TimelineProperty = 'position' | 'heading' | 'rotation' | 'focalLengthMm'
export type TimelineInterpolation = 'linear' | 'hold'
export type TimelineValue = number | ActorVector3

export type TimelineKeyframe = {
  id: string
  frame: number
  value: TimelineValue
  interpolation: TimelineInterpolation
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
  primaryColor: string
}

export type ActorDocument = {
  id: string
  name: string
  position: ActorVector3
  rotation: ActorVector3
  scale: ActorVector3
  appearance: ActorAppearance
  pose: ActorPose
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
  cameras: CameraDocument[]
  activeCameraId: string | null
  lights: unknown[]
  timeline: TimelineDocument
}

export type SceneTransformCommit = {
  entityId: string
  position: ActorVector3
  rotation: ActorVector3
}

export function applySceneEntityTransform(document: SceneDocument, change: SceneTransformCommit): SceneDocument {
  return {
    ...document,
    metadata: { ...document.metadata, updatedAt: new Date().toISOString() },
    actors: document.actors.map((actor) => actor.id === change.entityId ? { ...actor, position: [...change.position], rotation: [...change.rotation] } : actor),
    props: document.props.map((prop) => prop.id === change.entityId ? { ...prop, position: [...change.position], rotation: [...change.rotation] } : prop),
    cameras: document.cameras.map((camera) => camera.id === change.entityId ? { ...camera, position: [...change.position], rotation: [...change.rotation] } : camera),
  }
}

export function createStandingActorPose(): ActorPose {
  const zero: ActorVector3 = [0, 0, 0]
  return {
    pelvis: [...zero],
    torso: [...zero],
    head: [...zero],
    leftShoulder: [0, 0, -0.12],
    leftElbow: [0, 0, 0.08],
    rightShoulder: [0, 0, 0.12],
    rightElbow: [0, 0, -0.08],
    leftHip: [...zero],
    leftKnee: [...zero],
    rightHip: [...zero],
    rightKnee: [...zero],
  }
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
    frameGuides: [],
  }
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
