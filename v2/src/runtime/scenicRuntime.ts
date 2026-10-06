import * as THREE from 'three'
import type { OpeningDocument, PropDocument, ScenicPropType, SunDocument, WallDocument } from '../core/sceneDocument'
import { wallSolidRectangles } from '../architecture/wallApertures'
import { sunDirectionFromAngles, sunHelperPosition } from './sunMapping'

export type ScenicDefinition = PropDocument | WallDocument | OpeningDocument | SunDocument

export type ScenicVisual = {
  root: THREE.Group
  applyDocument: (definition: ScenicDefinition) => void
  setSelected: (selected: boolean) => void
  setSnapPreview: (active: boolean) => void
  dispose: () => void
}

type ScenicResource = THREE.BufferGeometry | THREE.Material

const SUN_HELPER_COLOR = 0xf0b866

export function scenicGeometrySignature(definition: ScenicDefinition, wallOpenings: readonly OpeningDocument[] = []): string {
  if (definition.type === 'Prop') return JSON.stringify([definition.type, definition.propType, definition.shape, definition.primaryColor, definition.dimensions])
  if (definition.type === 'Wall') return JSON.stringify([definition.type, definition.length, definition.height, definition.thickness, definition.primaryColor, wallOpenings.filter((opening) => opening.wallId === definition.id).map((opening) => [opening.id, opening.openingType, opening.offsetAlongWallMeters, opening.width, opening.height, opening.sillHeight])])
  if (definition.type === 'Opening') return JSON.stringify([definition.type, definition.openingType, definition.width, definition.height, definition.depth, definition.sillHeight, definition.hingeSide, definition.primaryColor])
  return definition.type
}

