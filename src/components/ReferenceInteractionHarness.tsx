import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type HarnessDiagnostic = {
  mode: 'IDLE' | 'CLICK' | 'ORBIT' | 'PAN' | 'ZOOM'
  button: 'NONE' | 'LEFT' | 'RIGHT' | 'MIDDLE' | 'WHEEL'
  movePx: number
  clientX: number
  clientY: number
  rect: { left: number; top: number; width: number; height: number }
  ndc: { x: number; y: number }
  rawHits: number
  selected: string | null
  target: [number, number, number]
  distance: number
  azimuth: number
  polar: number
}

type HarnessDrag = {
  pointerId: number
  button: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  moved: boolean
}

const MIN_POLAR = 0.05
const MAX_POLAR = 3.1
const MIN_DISTANCE = 0.6
const MAX_DISTANCE = 200

function initialDiagnostic(): HarnessDiagnostic {
  return {
    mode: 'IDLE',
    button: 'NONE',
    movePx: 0,
    clientX: 0,
    clientY: 0,
    rect: { left: 0, top: 0, width: 0, height: 0 },
    ndc: { x: 0, y: 0 },
    rawHits: 0,
    selected: null,
    target: [0, 1, 0],
    distance: 15,
    azimuth: 0.62,
    polar: 1.13,
  }
}

