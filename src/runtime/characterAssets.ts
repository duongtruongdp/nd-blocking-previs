import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinnedObject } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { ActorDocument } from '../domain/types'
import type { CharacterDefinition } from '../characters/characterRegistry'
import { getPoseDefinition, type PoseDefinition } from '../characters/poseLibrary'
import { applyActorPose, findSemanticJoint, hasRequiredSemanticJoints } from './characterPose'
import { auditPoseDefinition, diagnoseRig, reconstructReferencePoses, validatePoseDefinition, type PoseJointAudit, type PoseValidationReport, type RigDiagnosticReport } from './rigDiagnostics'

type RuntimePoseMap = Record<string, PoseDefinition>

export class CharacterAssetLoader {
  private readonly loader = new GLTFLoader()
  private readonly sources = new Map<string, Promise<THREE.Object3D | null>>()
  private readonly failures = new Map<string, string>()

  loadInstance(definition: CharacterDefinition): Promise<THREE.Object3D | null> {
    const cached = this.sources.get(definition.id)
    if (cached) return cached.then((source) => source ? cloneSkinnedObject(source) : null)

    const sourcePromise = this.loader.loadAsync(definition.assetPath)
      .then((gltf) => gltf.scene)
      .catch(() => {
        this.failures.set(definition.id, `Unable to load or parse ${definition.assetPath}.`)
        return null
      })
    this.sources.set(definition.id, sourcePromise)
    return sourcePromise.then((source) => source ? cloneSkinnedObject(source) : null)
  }

  dispose(): void {
    this.sources.forEach((sourcePromise) => {
      void sourcePromise.then((source) => {
        if (source) disposeObjectResources(source)
      })
    })
    this.sources.clear()
    this.failures.clear()
  }

  failureReason(characterId: string): string | undefined {
    return this.failures.get(characterId)
  }
}

export function attachCharacterInstance(
  actorRoot: THREE.Group,
  instance: THREE.Object3D,
  actor: ActorDocument,
  referenceHeightM: number,
): void {
  removeCharacterInstance(actorRoot)
  const diagnostic = diagnoseRig(instance)
  const reconstructedPoses = reconstructReferencePoses(instance, diagnostic)
  instance.userData.rigDiagnosticReport = diagnostic
  instance.userData.reconstructedPoses = reconstructedPoses
  instance.userData.poseAudits = Object.fromEntries(
    Object.values(reconstructedPoses).map((pose) => [pose.id, auditPoseDefinition(instance, actor, pose)]),
  ) as Record<string, PoseJointAudit[]>
  normalizeCharacterInstance(instance, referenceHeightM)
  instance.rotation.y = Math.PI
  instance.name = 'CharacterModel'
  instance.userData.characterModel = true
  prepareCharacterMaterials(instance, actor.appearance.color)
  actorRoot.add(instance)
  const fallback = actorRoot.getObjectByName('ActorFallback')
  if (fallback) fallback.visible = false
  instance.userData.poseReferenceHeight = referenceHeightM * (Math.abs(actorRoot.getWorldScale(new THREE.Vector3()).y) || 1)
  updateActorRuntimeAppearance(actorRoot, actor)
  const validation = Object.values(reconstructedPoses).map((pose) => validatePoseDefinition(instance, actor, pose))
  instance.userData.poseValidation = validation
  validation.filter((result) => !result.valid).forEach((result) => {
    console.warn('[Character Pose]', { actor: actor.name, pose: result.poseId, valid: false, warnings: result.warnings })
  })
  updateActorRuntimeAppearance(actorRoot, actor)
}

export function removeCharacterInstance(actorRoot: THREE.Group): void {
  const existing = actorRoot.getObjectByName('CharacterModel')
  if (!existing) return
  actorRoot.remove(existing)
  disposeObjectResources(existing, false)
}

export function updateActorRuntimeAppearance(actorRoot: THREE.Group, actor: ActorDocument, poseOverride?: PoseDefinition): void {
  const model = actorRoot.getObjectByName('CharacterModel')
  const target = model ?? actorRoot.getObjectByName('ActorFallback')
  if (!target) return

  target.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => {
      if ('color' in material) (material as THREE.MeshStandardMaterial).color.set(actor.appearance.color)
    })
  })
  const targetIsProductionModel = model !== undefined
  if (!targetIsProductionModel || hasRequiredSemanticJoints(target, 'humanoid-v1')) {
    const reconstructed = target.userData.reconstructedPoses as RuntimePoseMap | undefined
    const pose = poseOverride ?? reconstructed?.[actor.pose.poseId] ?? getPoseDefinition(actor.pose.poseId)
    if (!pose) return
    applyActorPose(target, actor, 'humanoid-v1', pose)
    groundActorVisual(actorRoot, target, pose)
  }
}

function normalizeCharacterInstance(instance: THREE.Object3D, referenceHeightM: number): void {
  refreshSkinnedBounds(instance)
  instance.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(instance)
  const size = bounds.getSize(new THREE.Vector3())
  if (size.y <= 0) return

  const scale = referenceHeightM / size.y
  instance.scale.multiplyScalar(scale)
  instance.updateMatrixWorld(true)

  refreshSkinnedBounds(instance)
  const normalizedBounds = new THREE.Box3().setFromObject(instance)
  const center = normalizedBounds.getCenter(new THREE.Vector3())
  instance.position.x -= center.x
  instance.position.z -= center.z
  instance.position.y -= normalizedBounds.min.y
}

export function isUsableCharacterInstance(instance: THREE.Object3D): boolean {
  return hasRequiredSemanticJoints(instance, 'humanoid-v1')
}

