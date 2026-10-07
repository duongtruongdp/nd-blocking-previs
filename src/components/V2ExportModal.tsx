import { useEffect, useState } from 'react'
import type { CameraDeliveryFrame, SceneDocument } from '../core/sceneDocument'
import { frameRateLabel } from '../timeline/timelineMath'
import { deliveryAspectForCamera, dimensionsForDeliveryAspect, exportFrameCount, formatExportDuration } from '../export/exportMath'
import { mediaRecorderErrorMessage } from '../export/mediaRecorder'
import { EXPORT_WIDTHS, type ExportFormat, type ExportQuality, type ExportWidth, type VideoExportSettings, type VideoExportStatus } from '../export/exportTypes'
import { detectExportFormatCapabilities, exportFormatMessage, preferredExportFormat, type ExportFormatCapabilities } from '../export/formatSupport'

type V2ExportModalProps = {
  document: SceneDocument
  projectName: string
  sceneName: string
  settings: VideoExportSettings
  status: VideoExportStatus
  progress: { completedFrames: number; totalFrames: number; currentFrame: number } | null
  error: string | null
  onSettingsChange: (settings: VideoExportSettings) => void
  onExport: () => void
  onCancel: () => void
  onClose: () => void
  desktop?: boolean
}

const DELIVERY_OPTIONS: Array<{ value: CameraDeliveryFrame; label: string }> = [
  { value: 'sensor', label: 'Sensor / Native' },
  { value: '16:9', label: '16:9' },
  { value: '1.85', label: '1.85:1' },
  { value: '2.00', label: '2.00:1' },
  { value: '2.39', label: '2.39:1' },
]

export function V2ExportModal({ document, projectName, sceneName, settings, status, progress, error, onSettingsChange, onExport, onCancel, onClose, desktop = false }: V2ExportModalProps) {
  const camera = settings.cameraId ? document.cameras.find((item) => item.id === settings.cameraId) : null
  const cameraAspect = deliveryAspectForCamera(settings.deliveryAspectRatio, settings.cameraId, document)
  const frameCount = exportFrameCount(settings.markIn, settings.markOut)
  const [capabilities, setCapabilities] = useState<ExportFormatCapabilities>(() => desktop ? { mp4: true, webm: false } : { mp4: false, webm: false })
  const outputDimensions = dimensionsForDeliveryAspect(settings.width, cameraAspect)
  const outputWidth = outputDimensions.width
  const outputHeight = outputDimensions.height
  const frameRateNumerator = settings.frameRate.numerator
  const frameRateDenominator = settings.frameRate.denominator
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
  const busy = status === 'preparing' || status === 'exporting' || status === 'encoding' || status === 'finalizing'
  const availableFormats = (['mp4', 'webm'] as const).filter((format) => capabilities[format])
  const canExport = !busy && !checkingFormats && frameCount > 0 && Boolean(camera) && formatSupported
  const statusLabel = status === 'preparing' ? 'Preparing export…' : status === 'exporting' ? `Rendering frame ${progress?.currentFrame ?? settings.markIn}` : status === 'encoding' ? 'Encoding video…' : status === 'finalizing' ? 'Finalizing video…' : status === 'completed' ? 'Video exported' : null

  return (
    <div className="v2-modal-backdrop" role="presentation">
      <section className="v2-export-modal" role="dialog" aria-modal="true" aria-labelledby="v2-export-title">
        <div className="v2-modal-heading">
          <div><span className="v2-eyebrow">Shot Planning</span><h2 id="v2-export-title">Export Video</h2></div>
          {!busy ? <button className="v2-modal-close" onClick={onClose} type="button" aria-label="Close export panel">×</button> : null}
        </div>
        <div className="v2-export-fields">
          <ExportReadout label="Project" value={projectName} />
          <ExportReadout label="Scene" value={sceneName} />
          <ExportReadout label="Camera" value={camera?.name ?? 'No active Camera'} />
          <ExportReadout label="Range" value={`${settings.markIn} – ${settings.markOut}`} />
          <ExportReadout label="Duration" value={formatExportDuration(settings.markIn, settings.markOut, settings.frameRate)} />
          <ExportReadout label="Frame Rate" value={`${frameRateLabel(settings.frameRate)} fps`} />
          <label className="v2-export-field"><span>Delivery Frame</span><select value={settings.deliveryAspectRatio} disabled={busy} onChange={(event) => onSettingsChange({ ...settings, deliveryAspectRatio: event.target.value as CameraDeliveryFrame })}>{DELIVERY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="v2-export-field"><span>Resolution</span><select value={settings.width} disabled={busy} onChange={(event) => onSettingsChange({ ...settings, width: Number(event.target.value) as ExportWidth })}>{EXPORT_WIDTHS.map((width) => { const size = dimensionsForDeliveryAspect(width, cameraAspect); return <option key={width} value={width}>{size.width} × {size.height}</option> })}</select></label>
          <label className="v2-export-field"><span>Quality</span><select value={settings.quality} disabled={busy} onChange={(event) => onSettingsChange({ ...settings, quality: event.target.value as ExportQuality })}><option value="high">High</option><option value="standard">Standard</option><option value="small">Small File</option></select></label>
          {availableFormats.length > 1 ? <label className="v2-export-field"><span>Format</span><select value={settings.format} disabled={busy || checkingFormats} onChange={(event) => onSettingsChange({ ...settings, format: event.target.value as ExportFormat })}>{availableFormats.map((format) => <option key={format} value={format}>{format === 'mp4' ? 'MP4' : 'WebM'}</option>)}</select></label> : <ExportReadout label="Format" value={checkingFormats ? 'Checking…' : formatSupported ? (settings.format === 'mp4' ? 'MP4' : 'WebM') : 'Unavailable'} />}
        </div>
        {error || (!checkingFormats && !formatSupported && camera) ? <p className="v2-export-error" role="alert">{error ?? (formatSupported ? '' : exportFormatMessage(capabilities, settings.format) || mediaRecorderErrorMessage())}</p> : null}
        {statusLabel ? <div className="v2-export-progress" aria-live="polite"><div className="v2-export-progress-heading"><span>{statusLabel}</span><span>{progress ? `${progress.completedFrames} / ${progress.totalFrames}` : '…'}</span></div><div className="v2-export-progress-track"><span style={{ width: `${progress && progress.totalFrames > 0 ? (progress.completedFrames / progress.totalFrames) * 100 : 0}%` }} /></div></div> : null}
        <div className="v2-modal-actions">
          {busy ? <button className="v2-button" onClick={onCancel} type="button">Cancel Export</button> : <button className="v2-button" onClick={onClose} type="button">Cancel</button>}
          <button className="v2-button v2-button-primary" disabled={!canExport} onClick={onExport} type="button">Export Video</button>
        </div>
      </section>
    </div>
  )
}

function ExportReadout({ label, value }: { label: string; value: string }) {
  return <div className="v2-export-readout"><span>{label}</span><strong>{value}</strong></div>
}
