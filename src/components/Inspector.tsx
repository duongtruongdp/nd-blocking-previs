import type { FocusEvent } from 'react'
import { blockingStore, useBlockingSelector } from '../state/blockingStore'
import { ACTOR_COLOR_PRESETS } from '../domain/blockingCommands'
import { CHARACTER_REGISTRY } from '../characters/characterRegistry'
import { poseCategoryLabel, posesForCategory } from '../characters/poseLibrary'
import { ARRI_CAMERA_DATASET } from '../cameras/data/arri'
import { CameraRegistry } from '../cameras/cameraRegistry'
import type { ActorDocument, CameraDocument, CameraFrameGuide, LensProfile, Placement, PoseCategory, PropDocument, Vec3 } from '../domain/types'
import { captureAspectRatio } from '../math/cinematography'

const cameraRegistry = new CameraRegistry(ARRI_CAMERA_DATASET)

export function Inspector() {
  const state = useBlockingSelector((snapshot) => snapshot)
  const shot = state.project.shots.find((entry) => entry.id === state.project.activeShotId)
  const entity = state.selection.kind === 'actor'
    ? shot?.actors.find((entry) => entry.id === state.selection.entityId)
    : state.selection.kind === 'prop'
      ? shot?.props.find((entry) => entry.id === state.selection.entityId)
      : state.selection.kind === 'camera'
        ? shot?.cameras.find((entry) => entry.id === state.selection.entityId)
      : undefined

  return (
    <aside className="side-panel inspector-panel" aria-label="Details">
      <div className="panel-heading">
        <h2>DETAILS</h2>
      </div>
      {entity && state.selection.kind ? (
        <InspectorContent key={`${entity.id}-${state.project.updatedAt}`} entity={entity} kind={state.selection.kind} />
      ) : (
        <div className="inspector-empty">
          <span className="empty-icon" aria-hidden="true">○</span>
          <strong>Select something in the scene</strong>
          <p>Its blocking settings will appear here.</p>
        </div>
      )}
    </aside>
  )
}

