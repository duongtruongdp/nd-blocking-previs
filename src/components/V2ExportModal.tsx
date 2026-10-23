import { useEffect, useState } from 'react'
import type { CameraDeliveryFrame, SceneDocument } from '../core/sceneDocument'
import type { ProjectDocument } from '../core/projectDocument'
import { frameRateLabel, frameToTimecode } from '../timeline/timelineMath'
import { deliveryAspectForCamera, dimensionsForDeliveryAspect, exportFrameCount, formatExportDuration, formatExportDurationExclusive } from '../export/exportMath'
import { mediaRecorderErrorMessage } from '../export/mediaRecorder'
import { buildMasterRenderPlan } from '../export/masterRenderPlan'
import { EXPORT_WIDTHS, type ExportFormat, type ExportQuality, type ExportSource, type ExportWidth, type VideoExportSettings, type VideoExportStatus, type VideoExportSuccess } from '../export/exportTypes'
import { defaultShotInfoBurnInSettings, SHOT_INFO_BURN_IN_FIELDS, SHOT_INFO_BURN_IN_FIELD_LABELS, shotInfoBurnInFieldsForPreset } from '../export/shotInfoBurnIn'
import { detectExportFormatCapabilities, exportFormatMessage, preferredExportFormat, type ExportFormatCapabilities } from '../export/formatSupport'

type V2ExportModalProps = {
  document: SceneDocument
  project: ProjectDocument
  projectName: string
  sceneName: string
  settings: VideoExportSettings
  status: VideoExportStatus
  progress: { completedFrames: number; totalFrames: number; currentFrame: number } | null
  error: string | null
  success: VideoExportSuccess | null
  revealError: string | null
  revealLabel: string
  onSettingsChange: (settings: VideoExportSettings) => void
  onExport: () => void
  onCancel: () => void
  onClose: () => void
  onOpenMediaManager?: () => void
  onReveal: () => void
  desktop?: boolean
}

const DELIVERY_OPTIONS: Array<{ value: CameraDeliveryFrame; label: string }> = [
  { value: 'sensor', label: 'Sensor / Native' },
  { value: '16:9', label: '16:9' },
  { value: '1.85', label: '1.85:1' },
  { value: '2.00', label: '2.00:1' },
  { value: '2.39', label: '2.39:1' },
]

