import { webcrypto } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { zipSync, strToU8, unzipSync } from 'fflate'
import { createEmptySceneDocument } from '../core/sceneDocument'
import { createMasterSequenceDocument, type MasterImageClipDocument } from '../core/masterSequence'
import { createProjectDocument, type ProjectDocument } from '../core/projectDocument'
import { buildProjectPackage, parseProjectPackage, prepareProjectPackageImport, ProjectPackageError, ProjectPackageMediaError, PROJECT_PACKAGE_DOCUMENT_PATH, PROJECT_PACKAGE_MANIFEST_PATH, restoreProjectPackageMedia } from '../core/projectPackage'

beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto)
})

function imageClip(assetId: string, id: string): MasterImageClipDocument {
  return { id, trackId: 'track-1', assetId, startMasterFrame: 0, durationFrames: 24, positionX: 0.5, positionY: 0.5, scale: 1, rotation: 0, opacity: 1, fadeInFrames: 0, fadeOutFrames: 0 }
}

function projectWithImages(assetIds = ['image-1']): ProjectDocument {
  const project = createProjectDocument('project-1', 'Portable Previs', createEmptySceneDocument())
  const sequence = createMasterSequenceDocument()
  project.masterSequence = {
    ...sequence,
    graphicsTracks: [{ id: 'track-1', name: 'Graphics 01', order: 0, visible: true }],
    imageAssets: assetIds.map((id, index) => ({ id, fileName: 'frame-' + index + '.png', mimeType: 'image/png', sizeBytes: 3, lastModified: null, width: 2, height: 2 })),
    imageClips: assetIds.map((id, index) => imageClip(id, 'clip-' + index)),
  }
  return project
}

function memoryStorage(initial: Record<string, Uint8Array> = {}) {
  const files = new Map(Object.entries(initial).map(([key, value]) => [key, new Uint8Array(value)]))
  const key = (projectId: string, kind: string, assetId: string) => projectId + ':' + kind + ':' + assetId
  return {
    files,
    storage: {
      load: async (projectId: string, kind: 'image' | 'audio', assetId: string) => {
        const value = files.get(key(projectId, kind, assetId))
        return value ? new Blob([value.slice().buffer], { type: kind === 'image' ? 'image/png' : 'audio/wav' }) : null
      },
      save: async (projectId: string, kind: 'image' | 'audio', assetId: string, blob: Blob) => {
        files.set(key(projectId, kind, assetId), new Uint8Array(await blob.arrayBuffer()))
        return true
      },
      remove: async (projectId: string, kind: 'image' | 'audio', assetId: string) => { files.delete(key(projectId, kind, assetId)) },
    },
  }
}

async function buildFixture(project = projectWithImages(), media: Record<string, Uint8Array> = { 'image-1': new Uint8Array([1, 2, 3]) }) {
  return buildProjectPackage(project, async (kind, assetId) => {
    const bytes = media[assetId]
    return bytes ? new Blob([bytes.slice().buffer], { type: kind === 'image' ? 'image/png' : 'audio/wav' }) : null
  })
}

