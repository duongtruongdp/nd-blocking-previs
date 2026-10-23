export type MasterExportLifecycleStats = {
  rendererInstances: number
  rendererCreations: number
  rendererDisposals: number
  sceneTransitions: number
  resourceDisposals: number
}

export function createMasterExportLifecycle(): { stats: MasterExportLifecycleStats; rendererCreated: () => void; rendererDisposed: () => void; sceneTransition: (releasedResources: number) => void } {
  const stats: MasterExportLifecycleStats = {
    rendererInstances: 0,
    rendererCreations: 0,
    rendererDisposals: 0,
    sceneTransitions: 0,
    resourceDisposals: 0,
  }
  return {
    stats,
    rendererCreated: () => {
      stats.rendererInstances += 1
      stats.rendererCreations += 1
    },
    rendererDisposed: () => {
      stats.rendererInstances = Math.max(0, stats.rendererInstances - 1)
      stats.rendererDisposals += 1
    },
    sceneTransition: (releasedResources) => {
      stats.sceneTransitions += 1
      stats.resourceDisposals += Math.max(0, releasedResources)
    },
  }
}
