import { useEffect, useRef, useState } from 'react'
import { computeCameraViewProjection, computeCameraViewViewport } from '../math/cameraView'
import { SceneRuntime } from '../runtime/SceneRuntime'
import { ReferenceInteractionHarness } from './ReferenceInteractionHarness'
import type { NavigationSnapshot } from '../runtime/navigation'
import { ViewCubeOverlay } from './ViewCubeOverlay'
import type { StageAlignmentDebugSnapshot, StagePickDebugSnapshot } from '../runtime/SceneRuntime'
import type { ViewCubeDirection } from './viewCube'
import { blockingStore, useBlockingSelector } from '../state/blockingStore'
import { poseCalibrationStore, usePoseCalibrationSelector } from '../state/poseCalibrationStore'

export function Stage() {
  const referenceInteractionEnabled = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('referenceInteraction') === '1'
  return referenceInteractionEnabled ? <ReferenceInteractionHarness /> : <ProductionStage />
}

function ProductionStage() {
  const interactionDebugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get('interactionDebug') === '1'
  const stageRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<SceneRuntime | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [navigationDiagnostic, setNavigationDiagnostic] = useState<NavigationSnapshot | null>(null)
  const [stagePickDebug, setStagePickDebug] = useState<StagePickDebugSnapshot | null>(null)
  const [stageAlignmentDebug, setStageAlignmentDebug] = useState<StageAlignmentDebugSnapshot | null>(null)
  const state = useBlockingSelector((snapshot) => snapshot)
  const calibration = usePoseCalibrationSelector((snapshot) => snapshot)
  const shot = state.project.shots.find((entry) => entry.id === state.project.activeShotId)
  const selectedCamera = state.selection.kind === 'camera'
    ? shot?.cameras.find((camera) => camera.id === state.selection.entityId)
    : undefined
  const cameraForView = selectedCamera ?? shot?.cameras.find((camera) => camera.id === shot.activeCameraId) ?? shot?.cameras[0]
  const cameraViewProjection = cameraForView ? computeCameraViewProjection(cameraForView) : null
  const cameraViewViewport = cameraViewProjection && viewportSize.width > 0 && viewportSize.height > 0
    ? computeCameraViewViewport(viewportSize.width, viewportSize.height, cameraViewProjection.displayAspectRatio)
    : null

  useEffect(() => {
    const container = stageRef.current
    if (!container) return

    try {
      let pickDebugTimer: number | null = null
      const runtime = new SceneRuntime(container)
      runtime.setInteractionHandlers({
        onSelectionChange: (entityId) => blockingStore.selectEntity(entityId),
        onTransformCommit: (entityId, placement) => blockingStore.setEntityPlacement(entityId, placement),
        onPoseDiagnosticsChange: (snapshot) => poseCalibrationStore.setRuntimeDiagnostics(snapshot),
        onViewModeChange: (viewMode) => blockingStore.setViewMode(viewMode),
        onNavigationChange: (snapshot) => setNavigationDiagnostic(snapshot),
        onStageAlignmentDebug: (snapshot) => setStageAlignmentDebug(snapshot),
        onStagePickDebug: (snapshot) => {
          setStagePickDebug(snapshot)
          if (interactionDebugEnabled) return
          if (pickDebugTimer !== null) window.clearTimeout(pickDebugTimer)
          pickDebugTimer = window.setTimeout(() => setStagePickDebug(null), 3000)
        },
      })
      runtimeRef.current = runtime
      container.dataset.stageState = 'ready'
      return () => {
        if (pickDebugTimer !== null) window.clearTimeout(pickDebugTimer)
        delete container.dataset.stageState
        runtimeRef.current = null
        runtime.dispose()
      }
    } catch (initializationError) {
      console.error('Blocking View could not be initialized.', initializationError)
      container.dataset.stageState = 'failed'
    }
  }, [interactionDebugEnabled])

  useEffect(() => {
    const container = stageRef.current
    if (!container) return
    const updateViewportSize = () => {
      const bounds = container.getBoundingClientRect()
      setViewportSize({ width: bounds.width, height: bounds.height })
    }
    updateViewportSize()
    const ResizeObserverClass = (window as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    if (!ResizeObserverClass) {
      window.addEventListener('resize', updateViewportSize)
      return () => window.removeEventListener('resize', updateViewportSize)
    }
    const observer = new ResizeObserverClass(updateViewportSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    runtimeRef.current?.syncBlockingEntities(shot?.actors ?? [], shot?.props ?? [], shot?.cameras ?? [])
  }, [shot?.actors, shot?.props, shot?.cameras])

  useEffect(() => {
    runtimeRef.current?.setSelectedEntity(state.selection.entityId)
  }, [state.selection.entityId])

  useEffect(() => {
    runtimeRef.current?.setTool(state.tool)
  }, [state.tool])

  useEffect(() => {
    runtimeRef.current?.setViewMode(state.viewMode, cameraForView?.id ?? null)
  }, [state.viewMode, cameraForView?.id])

  useEffect(() => {
    runtimeRef.current?.setPoseCalibration(calibration.actorId, calibration.pose)
  }, [calibration.actorId, calibration.pose])

  useEffect(() => {
    runtimeRef.current?.setRigDebugOverlay(calibration.actorId, {
      showRig: calibration.showRig,
      showJointAxes: calibration.showJointAxes,
      showContact: calibration.showContact,
      showPoseTargets: calibration.showPoseTargets,
    })
  }, [calibration.actorId, calibration.showRig, calibration.showJointAxes, calibration.showContact, calibration.showPoseTargets])

  const debugVector = (value: readonly number[] | null | undefined) => value ? value.map((entry) => entry.toFixed(3)).join(' / ') : '—'
  const debugHit = (value: { type: string; name: string; distance: number } | null | undefined) => value
    ? `${value.type} ${value.name} · ${value.distance.toFixed(3)} m`
    : 'NONE'
  const debugRect = (value: StageAlignmentDebugSnapshot['rendererCanvasRect'] | null) => value
    ? `L ${value.left.toFixed(1)} · T ${value.top.toFixed(1)} · R ${value.right.toFixed(1)} · B ${value.bottom.toFixed(1)} · W ${value.width.toFixed(1)} · H ${value.height.toFixed(1)}`
    : 'NONE'
  const debugMatrix = (value: readonly number[]) => value.map((entry) => entry.toFixed(3)).join(' / ')
  const debugOverlayPosition = (value: readonly [number, number] | null | undefined) => value && stageAlignmentDebug
    ? { left: `${value[0] - stageAlignmentDebug.stageViewportRect.left}px`, top: `${value[1] - stageAlignmentDebug.stageViewportRect.top}px` }
    : undefined

  return (
    <section className="stage-panel" aria-label="Stage">
      <div className="stage-viewport" ref={stageRef} data-stage-state="starting" data-view-mode={state.viewMode}>
        <div className="stage-error" role="alert">
          <span className="stage-error-mark">!</span>
          <div>
            <strong>Stage unavailable</strong>
            <p>The Stage could not be started on this device. Try a browser with 3D graphics enabled.</p>
          </div>
        </div>
        {state.viewMode === 'camera' && cameraForView && cameraViewProjection && cameraViewViewport ? (
          <div className="camera-view-overlay" aria-label={`Camera View through ${cameraForView.name}`}>
            <div
              className="camera-view-capture"
              style={{ width: `${cameraViewViewport.width}px`, height: `${cameraViewViewport.height}px` }}
            >
              <div
                className={`camera-view-delivery ${cameraViewProjection.frameGuideAspectRatio === null ? 'is-capture' : ''}`}
                style={{
                  width: `${cameraViewProjection.delivery.widthFraction * 100}%`,
                  height: `${cameraViewProjection.delivery.heightFraction * 100}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        {state.viewMode === 'camera' && !cameraForView ? (
          <div className="camera-view-empty" role="status">
            <strong>Select a Camera to use Camera View.</strong>
          </div>
        ) : null}
        <div className="stage-chrome stage-chrome-top">
          <span className="view-chip">{state.viewMode === 'camera' ? 'Camera View' : 'Blocking View'}</span>
          <span className="stage-status">
            {state.viewMode === 'camera' && cameraForView
              ? `${cameraForView.name} · ${cameraForView.lens.focalLengthMm} mm`
              : shot?.actors.length || shot?.props.length || shot?.cameras.length ? 'Stage' : 'Empty Stage'}
          </span>
        </div>
        {state.viewMode === 'blocking' ? (
          <ViewCubeOverlay
            orientation={navigationDiagnostic?.quaternion ?? [0, 0, 0, 1]}
            onZone={(direction: ViewCubeDirection) => runtimeRef.current?.snapNavigationDirection(direction)}
            onHome={() => runtimeRef.current?.resetNavigationView()}
            onOrbitDelta={(deltaX, deltaY) => runtimeRef.current?.orbitNavigationByPixels(deltaX, deltaY, 88)}
          />
        ) : null}
        <div className="stage-chrome stage-chrome-bottom">
          <span>{state.viewMode === 'camera' && cameraForView ? `Frame Guide · ${cameraForView.frameGuide.preset === 'capture' ? 'Capture' : cameraForView.frameGuide.preset}` : 'Orbit · Pan · Zoom'}</span>
          <span className="stage-units">Meters</span>
        </div>
        {interactionDebugEnabled && stageAlignmentDebug ? (
          <>
            {stageAlignmentDebug.probeExpectedBeforeClient ? (
              <div className="stage-alignment-crosshair stage-alignment-crosshair-before" style={debugOverlayPosition(stageAlignmentDebug.probeExpectedBeforeClient)} aria-hidden="true">+B</div>
            ) : null}
            {stageAlignmentDebug.probeExpectedClient ? (
              <div className="stage-alignment-crosshair stage-alignment-crosshair-after" style={debugOverlayPosition(stageAlignmentDebug.probeExpectedClient)} aria-hidden="true">+A</div>
            ) : null}
            {stageAlignmentDebug.clickClient ? (
              <div className="stage-alignment-crosshair stage-alignment-crosshair-click" style={debugOverlayPosition(stageAlignmentDebug.clickClient)} aria-hidden="true">○</div>
            ) : null}
            {stageAlignmentDebug.actorExpectedClient ? (
              <div className="stage-alignment-crosshair stage-alignment-crosshair-actor" style={debugOverlayPosition(stageAlignmentDebug.actorExpectedClient)} aria-hidden="true">◇</div>
            ) : null}
          </>
        ) : null}
        {import.meta.env.DEV ? (
          <div className="stage-dev-diagnostic" aria-hidden="true">
            <div className="stage-dev-build-marker">DEV 3B.6 — NAV REBASE</div>
            {navigationDiagnostic ? (
              <div className="stage-dev-navigation-readout">
                <div>PIVOT X: {navigationDiagnostic.target[0].toFixed(2)}</div>
                <div>PIVOT Y: {navigationDiagnostic.target[1].toFixed(2)}</div>
                <div>PIVOT Z: {navigationDiagnostic.target[2].toFixed(2)}</div>
                <div>CAM DIST: {navigationDiagnostic.distance.toFixed(2)}</div>
              </div>
            ) : null}
            {interactionDebugEnabled && stageAlignmentDebug ? (
              <div className="stage-dev-pick-readout stage-dev-alignment-readout">
                <div className="stage-dev-pick-section">RENDER / PICK ALIGNMENT</div>
                <div>RENDERER === INTERACTION CANVAS: {stageAlignmentDebug.rendererCanvasIsInteractionCanvas ? 'YES' : 'NO'}</div>
                <div>EVENT CURRENT TARGET === RENDERER: {stageAlignmentDebug.eventCurrentTargetIsRendererCanvas === null ? 'NOT CAPTURED' : stageAlignmentDebug.eventCurrentTargetIsRendererCanvas ? 'YES' : 'NO'}</div>
                <div>EVENT TARGET === RENDERER: {stageAlignmentDebug.eventTargetIsRendererCanvas === null ? 'NOT CAPTURED' : stageAlignmentDebug.eventTargetIsRendererCanvas ? 'YES' : 'NO'}</div>
                <div>RENDER SURFACE === RENDERER: {stageAlignmentDebug.stageRenderSurfaceIsRendererCanvas ? 'YES' : 'NO'}</div>
                <div>PICK RECT SOURCE: {stageAlignmentDebug.pickRectSource}</div>
                <div className="stage-dev-pick-section">ELEMENTS</div>
                <div>RENDERER: {stageAlignmentDebug.rendererCanvasElement}</div>
                <div>EVENT CURRENT: {stageAlignmentDebug.eventCurrentTargetElement}</div>
                <div>EVENT TARGET: {stageAlignmentDebug.eventTargetElement}</div>
                <div>RENDER SURFACE: {stageAlignmentDebug.stageRenderSurfaceElement}</div>
                <div>STAGE VIEWPORT: {stageAlignmentDebug.stageViewportElement}</div>
                <div className="stage-dev-pick-section">DOM RECTS</div>
                <div>RENDERER CANVAS: {debugRect(stageAlignmentDebug.rendererCanvasRect)}</div>
                <div>EVENT CURRENT: {debugRect(stageAlignmentDebug.eventCurrentTargetRect)}</div>
                <div>EVENT TARGET: {debugRect(stageAlignmentDebug.eventTargetRect)}</div>
                <div>RENDER SURFACE: {debugRect(stageAlignmentDebug.stageRenderSurfaceRect)}</div>
                <div>STAGE VIEWPORT: {debugRect(stageAlignmentDebug.stageViewportRect)}</div>
                <div>PROJECTION RECT: {debugRect(stageAlignmentDebug.projectionRect)}</div>
                <div className="stage-dev-pick-section">RENDERER STATE</div>
                <div>ELEMENT W/H: {stageAlignmentDebug.rendererElementWidth} / {stageAlignmentDebug.rendererElementHeight}</div>
                <div>CLIENT W/H: {stageAlignmentDebug.rendererClientWidth} / {stageAlignmentDebug.rendererClientHeight}</div>
                <div>PIXEL RATIO: {stageAlignmentDebug.pixelRatio.toFixed(3)}</div>
                <div>RENDERER SIZE: {debugVector(stageAlignmentDebug.rendererSize)}</div>
                <div>DRAWING BUFFER: {debugVector(stageAlignmentDebug.drawingBufferSize)}</div>
                <div>VIEWPORT: {debugVector(stageAlignmentDebug.viewport)}</div>
                <div>SCISSOR: {debugVector(stageAlignmentDebug.scissor)}</div>
                <div>SCISSOR TEST: {stageAlignmentDebug.scissorTest ? 'ON' : 'OFF'}</div>
                <div className="stage-dev-pick-section">CAMERAS</div>
                <div>RENDER: {stageAlignmentDebug.renderCamera.name} / {stageAlignmentDebug.renderCamera.type}</div>
                <div>RENDER UUID: {stageAlignmentDebug.renderCamera.uuid}</div>
                <div>ASPECT: {stageAlignmentDebug.renderCamera.aspect.toFixed(5)}</div>
                <div>FOV: {stageAlignmentDebug.renderCamera.fov.toFixed(3)}°</div>
                <div>POSITION: {debugVector(stageAlignmentDebug.renderCamera.position)}</div>
                <div>ASPECT W/H: {stageAlignmentDebug.renderCamera.aspectWidth.toFixed(3)} / {stageAlignmentDebug.renderCamera.aspectHeight.toFixed(3)}</div>
                <div>ASPECT SOURCE: {stageAlignmentDebug.renderCamera.aspectSource}</div>
                <div>PICK: {stageAlignmentDebug.pickCamera.name} / {stageAlignmentDebug.pickCamera.type}</div>
                <div>PICK UUID: {stageAlignmentDebug.pickCamera.uuid}</div>
                <div>RENDER CAMERA === PICK CAMERA: {stageAlignmentDebug.renderCameraIsPickCamera ? 'YES' : 'NO'}</div>
                <div className="stage-dev-pick-section">PROJECTED PROBE</div>
                <div>WORLD CENTER: {debugVector(stageAlignmentDebug.probeWorldCenter)}</div>
                <div>PROJECT BEFORE SYNC NDC X/Y: {debugVector(stageAlignmentDebug.probeProjectedBeforeNdc)}</div>
                <div>PROJECT BEFORE SYNC CLIENT X/Y: {debugVector(stageAlignmentDebug.probeExpectedBeforeClient)}</div>
                <div>PROJECT AFTER SYNC NDC X/Y: {debugVector(stageAlignmentDebug.probeProjectedNdc)}</div>
                <div>PROJECT AFTER SYNC CLIENT X/Y: {debugVector(stageAlignmentDebug.probeExpectedClient)}</div>
                <div>CLICK CLIENT X/Y: {debugVector(stageAlignmentDebug.clickClient)}</div>
                <div>CLICK DELTA X/Y: {debugVector(stageAlignmentDebug.clickDeltaFromProbe)}</div>
                <div>PROBE HIT BEFORE SYNC: {stageAlignmentDebug.matrixSync.probeHitBeforeSync === null ? '—' : stageAlignmentDebug.matrixSync.probeHitBeforeSync ? 'YES' : 'NO'}</div>
                <div>PROBE HIT AFTER SYNC: {stageAlignmentDebug.matrixSync.probeHitAfterSync === null ? '—' : stageAlignmentDebug.matrixSync.probeHitAfterSync ? 'YES' : 'NO'}</div>
                <div className="stage-dev-pick-section">MATRIX SYNC</div>
                <div>BEFORE CAMERA POSITION: {debugVector(stageAlignmentDebug.matrixSync.beforeCameraPosition)}</div>
                <div>BEFORE CAMERA WORLD POS: {debugVector(stageAlignmentDebug.matrixSync.beforeCameraWorldPosition)}</div>
                <div>BEFORE CAMERA WORLD INV: {debugMatrix(stageAlignmentDebug.matrixSync.beforeCameraMatrixWorldInverse)}</div>
                <div>BEFORE PROBE POSITION: {debugVector(stageAlignmentDebug.matrixSync.beforeProbePosition)}</div>
                <div>BEFORE PROBE WORLD POS: {debugVector(stageAlignmentDebug.matrixSync.beforeProbeWorldPosition)}</div>
                <div>AFTER CAMERA WORLD POS: {debugVector(stageAlignmentDebug.matrixSync.afterCameraWorldPosition)}</div>
                <div>AFTER PROBE WORLD POS: {debugVector(stageAlignmentDebug.matrixSync.afterProbeWorldPosition)}</div>
                <div className="stage-dev-pick-section">PROJECTED ACTOR</div>
                <div>NDC X/Y: {debugVector(stageAlignmentDebug.actorProjectedNdc)}</div>
                <div>EXPECTED CLIENT X/Y: {debugVector(stageAlignmentDebug.actorExpectedClient)}</div>
              </div>
            ) : null}
            {interactionDebugEnabled && stagePickDebug ? (
              <div className="stage-dev-pick-readout">
                <div>GESTURE: {stagePickDebug.gesture}</div>
                <div>BUTTON: {stagePickDebug.button}</div>
                <div>MOVE: {stagePickDebug.movePx.toFixed(1)} PX</div>
                <div className="stage-dev-pick-section">POINTER</div>
                <div>CLIENT X/Y: {stagePickDebug.clientX.toFixed(1)} / {stagePickDebug.clientY.toFixed(1)}</div>
                <div>NDC X: {stagePickDebug.ndcX.toFixed(3)}</div>
                <div>NDC Y: {stagePickDebug.ndcY.toFixed(3)}</div>
                <div>CANVAS L/T: {stagePickDebug.canvasRect.left.toFixed(1)} / {stagePickDebug.canvasRect.top.toFixed(1)}</div>
                <div>CANVAS W/H: {stagePickDebug.canvasRect.width.toFixed(1)} / {stagePickDebug.canvasRect.height.toFixed(1)}</div>
                <div className="stage-dev-pick-section">RAY</div>
                <div>ORIGIN: {debugVector(stagePickDebug.productionProbe?.rayOrigin)}</div>
                <div>DIRECTION: {debugVector(stagePickDebug.productionProbe?.rayDirection)}</div>
                <div className="stage-dev-pick-section">PROBE CUBE</div>
                <div>HIT: {stagePickDebug.productionProbe?.probe.hit ? 'YES' : 'NO'}</div>
                <div>DISTANCE: {stagePickDebug.productionProbe?.probe.distance?.toFixed(3) ?? '—'}</div>
                <div>POINT: {debugVector(stagePickDebug.productionProbe?.probe.point)}</div>
                <div className="stage-dev-pick-section">GROUND</div>
                <div>HIT: {stagePickDebug.productionProbe?.ground.hit ? 'YES' : 'NO'}</div>
                <div>DISTANCE: {stagePickDebug.productionProbe?.ground.distance?.toFixed(3) ?? '—'}</div>
                <div>POINT: {debugVector(stagePickDebug.productionProbe?.ground.point)}</div>
                <div className="stage-dev-pick-section">REGISTRY</div>
                <div>ROOTS: {stagePickDebug.productionProbe?.registryRoots.length ?? 0}</div>
                {stagePickDebug.productionProbe?.registryRoots.map((root) => (
                  <div key={`${root.entityId}-${root.entityKind}`} className="stage-dev-pick-detail">
                    {root.entityKind} {root.entityId} / {root.name} / {root.visible ? 'visible' : 'hidden'} / children {root.childCount}
                  </div>
                ))}
                <div>PICK RAW HITS: {stagePickDebug.rawHits}</div>
                {stagePickDebug.productionProbe?.registryRawHits.map((hit, index) => (
                  <div key={`${hit.name}-${index}`} className="stage-dev-pick-detail">
                    {hit.type} {hit.name} · {hit.distance.toFixed(3)} m · {hit.resolvedEntity ?? 'NONE'}
                  </div>
                ))}
                <div>REGISTRY RAW HITS: {stagePickDebug.productionProbe?.registryRawHits.length ?? 0}</div>
                <div>SELECTABLE HITS: {stagePickDebug.selectableHits}</div>
                <div className="stage-dev-pick-section">DIRECT ROOT HITS</div>
                <div>ACTOR: {stagePickDebug.productionProbe?.directRootHits.actor.length ?? 0}</div>
                <div>PROP: {stagePickDebug.productionProbe?.directRootHits.prop.length ?? 0}</div>
                <div>CAMERA: {stagePickDebug.productionProbe?.directRootHits.camera.length ?? 0}</div>
                <div className="stage-dev-pick-section">RESOLUTION</div>
                <div>FIRST RAW: {debugHit(stagePickDebug.productionProbe?.firstRawHit)}</div>
                <div>RESOLVED ENTITY: {stagePickDebug.productionProbe?.resolvedEntity ?? 'NONE'}</div>
                <div>SELECTION REQUESTED: {stagePickDebug.selectionRequested ?? 'NONE'}</div>
                <div>SELECTION COMMITTED: {stagePickDebug.selectionCommitted === null ? '—' : stagePickDebug.selectionCommitted ? 'YES' : 'NO'}</div>
                <div>CURRENT SELECTION: {stagePickDebug.currentSelection ?? 'NONE'}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
