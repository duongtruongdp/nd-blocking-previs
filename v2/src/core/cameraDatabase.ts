export type CameraSource = {
  manufacturer: string
  title: string
  url: string
  accessedAt: string
  notes?: string
}

export type SensorDefinition = {
  name: string
  physicalWidthMm: number
  physicalHeightMm: number
}

export type CaptureModeDefinition = {
  id: string
  name: string
  recordingWidthPx: number
  recordingHeightPx: number
  activeWidthMm: number
  activeHeightMm: number
  maxFrameRate?: number
  notes?: string
  provenance: CameraSource
}

export type CameraDefinition = {
  id: string
  manufacturer: string
  model: string
  sensor: SensorDefinition
  captureModes: readonly CaptureModeDefinition[]
  provenance: CameraSource
}

const ARRI_ALEXA_35_SOURCE: CameraSource = {
  manufacturer: 'ARRI',
  title: 'ALEXA 35 technical data',
  url: 'https://www.arri.com/en/cine-systems/cine-cameras/legacy-cine-cameras/alexa-35',
  accessedAt: '2026-10-05',
}

const ARRI_MINI_LF_SOURCE: CameraSource = {
  manufacturer: 'ARRI',
  title: 'ALEXA Mini LF technical data',
  url: 'https://www.arri.com/en/cine-systems/cine-cameras/alexa-mini-lf',
  accessedAt: '2026-10-05',
}

const ARRI_LF_SOURCE: CameraSource = {
  manufacturer: 'ARRI',
  title: 'ALEXA LF technical data',
  url: 'https://www.arri.com/en/cine-systems/cine-cameras/alexa-lf',
  accessedAt: '2026-10-05',
}

const BLACKMAGIC_PYXIS_SOURCE: CameraSource = {
  manufacturer: 'Blackmagic Design',
  title: 'Blackmagic PYXIS technical specifications',
  url: 'https://www.blackmagicdesign.com/products/blackmagicpyxis/techspecs/W-BOX-01',
  accessedAt: '2026-10-05',
  notes: 'Only the documented full-sensor Open Gate mode is seeded here; undocumented crop dimensions are intentionally omitted.',
}

const RED_VRAPTOR_SOURCE: CameraSource = {
  manufacturer: 'RED Digital Cinema',
  title: 'V-RAPTOR operation guide: technical specifications',
  url: 'https://docs.red.com/955-0199/955-0199_V1.2_Rev_A_RED_PS_V-RAPTOR_Operation_Guide/Content/C_TechSpecs/Specs_V-RAPTOR.htm',
  accessedAt: '2026-10-05',
}

function mode(
  id: string,
  name: string,
  recordingWidthPx: number,
  recordingHeightPx: number,
  activeWidthMm: number,
  activeHeightMm: number,
  provenance: CameraSource,
  options: Pick<CaptureModeDefinition, 'maxFrameRate' | 'notes'> = {},
): CaptureModeDefinition {
  return { id, name, recordingWidthPx, recordingHeightPx, activeWidthMm, activeHeightMm, provenance, ...options }
}

export const CAMERA_DATABASE: readonly CameraDefinition[] = [
  {
    id: 'arri-alexa35',
    manufacturer: 'ARRI',
    model: 'ALEXA 35',
    sensor: { name: 'Super 35 ALEV 4', physicalWidthMm: 27.99, physicalHeightMm: 19.22 },
    captureModes: [
      mode('arri-alexa35-open-gate', 'Open Gate 4.6K', 4608, 3164, 27.99, 19.22, ARRI_ALEXA_35_SOURCE),
      mode('arri-alexa35-4_6k-16_9', '4.6K 16:9', 4608, 2592, 27.99, 15.74, ARRI_ALEXA_35_SOURCE),
      mode('arri-alexa35-4k-16_9', '4K 16:9', 4096, 2304, 24.88, 13.99, ARRI_ALEXA_35_SOURCE),
    ],
    provenance: ARRI_ALEXA_35_SOURCE,
  },
  {
    id: 'arri-alexa-mini-lf',
    manufacturer: 'ARRI',
    model: 'ALEXA Mini LF',
    sensor: { name: 'Large Format ALEV 3', physicalWidthMm: 36.70, physicalHeightMm: 25.54 },
    captureModes: [
      mode('arri-mini-lf-open-gate', 'LF Open Gate 4.5K', 4448, 3096, 36.70, 25.54, ARRI_MINI_LF_SOURCE),
      mode('arri-mini-lf-16_9', 'LF 16:9 4.3K', 4320, 2430, 35.64, 20.05, ARRI_MINI_LF_SOURCE),
      mode('arri-mini-lf-2_39', 'LF 2.39', 4448, 1856, 36.70, 15.31, ARRI_MINI_LF_SOURCE),
    ],
    provenance: ARRI_MINI_LF_SOURCE,
  },
  {
    id: 'arri-alexa-lf',
    manufacturer: 'ARRI',
    model: 'ALEXA LF',
    sensor: { name: 'Large Format ALEV 3', physicalWidthMm: 36.70, physicalHeightMm: 25.54 },
    captureModes: [
      mode('arri-lf-open-gate', 'LF Open Gate 4.5K', 4448, 3096, 36.70, 25.54, ARRI_LF_SOURCE),
      mode('arri-lf-16_9', 'LF 16:9 4.3K', 4320, 2430, 35.64, 20.05, ARRI_LF_SOURCE),
      mode('arri-lf-2_39', 'LF 2.39', 4448, 1856, 36.70, 15.31, ARRI_LF_SOURCE),
    ],
    provenance: ARRI_LF_SOURCE,
  },
  {
    id: 'blackmagic-pyxis-6k',
    manufacturer: 'Blackmagic Design',
    model: 'PYXIS 6K',
    sensor: { name: 'Full Frame HDR', physicalWidthMm: 36, physicalHeightMm: 24 },
    captureModes: [
      mode('blackmagic-pyxis-6k-open-gate', '6K Open Gate 3:2', 6048, 4032, 36, 24, BLACKMAGIC_PYXIS_SOURCE, { maxFrameRate: 36 }),
    ],
    provenance: BLACKMAGIC_PYXIS_SOURCE,
  },
  {
    id: 'red-v-raptor-8k-vv',
    manufacturer: 'RED',
    model: 'V-RAPTOR 8K VV',
    sensor: { name: 'V-RAPTOR 8K VV', physicalWidthMm: 40.96, physicalHeightMm: 21.60 },
    captureModes: [
      mode('red-v-raptor-8k-vv-17_9', '8K 17:9', 8192, 4320, 40.96, 21.60, RED_VRAPTOR_SOURCE),
    ],
    provenance: RED_VRAPTOR_SOURCE,
  },
]

export function resolveCameraDefinition(id: string): CameraDefinition | null {
  return CAMERA_DATABASE.find((definition) => definition.id === id) ?? null
}

export function resolveCaptureMode(definition: CameraDefinition, id: string): CaptureModeDefinition {
  return definition.captureModes.find((captureMode) => captureMode.id === id) ?? definition.captureModes[0]
}
