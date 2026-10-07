import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { cloneSceneWithIdentity } from '../core/projectDocument'
import { parseSceneFile, serializeScene } from '../core/scenePersistence'
import { parseProjectFile, serializeProject } from '../core/projectPersistence'
import { createProjectDocument } from '../core/projectDocument'
import { createActorDocument, createCameraDocument, createEmptySceneDocument, createOpeningDocument, createPropDocument, createSunDocument, createWallDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { evaluateTimeline } from '../timeline/timelineEvaluator'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'
import { createScenicVisual } from '../runtime/scenicRuntime'
import { sunAnglesFromHelperPosition, sunHelperPosition } from '../runtime/sunMapping'

describe('V2.10 scenic foundation', () => {
  it('round-trips scenic props, walls, openings, and Sun state through .ndscene', () => {
    const scene = createEmptySceneDocument()
    scene.props.push(createPropDocument('prop-table-01', 'Table 01', 'table', [0, 0, 0], '#9a7658'))
    scene.walls.push(createWallDocument('wall-01', 'Wall 01'))
    const door = createOpeningDocument('door-01', 'Door 01', 'door', [0, 0, -2.9])
    door.wallId = scene.walls[0].id
    door.offsetAlongWallMeters = 2.25
    scene.openings.push(door)
    const window = createOpeningDocument('window-01', 'Window 01', 'window', [1, 1.1, -2.9])
    window.hingeSide = 'right'
    window.openAngle = 63
    scene.openings.push(window)
    scene.lights.push(createSunDocument('sun-01', 'Sun 01'))
    const loaded = parseSceneFile(serializeScene(scene, '2026-01-01T00:00:00.000Z'))
    expect(loaded.props[0].propType).toBe('table')
    expect(loaded.walls[0].length).toBe(6)
    expect(loaded.openings[0].openingType).toBe('door')
    expect(loaded.openings[0].offsetAlongWallMeters).toBe(2.25)
    expect(loaded.openings[1]).toMatchObject({ hingeSide: 'right', openAngle: 63 })
    expect(loaded.lights[0].azimuth).toBe(135)
  })

  it('preserves independent Actor, scenic, and Camera proxy colors through persistence', () => {
    const scene = createEmptySceneDocument()
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    actor.appearance.primaryColor = '#d94d5c'
    const cameraDefinition = CAMERA_DATABASE[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 4], [0, 0, 0], cameraDefinition.id, cameraDefinition.captureModes[0].id)
    camera.proxyColor = '#4f87d9'
    scene.actors.push(actor)
    scene.props.push(createPropDocument('prop-01', 'Car 01', 'car', [0, 0, 0], '#42a56b'))
    scene.walls.push(createWallDocument('wall-01', 'Wall 01'))
    scene.openings.push(createOpeningDocument('window-01', 'Window 01', 'window', [0, 1, 0]))
    scene.cameras.push(camera)
    const loaded = parseSceneFile(serializeScene(scene))
    expect(loaded.actors[0].appearance.primaryColor).toBe('#d94d5c')
    expect(loaded.props[0].primaryColor).toBe('#42a56b')
    expect(loaded.cameras[0].proxyColor).toBe('#4f87d9')
    expect(loaded.walls[0].primaryColor).toBe(scene.walls[0].primaryColor)
    expect(loaded.openings[0].primaryColor).toBe(scene.openings[0].primaryColor)
  })

  it('round-trips primitive scale through both scene and project files', () => {
    const scene = createEmptySceneDocument()
    const cube = createPropDocument('cube-01', 'Cube 01', 'cube', [0, 1, 0], '#9b91df')
    cube.scale = [2, 3, 4]
    scene.props.push(cube)
    expect(parseSceneFile(serializeScene(scene)).props[0].scale).toEqual([2, 3, 4])
    const project = createProjectDocument('project-01', 'Project 01', scene)
    expect(parseProjectFile(serializeProject(project)).scenes[0].scene.props[0].scale).toEqual([2, 3, 4])
  })

  it('round-trips Window hinge and open-angle state through a project file', () => {
    const scene = createEmptySceneDocument()
    const window = createOpeningDocument('window-01', 'Window 01', 'window', [0, 1.1, 0])
    window.hingeSide = 'right'
    window.openAngle = 63
    scene.openings.push(window)
    const project = createProjectDocument('project-01', 'Project 01', scene)
    const loaded = parseProjectFile(serializeProject(project)).scenes[0].scene.openings[0]
    expect(loaded).toMatchObject({ hingeSide: 'right', openAngle: 63 })
  })

  it('defaults missing primitive scale to one for older scene payloads', () => {
    const scene = createEmptySceneDocument()
    const cube = createPropDocument('cube-01', 'Cube 01', 'cube', [0, 1, 0], '#9b91df')
    delete cube.scale
    scene.props.push(cube)
    expect(parseSceneFile(serializeScene(scene)).props[0].scale).toEqual([1, 1, 1])
  })

  it('defaults legacy Window state to a closed left hinge and clamps imported Window angles', () => {
    const scene = createEmptySceneDocument()
    scene.openings.push(createOpeningDocument('window-01', 'Window 01', 'window', [0, 1.1, 0]))
    const payload = JSON.parse(serializeScene(scene)) as { scene: { openings: Array<Record<string, unknown>> } }
    delete payload.scene.openings[0].hingeSide
    delete payload.scene.openings[0].openAngle
    expect(parseSceneFile(JSON.stringify(payload)).openings[0]).toMatchObject({ hingeSide: 'left', openAngle: 0 })
    payload.scene.openings[0].openAngle = 140
    expect(parseSceneFile(JSON.stringify(payload)).openings[0].openAngle).toBe(90)
  })

  it('evaluates door swing and Sun direction/intensity tracks', () => {
    const scene = createEmptySceneDocument()
    const door = createOpeningDocument('door-01', 'Door 01', 'door', [0, 0, 0])
    const sun = createSunDocument('sun-01', 'Sun 01')
    scene.openings.push(door)
    scene.lights.push(sun)
    let timeline = upsertTimelineKeyframe(scene.timeline, door.id, 'Opening', 'openAngle', 0, 0)
    timeline = upsertTimelineKeyframe(timeline, door.id, 'Opening', 'openAngle', 24, 90)
    timeline = upsertTimelineKeyframe(timeline, sun.id, 'Sun', 'azimuth', 0, 90)
    timeline = upsertTimelineKeyframe(timeline, sun.id, 'Sun', 'azimuth', 24, 180)
    scene.timeline = timeline
    const evaluated = evaluateTimeline(scene, 12)
    expect(evaluated[door.id].openAngle).toBe(45)
    expect(evaluated[sun.id].azimuth).toBe(135)
  })

  it('evaluates Window open-angle keyframes as a scalar track', () => {
    const scene = createEmptySceneDocument()
    const window = createOpeningDocument('window-01', 'Window 01', 'window', [0, 1.1, 0])
    scene.openings.push(window)
    let timeline = upsertTimelineKeyframe(scene.timeline, window.id, 'Opening', 'openAngle', 0, 0)
    timeline = upsertTimelineKeyframe(timeline, window.id, 'Opening', 'openAngle', 24, 90)
    scene.timeline = timeline
    expect(evaluateTimeline(scene, 12)[window.id].openAngle).toBe(45)
  })

  it('rotates the Window sash around its selected vertical hinge without rebuilding the frame', () => {
    const window = createOpeningDocument('window-01', 'Window 01', 'window', [0, 1.1, 0])
    const visual = createScenicVisual(window)
    const pivot = visual.root.getObjectByName('Window hinge pivot')
    expect(pivot).toBeDefined()
    expect(pivot?.position.x).toBeCloseTo(-window.width / 2)
    expect(pivot?.rotation.y).toBeCloseTo(0)
    visual.applyDocument({ ...window, openAngle: 45 })
    expect(pivot?.rotation.y).toBeCloseTo(Math.PI / 4)
    visual.dispose()

    const rightWindow = createOpeningDocument('window-02', 'Window 02', 'window', [0, 1.1, 0])
    rightWindow.hingeSide = 'right'
    const rightVisual = createScenicVisual(rightWindow)
    const rightPivot = rightVisual.root.getObjectByName('Window hinge pivot')
    expect(rightPivot?.position.x).toBeCloseTo(rightWindow.width / 2)
    rightVisual.applyDocument({ ...rightWindow, openAngle: 45 })
    expect(rightPivot?.rotation.y).toBeCloseTo(-Math.PI / 4)
    rightVisual.dispose()
  })

  it('duplicates scenic entities and remaps opening wall references and timeline tracks', () => {
    const scene = createEmptySceneDocument()
    const wall = createWallDocument('wall-01', 'Wall 01')
    const door = createOpeningDocument('door-01', 'Door 01', 'door', [0, 0, -3])
    door.wallId = wall.id
    const window = createOpeningDocument('window-01', 'Window 01', 'window', [0, 1.1, -3])
    window.wallId = wall.id
    window.offsetAlongWallMeters = 3.8
    window.hingeSide = 'right'
    window.openAngle = 45
    scene.walls.push(wall)
    scene.openings.push(door, window)
    scene.lights.push(createSunDocument('sun-01', 'Sun 01'))
    scene.timeline = upsertTimelineKeyframe(scene.timeline, door.id, 'Opening', 'openAngle', 0, 0)
    const copy = cloneSceneWithIdentity(scene, 'scene-02', 'Scene 02', 'copy-02')
    expect(copy.walls[0].id).toBe('wall-01-copy-02')
    expect(copy.openings[0].id).toBe('door-01-copy-02')
    expect(copy.openings[0].wallId).toBe('wall-01-copy-02')
    expect(copy.openings[1]).toMatchObject({ id: 'window-01-copy-02', wallId: 'wall-01-copy-02', hingeSide: 'right', openAngle: 45 })
    expect(copy.lights[0].id).toBe('sun-01-copy-02')
    expect(copy.timeline.tracks[0].entityId).toBe('door-01-copy-02')
  })

  it('keeps vehicle proxy structure readable and inexpensive', () => {
    const car = createScenicVisual(createPropDocument('car-01', 'Car 01', 'car', [0, 0, 0], '#71839a'))
    const bicycle = createScenicVisual(createPropDocument('bike-01', 'Bicycle 01', 'bicycle', [0, 0, 0], '#8f9e6d'))
    const motorbike = createScenicVisual(createPropDocument('motor-01', 'Motorbike 01', 'motorbike', [0, 0, 0], '#a86d61'))
    const countNamed = (root: THREE.Object3D, text: string) => { let count = 0; root.traverse((child) => { if (child.name.includes(text)) count += 1 }); return count }
    expect(countNamed(car.root, 'Car body')).toBe(1)
    expect(countNamed(car.root, 'Car cabin')).toBe(1)
    expect(countNamed(car.root, 'Car hood')).toBe(0)
    expect(countNamed(car.root, 'Car trunk')).toBe(0)
    expect(countNamed(car.root, 'wheel')).toBe(4)
    expect(countNamed(bicycle.root, 'wheel')).toBe(2)
    expect(countNamed(motorbike.root, 'wheel')).toBe(2)
    const wheelAxles: number[] = []
    car.root.traverse((child) => { if (child.name.includes('wheel')) wheelAxles.push(child.userData.vehicleAxle === 'X' ? 1 : 0) })
    expect(wheelAxles).toEqual([1, 1, 1, 1])
    car.dispose(); bicycle.dispose(); motorbike.dispose()
  })

  it('builds wall sections around an attached opening while keeping one scenic owner', () => {
    const wall = createWallDocument('wall-01', 'Wall 01')
    const door = createOpeningDocument('door-01', 'Door 01', 'door', [0, 0, 0])
    door.wallId = wall.id
    door.offsetAlongWallMeters = 2
    const visual = createScenicVisual(wall, { wallOpenings: [door] })
    const sectionNames: string[] = []
    visual.root.traverse((child) => { if (child.name === 'Wall section') sectionNames.push(child.name) })
    expect(sectionNames).toHaveLength(3)
    expect(visual.root.userData.entityId).toBe(wall.id)
    visual.dispose()
  })

  it('round-trips the Sun helper direction model', () => {
    for (const [azimuth, elevation] of [[0, 45], [90, 30], [180, 70]]) {
      const angles = sunAnglesFromHelperPosition(sunHelperPosition(azimuth, elevation))
      expect(angles.azimuth).toBeCloseTo(azimuth, 6)
      expect(angles.elevation).toBeCloseTo(elevation, 6)
    }
  })
})