export function V2ExportModal({ document, project, projectName, sceneName, settings, status, progress, error, success, revealError, revealLabel, onSettingsChange, onExport, onCancel, onClose, onOpenMediaManager, onReveal, desktop = false }: V2ExportModalProps) {
  const source: ExportSource = settings.source ?? 'scene'
  const camera = source === 'scene' && settings.cameraId ? document.cameras.find((item) => item.id === settings.cameraId) : null
  let masterPlan: ReturnType<typeof buildMasterRenderPlan> | null = null
  let masterError: string | null = null
  if (source === 'master') {
    try {
      masterPlan = buildMasterRenderPlan(project, { width: settings.width, deliveryAspectRatio: settings.deliveryAspectRatio, includeMusic: settings.includeMusic === true })
    } catch (planError: unknown) {
      masterError = planError instanceof Error ? planError.message : 'The Master Sequence cannot be exported.'
    }
  }
  const cameraAspect = source === 'master' ? masterPlan?.deliveryAspect ?? 16 / 9 : deliveryAspectForCamera(settings.deliveryAspectRatio, settings.cameraId, document)
  const frameCount = source === 'master' ? masterPlan?.frameCount ?? 0 : exportFrameCount(settings.markIn, settings.markOut)
  const [capabilities, setCapabilities] = useState<ExportFormatCapabilities>(() => desktop ? { mp4: true, webm: false } : { mp4: false, webm: false })
  const outputDimensions = dimensionsForDeliveryAspect(settings.width, cameraAspect)
  const outputWidth = outputDimensions.width
  const outputHeight = outputDimensions.height
  const effectiveFrameRate = source === 'master' && masterPlan ? masterPlan.frameRate : settings.frameRate
  const frameRateNumerator = effectiveFrameRate.numerator
  const frameRateDenominator = effectiveFrameRate.denominator
  const formatCheckKey = `${outputWidth}x${outputHeight}@${frameRateNumerator}/${frameRateDenominator}`
  const [checkedFormatKey, setCheckedFormatKey] = useState<string | null>(() => desktop ? formatCheckKey : null)
  const checkingFormats = !desktop && checkedFormatKey !== formatCheckKey
  useEffect(() => {
    if (desktop) {
      return
    }
    let mounted = true
    void detectExportFormatCapabilities({ width: outputWidth, height: outputHeight }, { numerator: frameRateNumerator, denominator: frameRateDenominator }).then((nextCapabilities) => {
      if (!mounted) return
      setCapabilities(nextCapabilities)
      setCheckedFormatKey(formatCheckKey)
    })
    return () => { mounted = false }
  }, [desktop, formatCheckKey, frameRateDenominator, frameRateNumerator, outputHeight, outputWidth])
  useEffect(() => {
    if (checkingFormats || capabilities[settings.format]) return
    const preferred = preferredExportFormat(capabilities)
    if (preferred && preferred !== settings.format) onSettingsChange({ ...settings, format: preferred })
  }, [capabilities, checkingFormats, onSettingsChange, settings])
  const formatSupported = capabilities[settings.format]
  const busy = status === 'preparing' || status === 'exporting' || status === 'encoding' || status === 'finalizing' || status === 'saving'
  const availableFormats = (['mp4', 'webm'] as const).filter((format) => capabilities[format])
  const canExport = !busy && !checkingFormats && frameCount > 0 && (source === 'master' ? Boolean(masterPlan) : Boolean(camera)) && formatSupported
  const statusLabel = !success && (status === 'preparing' ? 'Preparing export…' : status === 'exporting' ? `Rendering frame ${progress?.currentFrame ?? settings.markIn}` : status === 'encoding' ? 'Encoding video…' : status === 'finalizing' ? 'Finalizing video…' : status === 'saving' ? 'Saving video…' : status === 'completed' ? 'Video exported' : null)
  const rangeStart = source === 'master' && masterPlan ? masterPlan.startFrame : settings.markIn
  const rangeEnd = source === 'master' && masterPlan ? masterPlan.endFrameExclusive : settings.markOut
  const shotInfoBurnIn = settings.shotInfoBurnIn ?? defaultShotInfoBurnInSettings()
  const updateShotInfoBurnIn = (patch: Partial<typeof shotInfoBurnIn>) => onSettingsChange({ ...settings, shotInfoBurnIn: { ...shotInfoBurnIn, ...patch } })

  return (
    <div className="v2-modal-backdrop" role="presentation">
      <section className="v2-export-modal" role="dialog" aria-modal="true" aria-labelledby="v2-export-title">
        <div className="v2-modal-heading">
          <div><span className="v2-eyebrow">Shot Planning</span><h2 id="v2-export-title">Export Video</h2></div>
          {!busy ? <button className="v2-modal-close" onClick={onClose} type="button" aria-label="Close export panel">×</button> : null}
        </div>
        {success ? <ExportSuccessCard success={success} desktop={desktop} revealError={revealError} revealLabel={revealLabel} onReveal={onReveal} /> : null}
        <div className="v2-export-fields">
          <label className="v2-export-field"><span>Source</span><select value={source} disabled={busy} onChange={(event) => onSettingsChange({ ...settings, source: event.target.value as ExportSource })}><option value="scene">Scene · {sceneName}</option><option value="master">Master Sequence</option></select></label>
          <ExportReadout label="Project" value={projectName} />
          {source === 'scene' ? <ExportReadout label="Camera" value={camera?.name ?? 'No active Camera'} /> : <ExportReadout label="Shots" value={`${project.masterSequence.clips.length}`} />}
          <ExportReadout label="Range" value={`${frameToTimecode(rangeStart, effectiveFrameRate)} → ${frameToTimecode(rangeEnd, effectiveFrameRate)}`} />
          <ExportReadout label="Duration" value={source === 'master' && masterPlan ? formatExportDurationExclusive(masterPlan.frameCount, masterPlan.frameRate) : formatExportDuration(settings.markIn, settings.markOut, settings.frameRate)} />
          <ExportReadout label="Frame Rate" value={`${frameRateLabel(effectiveFrameRate)} fps`} />
          <label className="v2-export-field"><span>Delivery Frame</span><select value={settings.deliveryAspectRatio} disabled={busy} onChange={(event) => onSettingsChange({ ...settings, deliveryAspectRatio: event.target.value as CameraDeliveryFrame })}>{DELIVERY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="v2-export-field"><span>Resolution</span><select value={settings.width} disabled={busy} onChange={(event) => onSettingsChange({ ...settings, width: Number(event.target.value) as ExportWidth })}>{EXPORT_WIDTHS.map((width) => { const size = dimensionsForDeliveryAspect(width, cameraAspect); return <option key={width} value={width}>{size.width} × {size.height}</option> })}</select></label>
          <label className="v2-export-field"><span>Quality</span><select value={settings.quality} disabled={busy} onChange={(event) => onSettingsChange({ ...settings, quality: event.target.value as ExportQuality })}><option value="high">High</option><option value="standard">Standard</option><option value="small">Small File</option></select></label>
          {source === 'master' && project.masterSequence.musicClip ? <label className="v2-export-field"><span>Audio</span><select value={settings.includeMusic === false ? 'without' : 'music'} disabled={busy} onChange={(event) => onSettingsChange({ ...settings, includeMusic: event.target.value === 'music' })}><option value="music">Master Music · {project.masterSequence.musicClip.asset.fileName}</option><option value="without">Without Music</option></select></label> : null}
          {availableFormats.length > 1 ? <label className="v2-export-field"><span>Format</span><select value={settings.format} disabled={busy || checkingFormats} onChange={(event) => onSettingsChange({ ...settings, format: event.target.value as ExportFormat })}>{availableFormats.map((format) => <option key={format} value={format}>{format === 'mp4' ? 'MP4' : 'WebM'}</option>)}</select></label> : <ExportReadout label="Format" value={checkingFormats ? 'Checking…' : formatSupported ? (settings.format === 'mp4' ? 'MP4' : 'WebM') : 'Unavailable'} />}
          <section className="v2-export-burn-in" aria-labelledby="v2-export-burn-in-title">
            <div className="v2-export-burn-in-heading">
              <label className="v2-export-checkbox v2-export-burn-in-toggle"><input type="checkbox" checked={shotInfoBurnIn.enabled} disabled={busy} onChange={(event) => updateShotInfoBurnIn({ enabled: event.target.checked })} /><span id="v2-export-burn-in-title">Shot Information Burn-in</span></label>
              <span className="v2-export-burn-in-hint">Optional</span>
            </div>
            {shotInfoBurnIn.enabled ? <div className="v2-export-burn-in-options">
              <label className="v2-export-field"><span>Layout</span><select value={shotInfoBurnIn.preset} disabled={busy} onChange={(event) => { const preset = event.target.value as 'minimal' | 'detailed'; updateShotInfoBurnIn({ preset, fields: shotInfoBurnInFieldsForPreset(preset) }) }}><option value="minimal">Minimal</option><option value="detailed">Detailed</option></select></label>
              <div className="v2-export-burn-in-fields">{SHOT_INFO_BURN_IN_FIELDS.map((field) => <label className="v2-export-checkbox" key={field}><input type="checkbox" checked={shotInfoBurnIn.fields[field]} disabled={busy} onChange={(event) => updateShotInfoBurnIn({ fields: { ...shotInfoBurnIn.fields, [field]: event.target.checked } })} /><span>{SHOT_INFO_BURN_IN_FIELD_LABELS[field]}</span></label>)}</div>
            </div> : null}
          </section>
        </div>
        {error || masterError || (!checkingFormats && !formatSupported && (camera || source === 'master')) ? <div className="v2-export-error" role="alert"><p>{error ?? masterError ?? (formatSupported ? '' : exportFormatMessage(capabilities, settings.format) || mediaRecorderErrorMessage())}</p>{error?.includes('Graphics image') && onOpenMediaManager ? <button className="v2-small-action" type="button" onClick={onOpenMediaManager}>Open Media Manager</button> : null}</div> : null}
        {statusLabel ? <div className="v2-export-progress" aria-live="polite"><div className="v2-export-progress-heading"><span>{statusLabel}</span><span>{progress ? `${progress.completedFrames} / ${progress.totalFrames}` : '…'}</span></div><div className="v2-export-progress-track"><span style={{ width: `${progress && progress.totalFrames > 0 ? (progress.completedFrames / progress.totalFrames) * 100 : 0}%` }} /></div></div> : null}
        <div className="v2-modal-actions">
          {busy ? <button className="v2-button" onClick={onCancel} type="button">Cancel Export</button> : <button className="v2-button" onClick={onClose} type="button">{success ? 'Done' : 'Cancel'}</button>}
          <button className="v2-button v2-button-primary" disabled={!canExport} onClick={onExport} type="button">{success ? 'Export Again' : 'Export Video'}</button>
        </div>
      </section>
    </div>
  )
}

function ExportReadout({ label, value }: { label: string; value: string }) {
  return <div className="v2-export-readout"><span>{label}</span><strong>{value}</strong></div>
}

function ExportSuccessCard({ success, desktop, revealError, revealLabel, onReveal }: { success: VideoExportSuccess; desktop: boolean; revealError: string | null; revealLabel: string; onReveal: () => void }) {
  return <div className="v2-export-success" role="status" aria-live="polite">
    <div className="v2-export-success-heading"><span className="v2-export-success-icon" aria-hidden="true">✓</span><div><strong>Video Exported Successfully</strong><p>Your video is ready.</p></div></div>
    <div className="v2-export-success-grid">
      <ExportReadout label="Source" value={success.source === 'master' ? 'Master Sequence' : 'Scene'} />
      <ExportReadout label="Format" value={success.format.toUpperCase()} />
      <ExportReadout label="Resolution" value={`${success.resolution.width} × ${success.resolution.height}`} />
      <ExportReadout label="Duration" value={success.durationTimecode} />
    </div>
    {desktop ? success.outputPath ? <div className="v2-export-success-reveal"><button className="v2-small-action" type="button" onClick={onReveal}>{revealLabel}</button>{revealError ? <p role="alert">{revealError}</p> : null}</div> : <p className="v2-export-success-note">The output was saved, but its file location is unavailable for reveal.</p> : <p className="v2-export-success-note">Download handoff completed. Your browser manages the download location.</p>}
  </div>
}