export function createScenicVisual(definition: ScenicDefinition, options: { includeSunHelper?: boolean; wallOpenings?: readonly OpeningDocument[] } = {}): ScenicVisual {
  const root = new THREE.Group()
  root.name = definition.name
  root.userData.entityId = definition.id
  const resources: ScenicResource[] = []
  const selectableMaterials: THREE.MeshStandardMaterial[] = []
  let doorPanel: THREE.Object3D | null = null
  let windowSash: THREE.Group | null = null
  let sunLight: THREE.DirectionalLight | null = null
  let sunTarget: THREE.Object3D | null = null
  let sunMarker: THREE.Object3D | null = null
  let sunLine: THREE.Line | null = null
  let disposed = false
  let selected = false
  let snapPreview = false

  const registerMaterial = (material: THREE.Material): void => {
    resources.push(material)
    if (material instanceof THREE.MeshStandardMaterial) selectableMaterials.push(material)
  }
  const addMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string, parent = root): THREE.Mesh => {
    resources.push(geometry)
    registerMaterial(material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.entityId = definition.id
    parent.add(mesh)
    return mesh
  }
  const material = (color: string, roughness = 0.72): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 })
  const box = (name: string, size: [number, number, number], position: [number, number, number], color: string, parent = root): THREE.Mesh => {
    const mesh = addMesh(new THREE.BoxGeometry(...size), material(color), name, parent)
    mesh.position.set(...position)
    return mesh
  }
  const cylinder = (name: string, radius: number, height: number, position: [number, number, number], color: string, parent = root, radialSegments = 12): THREE.Mesh => {
    const mesh = addMesh(new THREE.CylinderGeometry(radius, radius, height, radialSegments), material(color), name, parent)
    mesh.position.set(...position)
    return mesh
  }
  const applyTransform = (value: ScenicDefinition): void => {
    if ('position' in value) {
      root.position.set(...value.position)
      root.rotation.set(...value.rotation)
      if (value.type === 'Prop') root.scale.set(...(value.scale ?? [1, 1, 1]))
    }
  }
  const addWheel = (name: string, position: [number, number, number], radius: number, color: string): THREE.Mesh => {
    const wheel = addMesh(new THREE.TorusGeometry(radius, Math.max(0.045, radius * 0.12), 8, 16), material(color, 0.88), name)
    wheel.position.set(...position)
    // TorusGeometry's default axle is +Z. Rotate it into the vehicle width axis +X.
    wheel.rotation.y = Math.PI / 2
    wheel.userData.vehicleAxle = 'X'
    return wheel
  }
  const wheelGroundY = (radius: number): number => radius + Math.max(0.045, radius * 0.12)
  const addBeam = (name: string, start: [number, number, number], end: [number, number, number], thickness: number, color: string): THREE.Mesh => {
    const startVector = new THREE.Vector3(...start)
    const endVector = new THREE.Vector3(...end)
    const delta = endVector.clone().sub(startVector)
    const beam = addMesh(new THREE.CylinderGeometry(thickness / 2, thickness / 2, delta.length(), 8), material(color), name)
    beam.position.copy(startVector).add(endVector).multiplyScalar(0.5)
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
    return beam
  }
  if (definition.type === 'Prop') {
    const kind: ScenicPropType = definition.propType ?? definition.shape
    const dimensions = definition.dimensions ?? [1.6, 2, 1.6]
    if (kind === 'table') {
      const [width, height, depth] = dimensions
      box('Tabletop', [width, 0.14, depth], [0, height - 0.07, 0], definition.primaryColor)
      for (const x of [-width / 2 + 0.12, width / 2 - 0.12]) for (const z of [-depth / 2 + 0.12, depth / 2 - 0.12]) box('Table leg', [0.12, height - 0.14, 0.12], [x, (height - 0.14) / 2, z], definition.primaryColor)
    } else if (kind === 'chair') {
      const [width, height, depth] = dimensions
      box('Chair seat', [width, 0.12, depth], [0, height * 0.52, 0], definition.primaryColor)
      box('Chair back', [width, height * 0.55, 0.12], [0, height * 0.77, depth / 2 - 0.06], definition.primaryColor)
      for (const x of [-width / 2 + 0.08, width / 2 - 0.08]) for (const z of [-depth / 2 + 0.08, depth / 2 - 0.08]) box('Chair leg', [0.08, height * 0.52, 0.08], [x, height * 0.26, z], definition.primaryColor)
    } else if (kind === 'window') {
      const frame = 0.08
      box('Window glass', [Math.max(0.02, dimensions[0] - frame * 2), Math.max(0.02, dimensions[1] - frame * 2), dimensions[2] * 0.35], [0, dimensions[1] / 2, 0], '#466878')
      box('Window top frame', [dimensions[0], frame, dimensions[2]], [0, dimensions[1] - frame / 2, 0], definition.primaryColor)
      box('Window bottom frame', [dimensions[0], frame, dimensions[2]], [0, frame / 2, 0], definition.primaryColor)
      box('Window left frame', [frame, Math.max(0.02, dimensions[1] - frame * 2), dimensions[2]], [-dimensions[0] / 2 + frame / 2, dimensions[1] / 2, 0], definition.primaryColor)
      box('Window right frame', [frame, Math.max(0.02, dimensions[1] - frame * 2), dimensions[2]], [dimensions[0] / 2 - frame / 2, dimensions[1] / 2, 0], definition.primaryColor)
    } else if (kind === 'door') {
      const hinge = new THREE.Group()
      hinge.position.x = -dimensions[0] / 2
      root.add(hinge)
      box('Door panel', [dimensions[0], dimensions[1], dimensions[2]], [dimensions[0] / 2, dimensions[1] / 2, 0], definition.primaryColor, hinge)
      box('Door top frame', [dimensions[0] + 0.12, 0.12, dimensions[2] + 0.04], [0, dimensions[1] + 0.06, 0], '#634f42')
      box('Door hinge frame', [0.12, dimensions[1], dimensions[2] + 0.04], [-dimensions[0] / 2 - 0.06, dimensions[1] / 2, 0], '#634f42')
      doorPanel = hinge
    } else if (kind === 'bicycle') {
      const [width, height, length] = dimensions
      const wheelRadius = Math.min(height * 0.29, length * 0.28)
      const rearZ = length * 0.39
      const frontZ = -length * 0.39
      const axleY = wheelGroundY(wheelRadius)
      const rearHub = [0, axleY, rearZ] as [number, number, number]
      const frontHub = [0, axleY, frontZ] as [number, number, number]
      const crank = [0, height * 0.34, length * 0.04] as [number, number, number]
      const seat = [0, height * 0.62, length * 0.19] as [number, number, number]
      const head = [0, height * 0.58, -length * 0.2] as [number, number, number]
      addWheel('Bicycle rear wheel', rearHub, wheelRadius, '#343b4a')
      addWheel('Bicycle front wheel', frontHub, wheelRadius, '#343b4a')
      cylinder('Bicycle rear hub', 0.045, width * 0.42, rearHub, '#7b8492', root, 10).rotation.z = Math.PI / 2
      cylinder('Bicycle front hub', 0.045, width * 0.42, frontHub, '#7b8492', root, 10).rotation.z = Math.PI / 2
      addBeam('Bicycle top tube', seat, head, 0.052, definition.primaryColor)
      addBeam('Bicycle down tube', head, crank, 0.058, definition.primaryColor)
      addBeam('Bicycle seat tube', seat, crank, 0.058, definition.primaryColor)
      addBeam('Bicycle chain stay left', rearHub, crank, 0.04, definition.primaryColor)
      addBeam('Bicycle chain stay right', rearHub, crank, 0.04, definition.primaryColor)
      addBeam('Bicycle seat stay', rearHub, seat, 0.04, definition.primaryColor)
      addBeam('Bicycle front fork', frontHub, head, 0.045, definition.primaryColor)
      addBeam('Bicycle seat post', seat, [0, height * 0.76, length * 0.19], 0.035, definition.primaryColor)
      box('Bicycle saddle', [width * 0.72, 0.045, length * 0.14], [0, height * 0.78, length * 0.19], '#343b4a')
      addBeam('Bicycle handlebar stem', head, [0, height * 0.79, -length * 0.21], 0.035, definition.primaryColor)
      box('Bicycle handlebar', [width * 0.9, 0.045, 0.045], [0, height * 0.8, -length * 0.22], '#343b4a')
      cylinder('Bicycle crank', 0.065, width * 0.16, crank, '#343b4a', root, 12).rotation.z = Math.PI / 2
    } else if (kind === 'motorbike') {
      const [width, height, length] = dimensions
      const wheelRadius = Math.min(height * 0.28, length * 0.16)
      const rearZ = length * 0.32
      const frontZ = -length * 0.35
      const axleY = wheelGroundY(wheelRadius)
      addWheel('Motorbike rear wheel', [0, axleY, rearZ], wheelRadius, '#272c37')
      addWheel('Motorbike front wheel', [0, axleY, frontZ], wheelRadius, '#272c37')
      cylinder('Motorbike rear hub', 0.055, width * 0.45, [0, axleY, rearZ], '#798291', root, 10).rotation.z = Math.PI / 2
      cylinder('Motorbike front hub', 0.055, width * 0.45, [0, axleY, frontZ], '#798291', root, 10).rotation.z = Math.PI / 2
      addBeam('Motorbike frame spine', [0, height * 0.46, rearZ * 0.35], [0, height * 0.59, -length * 0.12], 0.09, definition.primaryColor)
      box('Motorbike engine', [width * 0.7, height * 0.3, length * 0.27], [0, height * 0.38, length * 0.04], '#343b4a')
      box('Motorbike fuel tank', [width * 0.78, height * 0.25, length * 0.32], [0, height * 0.62, -length * 0.1], definition.primaryColor)
      box('Motorbike seat', [width * 0.68, 0.12, length * 0.42], [0, height * 0.72, length * 0.16], '#343b4a')
      box('Motorbike tail', [width * 0.58, height * 0.16, length * 0.25], [0, height * 0.72, length * 0.39], definition.primaryColor)
      addBeam('Motorbike front fork', [0, axleY, frontZ], [0, height * 0.64, -length * 0.2], 0.065, definition.primaryColor)
      box('Motorbike front cowl', [width * 0.72, height * 0.3, length * 0.18], [0, height * 0.7, -length * 0.27], definition.primaryColor)
      box('Motorbike handlebar', [width * 1.1, 0.06, 0.06], [0, height * 0.89, -length * 0.22], '#343b4a')
      box('Motorbike headlight', [width * 0.32, height * 0.18, 0.08], [0, height * 0.77, -length * 0.38], '#d4bd79')
    } else if (kind === 'car') {
      const [width, height, length] = dimensions
      box('Car body', [width, height * 0.42, length], [0, height * 0.28, 0], definition.primaryColor)
      box('Car cabin', [width * 0.78, height * 0.4, length * 0.5], [0, height * 0.68, length * 0.02], definition.primaryColor)
      const wheelX = width * 0.52
      const wheelRadius = height * 0.16
      const wheelY = wheelGroundY(wheelRadius)
      for (const x of [-wheelX, wheelX]) for (const z of [-length * 0.31, length * 0.31]) {
        addWheel(`Car ${z < 0 ? 'front' : 'rear'} ${x < 0 ? 'left' : 'right'} wheel`, [x, wheelY, z], wheelRadius, '#303642')
      }
    } else if (kind === 'sphere') {
      addMesh(new THREE.SphereGeometry(0.9, 20, 14), material(definition.primaryColor), definition.name)
    } else if (kind === 'cylinder') {
      cylinder(definition.name, 0.78, 2, [0, 0, 0], definition.primaryColor, root, 20)
    } else {
      box(definition.name, [1.6, 2, 1.6], [0, 0, 0], definition.primaryColor)
    }
  } else if (definition.type === 'Wall') {
    wallSolidRectangles(definition, options.wallOpenings ?? []).forEach((rect) => {
      const width = rect.uMax - rect.uMin
      const height = rect.vMax - rect.vMin
      box('Wall section', [width, height, definition.thickness], [(rect.uMin + rect.uMax) / 2 - definition.length / 2, (rect.vMin + rect.vMax) / 2, 0], definition.primaryColor)
    })
  } else if (definition.type === 'Opening') {
    const frameColor = definition.primaryColor
    const frame = 0.08
    if (definition.openingType === 'window') {
      // The outer frame remains fixed in the aperture. The sash owns its own
      // local hinge pivot, so openAngle never changes the Wall cutout.
      box('Window outer top frame', [definition.width + frame * 2, frame, definition.depth], [0, definition.height - frame / 2, 0], frameColor)
      box('Window outer left frame', [frame, definition.height, definition.depth], [-definition.width / 2 - frame / 2, definition.height / 2, 0], frameColor)
      box('Window outer right frame', [frame, definition.height, definition.depth], [definition.width / 2 + frame / 2, definition.height / 2, 0], frameColor)
      box('Window outer sill', [definition.width + frame * 2, frame, definition.depth], [0, frame / 2, 0], frameColor)
      const hingeSide = definition.hingeSide === 'right' ? 'right' : 'left'
      const direction = hingeSide === 'right' ? -1 : 1
      const sash = new THREE.Group()
      sash.name = 'Window hinge pivot'
      sash.position.x = hingeSide === 'right' ? definition.width / 2 : -definition.width / 2
      root.add(sash)
      box('Window sash glass', [Math.max(0.02, definition.width - frame * 2), Math.max(0.02, definition.height - frame * 2), definition.depth * 0.35], [direction * definition.width / 2, definition.height / 2, 0], '#466878', sash)
      box('Window sash top frame', [definition.width, frame, definition.depth], [direction * definition.width / 2, definition.height - frame / 2, 0], frameColor, sash)
      box('Window sash bottom frame', [definition.width, frame, definition.depth], [direction * definition.width / 2, frame / 2, 0], frameColor, sash)
      box('Window sash edge frame', [frame, definition.height, definition.depth], [direction * definition.width, definition.height / 2, 0], frameColor, sash)
      windowSash = sash
    }
    if (definition.openingType === 'door') {
      const hinge = new THREE.Group()
      hinge.position.x = definition.hingeSide === 'right' ? definition.width / 2 : -definition.width / 2
      root.add(hinge)
      const panel = box('Door panel', [definition.width, definition.height - 0.08, definition.depth * 0.7], [definition.hingeSide === 'right' ? -definition.width / 2 : definition.width / 2, (definition.height - 0.08) / 2, 0], definition.primaryColor, hinge)
      doorPanel = panel.parent
    }
  } else if (definition.type === 'Sun') {
    const light = new THREE.DirectionalLight(definition.color, definition.intensity)
    light.castShadow = true
    const target = new THREE.Object3D()
    target.name = 'Sun target'
    root.add(light, target)
    sunLight = light
    sunTarget = target
    if (options.includeSunHelper !== false) {
      const markerMaterial = new THREE.MeshBasicMaterial({ color: SUN_HELPER_COLOR })
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), markerMaterial)
      marker.name = 'Sun helper'
      root.add(marker)
      const lineMaterial = new THREE.LineBasicMaterial({ color: SUN_HELPER_COLOR, transparent: true, opacity: 0.8 })
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -4, 0)])
      const line = new THREE.Line(lineGeometry, lineMaterial)
      root.add(line)
      resources.push(marker.geometry, markerMaterial, lineGeometry, lineMaterial)
      sunMarker = marker
      sunLine = line
    }
  }

  const applyDocument = (value: ScenicDefinition): void => {
    root.name = value.name
    root.userData.entityId = value.id
    applyTransform(value)
    if (value.type === 'Opening' && doorPanel) {
      doorPanel.rotation.y = THREE.MathUtils.degToRad((value.openAngle ?? 0) * (value.hingeSide === 'right' ? -1 : 1))
    }
    if (value.type === 'Opening' && windowSash) {
      const openAngle = THREE.MathUtils.clamp(value.openAngle ?? 0, 0, 90)
      windowSash.rotation.y = THREE.MathUtils.degToRad(openAngle * (value.hingeSide === 'right' ? -1 : 1))
    }
    if (value.type === 'Sun' && sunLight && sunTarget) {
      const direction = sunDirectionFromAngles(value.azimuth, value.elevation)
      const helperPosition = sunHelperPosition(value.azimuth, value.elevation)
      root.position.copy(helperPosition)
      root.rotation.set(0, 0, 0)
      sunLight.color.set(value.color)
      sunLight.intensity = value.intensity
      sunLight.position.copy(direction).multiplyScalar(-8).sub(helperPosition)
      sunTarget.position.copy(helperPosition).multiplyScalar(-1)
      if (sunMarker) sunMarker.position.set(0, 0, 0)
      if (sunLine) {
        sunLine.geometry.setFromPoints([new THREE.Vector3(), helperPosition.clone().multiplyScalar(-1)])
        sunLine.geometry.computeBoundingSphere()
      }
    }
  }

  applyDocument(definition)

  const updateHighlight = (): void => selectableMaterials.forEach((item) => {
    item.emissive.set(selected || snapPreview ? '#f0a032' : '#000000')
    item.emissiveIntensity = selected ? 0.35 : snapPreview ? 0.14 : 0
  })

  return {
    root,
    applyDocument,
    setSelected: (value) => { selected = value; updateHighlight() },
    setSnapPreview: (value) => { snapPreview = value; updateHighlight() },
    dispose: () => {
      if (disposed) return
      disposed = true
      resources.forEach((resource) => resource.dispose())
      sunLight = null
      sunTarget = null
    },
  }
}
