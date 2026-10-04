import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { resolveCharacterDefinition } from '../characters/characterRegistry'
import { getPoseDefinition, type PoseDefinition } from '../characters/poseLibrary'
import { productionPoseIntents } from './anatomicalPose'
import type { ActorDocument, CameraDocument, EulerRotation, Placement, PropDocument } from '../domain/types'
import { attachCharacterInstance, CharacterAssetLoader, computeBlockingBounds, getRigDiagnosticReport, inspectCharacterInstance, isUsableCharacterInstance, removeCharacterInstance, updateActorRuntimeAppearance } from './characterAssets'
import { createBlockingProxy, BlockingAssetLibrary, updateBlockingProxy } from './entityAdapters'
import { RuntimeRegistry } from './RuntimeRegistry'
import { capStagePixelRatio } from './renderPolicy'
import { validatePoseDefinition, type PoseDiagnosticsSnapshot } from './rigDiagnostics'

export type RuntimeTool = 'select' | 'move' | 'rotate'
export type BlockingEntity = ActorDocument | PropDocument | CameraDocument

export type SceneInteractionHandlers = {
  onSelectionChange: (entityId: string | null) => void
  onTransformCommit: (entityId: string, placement: Placement) => void
  onPoseDiagnosticsChange?: (snapshot: PoseDiagnosticsSnapshot | null) => void
}

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
  private readonly transformControls: TransformControls
  private readonly selectionHelper: THREE.Box3Helper
  private readonly registry = new RuntimeRegistry()
  private readonly assets = new BlockingAssetLibrary()
  private readonly characterAssets = new CharacterAssetLoader()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly resizeObserver: ResizeObserver | null
  private readonly handleWindowResize: () => void
  private readonly handleControlsChange: () => void
  private readonly handlePointerDown: (event: PointerEvent) => void
  private frameRequest: number | null = null
  private continuousRendering = false
  private disposed = false
  private selectedEntityId: string | null = null
  private activeTransformEntityId: string | null = null
  private tool: RuntimeTool = 'select'
  private rigDebugState = { actorId: null as string | null, showRig: false, showJointAxes: false, showContact: false, showPoseTargets: false }
  private diagnosticOverlay: THREE.Group | null = null
  private interactionHandlers: SceneInteractionHandlers = {
    onSelectionChange: () => undefined,
    onTransformCommit: () => undefined,
  }

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

    this.transformControls = new TransformControls(this.navigationCamera, this.renderer.domElement)
    this.transformControls.setSpace('world')
    this.transformControls.setSize(0.7)
    const transformHelper = this.transformControls.getHelper()
    transformHelper.visible = false
    this.scene.add(transformHelper)
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value
      if (event.value) {
        this.activeTransformEntityId = this.selectedEntityId
      } else if (this.activeTransformEntityId) {
        const object = this.registry.get(this.activeTransformEntityId)
        if (object) this.interactionHandlers.onTransformCommit(this.activeTransformEntityId, placementFromObject(object))
        this.activeTransformEntityId = null
      }
      this.requestRender()
    })
    this.transformControls.addEventListener('objectChange', () => {
      this.updateSelectionVisual()
      this.requestRender()
    })

    this.selectionHelper = new THREE.Box3Helper(new THREE.Box3(), '#e5bb82')
    this.selectionHelper.visible = false
    const selectionMaterial = this.selectionHelper.material as THREE.LineBasicMaterial
    selectionMaterial.transparent = true
    selectionMaterial.opacity = 0.8
    this.scene.add(this.selectionHelper)

    this.handlePointerDown = (event) => this.handleStagePointerDown(event)
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)

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

  setInteractionHandlers(handlers: SceneInteractionHandlers): void {
    this.interactionHandlers = handlers
  }

  syncBlockingEntities(actors: ActorDocument[], props: PropDocument[], cameras: CameraDocument[] = []): void {
    const entities: BlockingEntity[] = [...actors, ...props, ...cameras]
    const incomingIds = new Set(entities.map((entity) => entity.id))

    this.registry.rootsList().forEach((root) => {
      const entityId = root.userData.entityId as string | undefined
      if (entityId && !incomingIds.has(entityId)) {
        if (root.userData.entityKind === 'actor') removeCharacterInstance(root as THREE.Group)
        disposeCameraRuntime(root)
        this.scene.remove(this.registry.unregister(entityId) ?? root)
      }
    })

    entities.forEach((entity) => {
      const expectedKind = 'character' in entity ? 'actor' : 'lens' in entity ? 'camera' : 'prop'
      const existing = this.registry.get(entity.id)
      if (existing && existing.userData.entityKind !== expectedKind) {
        if (existing.userData.entityKind === 'actor') removeCharacterInstance(existing as THREE.Group)
        disposeCameraRuntime(existing)
        this.scene.remove(this.registry.unregister(entity.id) ?? existing)
      }

      const current = this.registry.get(entity.id)
      if (current) {
        updateBlockingProxy(current as THREE.Group, entity)
        if ('character' in entity) this.syncCharacterAsset(entity, current as THREE.Group)
      } else {
        const proxy = createBlockingProxy(entity, this.assets)
        this.scene.add(proxy)
        this.registry.register(entity.id, proxy)
        if ('character' in entity) this.syncCharacterAsset(entity, proxy)
      }
    })

    if (this.selectedEntityId) this.updateSelectionVisual()
    this.updateFacingIndicators()
    this.updateCameraGuides()
    this.requestRender()
  }

  setSelectedEntity(entityId: string | null): void {
    this.selectedEntityId = entityId
    this.updateSelectionVisual()
    this.updateFacingIndicators()
    this.updateCameraGuides()
    this.configureTransformControls()
    this.requestRender()
  }

  setTool(tool: RuntimeTool): void {
    this.tool = tool
    this.updateFacingIndicators()
    this.configureTransformControls()
    this.requestRender()
  }

  setPoseCalibration(actorId: string | null, pose: PoseDefinition | null): void {
    const root = actorId ? this.registry.get(actorId) : undefined
    if (!root || root.userData.entityKind !== 'actor') return
    const actor = root.userData.currentActor as ActorDocument | undefined
    if (!actor) return
    const model = root.getObjectByName('CharacterModel')
    const reconstructed = model?.userData.reconstructedPoses as Record<string, PoseDefinition> | undefined
    const generated = reconstructed?.[actor.pose.poseId]
    const calibrationPose = pose && generated ? mergeCalibrationPose(generated, getPoseDefinition(actor.pose.poseId), pose) : pose
    updateActorRuntimeAppearance(root as THREE.Group, actor, calibrationPose ?? undefined)
    if (this.selectedEntityId === actorId) this.updateSelectionVisual()
    this.refreshRigDebugOverlay()
    this.requestRender()
  }

  setRigDebugOverlay(actorId: string | null, options: { showRig: boolean; showJointAxes: boolean; showContact: boolean; showPoseTargets: boolean }): void {
    this.rigDebugState = { actorId, ...options }
    this.updateFacingIndicators()
    this.refreshRigDebugOverlay()
    this.requestRender()
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
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    this.transformControls.detach()
    this.transformControls.dispose()
    if (this.diagnosticOverlay) this.disposeDiagnosticOverlay(this.diagnosticOverlay)
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
    this.registry.clear()
    this.assets.dispose()
    this.characterAssets.dispose()
  }

  private configureTransformControls(): void {
    this.transformControls.detach()
    this.transformControls.enabled = false
    this.transformControls.getHelper().visible = false

    if (this.tool === 'select' || !this.selectedEntityId) return
    const object = this.registry.get(this.selectedEntityId)
    if (!object) return

    this.transformControls.setMode(this.tool === 'move' ? 'translate' : 'rotate')
    this.transformControls.attach(object)
    this.transformControls.enabled = true
    this.transformControls.getHelper().visible = true
  }

  private updateSelectionVisual(): void {
    const object = this.selectedEntityId ? this.registry.get(this.selectedEntityId) : undefined
    if (!object) {
      this.selectionHelper.visible = false
      this.transformControls.detach()
      return
    }
    const bounds = computeBlockingBounds(object)
    if (bounds.isEmpty()) {
      this.selectionHelper.visible = false
      return
    }
    this.selectionHelper.box.copy(bounds)
    this.selectionHelper.visible = true
  }

  private updateFacingIndicators(): void {
    const visible = (this.tool === 'rotate' || this.selectedEntityId !== null) && this.rigDebugState.actorId === null
    this.registry.rootsList().forEach((root) => {
      root.traverse((object) => {
        if (object.userData.facingIndicator === true) object.visible = visible
      })
    })
  }

  private updateCameraGuides(): void {
    this.registry.rootsList().forEach((root) => {
      if (root.userData.entityKind !== 'camera') return
      const guide = root.getObjectByName('CameraFrustumGuide')
      if (guide) guide.visible = root.userData.entityId === this.selectedEntityId
    })
  }

  private refreshRigDebugOverlay(): void {
    if (this.diagnosticOverlay) {
      this.disposeDiagnosticOverlay(this.diagnosticOverlay)
      this.diagnosticOverlay.parent?.remove(this.diagnosticOverlay)
      this.diagnosticOverlay = null
    }

    const { actorId, showRig, showJointAxes, showContact, showPoseTargets } = this.rigDebugState
    if (!actorId) {
      this.interactionHandlers.onPoseDiagnosticsChange?.(null)
      return
    }
    const actorRoot = this.registry.get(actorId)
    const model = actorRoot?.getObjectByName('CharacterModel')
    if (!actorRoot || !model) {
      this.interactionHandlers.onPoseDiagnosticsChange?.(null)
      return
    }
    const report = getRigDiagnosticReport(model)
    const actor = actorRoot.userData.currentActor as ActorDocument | undefined
    if (!report || !actor) {
      this.interactionHandlers.onPoseDiagnosticsChange?.(null)
      return
    }
    const reconstructed = model.userData.reconstructedPoses as Record<string, PoseDefinition> | undefined
    const pose = reconstructed?.[actor.pose.poseId] ?? getPoseDefinition(actor.pose.poseId)
    if (!pose) {
      this.interactionHandlers.onPoseDiagnosticsChange?.(null)
      return
    }
    const validation = validatePoseDefinition(model, actor, pose)
    const preContactBounds = computeBlockingBounds(model).getSize(new THREE.Vector3())
    const contactMode = pose.grounding.type === 'seat' ? 'Seat + Feet' : pose.grounding.type === 'back' ? 'Back' : 'Feet'
    const supportOrientation = pose.grounding.type !== 'back' || !pose.grounding.supportFrame
      ? 'Posterior'
      : pose.grounding.supportFrame === 'posterior'
        ? 'Posterior'
        : pose.grounding.supportFrame === 'anterior'
          ? 'Anterior'
          : pose.grounding.supportFrame === 'left-lateral'
            ? 'Left Lateral'
            : pose.grounding.supportFrame === 'right-lateral'
              ? 'Right Lateral'
              : pose.grounding.supportFrame === 'posterior-inclined'
                ? 'Posterior Inclined'
                : 'Lateral'
    const torsoOrientation = validation.metrics.torsoVerticality > 0.75
      ? pose.category === 'sitting' ? 'Seated' : 'Vertical'
      : 'Horizontal'
    const hasOverlay = showRig || showJointAxes || showContact || showPoseTargets
    if (!hasOverlay) {
      updateActorRuntimeAppearance(actorRoot as THREE.Group, actor)
      const postContactBounds = computeBlockingBounds(actorRoot).getSize(new THREE.Vector3())
      this.interactionHandlers.onPoseDiagnosticsChange?.({
        poseId: pose.id,
        validation,
        preContactBounds: [preContactBounds.x, preContactBounds.y, preContactBounds.z],
        postContactBounds: [postContactBounds.x, postContactBounds.y, postContactBounds.z],
        contactMode,
        supportOrientation,
        torsoOrientation,
      })
      return
    }

    const overlay = new THREE.Group()
    overlay.name = 'RigDiagnosticOverlay'
    overlay.userData.diagnosticOverlay = true
    const actorInverse = actorRoot.matrixWorld.clone().invert()
    const positionInActor = (object: THREE.Object3D): THREE.Vector3 => object.getWorldPosition(new THREE.Vector3()).applyMatrix4(actorInverse)

    if (showRig) {
      const jointGeometry = new THREE.SphereGeometry(0.018, 8, 6)
      const pointMaterial = new THREE.MeshBasicMaterial({ color: '#77c8ff', depthTest: false, transparent: true, opacity: 0.9 })
      const lineMaterial = new THREE.LineBasicMaterial({ color: '#77c8ff', depthTest: false, transparent: true, opacity: 0.85 })
      Object.values(report.joints).forEach((diagnostic) => {
        if (!diagnostic) return
        const object = model.getObjectByName(diagnostic.bone)
        if (!object) return
        const point = new THREE.Mesh(jointGeometry, pointMaterial)
        point.position.copy(positionInActor(object))
        point.userData.diagnosticOverlay = true
        overlay.add(point)
        const child = diagnostic.primaryChildBone ? model.getObjectByName(diagnostic.primaryChildBone) : undefined
        if (child) {
          const geometry = new THREE.BufferGeometry().setFromPoints([positionInActor(object), positionInActor(child)])
          const line = new THREE.Line(geometry, lineMaterial)
          line.userData.diagnosticOverlay = true
          overlay.add(line)
        }
      })
    }

    if (showJointAxes) {
      Object.values(report.joints).forEach((diagnostic) => {
        if (!diagnostic) return
        const object = model.getObjectByName(diagnostic.bone)
        if (!object) return
        const axes = new THREE.AxesHelper(0.12)
        axes.position.copy(positionInActor(object))
        axes.quaternion.copy(actorRoot.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(object.getWorldQuaternion(new THREE.Quaternion())))
        axes.userData.diagnosticOverlay = true
        overlay.add(axes)
      })
    }

    if (showPoseTargets) {
      const actor = actorRoot.userData.currentActor as ActorDocument | undefined
      const intent = actor ? productionPoseIntents().find((entry) => entry.id === actor.pose.poseId) : undefined
      if (intent) {
        const reconstructed = model.userData.reconstructedPoses as Record<string, PoseDefinition> | undefined
        const pose = reconstructed?.[intent.id] ?? getPoseDefinition(intent.id)
        if (!pose) return
        const targetMaterial = new THREE.LineBasicMaterial({ color: '#f1ba68', depthTest: false, transparent: true, opacity: 0.9 })
        const targetPointMaterial = new THREE.MeshBasicMaterial({ color: '#f1ba68', depthTest: false, transparent: true, opacity: 0.95 })
        const anatomyMaterial = new THREE.LineBasicMaterial({ color: '#86d5b3', depthTest: false, transparent: true, opacity: 0.85 })
        const referenceMaterial = new THREE.LineBasicMaterial({ color: '#7c8da3', depthTest: false, transparent: true, opacity: 0.7 })
        const targetGeometry = new THREE.SphereGeometry(0.014, 8, 6)
        const modelRotation = actorRoot.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(model.getWorldQuaternion(new THREE.Quaternion()))
        const modelWorldScale = model.getWorldScale(new THREE.Vector3())
        const actorWorldScale = actorRoot.getWorldScale(new THREE.Vector3())
        const modelScaleInActor = modelWorldScale.x / Math.max(0.0001, actorWorldScale.x)
        const directionInActor = (joint: keyof typeof intent.joints): THREE.Vector3 | undefined => {
          const target = intent.joints[joint]?.targetDirection
          if (!target) return undefined
          return new THREE.Vector3()
            .addScaledVector(new THREE.Vector3(...report.characterAxes.right), target.characterRight)
            .addScaledVector(new THREE.Vector3(...report.characterAxes.up), target.characterUp)
            .addScaledVector(new THREE.Vector3(...report.characterAxes.forward), target.characterForward)
            .normalize()
            .applyQuaternion(modelRotation)
        }
        const boneObject = (joint: keyof typeof report.joints): THREE.Object3D | undefined => {
          const diagnostic = report.joints[joint]
          return diagnostic ? model.getObjectByName(diagnostic.bone) : undefined
        }
        const restLength = (joint: keyof typeof report.joints): number => {
          const diagnostic = report.joints[joint]
          const childJoint = diagnostic?.primaryChildJoint
          const child = childJoint ? report.joints[childJoint] : undefined
          return diagnostic && child
            ? new THREE.Vector3(...diagnostic.restWorldPosition).distanceTo(new THREE.Vector3(...child.restWorldPosition)) * modelScaleInActor
            : 0.28
        }
        const addPoint = (position: THREE.Vector3) => {
          const point = new THREE.Mesh(targetGeometry, targetPointMaterial)
          point.position.copy(position)
          point.userData.diagnosticOverlay = true
          overlay.add(point)
        }
        const addLine = (start: THREE.Vector3, end: THREE.Vector3) => {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), targetMaterial)
          line.userData.diagnosticOverlay = true
          overlay.add(line)
        }
        const addReferenceLine = (start: THREE.Vector3, end: THREE.Vector3, material: THREE.LineBasicMaterial = referenceMaterial) => {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), material)
          line.userData.diagnosticOverlay = true
          overlay.add(line)
        }
        const addPlane = (height: number, color: string, name: string) => {
          const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.8),
            new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.45, depthTest: false }),
          )
          plane.name = name
          plane.rotation.x = -Math.PI / 2
          plane.position.y = height
          plane.userData.diagnosticOverlay = true
          overlay.add(plane)
        }

        // Upper-body guides are deliberately built as a chain: clavicle origin
        // -> shoulder socket -> elbow target -> wrist target. The clavicle is
        // not reused as an arm-direction control.
        (['L', 'R'] as const).forEach((side) => {
          const shoulder = boneObject(`shoulder.${side}`)
          const socket = boneObject(`upperArm.${side}`)
          const upperDirection = directionInActor(`upperArm.${side}`)
          const lowerDirection = directionInActor(`lowerArm.${side}`)
          if (!shoulder || !socket || !upperDirection || !lowerDirection) return
          const shoulderOrigin = positionInActor(shoulder)
          const socketOrigin = positionInActor(socket)
          const elbowTarget = socketOrigin.clone().addScaledVector(upperDirection, restLength(`upperArm.${side}`))
          const wristTarget = elbowTarget.clone().addScaledVector(lowerDirection, restLength(`lowerArm.${side}`))
          addPoint(shoulderOrigin)
          addPoint(socketOrigin)
          addPoint(elbowTarget)
          addPoint(wristTarget)
          addLine(shoulderOrigin, socketOrigin)
          addLine(socketOrigin, elbowTarget)
          addLine(elbowTarget, wristTarget)
          const hipsReference = boneObject('hips')
          const chestReference = boneObject('chest')
          const bodyCenter = hipsReference && chestReference
            ? positionInActor(hipsReference).add(positionInActor(chestReference)).multiplyScalar(0.5)
            : new THREE.Vector3(0, socketOrigin.y, socketOrigin.z)
          const oppositeShoulder = positionInActor(boneObject(`shoulder.${side === 'L' ? 'R' : 'L'}`) ?? shoulder)
          const lateral = shoulderOrigin.clone().sub(oppositeShoulder).normalize()
          const signedLateral = socketOrigin.clone().sub(bodyCenter).dot(lateral)
          const centerlinePoint = socketOrigin.clone().addScaledVector(lateral, -signedLateral)
          addReferenceLine(socketOrigin.clone().add(elbowTarget).multiplyScalar(0.5), centerlinePoint, anatomyMaterial)
        })

        const hips = boneObject('hips')
        const chest = boneObject('chest')
        const head = boneObject('head')
        if (hips && chest && head) {
          const hipsPoint = positionInActor(hips)
          const chestPoint = positionInActor(chest)
          const headPoint = positionInActor(head)
          addReferenceLine(hipsPoint, headPoint)
          const leftShoulder = boneObject('shoulder.L')
          const rightShoulder = boneObject('shoulder.R')
          if (leftShoulder && rightShoulder) addReferenceLine(positionInActor(leftShoulder), positionInActor(rightShoulder), anatomyMaterial)
          const center = hipsPoint.clone().add(chestPoint).multiplyScalar(0.5)
          const ribWidth = leftShoulder && rightShoulder ? positionInActor(leftShoulder).distanceTo(positionInActor(rightShoulder)) * 2.6 : 0.4
          const ribBounds = new THREE.Box3(
            new THREE.Vector3(center.x - ribWidth * 0.5, Math.min(hipsPoint.y, chestPoint.y) - 0.08, center.z - 0.16),
            new THREE.Vector3(center.x + ribWidth * 0.5, Math.max(hipsPoint.y, chestPoint.y) + 0.08, center.z + 0.16),
          )
          const ribGuide = new THREE.Box3Helper(ribBounds, '#7c8da3')
          ribGuide.userData.diagnosticOverlay = true
          overlay.add(ribGuide)
        }

        if (intent.id === 'sitting-neutral') {
          const seatGrounding = pose.grounding.type === 'seat' ? pose.grounding : undefined
          const seatHeight = seatGrounding ? seatGrounding.referenceHeight * modelScaleInActor : 0
          addPlane(0, '#8ea4b8', 'PoseTargetFloor')
          addPlane(seatHeight, '#f0bd67', 'PoseTargetSeat')
          const pelvis = boneObject('hips')
          if (pelvis) {
            const pelvisTarget = positionInActor(pelvis)
            pelvisTarget.y = seatHeight
            addPoint(pelvisTarget)
          }
          (['L', 'R'] as const).forEach((side) => {
            const hip = boneObject(`upperLeg.${side}`)
            const kneeDirection = directionInActor(`upperLeg.${side}`)
            const ankleDirection = directionInActor(`lowerLeg.${side}`)
            const foot = boneObject(`foot.${side}`)
            if (!hip || !kneeDirection || !ankleDirection || !foot) return
            const hipOrigin = positionInActor(hip)
            const kneeTarget = hipOrigin.clone().addScaledVector(kneeDirection, restLength(`upperLeg.${side}`))
            const ankleTarget = kneeTarget.clone().addScaledVector(ankleDirection, restLength(`lowerLeg.${side}`))
            const footTarget = positionInActor(foot)
            const supportOffset = seatGrounding
              ? seatGrounding.secondaryContact?.supportOffsets?.[`foot.${side}`] ?? 0
              : 0
            footTarget.y = supportOffset * modelScaleInActor
            addPoint(hipOrigin)
            addPoint(kneeTarget)
            addPoint(ankleTarget)
            addPoint(footTarget)
            addLine(hipOrigin, kneeTarget)
            addLine(kneeTarget, ankleTarget)
            addLine(ankleTarget, footTarget)
          })
        }

        if (intent.category === 'lying') {
          addPlane(0, '#8ea4b8', 'PoseTargetFloor')
          const hips = boneObject('hips')
          const head = boneObject('head')
          const chest = boneObject('chest')
          if (hips && head) {
            const origin = positionInActor(hips)
            const bodyDirection = new THREE.Vector3(...report.characterAxes.up).applyQuaternion(modelRotation).normalize()
            const bodyTarget = origin.clone().addScaledVector(bodyDirection, origin.distanceTo(positionInActor(head)))
            addPoint(origin)
            addPoint(bodyTarget)
            addLine(origin, bodyTarget)
          }
          if (chest) {
            const origin = positionInActor(chest)
            const frontDirection = new THREE.Vector3(...report.characterAxes.forward).applyQuaternion(modelRotation).normalize()
            const frontTarget = origin.clone().addScaledVector(frontDirection, 0.22)
            addPoint(frontTarget)
            addLine(origin, frontTarget)
          }
          const support = boneObject('spine')
          if (support && pose.grounding.type === 'back') {
            const supportTarget = positionInActor(support)
            supportTarget.y = pose.grounding.contactOffset * modelScaleInActor
            addPoint(supportTarget)
          }
        }
      }
    }

    // Target and rig guides are built from the pre-contact skeleton. Restore
    // the final grounded character before adding the contact overlay.
    updateActorRuntimeAppearance(actorRoot as THREE.Group, actor)
    const postContactBounds = computeBlockingBounds(actorRoot).getSize(new THREE.Vector3())
    this.interactionHandlers.onPoseDiagnosticsChange?.({
      poseId: pose.id,
      validation,
      preContactBounds: [preContactBounds.x, preContactBounds.y, preContactBounds.z],
      postContactBounds: [postContactBounds.x, postContactBounds.y, postContactBounds.z],
      contactMode,
      supportOrientation,
      torsoOrientation,
    })

    if (showContact) {
      const contact = getContactDebugObject(model, actorRoot, report)
      if (contact) overlay.add(contact)
    }

    actorRoot.add(overlay)
    this.diagnosticOverlay = overlay
  }

  private disposeDiagnosticOverlay(overlay: THREE.Group): void {
    overlay.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
        object.geometry.dispose()
        disposeMaterial(object.material)
      }
    })
  }

  private syncCharacterAsset(actor: ActorDocument, root: THREE.Group): void {
    const definition = resolveCharacterDefinition(actor.character.characterId)
    root.userData.currentActor = actor

    const loadedCharacterId = root.userData.loadedCharacterId as string | undefined
    if (loadedCharacterId && loadedCharacterId !== definition.id) {
      removeCharacterInstance(root)
      root.userData.loadedCharacterId = undefined
      root.userData.characterLoadAttempted = undefined
      const fallback = root.getObjectByName('ActorFallback')
      if (fallback) fallback.visible = true
    }

    if (root.userData.loadedCharacterId === definition.id || root.userData.characterLoadAttempted === definition.id) return
    root.userData.characterLoadAttempted = definition.id

      void this.characterAssets.loadInstance(definition).then((instance) => {
      if (this.disposed || this.registry.get(actor.id) !== root) return
      const currentActor = root.userData.currentActor as ActorDocument | undefined
      if (!currentActor || currentActor.character.characterId !== definition.id) return
      if (!instance) {
        this.reportCharacterFallback(root, currentActor, definition.id, this.characterAssets.failureReason(definition.id) ?? 'Character asset did not produce a runtime instance.')
        return
      }
      if (!isUsableCharacterInstance(instance)) {
        this.reportCharacterFallback(root, currentActor, definition.id, 'Character asset is missing required humanoid joints.')
        return
      }
      root.userData.loadedCharacterId = definition.id
      attachCharacterInstance(root, instance, currentActor, definition.referenceHeightM)
      const inspection = inspectCharacterInstance(instance)
      console.info('[Character]', {
        actor: currentActor.name,
        character: definition.id,
        asset: definition.assetPath,
        load: 'success',
        skinnedMesh: inspection.skinnedMesh,
        skeleton: `${inspection.skeletonBones} bones`,
        meshCount: inspection.meshCount,
        visibleMesh: inspection.visibleMesh,
        deformation: inspection.deformation,
        rigWarnings: (getRigDiagnosticReport(instance)?.warnings ?? []).length,
        rigProfile: definition.rigProfile,
        fallback: false,
      })
      this.refreshRigDebugOverlay()
      this.requestRender()
    })
  }

  private reportCharacterFallback(root: THREE.Group, actor: ActorDocument, characterId: string, reason: string): void {
    root.userData.characterFallbackReason = reason
    console.warn('[Character]', {
      actor: actor.name,
      character: characterId,
      fallback: true,
      reason,
    })
  }

  private handleStagePointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.transformControls.dragging) return
    const bounds = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.navigationCamera)
    const hit = this.raycaster.intersectObjects(this.registry.rootsList(), true)[0]
    this.interactionHandlers.onSelectionChange(this.registry.resolveHit(hit?.object) ?? null)
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

