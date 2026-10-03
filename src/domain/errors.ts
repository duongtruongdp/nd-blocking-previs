export type ProjectErrorCode =
  | 'invalid-json'
  | 'invalid-format'
  | 'unsupported-version'
  | 'validation-failed'
  | 'migration-failed'

export type ProjectErrorDetail = {
  path: string
  message: string
}

export class ProjectFileError extends Error {
  readonly code: ProjectErrorCode
  readonly details: ProjectErrorDetail[]

  constructor(
    code: ProjectErrorCode,
    message: string,
    details: ProjectErrorDetail[] = [],
  ) {
    super(message)
    this.name = 'ProjectFileError'
    this.code = code
    this.details = details
  }
}