describe('portable .ndpack project packages', () => {
  it('round-trips the document, manifest, Unicode metadata, and media checksum', async () => {
    const project = projectWithImages()
    project.name = 'Cảnh đêm / Portable'
    const built = await buildFixture(project)
    const parsed = await parseProjectPackage(built.data)
    expect(parsed.project.name).toBe(project.name)
    expect(parsed.manifest.format).toBe('nd-blocking-previs.ndpack')
    expect(parsed.manifest.assets).toHaveLength(1)
    expect(parsed.manifest.assets[0].path).toMatch(/^media\/images\//)
    expect(parsed.media[0].bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(JSON.stringify(parsed.manifest)).not.toContain('/Users/')
  })

  it('collects music and deduplicates identical referenced image bytes', async () => {
    const project = projectWithImages(['image-1', 'image-2'])
    project.masterSequence.musicClip = { id: 'music-clip-1', asset: { id: 'music-1', fileName: 'nhac.wav', mimeType: 'audio/wav', sizeBytes: 3, lastModified: null }, durationSeconds: 1, startMasterFrame: 0, sourceStartSeconds: 0, sourceEndSeconds: 1 }
    const built = await buildFixture(project, { 'image-1': new Uint8Array([1, 2, 3]), 'image-2': new Uint8Array([1, 2, 3]), 'music-1': new Uint8Array([4, 5, 6]) })
    expect(built.assetCount).toBe(3)
    expect(built.manifest.assets[0].path).toBe(built.manifest.assets[1].path)
    expect(built.manifest.assets.find((asset) => asset.kind === 'audio')?.path).toMatch(/^media\/audio\//)
  })

  it('fails preflight with the missing asset name and reference count', async () => {
    await expect(buildFixture()).resolves.toBeDefined()
    await expect(buildProjectPackage(projectWithImages(), async () => null)).rejects.toMatchObject({ code: 'missing-media', assetName: 'frame-0.png', referenceCount: 1 })
  })

  it('rejects checksum tampering and unsafe ZIP paths', async () => {
    const built = await buildFixture()
    const files = { [PROJECT_PACKAGE_DOCUMENT_PATH]: strToU8('{}'), [PROJECT_PACKAGE_MANIFEST_PATH]: strToU8(JSON.stringify(built.manifest)), '../escape.txt': strToU8('bad') }
    await expect(parseProjectPackage(zipSync(files))).rejects.toMatchObject({ code: 'unsafe-archive' })
    const tampered = new Uint8Array(built.data)
    tampered[tampered.length - 1] ^= 0xff
    await expect(parseProjectPackage(tampered)).rejects.toBeInstanceOf(ProjectPackageError)
  })

  it('reuses same-content sidecars and remaps colliding IDs with different bytes', async () => {
    const built = await buildFixture()
    const parsed = await parseProjectPackage(built.data)
    const same = memoryStorage({ 'project-1:image:image-1': new Uint8Array([1, 2, 3]) })
    const samePlan = await prepareProjectPackageImport(parsed, same.storage)
    expect(samePlan.media[0].reuseExisting).toBe(true)
    expect(samePlan.project.masterSequence.imageAssets?.[0].id).toBe('image-1')

    const collision = memoryStorage({ 'project-1:image:image-1': new Uint8Array([9, 9, 9]) })
    const collisionPlan = await prepareProjectPackageImport(parsed, collision.storage)
    const remappedId = collisionPlan.project.masterSequence.imageAssets?.[0].id
    expect(remappedId).toMatch(/^image-1-import-/)
    expect(collisionPlan.project.masterSequence.imageClips?.[0].assetId).toBe(remappedId)
    await restoreProjectPackageMedia(collisionPlan, collision.storage)
    expect(collision.files.has('project-1:image:' + remappedId)).toBe(true)
  })

  it('rolls back media created before a later restore failure', async () => {
    const project = projectWithImages(['image-1', 'image-2'])
    const built = await buildFixture(project, { 'image-1': new Uint8Array([1, 2, 3]), 'image-2': new Uint8Array([4, 5, 6]) })
    const parsed = await parseProjectPackage(built.data)
    const storage = memoryStorage()
    let saves = 0
    const failingStorage = { ...storage.storage, save: async (projectId: string, kind: 'image' | 'audio', assetId: string, blob: Blob) => { saves += 1; if (saves === 2) return false; return storage.storage.save(projectId, kind, assetId, blob) } }
    const plan = await prepareProjectPackageImport(parsed, storage.storage)
    await expect(restoreProjectPackageMedia(plan, failingStorage)).rejects.toMatchObject({ code: 'restore-failed' })
    expect([...storage.files.keys()]).toHaveLength(0)
  })

  it('keeps malformed project documents out of the active project', async () => {
    const built = await buildFixture()
    const files = unzipSync(built.data)
    files[PROJECT_PACKAGE_DOCUMENT_PATH] = strToU8('{}')
    await expect(parseProjectPackage(zipSync(files))).rejects.toMatchObject({ code: 'invalid-document' })
  })

  it('does not silently package an unreferenced image sidecar', async () => {
    const project = projectWithImages()
    project.masterSequence.imageClips = []
    const built = await buildFixture(project)
    expect(built.assetCount).toBe(0)
    expect(built.manifest.assets).toEqual([])
  })

  it('exposes the missing-media error as a typed preflight failure', async () => {
    try {
      await buildProjectPackage(projectWithImages(), async () => null)
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectPackageMediaError)
      return
    }
    throw new Error('expected missing media')
  })
})
