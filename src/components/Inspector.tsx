import type { FocusEvent } from 'react'
import { blockingStore, useBlockingSelector } from '../state/blockingStore'
import { ACTOR_COLOR_PRESETS } from '../domain/blockingCommands'
import { CHARACTER_REGISTRY } from '../characters/characterRegistry'
import { poseCategoryLabel, posesForCategory } from '../characters/poseLibrary'
import type { ActorDocument, Placement, PoseCategory, PropDocument, Vec3 } from '../domain/types'

export function Inspector() {
  const state = useBlockingSelector((snapshot) => snapshot)
  const shot = state.project.shots.find((entry) => entry.id === state.project.activeShotId)
  const entity = state.selection.kind === 'actor'
    ? shot?.actors.find((entry) => entry.id === state.selection.entityId)
    : state.selection.kind === 'prop'
      ? shot?.props.find((entry) => entry.id === state.selection.entityId)
      : undefined

  return (
    <aside className="side-panel inspector-panel" aria-label="Inspector">
      <div className="panel-heading">
        <span className="panel-kicker">Details</span>
        <h2>INSPECTOR</h2>
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

function InspectorContent({ entity, kind }: { entity: ActorDocument | PropDocument; kind: 'actor' | 'prop' }) {
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
        <div className="inspector-section-label">{isActor ? 'FACING' : 'ROTATION'}</div>
        <NumberField
          label="Y"
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
          <p className="field-note">Overall Actor stature</p>
        </section>
      ) : null}

      {prop ? (
        <section className="inspector-section">
          <div className="inspector-section-label">DIMENSIONS</div>
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

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString()
}

function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI)
}

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}
