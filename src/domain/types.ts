export const CURRENT_PROJECT_FORMAT_VERSION = 1 as const
export const CURRENT_PROJECT_SCHEMA_VERSION = 1 as const

export type ProjectFormatVersion = typeof CURRENT_PROJECT_FORMAT_VERSION
export type ProjectSchemaVersion = typeof CURRENT_PROJECT_SCHEMA_VERSION

export type Vec3 = [number, number, number]

export type CharacterType = 'male' | 'female'

export type PoseCategory = 'standing' | 'sitting' | 'lying' | 'walking' | 'action' | 'custom'

export type EulerRotation = {
  order: 'XYZ'
  radians: Vec3
}

export type Placement = {
  position: Vec3
  rotation: EulerRotation
}

export type FrameRate = {
  numerator: number
  denominator: number
}

export type SensorPresetId =
  | 'full-frame'
  | 'super-35'
  | 'micro-four-thirds'
  | 'academy'

export type SensorFormat =
  | {
      kind: 'preset'
      preset: SensorPresetId
    }
  | {
      kind: 'custom'
      widthMm: number
      heightMm: number
    }

export type LensProfile =
  | {
      type: 'spherical'
      preset: 'spherical'
      squeezeFactor: 1
    }
  | {
      type: 'anamorphic'
      preset: '1.33' | '1.5' | '1.8' | '2.0' | 'custom'
      squeezeFactor: number
    }

export type CameraAim =
  | {
      mode: 'free'
    }
  | {
      mode: 'look-at'
      targetEntityId?: string
      targetPoint?: Vec3
    }

export type CameraDocument = {
  id: string
  name: string
  placement: Placement
  lens: {
    focalLengthMm: number
    sensorFormat: SensorFormat
    profile: LensProfile
    focusDistanceM: number
  }
  aim: CameraAim
}

export type ActorDocument = {
  id: string
  name: string
  role?: string
  character: {
    characterId: string
  }
  appearance: {
    color: string
    heightM: number
    representation: 'person-proxy' | 'box-proxy'
  }
  pose: {
    poseId: string
  }
  placement: Placement
}

export type PropDocument = {
  id: string
  name: string
  appearance: {
    color: string
    dimensionsM: Vec3
    propType: 'cube' | 'cylinder' | 'wall' | 'floor' | 'table' | 'chair'
    representation: 'box-proxy' | 'cylinder-proxy' | 'plane-proxy'
  }
  placement: Placement
}

export type LightDocument = {
  id: string
  name: string
  role: 'key' | 'fill' | 'rim' | 'practical'
  type: 'area' | 'point' | 'directional'
  color: string
  intensity: number
  placement: Placement
  target?: Vec3
}

export type FrameSettings = {
  aspectRatio: {
    width: number
    height: number
  }
  guideOptions: {
    showSafeAreas: boolean
    showCenterMarks: boolean
    showThirds: boolean
    showHorizon: boolean
  }
  safeAreaPercent: number
}

export type KeyframeInterpolation = 'step' | 'linear'

export type Keyframe<TValue> = {
  id: string
  frame: number
  value: TValue
  interpolation: KeyframeInterpolation
}

export type TimelineTrack =
  | {
      id: string
      entityId: string
      property: 'position'
      keyframes: Array<Keyframe<Vec3>>
    }
  | {
      id: string
      entityId: string
      property: 'rotation'
      keyframes: Array<Keyframe<EulerRotation>>
    }
  | {
      id: string
      entityId: string
      property: 'focalLengthMm'
      keyframes: Array<Keyframe<number>>
    }
  | {
      id: string
      entityId: string
      property: 'focusDistanceM'
      keyframes: Array<Keyframe<number>>
    }

export type TimelineDocument = {
  tracks: TimelineTrack[]
}

export type ShotDocument = {
  id: string
  name: string
  description?: string
  startFrame: number
  endFrame: number
  markIn: number
  markOut: number
  frame: FrameSettings
  actors: ActorDocument[]
  props: PropDocument[]
  cameras: CameraDocument[]
  lights: LightDocument[]
  timeline: TimelineDocument
  activeCameraId: string | null
}

export type ProjectDocument = {
  schemaVersion: ProjectSchemaVersion
  id: string
  name: string
  createdAt: string
  updatedAt: string
  unitSystem: 'metric'
  frameRate: FrameRate
  shots: ShotDocument[]
  activeShotId: string
}

export type ProjectFile = {
  format: 'nd-blocking-previs'
  formatVersion: ProjectFormatVersion
  generator: {
    application: 'ND Blocking & Previs'
    version: string
  }
  project: ProjectDocument
}
