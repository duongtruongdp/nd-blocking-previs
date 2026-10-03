import { ProjectFileError } from './errors'
import { CURRENT_PROJECT_FORMAT_VERSION, type ProjectDocument, type ProjectFile } from './types'
import { validateProjectFile } from './validation'

export const APPLICATION_VERSION = '0.0.0'

export function serializeProject(project: ProjectDocument, generatorVersion = APPLICATION_VERSION): string {
  const file: ProjectFile = {
    format: 'nd-blocking-previs',
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    generator: {
      application: 'ND Blocking & Previs',
      version: generatorVersion,
    },
    project,
  }

  const validated = validateProjectFile(file)
  if (!validated.valid) throw projectErrorFromValidation(validated)

  assertPortableJson(file)
  return `${JSON.stringify(file, null, 2)}\n`
}

export function deserializeProject(contents: string): ProjectDocument {
  let input: unknown
  try {
    input = JSON.parse(contents) as unknown
  } catch (error) {
    throw new ProjectFileError('invalid-json', 'The project file is not valid JSON.', [
      { path: '$', message: error instanceof Error ? error.message : 'JSON parsing failed.' },
    ])
  }

  return migrateProjectFile(input).project
}

export function migrateProjectFile(input: unknown): ProjectFile {
  const validated = validateProjectFile(input)
  if (!validated.valid) throw projectErrorFromValidation(validated)

  // The migration seam is intentionally explicit. Future versions should add
  // migrateV1ToV2, then validate the resulting V2 document before returning it.
  return validated.value
}

function projectErrorFromValidation(result: Exclude<ReturnType<typeof validateProjectFile>, { valid: true }>): ProjectFileError {
  return new ProjectFileError(
    result.code,
    result.errors[0]?.message ?? 'Project file validation failed.',
    result.errors,
  )
}

function assertPortableJson(value: unknown, path = '$', seen = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ProjectFileError('validation-failed', 'Project data contains a non-finite number.', [{ path, message: 'Numbers must be finite.' }])
    return
  }
  if (typeof value !== 'object' || value === undefined) {
    throw new ProjectFileError('validation-failed', 'Project data contains a non-portable runtime value.', [{ path, message: 'Only JSON-compatible values are allowed.' }])
  }
  if (seen.has(value)) throw new ProjectFileError('validation-failed', 'Project data contains a circular reference.', [{ path, message: 'Circular references are not portable.' }])
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertPortableJson(child, `${path}[${index}]`, seen))
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new ProjectFileError('validation-failed', 'Project data contains a runtime object.', [{ path, message: 'Only plain objects are portable.' }])
    }
    Object.entries(value).forEach(([key, child]) => assertPortableJson(child, `${path}.${key}`, seen))
  }
  seen.delete(value)
}
