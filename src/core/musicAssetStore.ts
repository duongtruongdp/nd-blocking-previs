const DATABASE_NAME = 'nd-blocking-previs-assets'
const STORE_NAME = 'music'
const DATABASE_VERSION = 1

type StoredMusicAsset = {
  key: string
  projectId: string
  assetId: string
  blob: Blob
}

function assetKey(projectId: string, assetId: string): string {
  return `${projectId}::${assetId}`
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Music asset storage could not be opened.'))
  })
}

export async function saveMusicAsset(projectId: string, assetId: string, blob: Blob): Promise<boolean> {
  const database = await openDatabase()
  if (!database) return false
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put({ key: assetKey(projectId, assetId), projectId, assetId, blob } satisfies StoredMusicAsset)
    transaction.oncomplete = () => { database.close(); resolve(true) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Music asset could not be saved.')) }
  })
}

export async function loadMusicAsset(projectId: string, assetId: string): Promise<Blob | null> {
  const database = await openDatabase()
  if (!database) return null
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(assetKey(projectId, assetId))
    request.onsuccess = () => { database.close(); resolve((request.result as StoredMusicAsset | undefined)?.blob ?? null) }
    request.onerror = () => { database.close(); reject(request.error ?? new Error('Music asset could not be loaded.')) }
  })
}

export async function deleteMusicAsset(projectId: string, assetId: string): Promise<void> {
  const database = await openDatabase()
  if (!database) return
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(assetKey(projectId, assetId))
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Music asset could not be deleted.')) }
  })
}
