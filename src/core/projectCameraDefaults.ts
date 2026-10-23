import { CAMERA_DATABASE, defaultCaptureModeForDefinition, type CameraDefinition, type CaptureModeDefinition } from './cameraDatabase'

/** Resolve an explicit project model by ID; database order is only the final fallback. */
export function resolveProjectCameraDefinition(modelId: string | undefined, database: readonly CameraDefinition[] = CAMERA_DATABASE): CameraDefinition | null {
  return database.find((definition) => definition.id === modelId) ?? database[0] ?? null
}

export function projectCameraCreationSpec(modelId: string | undefined, database: readonly CameraDefinition[] = CAMERA_DATABASE): { definition: CameraDefinition; captureMode: CaptureModeDefinition } | null {
  const definition = resolveProjectCameraDefinition(modelId, database)
  return definition ? { definition, captureMode: defaultCaptureModeForDefinition(definition) } : null
}