function placementFromObject(object: THREE.Object3D): Placement {
  const rotation: EulerRotation = {
    order: 'XYZ',
    radians: [object.rotation.x, object.rotation.y, object.rotation.z],
  }
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation,
  }
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material]
  materials.forEach((entry) => entry.dispose())
}

function disposeCameraRuntime(root: THREE.Object3D): void {
  const guide = root.getObjectByName('CameraFrustumGuide')
  guide?.traverse((object) => {
    if (object instanceof THREE.Line || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      disposeMaterial(object.material)
    }
  })
}

function getContactDebugObject(model: THREE.Object3D, actorRoot: THREE.Object3D, report: ReturnType<typeof getRigDiagnosticReport>): THREE.Group | null {
  if (!report) return null
  const actor = actorRoot.userData.currentActor as ActorDocument | undefined
  if (!actor) return null
  const reconstructed = model.userData.reconstructedPoses as Record<string, PoseDefinition> | undefined
    const pose = reconstructed?.[actor.pose.poseId] ?? getPoseDefinition(actor.pose.poseId)
  if (!pose) return null

  const contact = new THREE.Group()
  contact.name = 'ContactDebug'
  contact.userData.diagnosticOverlay = true
  const actorInverse = actorRoot.matrixWorld.clone().invert()
  const actorScaleY = Math.abs(actorRoot.getWorldScale(new THREE.Vector3()).y) || 1
  const modelScaleInActor = Math.abs(model.getWorldScale(new THREE.Vector3()).y) / actorScaleY || 1
  const positionInActor = (object: THREE.Object3D): THREE.Vector3 => object.getWorldPosition(new THREE.Vector3()).applyMatrix4(actorInverse)
  const addPlane = (height: number, color: string, name: string): void => {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.6, depthTest: false }),
    )
    plane.name = name
    plane.rotation.x = -Math.PI / 2
    plane.position.y = height
    plane.userData.diagnosticOverlay = true
    contact.add(plane)
  }
  const addTarget = (object: THREE.Object3D, height: number): void => {
    const point = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#f0bd67', depthTest: false }),
    )
    point.position.copy(positionInActor(object))
    point.position.y = height
    point.userData.diagnosticOverlay = true
    contact.add(point)
  }

  addPlane(0, '#8ea4b8', 'FloorContactPlane')
  if (pose.grounding.type === 'seat') {
    const seatGrounding = pose.grounding
    const seatHeight = seatGrounding.referenceHeight * modelScaleInActor
    addPlane(seatHeight, '#f0bd67', 'SeatContactPlane')
    const pelvis = model.getObjectByName(report.joints[pose.grounding.referenceJoint]?.bone ?? '')
    if (pelvis) addTarget(pelvis, seatHeight)
    seatGrounding.secondaryContact?.referenceJoints.forEach((joint) => {
      const foot = model.getObjectByName(report.joints[joint]?.bone ?? '')
      if (foot) {
        const supportOffset = seatGrounding.secondaryContact?.supportOffsets?.[joint] ?? 0
        addTarget(foot, (seatGrounding.secondaryContact?.floorHeight ?? 0) + supportOffset * modelScaleInActor)
      }
    })
  } else if (pose.grounding.type === 'back') {
    const reference = model.getObjectByName(report.joints[pose.grounding.referenceJoint]?.bone ?? '')
    if (reference) addTarget(reference, pose.grounding.contactOffset * modelScaleInActor)
  } else if (pose.grounding.type === 'feet') {
    const reference = model.getObjectByName(report.joints[pose.grounding.referenceJoint]?.bone ?? '')
    if (reference) addTarget(reference, 0)
  } else {
    const reference = model.getObjectByName(report.joints[pose.grounding.referenceJoint]?.bone ?? '')
    if (reference) addTarget(reference, 0)
  }
  return contact
}

function mergeCalibrationPose(generated: PoseDefinition, source: PoseDefinition | undefined, edited: PoseDefinition): PoseDefinition {
  if (!source) return edited
  const bones = { ...generated.bones }
  Object.entries(edited.bones).forEach(([joint, transform]) => {
    const sourceTransform = source.bones[joint as keyof typeof source.bones]
    if (JSON.stringify(transform) !== JSON.stringify(sourceTransform)) {
      bones[joint as keyof typeof bones] = transform
    }
  })
  return {
    ...generated,
    bones,
    ...(edited.rootOffset ? { rootOffset: edited.rootOffset } : {}),
    ...(edited.rootRotationQuaternion && JSON.stringify(edited.rootRotationQuaternion) !== JSON.stringify(source.rootRotationQuaternion)
      ? { rootRotationQuaternion: edited.rootRotationQuaternion }
      : {}),
  }
}
