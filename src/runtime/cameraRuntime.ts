import * as THREE from 'three'
import type { CameraDocument } from '../core/sceneDocument'
import { cameraProjectionForDocument } from './cameraMath'
import { cameraFrustumGuideDimensions } from './cameraFrustum'

const BODY_COLOR = '#4e5665'
const BODY_DARK = '#252b35'
const BODY_LIGHT = '#70798a'
const GLASS_COLOR = '#172b3c'
const SELECTION_COLOR = '#f0b866'
const FOV_GUIDE_DISTANCE = 3
const FOV_GUIDE_ORIGIN_Z = -1.04
const FOV_GUIDE_COLOR_FALLBACK = '#2c6fb7'

function fovGuideColor(): string {
  if (typeof document === 'undefined') return FOV_GUIDE_COLOR_FALLBACK
  return getComputedStyle(document.documentElement).getPropertyValue('--camera-fov-accent').trim() || FOV_GUIDE_COLOR_FALLBACK
}

function material(color: string, roughness = 0.64, metalness = 0.18): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

export class ProceduralCameraRuntime {
  readonly root = new THREE.Group()
  readonly productionCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 500)
  readonly selectableMeshes: THREE.Mesh[] = []
  readonly fovGuide = new THREE.Group()
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material> = []
  private readonly selectionMaterials: THREE.MeshStandardMaterial[] = []
  private readonly proxyMaterials: THREE.MeshStandardMaterial[] = []
  private readonly fovGuideRayMaterial = new THREE.LineBasicMaterial({ color: fovGuideColor(), transparent: true, opacity: 0.86, depthTest: false })
  private readonly fovGuideFrameMaterial = new THREE.LineBasicMaterial({ color: fovGuideColor(), transparent: true, opacity: 0.96, depthTest: false })
  private readonly fovGuideAxisMaterial = new THREE.LineBasicMaterial({ color: fovGuideColor(), transparent: true, opacity: 0.52, depthTest: false })
  private fovGuideGeometries: THREE.BufferGeometry[] = []
  private disposed = false

  constructor(document: CameraDocument) {
    this.root.name = 'CameraRoot'
    this.productionCamera.name = `${document.name} Capture Camera`
    this.root.add(this.productionCamera)
    this.fovGuide.name = 'CameraFovGuide'
    this.fovGuide.userData.cameraFrustum = true
    this.fovGuide.userData.stageSelectable = false
    this.fovGuide.visible = false
    this.root.add(this.fovGuide)
    this.resources.push(this.fovGuideRayMaterial, this.fovGuideFrameMaterial, this.fovGuideAxisMaterial)
    this.buildProxy(document.id, document.name)
    this.applyDocument(document)
  }

  applyDocument(document: CameraDocument): void {
    this.root.name = document.name
    this.root.position.set(...document.position)
    this.root.rotation.set(...document.rotation)
    this.proxyMaterials.forEach((surface) => surface.color.set(document.proxyColor || BODY_COLOR))
    const projection = cameraProjectionForDocument(document)
    if (projection) {
      this.productionCamera.aspect = projection.displayAspect
      this.productionCamera.fov = projection.fov
    }
    this.productionCamera.updateProjectionMatrix()
    this.updateFovGuide()
    this.root.updateMatrixWorld(true)
  }

  setSelected(selected: boolean): void {
    this.selectionMaterials.forEach((entry) => {
      entry.emissive.set(selected ? SELECTION_COLOR : '#000000')
      entry.emissiveIntensity = selected ? 0.18 : 0
    })
    this.fovGuide.visible = selected
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.fovGuideGeometries.forEach((geometry) => geometry.dispose())
    this.resources.forEach((resource) => resource.dispose())
    this.root.removeFromParent()
  }

  private updateFovGuide(): void {
    this.fovGuideGeometries.forEach((geometry) => geometry.dispose())
    this.fovGuideGeometries = []
    while (this.fovGuide.children.length > 0) this.fovGuide.remove(this.fovGuide.children[0])

    const dimensions = cameraFrustumGuideDimensions(this.productionCamera, FOV_GUIDE_DISTANCE)
    const halfWidth = dimensions.width / 2
    const halfHeight = dimensions.height / 2
    const origin = new THREE.Vector3(0, 0, FOV_GUIDE_ORIGIN_Z)
    const far = [
      new THREE.Vector3(-halfWidth, halfHeight, FOV_GUIDE_ORIGIN_Z - FOV_GUIDE_DISTANCE),
      new THREE.Vector3(halfWidth, halfHeight, FOV_GUIDE_ORIGIN_Z - FOV_GUIDE_DISTANCE),
      new THREE.Vector3(halfWidth, -halfHeight, FOV_GUIDE_ORIGIN_Z - FOV_GUIDE_DISTANCE),
      new THREE.Vector3(-halfWidth, -halfHeight, FOV_GUIDE_ORIGIN_Z - FOV_GUIDE_DISTANCE),
    ]
    const rays = [
      origin, far[0], origin, far[1], origin, far[2], origin, far[3],
    ]
    const frame = [far[0], far[1], far[1], far[2], far[2], far[3], far[3], far[0]]
    const axis = [origin, new THREE.Vector3(0, 0, FOV_GUIDE_ORIGIN_Z - FOV_GUIDE_DISTANCE)]
    const addGuideLines = (name: string, points: THREE.Vector3[], material: THREE.LineBasicMaterial) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const guide = new THREE.LineSegments(geometry, material)
      guide.name = name
      guide.userData.cameraFrustum = true
      guide.userData.stageSelectable = false
      guide.raycast = () => undefined
      this.fovGuideGeometries.push(geometry)
      this.fovGuide.add(guide)
    }
    addGuideLines('CameraFovGuideRays', rays, this.fovGuideRayMaterial)
    addGuideLines('CameraFovGuideFrame', frame, this.fovGuideFrameMaterial)
    addGuideLines('CameraFovGuideAxis', axis, this.fovGuideAxisMaterial)
  }

  private buildProxy(entityId: string, name: string): void {
    const addBox = (label: string, size: [number, number, number], position: [number, number, number], color: string, selectable = true, tintWithProxy = true) => {
      const geometry = new THREE.BoxGeometry(...size)
      const surface = material(color)
      const mesh = new THREE.Mesh(geometry, surface)
      mesh.name = `${name} ${label}`
      mesh.position.set(...position)
      mesh.userData.entityId = ''
      this.root.add(mesh)
      this.resources.push(geometry, surface)
      this.selectionMaterials.push(surface)
      if (tintWithProxy) this.proxyMaterials.push(surface)
      if (selectable) this.selectableMeshes.push(mesh)
      return mesh
    }
    const addCylinder = (label: string, radius: number, depth: number, position: [number, number, number], color: string, radialSegments = 16, tintWithProxy = true) => {
      const geometry = new THREE.CylinderGeometry(radius, radius, depth, radialSegments)
      const surface = material(color)
      const mesh = new THREE.Mesh(geometry, surface)
      mesh.name = `${name} ${label}`
      mesh.position.set(...position)
      mesh.rotation.x = Math.PI / 2
      mesh.userData.entityId = ''
      this.root.add(mesh)
      this.resources.push(geometry, surface)
      this.selectionMaterials.push(surface)
      if (tintWithProxy) this.proxyMaterials.push(surface)
      this.selectableMeshes.push(mesh)
      return mesh
    }
    const addSphere = (label: string, radius: number, position: [number, number, number], color: string, tintWithProxy = true) => {
      const geometry = new THREE.SphereGeometry(radius, 12, 8)
      const surface = material(color)
      const mesh = new THREE.Mesh(geometry, surface)
      mesh.name = `${name} ${label}`
      mesh.position.set(...position)
      mesh.userData.entityId = ''
      this.root.add(mesh)
      this.resources.push(geometry, surface)
      this.selectionMaterials.push(surface)
      if (tintWithProxy) this.proxyMaterials.push(surface)
      this.selectableMeshes.push(mesh)
      return mesh
    }

    addBox('Body', [0.86, 0.58, 0.92], [0, 0, 0.14], BODY_COLOR)
    addBox('Rear Battery', [0.78, 0.54, 0.28], [0, 0.01, 0.72], BODY_LIGHT)
    addBox('Base Plate', [0.78, 0.10, 0.82], [0, -0.34, 0.14], BODY_DARK)
    addBox('Top Deck', [0.62, 0.08, 0.48], [0, 0.34, 0.23], BODY_DARK)

    // The camera looks down -Z; the handle runs rear-to-front on that same axis.
    addBox('Handle Support Rear', [0.08, 0.22, 0.08], [0, 0.49, 0.40], BODY_DARK)
    addBox('Handle Support Front', [0.08, 0.22, 0.08], [0, 0.49, -0.18], BODY_DARK)
    addBox('Top Handle', [0.16, 0.14, 0.62], [0, 0.60, 0.11], BODY_LIGHT)

    addCylinder('Lens Mount', 0.27, 0.13, [0, 0, -0.42], BODY_LIGHT)
    addCylinder('Rear Lens Barrel', 0.25, 0.18, [0, 0, -0.56], BODY_DARK)
    addCylinder('Focus Ring', 0.29, 0.16, [0, 0, -0.72], BODY_LIGHT, 20)
    addCylinder('Front Lens Barrel', 0.25, 0.22, [0, 0, -0.88], BODY_DARK)
    addCylinder('Front Glass', 0.20, 0.04, [0, 0, -1.01], GLASS_COLOR, 20, false)

    addBox('Matte Box Top', [0.72, 0.08, 0.18], [0, 0.32, -1.02], BODY_LIGHT)
    addBox('Matte Box Bottom', [0.72, 0.08, 0.18], [0, -0.32, -1.02], BODY_LIGHT)
    addBox('Matte Box Left', [0.08, 0.56, 0.18], [-0.32, 0, -1.02], BODY_LIGHT)
    addBox('Matte Box Right', [0.08, 0.56, 0.18], [0.32, 0, -1.02], BODY_LIGHT)

    addBox('Side Panel', [0.035, 0.32, 0.46], [0.45, 0.02, 0.18], BODY_DARK)
    addBox('Vent Upper', [0.045, 0.035, 0.20], [0.48, 0.12, 0.22], BODY_LIGHT, false)
    addBox('Vent Lower', [0.045, 0.035, 0.20], [0.48, 0.04, 0.22], BODY_LIGHT, false)
    addSphere('Side Button A', 0.045, [0.49, -0.10, 0.12], BODY_LIGHT)
    addSphere('Side Button B', 0.045, [0.49, -0.18, 0.12], BODY_LIGHT)
    addSphere('Side Button C', 0.045, [0.49, -0.26, 0.12], BODY_LIGHT)

    this.selectableMeshes.forEach((mesh) => { mesh.userData.entityId = entityId })
  }
}
