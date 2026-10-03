import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { capStagePixelRatio } from './renderPolicy'

/**
 * Owns the non-serializable Blocking View environment.
 *
 * This viewpoint is an editor/navigation camera only. It is deliberately not
 * a CameraDocument and must never cross into the project domain or file model.
 */
export class SceneRuntime {
  private readonly container: HTMLElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly navigationCamera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly resizeObserver: ResizeObserver | null
  private readonly handleWindowResize: () => void
  private readonly handleControlsChange: () => void
  private frameRequest: number | null = null
  private continuousRendering = false
  private disposed = false

  constructor(container: HTMLElement) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#15191f')

    this.navigationCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    this.navigationCamera.position.set(6, 4.8, 7)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(capStagePixelRatio(window.devicePixelRatio))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'stage-render-surface'
    this.renderer.domElement.setAttribute('aria-label', 'Blocking View Stage')

    this.createEnvironment()
    this.container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.navigationCamera, this.renderer.domElement)
    this.controls.target.set(0, 0.65, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 1.4
    this.controls.maxDistance = 50
    this.controls.maxPolarAngle = Math.PI * 0.49
    this.controls.screenSpacePanning = true
    this.controls.rotateSpeed = 0.65
    this.controls.zoomSpeed = 0.8
    this.controls.panSpeed = 0.8

    this.handleControlsChange = () => this.requestRender()
    this.controls.addEventListener('change', this.handleControlsChange)

    this.handleWindowResize = () => this.updateSize()
    const ResizeObserverClass = (
      window as Window & { ResizeObserver?: typeof ResizeObserver }
    ).ResizeObserver
    if (ResizeObserverClass) {
      this.resizeObserver = new ResizeObserverClass(() => this.updateSize())
      this.resizeObserver.observe(this.container)
    } else {
      this.resizeObserver = null
      window.addEventListener('resize', this.handleWindowResize)
    }

    this.updateSize()
    this.requestRender()
  }

  /** Enable continuous frames for a future playback owner. */
  setContinuousRendering(enabled: boolean): void {
    if (this.disposed) return
    this.continuousRendering = enabled
    if (enabled) this.requestRender()
  }

  /** Render one frame without exposing Three.js state to React. */
  requestRender(): void {
    if (this.disposed || this.frameRequest !== null) return
    this.frameRequest = window.requestAnimationFrame(() => {
      this.frameRequest = null
      const controlsChanged = this.controls.update()
      this.renderer.render(this.scene, this.navigationCamera)

      if (this.continuousRendering || controlsChanged) this.requestRender()
    })
  }

  updateSize(): void {
    if (this.disposed) return
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.renderer.setPixelRatio(capStagePixelRatio(window.devicePixelRatio))
    this.renderer.setSize(width, height, false)
    this.navigationCamera.aspect = width / height
    this.navigationCamera.updateProjectionMatrix()
    this.requestRender()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    if (this.frameRequest !== null) {
      window.cancelAnimationFrame(this.frameRequest)
      this.frameRequest = null
    }

    this.controls.removeEventListener('change', this.handleControlsChange)
    this.controls.dispose()
    this.resizeObserver?.disconnect()
    if (!this.resizeObserver) window.removeEventListener('resize', this.handleWindowResize)

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose()
        disposeMaterial(object.material)
      }
    })

    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private createEnvironment(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({
        color: '#242a31',
        roughness: 0.92,
        metalness: 0,
      }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.015
    ground.receiveShadow = true
    this.scene.add(ground)

    const grid = new THREE.GridHelper(20, 20, '#4d5864', '#303841')
    grid.position.y = 0
    const gridMaterial = grid.material as THREE.LineBasicMaterial
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.5
    this.scene.add(grid)

    const hemisphere = new THREE.HemisphereLight('#dbe4ee', '#101317', 1.7)
    this.scene.add(hemisphere)

    const key = new THREE.DirectionalLight('#ffffff', 1.25)
    key.position.set(4, 8, 5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 0.1
    key.shadow.camera.far = 30
    key.shadow.camera.left = -10
    key.shadow.camera.right = 10
    key.shadow.camera.top = 10
    key.shadow.camera.bottom = -10
    this.scene.add(key)
  }
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material]
  materials.forEach((entry) => entry.dispose())
}
