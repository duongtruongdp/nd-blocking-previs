import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'
import { stageViewCubeDragStarted, type StageViewMode, type StageViewOrientation, type StageViewSelection } from '../stage-engine'
import { viewCubeFaceLabel, viewCubeOrthoHalfHeight, viewCubeProjectedBounds } from '../runtime/viewCubeMath'
import { registerWebGLRenderer } from '../runtime/webglDiagnostics'

type FaceMode = Exclude<StageViewMode, 'perspective'>

type StageViewCubeProps = {
  selection: StageViewSelection
  orientation: StageViewOrientation
  onSelect: (selection: StageViewSelection) => void
  onOrbitDrag: (deltaX: number, deltaY: number) => void
}

type FaceDefinition = {
  mode: FaceMode
  position: [number, number, number]
  rotation: [number, number, number]
}

const faces: FaceDefinition[] = [
  { mode: 'front', position: [0, 0, 1.01], rotation: [0, 0, 0] },
  { mode: 'back', position: [0, 0, -1.01], rotation: [0, Math.PI, 0] },
  { mode: 'right', position: [1.01, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { mode: 'left', position: [-1.01, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { mode: 'top', position: [0, 1.01, 0], rotation: [-Math.PI / 2, 0, 0] },
  { mode: 'bottom', position: [0, -1.01, 0], rotation: [Math.PI / 2, 0, 0] },
]

type CubeResources = {
  renderer: THREE.WebGLRenderer
  camera: THREE.OrthographicCamera
  scene: THREE.Scene
  cube: THREE.Group
  raycaster: THREE.Raycaster
  faceMeshes: Map<FaceMode, THREE.Mesh>
  faceMaterials: Map<FaceMode, THREE.MeshBasicMaterial>
  labelMeshes: Map<FaceMode, THREE.Mesh>
  labelMaterials: Map<FaceMode, THREE.MeshBasicMaterial>
  labelTextures: THREE.CanvasTexture[]
  cubeGeometry: THREE.BoxGeometry
  faceGeometry: THREE.PlaneGeometry
  edgeGeometry: THREE.EdgesGeometry
  cubeMaterial: THREE.MeshBasicMaterial
  edgeMaterial: THREE.LineBasicMaterial
  webglDiagnosticsDispose: () => void
}

type CubeDrag = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  moved: boolean
  startFace: FaceMode | null
}

const faceBaseColors: Record<FaceMode, number> = {
  front: 0xd9deef,
  back: 0xc2cade,
  right: 0xcad2e6,
  left: 0xc2cade,
  top: 0xeaEEF8,
  bottom: 0xc2cade,
}

function createFaceLabelTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('ViewCube face label canvas is unavailable')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#27345d'
  context.font = '700 72px Arial, Helvetica, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

function createResources(mount: HTMLDivElement): CubeResources {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.className = 'v2-stage-viewcube-canvas'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  renderer.domElement.dataset.webglIdentity = 'view-cube'
  const webglDiagnosticsDispose = registerWebGLRenderer(renderer, 'interactive:view-cube')
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 20)
  camera.position.set(0, 0, 7)
  camera.lookAt(0, 0, 0)

  const cube = new THREE.Group()
  const cubeGeometry = new THREE.BoxGeometry(2, 2, 2)
  const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xd1d8e8 })
  cube.add(new THREE.Mesh(cubeGeometry, cubeMaterial))
  const edgeGeometry = new THREE.EdgesGeometry(cubeGeometry)
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x69738b, transparent: true, opacity: 0.65 })
  cube.add(new THREE.LineSegments(edgeGeometry, edgeMaterial))

  const faceGeometry = new THREE.PlaneGeometry(2, 2)
  const faceMeshes = new Map<FaceMode, THREE.Mesh>()
  const faceMaterials = new Map<FaceMode, THREE.MeshBasicMaterial>()
  const labelMeshes = new Map<FaceMode, THREE.Mesh>()
  const labelMaterials = new Map<FaceMode, THREE.MeshBasicMaterial>()
  const labelTextures: THREE.CanvasTexture[] = []
  faces.forEach((face) => {
    const material = new THREE.MeshBasicMaterial({ color: faceBaseColors[face.mode], side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(faceGeometry, material)
    mesh.position.set(...face.position)
    mesh.rotation.set(...face.rotation)
    mesh.userData.faceMode = face.mode
    cube.add(mesh)
    faceMeshes.set(face.mode, mesh)
    faceMaterials.set(face.mode, material)

    const labelTexture = createFaceLabelTexture(viewCubeFaceLabel(face.mode).toUpperCase())
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    })
    const labelMesh = new THREE.Mesh(faceGeometry, labelMaterial)
    labelMesh.position.copy(mesh.position)
    labelMesh.position.add(new THREE.Vector3(...face.position).normalize().multiplyScalar(0.008))
    labelMesh.rotation.copy(mesh.rotation)
    labelMesh.scale.setScalar(0.74)
    labelMesh.visible = false
    labelMesh.userData.stageSelectable = false
    labelMesh.raycast = () => undefined
    cube.add(labelMesh)
    labelMeshes.set(face.mode, labelMesh)
    labelMaterials.set(face.mode, labelMaterial)
    labelTextures.push(labelTexture)
  })
  scene.add(cube)

  return { renderer, camera, scene, cube, raycaster: new THREE.Raycaster(), faceMeshes, faceMaterials, labelMeshes, labelMaterials, labelTextures, cubeGeometry, faceGeometry, edgeGeometry, cubeMaterial, edgeMaterial, webglDiagnosticsDispose }
}