export function ReferenceInteractionHarness() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [diagnostic, setDiagnostic] = useState(initialDiagnostic)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#101419')
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(1, 1, false)
    renderer.setClearColor('#101419', 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = 'reference-interaction-canvas'
    renderer.domElement.setAttribute('aria-label', 'Reference interaction harness')
    renderer.domElement.style.touchAction = 'none'
    viewport.appendChild(renderer.domElement)

    const ambient = new THREE.HemisphereLight('#dce8f5', '#303743', 1.4)
    scene.add(ambient)
    const key = new THREE.DirectionalLight('#fff1d6', 1.7)
    key.position.set(5, 9, 6)
    scene.add(key)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ color: '#28313a', roughness: 0.9 }),
    )
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)
    const grid = new THREE.GridHelper(24, 24, '#56616d', '#36404b')
    grid.position.y = 0.01
    scene.add(grid)

    const cubeA = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 2, 1.6),
      new THREE.MeshStandardMaterial({ color: '#c68a57', roughness: 0.72 }),
    )
    cubeA.position.set(-2.2, 1, 0)
    cubeA.userData.testId = 'cube-a'
    const cubeB = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 2, 1.6),
      new THREE.MeshStandardMaterial({ color: '#6f9fbe', roughness: 0.72 }),
    )
    cubeB.position.set(2.2, 1, 0)
    cubeB.userData.testId = 'cube-b'
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#b477a1', roughness: 0.62 }),
    )
    sphere.position.set(0, 1, 2.5)
    sphere.userData.testId = 'sphere'
    scene.add(cubeA, cubeB, sphere)

    const selectableMeshes = [cubeA, cubeB, sphere]
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const navigation = {
      target: new THREE.Vector3(0, 1, 0),
      distance: 15,
      azimuth: 0.62,
      polar: 1.13,
    }
    let selectedTestId: string | null = null
    let selectionHelper: THREE.BoxHelper | null = null
    let drag: HarnessDrag | null = null
    let frameRequest = 0
    let disposed = false

    const renderNavigationCamera = () => {
      navigation.polar = THREE.MathUtils.clamp(navigation.polar, MIN_POLAR, MAX_POLAR)
      navigation.distance = THREE.MathUtils.clamp(navigation.distance, MIN_DISTANCE, MAX_DISTANCE)
      camera.up.set(0, 1, 0)
      camera.position.set(
        navigation.target.x + navigation.distance * Math.sin(navigation.polar) * Math.sin(navigation.azimuth),
        navigation.target.y + navigation.distance * Math.cos(navigation.polar),
        navigation.target.z + navigation.distance * Math.sin(navigation.polar) * Math.cos(navigation.azimuth),
      )
      camera.lookAt(navigation.target)
    }

    const canvasRect = () => renderer.domElement.getBoundingClientRect()
    const toNdc = (clientX: number, clientY: number) => {
      const rect = canvasRect()
      const ndc = {
        x: ((clientX - rect.left) / rect.width) * 2 - 1,
        y: -((clientY - rect.top) / rect.height) * 2 + 1,
      }
      return { rect, ndc }
    }

    const updateSelectionVisual = () => {
      selectableMeshes.forEach((mesh) => {
        const material = mesh.material as THREE.MeshStandardMaterial
        const isSelected = mesh.userData.testId === selectedTestId
        material.emissive.set(isSelected ? '#f0a032' : '#000000')
        material.emissiveIntensity = isSelected ? 0.8 : 0
      })
      if (selectionHelper) {
        scene.remove(selectionHelper)
        selectionHelper.geometry.dispose()
        ;(selectionHelper.material as THREE.Material).dispose()
        selectionHelper = null
      }
      const selectedMesh = selectableMeshes.find((mesh) => mesh.userData.testId === selectedTestId)
      if (selectedMesh) {
        selectionHelper = new THREE.BoxHelper(selectedMesh, '#ffd27a')
        scene.add(selectionHelper)
      }
    }

    const publish = (
      mode: HarnessDiagnostic['mode'],
      button: HarnessDiagnostic['button'],
      movePx: number,
      clientX: number,
      clientY: number,
      rawHits: number,
    ) => {
      const { rect, ndc } = toNdc(clientX, clientY)
      setDiagnostic({
        mode,
        button,
        movePx,
        clientX,
        clientY,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        ndc,
        rawHits,
        selected: selectedTestId,
        target: [navigation.target.x, navigation.target.y, navigation.target.z],
        distance: navigation.distance,
        azimuth: navigation.azimuth,
        polar: navigation.polar,
      })
    }

    const pickAt = (clientX: number, clientY: number) => {
      const { ndc } = toNdc(clientX, clientY)
      pointer.set(ndc.x, ndc.y)
      camera.updateMatrixWorld(true)
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(selectableMeshes, true)
      const hit = hits[0]
      selectedTestId = hit?.object.userData.testId ?? null
      updateSelectionVisual()
      return hits.length
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
      renderer.domElement.setPointerCapture(event.pointerId)
      drag = {
        pointerId: event.pointerId,
        button: event.button,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
      }
      publish('IDLE', event.button === 0 ? 'LEFT' : event.button === 1 ? 'MIDDLE' : 'RIGHT', 0, event.clientX, event.clientY, 0)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      const movePx = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
      if (!drag.moved && movePx <= 3) {
        publish('IDLE', drag.button === 0 ? 'LEFT' : drag.button === 1 ? 'MIDDLE' : 'RIGHT', movePx, event.clientX, event.clientY, 0)
        return
      }
      drag.moved = true
      const deltaX = event.clientX - drag.lastX
      const deltaY = event.clientY - drag.lastY
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      if (drag.button === 0) {
        navigation.azimuth -= deltaX * 0.006
        navigation.polar = THREE.MathUtils.clamp(navigation.polar - deltaY * 0.006, MIN_POLAR, MAX_POLAR)
        renderNavigationCamera()
        publish('ORBIT', 'LEFT', movePx, event.clientX, event.clientY, 0)
      } else {
        camera.updateMatrixWorld(true)
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
        const panScale = navigation.distance * 0.0014
        navigation.target.addScaledVector(right, -deltaX * panScale)
        navigation.target.addScaledVector(up, deltaY * panScale)
        renderNavigationCamera()
        publish('PAN', drag.button === 1 ? 'MIDDLE' : 'RIGHT', movePx, event.clientX, event.clientY, 0)
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      const current = drag
      const movePx = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
      if (current.button === 0 && !current.moved) {
        const rawHits = pickAt(event.clientX, event.clientY)
        publish('CLICK', 'LEFT', movePx, event.clientX, event.clientY, rawHits)
      } else {
        publish(current.button === 0 ? 'ORBIT' : 'PAN', current.button === 0 ? 'LEFT' : current.button === 1 ? 'MIDDLE' : 'RIGHT', movePx, event.clientX, event.clientY, 0)
      }
      drag = null
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId)
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      drag = null
      publish('IDLE', 'NONE', 0, event.clientX, event.clientY, 0)
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      navigation.distance = THREE.MathUtils.clamp(navigation.distance * Math.pow(1.0012, event.deltaY), MIN_DISTANCE, MAX_DISTANCE)
      renderNavigationCamera()
      publish('ZOOM', 'WHEEL', Math.abs(event.deltaY), event.clientX, event.clientY, 0)
    }

    const onContextMenu = (event: MouseEvent) => event.preventDefault()
    const resize = () => {
      const rect = viewport.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderNavigationCamera()
    }
    const resizeObserver = new ResizeObserver(resize)

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerCancel)
    renderer.domElement.addEventListener('lostpointercapture', onPointerCancel)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
    renderer.domElement.addEventListener('contextmenu', onContextMenu)
    resizeObserver.observe(viewport)
    resize()
    renderNavigationCamera()

    const renderLoop = () => {
      if (disposed) return
      renderer.render(scene, camera)
      frameRequest = window.requestAnimationFrame(renderLoop)
    }
    frameRequest = window.requestAnimationFrame(renderLoop)

    return () => {
      disposed = true
      window.cancelAnimationFrame(frameRequest)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel)
      renderer.domElement.removeEventListener('lostpointercapture', onPointerCancel)
      renderer.domElement.removeEventListener('wheel', onWheel)
      renderer.domElement.removeEventListener('contextmenu', onContextMenu)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose()
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
          else object.material.dispose()
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  const format = (value: number) => value.toFixed(3)
  return (
    <section className="stage-panel" aria-label="Reference interaction harness">
      <div ref={viewportRef} className="reference-interaction-harness">
        <div className="reference-harness-title">
          <strong>REFERENCE INTERACTION HARNESS</strong>
          <span>DEVELOPMENT ONLY · DEMO interaction model</span>
        </div>
        <div className="reference-harness-diagnostic" aria-live="polite">
          <div className="reference-harness-diagnostic-title">INPUT DIAGNOSTIC</div>
          <div>MODE <b>{diagnostic.mode}</b></div>
          <div>BUTTON <b>{diagnostic.button}</b></div>
          <div>MOVE PX <b>{format(diagnostic.movePx)}</b></div>
          <div className="reference-harness-divider" />
          <div>CLIENT X/Y <b>{format(diagnostic.clientX)} / {format(diagnostic.clientY)}</b></div>
          <div>CANVAS LEFT/TOP <b>{format(diagnostic.rect.left)} / {format(diagnostic.rect.top)}</b></div>
          <div>CANVAS W/H <b>{format(diagnostic.rect.width)} / {format(diagnostic.rect.height)}</b></div>
          <div>NDC X/Y <b>{format(diagnostic.ndc.x)} / {format(diagnostic.ndc.y)}</b></div>
          <div>RAW HITS <b>{diagnostic.rawHits}</b></div>
          <div>SELECTED <b>{diagnostic.selected ?? 'NONE'}</b></div>
          <div className="reference-harness-divider" />
          <div>TARGET <b>{diagnostic.target.map(format).join(' / ')}</b></div>
          <div>DISTANCE <b>{format(diagnostic.distance)}</b></div>
          <div>AZIMUTH <b>{format(diagnostic.azimuth)}</b></div>
          <div>POLAR <b>{format(diagnostic.polar)}</b></div>
        </div>
        <div className="reference-harness-help">Left click select · Left drag orbit · Right/middle drag pan · Wheel zoom</div>
      </div>
    </section>
  )
}