export type CharacterInspection = {
  skinnedMesh: boolean
  skeletonBones: number
  meshCount: number
  visibleMesh: boolean
  deformation: 'bound-skeleton' | 'static-geometry' | 'missing-geometry'
}

export function inspectCharacterInstance(instance: THREE.Object3D): CharacterInspection {
  let skinnedMesh = false
  let skeletonBones = 0
  let meshCount = 0
  let visibleMesh = false
  instance.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    meshCount += 1
    visibleMesh ||= object.visible
    if (object instanceof THREE.SkinnedMesh) {
      skinnedMesh = true
      skeletonBones = Math.max(skeletonBones, object.skeleton.bones.length)
    }
  })
  return {
    skinnedMesh,
    skeletonBones,
    meshCount,
    visibleMesh,
    deformation: skinnedMesh && skeletonBones > 0 ? 'bound-skeleton' : meshCount > 0 ? 'static-geometry' : 'missing-geometry',
  }
}

function groundActorVisual(actorRoot: THREE.Group, target: THREE.Object3D, pose: PoseDefinition): void {
  target.updateMatrixWorld(true)
  actorRoot.updateMatrixWorld(true)
  refreshSkinnedBounds(target)
  const actorPosition = actorRoot.getWorldPosition(new THREE.Vector3())
  const actorScaleY = Math.abs(actorRoot.getWorldScale(new THREE.Vector3()).y) || 1
  if (pose.grounding.type === 'feet') {
    const footReference = findSemanticJoint(target, pose.grounding.referenceJoint, 'humanoid-v1')
    if (footReference) {
      const referenceWorld = footReference.getWorldPosition(new THREE.Vector3())
      const currentLocalY = (referenceWorld.y - actorPosition.y) / actorScaleY
      const bounds = new THREE.Box3().setFromObject(target)
      const minimumLocalY = (bounds.min.y - actorPosition.y) / actorScaleY
      const referenceToContact = currentLocalY - minimumLocalY
      target.position.y -= currentLocalY - referenceToContact
    } else {
      const bounds = new THREE.Box3().setFromObject(target)
      const minimumLocalY = (bounds.min.y - actorPosition.y) / actorScaleY
      target.position.y -= minimumLocalY
    }
  } else if (pose.grounding.type === 'seat') {
    const seatReference = findSemanticJoint(target, pose.grounding.referenceJoint, 'humanoid-v1')
    if (seatReference) {
      const referenceWorld = seatReference.getWorldPosition(new THREE.Vector3())
      const currentLocalY = (referenceWorld.y - actorPosition.y) / actorScaleY
      const targetScaleInActor = Math.abs(target.getWorldScale(new THREE.Vector3()).y) / actorScaleY || 1
      const resolvedSeatHeight = pose.grounding.referenceHeight * targetScaleInActor
      target.position.y += resolvedSeatHeight - currentLocalY
      target.userData.resolvedSeatHeight = resolvedSeatHeight
    }
    // Seat support is primary. The secondary floor contact is represented in
    // grounding metadata and validation; correcting the whole model to the
    // floor here would move the pelvis away from the seat plane.
  } else if (pose.grounding.type === 'back') {
    // For a supine body the lowest deformed body surface is the posterior
    // support surface. It is intentionally distinct from feet grounding.
    const bounds = new THREE.Box3().setFromObject(target)
    const minimumLocalY = (bounds.min.y - actorPosition.y) / actorScaleY
    target.position.y -= minimumLocalY
  } else {
    const bounds = new THREE.Box3().setFromObject(target)
    const minimumLocalY = (bounds.min.y - actorPosition.y) / actorScaleY
    target.position.y -= minimumLocalY
  }
  target.updateMatrixWorld(true)
  target.userData.poseContactType = pose.grounding.type
}

export function getRigDiagnosticReport(instance: THREE.Object3D): RigDiagnosticReport | undefined {
  return instance.userData.rigDiagnosticReport as RigDiagnosticReport | undefined
}

export function getPoseValidationReports(instance: THREE.Object3D): PoseValidationReport[] {
  return (instance.userData.poseValidation as PoseValidationReport[] | undefined) ?? []
}

export function computeBlockingBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true)
  refreshSkinnedBounds(root)
  root.updateWorldMatrix(true, true)
  const bounds = new THREE.Box3()
  const visit = (object: THREE.Object3D) => {
    if (!object.visible || object.userData.facingIndicator === true || object.userData.diagnosticOverlay === true) return
    if (object instanceof THREE.Mesh) bounds.expandByObject(object)
    object.children.forEach(visit)
  }
  visit(root)
  return bounds
}

function refreshSkinnedBounds(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      object.computeBoundingBox()
      object.computeBoundingSphere()
    }
  })
}

function prepareCharacterMaterials(instance: THREE.Object3D, color: string): void {
  instance.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.characterMaterialsPrepared) return
    const current = Array.isArray(object.material) ? object.material : [object.material]
    const cloned = current.map((material) => {
      const next = material.clone()
      if ('color' in next) (next as THREE.MeshStandardMaterial).color.set(color)
      return next
    })
    object.material = Array.isArray(object.material) ? cloned : cloned[0]
    object.userData.characterMaterialsPrepared = true
  })
}

function disposeObjectResources(root: THREE.Object3D, disposeGeometry = true): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    const entries = Array.isArray(object.material) ? object.material : [object.material]
    entries.forEach((material) => materials.add(material))
  })
  if (disposeGeometry) geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}
