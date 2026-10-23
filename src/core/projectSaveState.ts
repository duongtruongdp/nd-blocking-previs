export type ProjectSaveResult =
  | { readonly status: 'success'; readonly path: string | null; readonly revision: number }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly error: unknown }

export type ProjectSaveCheckpoint = {
  readonly revision: number
  readonly fingerprint: string
}

export function checkpointForSuccessfulSave(revision: number, fingerprint: string): ProjectSaveCheckpoint {
  return { revision, fingerprint }
}

/**
 * Fingerprint equality is intentional here: it lets undo return to the exact
 * saved document and become clean again, while the revision still identifies
 * which async save was acknowledged by the filesystem.
 */
export function isProjectDirty(currentFingerprint: string, checkpoint: ProjectSaveCheckpoint): boolean {
  return currentFingerprint !== checkpoint.fingerprint
}

export function currentDocumentMatchesSave(currentFingerprint: string, savedFingerprint: string): boolean {
  return currentFingerprint === savedFingerprint
}

export function saveResultAllowsClose(result: ProjectSaveResult): boolean {
  return result.status === 'success'
}