function frameCamera(resources: CubeResources, width: number, height: number): void {
  const aspect = width / Math.max(1, height)
  const bounds = viewCubeProjectedBounds(resources.cube.quaternion)
  const halfHeight = viewCubeOrthoHalfHeight(bounds, aspect)
  resources.camera.left = -halfHeight * aspect
  resources.camera.right = halfHeight * aspect
  resources.camera.top = halfHeight
  resources.camera.bottom = -halfHeight
  resources.camera.updateProjectionMatrix()
}

function resizeResources(resources: CubeResources, mount: HTMLDivElement): void {
  const rect = mount.getBoundingClientRect()
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  resources.renderer.setSize(width, height, false)
  frameCamera(resources, width, height)
  resources.renderer.render(resources.scene, resources.camera)
}

function setFaceColor(resources: CubeResources, mode: FaceMode, state: 'normal' | 'active' | 'hover'): void {
  const material = resources.faceMaterials.get(mode)
  if (!material) return
  material.color.setHex(state === 'hover' ? 0xb4c4ea : state === 'active' ? 0xb4a5ef : faceBaseColors[mode])
}

function updateFaceStates(resources: CubeResources, selection: StageViewSelection, hovered: FaceMode | null): void {
  faces.forEach((face) => {
    setFaceColor(resources, face.mode, hovered === face.mode ? 'hover' : selection === face.mode ? 'active' : 'normal')
    const label = resources.labelMeshes.get(face.mode)
    if (label) label.visible = hovered === face.mode
  })
}

function faceAtPointer(resources: CubeResources, event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): FaceMode | null {
  const rect = canvas.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
    -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
  )
  resources.raycaster.setFromCamera(ndc, resources.camera)
  const hits = resources.raycaster.intersectObjects(Array.from(resources.faceMeshes.values()), false)
  return (hits[0]?.object.userData.faceMode as FaceMode | undefined) ?? null
}