function InspectorContent({ entity, kind }: { entity: ActorDocument | PropDocument | CameraDocument; kind: 'actor' | 'prop' | 'camera' }) {
  if (kind === 'camera') return <CameraInspector camera={entity as CameraDocument} />
  const isActor = kind === 'actor'
  const actor = isActor ? entity as ActorDocument : undefined
  const prop = !isActor ? entity as PropDocument : undefined

  return (
    <div className="inspector-content">
      <section className="inspector-section">
        <div className="inspector-section-label">{isActor ? 'ACTOR' : 'PROP'}</div>
        <TextField label="Name" defaultValue={entity.name} onCommit={(name) => blockingStore.renameSelected(name)} />
      </section>

      <section className="inspector-section">
        <div className="inspector-section-label">POSITION</div>
        <div className="field-grid three-columns">
          {(['X', 'Y', 'Z'] as const).map((axis, index) => (
            <NumberField
              key={axis}
              label={axis}
              unit="m"
              value={entity.placement.position[index]}
              onCommit={(value) => commitPosition(entity.placement, index, value)}
            />
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <div className="inspector-section-label">{isActor ? 'FACING DIRECTION' : 'ROTATION'}</div>
        <NumberField
          label="Direction"
          unit="°"
          value={radiansToDegrees(entity.placement.rotation.radians[1])}
          onCommit={(degrees) => commitFacing(entity.placement, degrees)}
        />
      </section>

      {actor ? (
        <section className="inspector-section">
          <div className="inspector-section-label">CHARACTER</div>
          <SelectField
            label="Character"
            defaultValue={actor.character.characterId}
            options={CHARACTER_REGISTRY.map((character) => ({ label: character.label, value: character.id }))}
            onCommit={(value) => blockingStore.setSelectedActorCharacter(value)}
          />
        </section>
      ) : null}

      {actor ? (
        <section className="inspector-section">
          <div className="inspector-section-label">APPEARANCE</div>
          <ColorField value={actor.appearance.color} />
        </section>
      ) : null}

      {actor ? (
        <section className="inspector-section">
          <div className="inspector-section-label">POSE</div>
          <PoseFields actor={actor} />
        </section>
      ) : null}

      {actor ? (
        <section className="inspector-section">
          <div className="inspector-section-label">BLOCKING</div>
          <NumberField label="Height" unit="m" value={actor.appearance.heightM} onCommit={(value) => blockingStore.setSelectedActorHeight(value)} />
          <p className="field-note">Actor height</p>
        </section>
      ) : null}

      {prop ? (
        <section className="inspector-section">
          <div className="inspector-section-label">SIZE</div>
          <div className="field-stack">
            {(['Width', 'Height', 'Depth'] as const).map((label, index) => (
              <NumberField
                key={label}
                label={label}
                unit="m"
                value={prop.appearance.dimensionsM[index]}
                onCommit={(value) => commitDimension(prop.appearance.dimensionsM, index, value)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="inspector-actions">
        <button type="button" className="delete-button" onClick={() => blockingStore.deleteSelected()}>Delete {isActor ? 'Actor' : 'Prop'}</button>
      </div>
    </div>
  )
}

function CameraInspector({ camera }: { camera: CameraDocument }) {
  const model = cameraRegistry.getCameraById(camera.cameraModelId)
  const modes = model?.recordingModes ?? []
  const mode = modes.find((candidate) => candidate.id === camera.sensorModeId)
  const outputs = mode?.recordingOutputs ?? []
  const profileValue = camera.lens.profile.type === 'spherical' ? 'spherical' : camera.lens.profile.preset
  return (
    <div className="inspector-content">
      <section className="inspector-section">
        <div className="inspector-section-label">CAMERA</div>
        <TextField label="Name" defaultValue={camera.name} onCommit={(name) => blockingStore.renameSelected(name)} />
        <SelectField
          label="Camera Model"
          defaultValue={camera.cameraModelId}
          options={[{ label: 'Generic Camera', value: 'generic.camera' }, ...cameraRegistry.getCamerasByManufacturer('arri').map((candidate) => ({ label: candidate.displayName, value: candidate.id }))]}
          onCommit={(value) => value === 'generic.camera' ? undefined : blockingStore.setSelectedCameraModel(value)}
        />
        {model ? (
          <>
            <SelectField
              label="Capture Mode"
              defaultValue={camera.sensorModeId}
              options={modes.map((candidate) => ({ label: candidate.displayName, value: candidate.id }))}
              onCommit={(value) => blockingStore.setSelectedCameraSensorMode(value)}
            />
            <SelectField
              label="Recording Format"
              defaultValue={camera.recordingOutputId ?? outputs[0]?.id ?? ''}
              options={outputs.map((output) => ({ label: output.displayName, value: output.id }))}
              onCommit={(value) => blockingStore.setSelectedCameraRecordingOutput(value || undefined)}
            />
          </>
        ) : <p className="field-note">Choose an ARRI camera model to select its sensor modes and recording formats.</p>}
      </section>

      <section className="inspector-section">
        <div className="inspector-section-label">LENS</div>
        <NumberField label="Focal Length" unit="mm" value={camera.lens.focalLengthMm} onCommit={(value) => blockingStore.setSelectedCameraFocalLength(value)} />
        <SelectField
          label="Lens Type"
          defaultValue={profileValue}
          options={[{ label: 'Spherical', value: 'spherical' }, { label: 'Anamorphic 1.33x', value: '1.33' }, { label: 'Anamorphic 1.5x', value: '1.5' }, { label: 'Anamorphic 1.8x', value: '1.8' }, { label: 'Anamorphic 2.0x', value: '2.0' }, { label: 'Custom Anamorphic', value: 'custom' }]}
          onCommit={(value) => commitLensProfile(camera.lens.profile, value)}
        />
        {camera.lens.profile.type === 'anamorphic' && camera.lens.profile.preset === 'custom' ? (
          <NumberField label="Custom Squeeze" unit="x" value={camera.lens.profile.squeezeFactor} onCommit={(value) => blockingStore.setSelectedCameraLensProfile({ type: 'anamorphic', preset: 'custom', squeezeFactor: value })} />
        ) : null}
      </section>

      <section className="inspector-section">
        <div className="inspector-section-label">POSITION</div>
        <div className="field-grid two-columns">
          {(['X', 'Z'] as const).map((axis) => (
            <NumberField key={axis} label={axis} unit="m" value={camera.placement.position[axis === 'X' ? 0 : 2]} onCommit={(value) => commitCameraPosition(camera.placement, axis === 'X' ? 0 : 2, value)} />
          ))}
        </div>
        <NumberField label="Camera Height" unit="m" value={camera.placement.position[1]} onCommit={(value) => commitCameraPosition(camera.placement, 1, value)} />
        <div className="field-grid three-columns">
          <NumberField label="Pan" unit="°" value={radiansToDegrees(camera.placement.rotation.radians[1])} onCommit={(value) => commitCameraRotation(camera.placement, 1, value)} />
          <NumberField label="Tilt" unit="°" value={radiansToDegrees(camera.placement.rotation.radians[0])} onCommit={(value) => commitCameraRotation(camera.placement, 0, value)} />
          <NumberField label="Roll" unit="°" value={radiansToDegrees(camera.placement.rotation.radians[2])} onCommit={(value) => commitCameraRotation(camera.placement, 2, value)} />
        </div>
      </section>

      <section className="inspector-section">
        <div className="inspector-section-label">FOCUS</div>
        <NumberField label="Focus Distance" unit="m" value={camera.lens.focusDistanceM} onCommit={(value) => blockingStore.setSelectedCameraFocusDistance(value)} />
      </section>

      <section className="inspector-section">
        <div className="inspector-section-label">FRAME</div>
        <p className="camera-readout">Sensor Area <strong>{camera.resolvedCapture.activeWidthMm.toFixed(2)} × {camera.resolvedCapture.activeHeightMm.toFixed(2)} mm</strong></p>
        <p className="camera-readout">Capture Ratio <strong>{captureAspectRatio(camera.resolvedCapture).toFixed(2)}:1</strong></p>
        <SelectField
          label="Frame Guide"
          defaultValue={camera.frameGuide.preset}
          options={[{ label: 'Capture', value: 'capture' }, { label: '16:9', value: '16:9' }, { label: '1.85:1', value: '1.85:1' }, { label: '2.00:1', value: '2.00:1' }, { label: '2.39:1', value: '2.39:1' }, { label: 'Custom', value: 'custom' }]}
          onCommit={(value) => commitFrameGuide(value)}
        />
        <p className="field-note">Frame guide only — camera setup stays the same.</p>
        {camera.frameGuide.preset === 'custom' ? (
          <div className="field-grid two-columns">
            <NumberField label="Width" unit="" value={camera.frameGuide.width ?? 1.85} onCommit={(value) => commitCustomFrameGuide(value, camera.frameGuide.height ?? 1)} />
            <NumberField label="Height" unit="" value={camera.frameGuide.height ?? 1} onCommit={(value) => commitCustomFrameGuide(camera.frameGuide.width ?? 1.85, value)} />
          </div>
        ) : null}
      </section>

      <div className="inspector-actions">
        <button type="button" className="delete-button" onClick={() => blockingStore.deleteSelected()}>Delete Camera</button>
      </div>
    </div>
  )

  function commitFrameGuide(value: string): void {
    if (value === 'custom') {
      blockingStore.setSelectedCameraFrameGuide({ preset: 'custom', width: 1.85, height: 1 })
      return
    }
    blockingStore.setSelectedCameraFrameGuide({ preset: value as CameraFrameGuide['preset'] })
  }
}

function SelectField({ label, defaultValue, options, onCommit }: { label: string; defaultValue: string; options: Array<{ label: string; value: string }>; onCommit: (value: string) => void }) {
  return (
    <label className="inspector-field select-field">
      <span>{label}</span>
      <select defaultValue={defaultValue} onChange={(event) => onCommit(event.currentTarget.value)} aria-label={label}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function ColorField({ value }: { value: string }) {
  return (
    <div className="color-field">
      <div className="color-control-row">
        <label className="color-input-label">
          <input type="color" defaultValue={value} onChange={(event) => blockingStore.setSelectedActorColor(event.currentTarget.value)} aria-label="Actor color" />
          <span>{value.toUpperCase()}</span>
        </label>
      </div>
      <div className="color-presets" aria-label="Actor color presets">
        {ACTOR_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`color-swatch ${preset === value.toLowerCase() ? 'is-active' : ''}`}
            style={{ backgroundColor: preset }}
            aria-label={`Use ${preset} Actor color`}
            onClick={() => blockingStore.setSelectedActorColor(preset)}
          />
        ))}
      </div>
    </div>
  )
}

function PoseFields({ actor }: { actor: ActorDocument }) {
  const poseCategory = (actor.pose.poseId.split('-')[0] as PoseCategory) || 'standing'
  const category = ['standing', 'sitting', 'lying'].includes(poseCategory) ? poseCategory : 'standing'
  const poses = posesForCategory(category)
  return (
    <div className="field-stack">
      <SelectField
        label="Category"
        defaultValue={category}
        options={['standing', 'sitting', 'lying'].map((value) => ({ label: poseCategoryLabel(value as PoseCategory), value }))}
        onCommit={(value) => {
          const nextPoses = posesForCategory(value as PoseCategory)
          if (nextPoses[0]) blockingStore.setSelectedActorPose(nextPoses[0].id)
        }}
      />
      <SelectField
        label="Pose"
        defaultValue={actor.pose.poseId}
        options={poses.map((pose) => ({ label: pose.label, value: pose.id }))}
        onCommit={(value) => blockingStore.setSelectedActorPose(value)}
      />
    </div>
  )
}

function TextField({ label, defaultValue, onCommit }: { label: string; defaultValue: string; onCommit: (value: string) => void }) {
  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value.trim()
    if (!nextValue) {
      event.currentTarget.value = defaultValue
      return
    }
    onCommit(nextValue)
  }

  return (
    <label className="inspector-field text-field">
      <span>{label}</span>
      <input type="text" defaultValue={defaultValue} onBlur={handleBlur} aria-label={label} />
    </label>
  )
}

function NumberField({ label, unit, value, onCommit }: { label: string; unit: string; value: number; onCommit: (value: number) => void }) {
  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const nextValue = Number(event.currentTarget.value)
    if (!Number.isFinite(nextValue)) {
      event.currentTarget.value = formatNumber(value)
      return
    }
    onCommit(nextValue)
  }

  return (
    <label className="inspector-field number-field">
      <span>{label}</span>
      <span className="number-input-wrap">
        <input type="number" defaultValue={formatNumber(value)} step="0.01" onBlur={handleBlur} aria-label={`${label} ${unit}`} />
        <em>{unit}</em>
      </span>
    </label>
  )
}

function commitPosition(placement: Placement, axis: number, value: number): void {
  const position: Vec3 = [...placement.position]
  position[axis] = value
  blockingStore.setSelectedPlacement({ ...placement, position })
}

function commitFacing(placement: Placement, degrees: number): void {
  const radians: Vec3 = [...placement.rotation.radians]
  radians[1] = degreesToRadians(degrees)
  blockingStore.setSelectedPlacement({ ...placement, rotation: { order: 'XYZ', radians } })
}

function commitDimension(dimensions: Vec3, axis: number, value: number): void {
  const next: Vec3 = [...dimensions]
  next[axis] = value
  blockingStore.setSelectedPropDimensions(next)
}

function commitCameraPosition(placement: Placement, axis: number, value: number): void {
  const position: Vec3 = [...placement.position]
  position[axis] = value
  blockingStore.setSelectedPlacement({ ...placement, position })
}

function commitCameraRotation(placement: Placement, axis: number, degrees: number): void {
  const radians: Vec3 = [...placement.rotation.radians]
  radians[axis] = degreesToRadians(degrees)
  blockingStore.setSelectedPlacement({ ...placement, rotation: { order: 'XYZ', radians } })
}

function commitLensProfile(current: LensProfile, value: string): void {
  if (value === 'spherical') {
    blockingStore.setSelectedCameraLensProfile({ type: 'spherical', preset: 'spherical', squeezeFactor: 1 })
    return
  }
  if (value === 'custom') {
    blockingStore.setSelectedCameraLensProfile({ type: 'anamorphic', preset: 'custom', squeezeFactor: current.type === 'anamorphic' ? current.squeezeFactor : 1.33 })
    return
  }
  blockingStore.setSelectedCameraLensProfile({ type: 'anamorphic', preset: value as '1.33' | '1.5' | '1.8' | '2.0', squeezeFactor: Number(value) })
}

function commitCustomFrameGuide(width: number, height: number): void {
  blockingStore.setSelectedCameraFrameGuide({ preset: 'custom', width, height })
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString()
}

function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI)
}

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}