export function StageViewCube({ selection, orientation, onSelect, onOrbitDrag }: StageViewCubeProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const resourcesRef = useRef<CubeResources | null>(null)
  const dragRef = useRef<CubeDrag | null>(null)
  const hoveredFaceRef = useRef<FaceMode | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const resources = createResources(mount)
    resourcesRef.current = resources
    const resize = () => resizeResources(resources, mount)
    const ResizeObserverClass = window.ResizeObserver
    const resizeObserver = ResizeObserverClass ? new ResizeObserverClass(resize) : null
    resizeObserver?.observe(mount)
    if (!resizeObserver) window.addEventListener('resize', resize)
    resize()
    return () => {
      resizeObserver?.disconnect()
      if (!resizeObserver) window.removeEventListener('resize', resize)
      resources.faceMaterials.forEach((material) => material.dispose())
      resources.labelTextures.forEach((texture) => texture.dispose())
      resources.labelMaterials.forEach((material) => material.dispose())
      resources.cubeGeometry.dispose()
      resources.faceGeometry.dispose()
      resources.edgeGeometry.dispose()
      resources.cubeMaterial.dispose()
      resources.edgeMaterial.dispose()
      resources.renderer.dispose()
      resources.webglDiagnosticsDispose()
      resources.renderer.domElement.remove()
      resourcesRef.current = null
    }
  }, [])

  useEffect(() => {
    const resources = resourcesRef.current
    if (!resources) return
    resources.cube.quaternion.set(...orientation).invert()
    const rect = resources.renderer.domElement.getBoundingClientRect()
    frameCamera(resources, Math.max(1, rect.width), Math.max(1, rect.height))
    resources.renderer.render(resources.scene, resources.camera)
  }, [orientation])

  useEffect(() => {
    const resources = resourcesRef.current
    if (!resources) return
    updateFaceStates(resources, selection, hoveredFaceRef.current)
    resources.renderer.render(resources.scene, resources.camera)
  }, [selection])

  const updateHover = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const resources = resourcesRef.current
    if (!resources || dragRef.current?.moved) return
    const next = faceAtPointer(resources, event, event.currentTarget)
    if (next === hoveredFaceRef.current) return
    hoveredFaceRef.current = next
    updateFaceStates(resources, selection, next)
    resources.renderer.render(resources.scene, resources.camera)
  }

  const startDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation()
    if (event.button !== 0) return
    const resources = resourcesRef.current
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, startFace: resources ? faceAtPointer(resources, event, event.currentTarget) : null }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation()
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      updateHover(event)
      return
    }
    if (!drag.moved) {
      if (!stageViewCubeDragStarted(drag.startX, drag.startY, event.clientX, event.clientY)) return
      drag.moved = true
      hoveredFaceRef.current = null
      const resources = resourcesRef.current
      if (resources) {
        updateFaceStates(resources, selection, null)
        resources.renderer.render(resources.scene, resources.camera)
      }
    }
    const deltaX = event.clientX - drag.lastX
    const deltaY = event.clientY - drag.lastY
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    onOrbitDrag(deltaX, deltaY)
    event.preventDefault()
  }

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation()
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && drag.startFace) onSelect(drag.startFace)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
    updateHover(event)
  }

  return (
    <aside className="v2-stage-viewcube" aria-label="Stage view navigation" onContextMenu={(event) => { event.preventDefault(); event.stopPropagation() }}>
      <button className={`v2-stage-viewcube-home${selection === 'perspective' ? ' is-active' : ''}`} onClick={() => onSelect('perspective')} type="button" aria-label="Perspective view — restore free view" title="Perspective view">
        <span aria-hidden="true">⌂</span>
      </button>
      <div className="v2-stage-viewcube-model" ref={mountRef} aria-label="ViewCube. Drag to orbit editor view." onPointerDown={(event) => event.stopPropagation()}>
        <canvas className="v2-stage-viewcube-input" aria-hidden="true" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onPointerLeave={updateHover} />
      </div>
      <div className="v2-stage-viewcube-a11y" aria-label="Stage view faces">
        {faces.map((face) => <button key={face.mode} onClick={() => onSelect(face.mode)} type="button" aria-label={`${viewCubeFaceLabel(face.mode)} view`}>{viewCubeFaceLabel(face.mode)}</button>)}
      </div>
    </aside>
  )
}
