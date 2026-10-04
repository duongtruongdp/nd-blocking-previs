import type {
  CameraDataset,
  RecordingFrameRates,
  RecordingMode,
  RecordingOutput,
} from '../cameraData'
import type { FrameRate } from '../../domain/types'

const ACCESSED_AT = '2026-10-04'
const THREE_QUARTERS: FrameRate = { numerator: 3, denominator: 4 }

const sources = {
  miniProduct: 'arri.alexa-mini-lf.product',
  miniFaq: 'arri.alexa-mini-lf.faq',
  miniManual: 'arri.alexa-mini-lf.sup-7-3.manual',
  miniSup: 'arri.alexa-mini-lf.sup-7-3-2',
  miniFormats: 'arri.alexa-mini-lf.recording-formats',
  miniAfro: 'arri.formats-overview-v6-3.mini-lf',
  a35Product: 'arri.alexa-35.product',
  a35Manual: 'arri.alexa-35.sup-6-1.manual',
  a35ManualSup60: 'arri.alexa-35.sup-6-0.manual',
  a35Formats: 'arri.alexa-35.recording-formats',
  a35Afro: 'arri.formats-overview-v6-3.alexa-35',
} as const

type RateMaximum = {
  maximum: number
  media?: string
  notes?: string
}

function fps(maxima: RateMaximum[], condition: { codec: string; resolution: string; firmware: string }): RecordingFrameRates {
  return {
    ranges: maxima.map(({ maximum, media, notes }) => ({
      minimum: THREE_QUARTERS,
      maximum: { numerator: maximum, denominator: 1 },
      conditions: { ...condition, ...(media === undefined ? {} : { media }), ...(notes === undefined ? {} : { notes }) },
    })),
  }
}

function output(
  id: string,
  displayName: string,
  codec: string,
  width: number,
  height: number,
  frameRates: RecordingFrameRates,
  sourceIds: string[],
  options: { imageWidth?: number; imageHeight?: number; notes?: string } = {},
): RecordingOutput {
  return {
    id,
    displayName,
    codec,
    containerWidthPx: width,
    containerHeightPx: height,
    imageContentWidthPx: options.imageWidth ?? width,
    imageContentHeightPx: options.imageHeight ?? height,
    frameRates,
    sourceIds,
    ...(options.notes === undefined ? {} : { notes: options.notes }),
  }
}

function mode(
  id: string,
  displayName: string,
  activeWidthPx: number,
  activeHeightPx: number,
  activeWidthMm: number,
  activeHeightMm: number,
  windowKind: RecordingMode['windowKind'],
  recordingOutputs: RecordingOutput[],
  sourceIds: string[],
  options: Pick<RecordingMode, 'anamorphic' | 'notes'> = {},
): RecordingMode {
  return {
    id,
    displayName,
    activeWidthPx,
    activeHeightPx,
    activeWidthMm,
    activeHeightMm,
    windowKind,
    frameRates: {
      ranges: recordingOutputs.flatMap((recordingOutput) => recordingOutput.frameRates.ranges ?? []),
    },
    recordingOutputs,
    sourceIds,
    ...options,
  }
}

const miniRates = (codec: string, resolution: string, maximum: number) => fps(
  [{ maximum }],
  { codec, resolution, firmware: 'ALEXA Mini LF SUP 7.3.2 / SUP 7.3 User Manual' },
)

const miniProRes = (resolution: string, maximum: number, notes?: string) => fps(
  [{ maximum }],
  { codec: 'Apple ProRes', resolution, firmware: 'ALEXA Mini LF SUP 7.3.2 / SUP 7.3 User Manual', ...(notes === undefined ? {} : { notes }) },
)

const miniModes: RecordingMode[] = [
  mode('arri.alexa-mini-lf.4_5k-lf-open-gate', '4.5K LF 3:2 Open Gate', 4448, 3096, 36.70, 25.54, 'full-sensor', [
    output('arri.alexa-mini-lf.4_5k-lf-open-gate.arriraw', 'ARRIRAW 4.5K LF Open Gate', 'ARRIRAW', 4448, 3096, miniRates('ARRIRAW', '4.5K LF 3:2 Open Gate', 40), [sources.miniProduct, sources.miniAfro, sources.miniFormats]),
    output('arri.alexa-mini-lf.4_5k-lf-open-gate.prores', 'Apple ProRes 4.5K LF Open Gate', 'Apple ProRes', 4480, 3096, miniRates('Apple ProRes', '4.5K LF 3:2 Open Gate', 40), [sources.miniProduct, sources.miniAfro, sources.miniFormats], { imageWidth: 4448, imageHeight: 3096 }),
  ], [sources.miniProduct, sources.miniAfro, sources.miniFormats]),
  mode('arri.alexa-mini-lf.4_5k-lf-2_39', '4.5K LF 2.39:1', 4448, 1856, 36.70, 15.31, 'window', [
    output('arri.alexa-mini-lf.4_5k-lf-2_39.arriraw', 'ARRIRAW 4.5K LF 2.39:1', 'ARRIRAW', 4448, 1856, miniRates('ARRIRAW', '4.5K LF 2.39:1', 60), [sources.miniProduct, sources.miniAfro, sources.miniFormats]),
    output('arri.alexa-mini-lf.4_5k-lf-2_39.prores', 'Apple ProRes 4.5K LF 2.39:1', 'Apple ProRes', 4480, 1856, miniRates('Apple ProRes', '4.5K LF 2.39:1', 60), [sources.miniProduct, sources.miniAfro, sources.miniFormats], { imageWidth: 4448, imageHeight: 1856 }),
  ], [sources.miniProduct, sources.miniAfro, sources.miniFormats]),
  mode('arri.alexa-mini-lf.4_3k-lf-16_9', '4.3K LF 16:9', 4320, 2430, 35.64, 20.05, 'window', [
    output('arri.alexa-mini-lf.4_3k-lf-16_9.prores-uhd', 'Apple ProRes UHD', 'Apple ProRes', 3840, 2160, miniProRes('4.3K LF 16:9 → UHD', 40, 'SUP 7.3 User Manual reports 40 fps; the older product-page table reports 48 fps. The current SUP/manual value is selected.'), [sources.miniProduct, sources.miniFaq, sources.miniAfro]),
    output('arri.alexa-mini-lf.4_3k-lf-16_9.prores-hd', 'Apple ProRes HD', 'Apple ProRes', 1920, 1080, miniProRes('4.3K LF 16:9 → HD', 75), [sources.miniProduct, sources.miniFaq, sources.miniAfro]),
  ], [sources.miniProduct, sources.miniFaq, sources.miniAfro]),
  mode('arri.alexa-mini-lf.3_8k-lf-16_9', '3.8K LF 16:9', 3840, 2160, 31.68, 17.82, 'window', [
    output('arri.alexa-mini-lf.3_8k-lf-16_9.arriraw', 'ARRIRAW 3.8K LF 16:9', 'ARRIRAW', 3840, 2160, miniRates('ARRIRAW', '3.8K LF 16:9', 60), [sources.miniProduct, sources.miniAfro]),
    output('arri.alexa-mini-lf.3_8k-lf-16_9.prores-uhd', 'Apple ProRes UHD', 'Apple ProRes', 3840, 2160, miniProRes('3.8K LF 16:9 → UHD', 60), [sources.miniProduct, sources.miniFaq, sources.miniAfro]),
    output('arri.alexa-mini-lf.3_8k-lf-16_9.prores-2k', 'Apple ProRes 2K', 'Apple ProRes', 2048, 1152, miniProRes('3.8K LF 16:9 → 2K', 90), [sources.miniProduct, sources.miniFaq, sources.miniAfro]),
    output('arri.alexa-mini-lf.3_8k-lf-16_9.prores-hd', 'Apple ProRes HD', 'Apple ProRes', 1920, 1080, miniProRes('3.8K LF 16:9 → HD', 90), [sources.miniProduct, sources.miniFaq, sources.miniAfro]),
  ], [sources.miniProduct, sources.miniFaq, sources.miniAfro]),
  mode('arri.alexa-mini-lf.2_8k-lf-1_1', '2.8K LF 1:1', 2880, 2880, 23.76, 23.76, 'anamorphic-oriented', [
    output('arri.alexa-mini-lf.2_8k-lf-1_1.arriraw', 'ARRIRAW 2.8K LF 1:1', 'ARRIRAW', 2880, 2880, miniRates('ARRIRAW', '2.8K LF 1:1', 60), [sources.miniProduct, sources.miniAfro, sources.miniFormats]),
    output('arri.alexa-mini-lf.2_8k-lf-1_1.prores', 'Apple ProRes 1:1', 'Apple ProRes', 3072, 3024, miniRates('Apple ProRes', '2.8K LF 1:1', 60), [sources.miniProduct, sources.miniAfro, sources.miniFormats], { imageWidth: 2880, imageHeight: 2880, notes: 'ARRI technical data lists the 3072 × 3024 file container and 2880 × 2880 image content.' }),
  ], [sources.miniProduct, sources.miniAfro, sources.miniFormats], { anamorphic: { orientation: 'horizontal', notes: 'ARRI FAQ identifies this mode for 2x anamorphic 2:1 delivery; lens squeeze remains separate from capture geometry.' } }),
  mode('arri.alexa-mini-lf.3_4k-s35-3_2', '3.4K S35 3:2', 3424, 2202, 28.25, 18.16, 'super-35-window', [
    output('arri.alexa-mini-lf.3_4k-s35-3_2.arriraw', 'ARRIRAW 3.4K S35', 'ARRIRAW', 3424, 2202, miniRates('ARRIRAW', '3.4K S35 3:2', 60), [sources.miniProduct, sources.miniAfro]),
    output('arri.alexa-mini-lf.3_4k-s35-3_2.prores', 'Apple ProRes 3.4K S35', 'Apple ProRes', 3424, 2202, miniRates('Apple ProRes', '3.4K S35 3:2', 60), [sources.miniProduct, sources.miniAfro]),
  ], [sources.miniProduct, sources.miniAfro]),
  mode('arri.alexa-mini-lf.3_2k-s35-16_9', '3.2K S35 16:9', 3200, 1800, 26.40, 14.85, 'super-35-window', [
    output('arri.alexa-mini-lf.3_2k-s35-16_9.prores', 'Apple ProRes 3.2K S35', 'Apple ProRes', 3200, 1800, miniProRes('3.2K S35 16:9', 75), [sources.miniProduct, sources.miniAfro]),
  ], [sources.miniProduct, sources.miniAfro]),
  mode('arri.alexa-mini-lf.2_8k-s35-4_3', '2.8K S35 4:3', 2880, 2160, 23.76, 17.81, 'super-35-window', [
    output('arri.alexa-mini-lf.2_8k-s35-4_3.prores', 'Apple ProRes 2.8K S35 4:3', 'Apple ProRes', 2880, 2160, miniProRes('2.8K S35 4:3', 75), [sources.miniProduct, sources.miniAfro]),
  ], [sources.miniProduct, sources.miniAfro]),
  mode('arri.alexa-mini-lf.2_8k-s35-16_9', '2.8K S35 16:9', 2880, 1620, 23.76, 13.36, 'super-35-window', [
    output('arri.alexa-mini-lf.2_8k-s35-16_9.prores', 'Apple ProRes HD', 'Apple ProRes', 1920, 1080, miniProRes('2.8K S35 16:9 → HD', 100), [sources.miniProduct, sources.miniAfro]),
  ], [sources.miniProduct, sources.miniAfro]),
].map((recordingMode) => ({
  ...recordingMode,
  sourceIds: [...new Set([...recordingMode.sourceIds, sources.miniManual, sources.miniSup])],
  recordingOutputs: recordingMode.recordingOutputs?.map((recordingOutput) => ({
    ...recordingOutput,
    sourceIds: [...new Set([...recordingOutput.sourceIds, sources.miniManual, sources.miniSup])],
  })),
}))

const a35Firmware = 'Original ALEXA 35 / SUP 6.1.0 / ARRI Formats and Resolutions Overview V6.3'

function a35Rates(codec: string, resolution: string, maxima: RateMaximum[]): RecordingFrameRates {
  return fps(maxima, { codec, resolution, firmware: a35Firmware })
}

const a35Modes: RecordingMode[] = [
  mode('arri.alexa-35.4_6k-open-gate', '4.6K 3:2 Open Gate', 4608, 3164, 27.99, 19.22, 'full-sensor', [
    output('arri.alexa-35.4_6k-open-gate.arriraw', 'ARRIRAW 4.6K', 'ARRIRAW', 4608, 3164, a35Rates('ARRIRAW', '4.6K', [
      { maximum: 35, media: 'Compact Drive 1TB', notes: 'AFRO V6.3 max FPS notation: -/35/75.' },
      { maximum: 75, media: 'Compact Drive 2TB', notes: 'AFRO V6.3 max FPS notation: -/35/75.' },
    ]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.4_6k-open-gate.prores', 'Apple ProRes 4.6K', 'Apple ProRes', 4608, 3164, a35Rates('Apple ProRes', '4.6K', [{ maximum: 60, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 lists 60/60/60 for this output.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  ], [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  mode('arri.alexa-35.4_6k-16_9', '4.6K 16:9', 4608, 2592, 27.99, 15.75, 'window', [
    output('arri.alexa-35.4_6k-16_9.arriraw', 'ARRIRAW 4.6K', 'ARRIRAW', 4608, 2592, a35Rates('ARRIRAW', '4.6K', [{ maximum: 45, media: 'Compact Drive 1TB', notes: 'AFRO V6.3 max FPS notation: -/45/75.' }, { maximum: 75, media: 'Compact Drive 2TB', notes: 'AFRO V6.3 max FPS notation: -/45/75.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.4_6k-16_9.prores', 'Apple ProRes 4K', 'Apple ProRes', 4096, 2304, a35Rates('Apple ProRes', '4K', [{ maximum: 75, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 identifies the 4K ProRes output for this sensor mode.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  ], [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  mode('arri.alexa-35.4k-16_9', '4K 16:9', 4096, 2304, 24.88, 14.00, 'window', [
    output('arri.alexa-35.4k-16_9.arriraw', 'ARRIRAW 4K', 'ARRIRAW', 4096, 2304, a35Rates('ARRIRAW', '4K', [{ maximum: 55, media: 'Compact Drive 1TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: -/55/120.' }, { maximum: 120, media: 'Compact Drive 2TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: -/55/120.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.4k-16_9.prores-4k', 'Apple ProRes 4K', 'Apple ProRes', 4096, 2304, a35Rates('Apple ProRes', '4K', [{ maximum: 100, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: 90-100/90-100/100.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.4k-16_9.prores-uhd', 'Apple ProRes UHD', 'Apple ProRes', 3840, 2160, a35Rates('Apple ProRes', 'UHD', [{ maximum: 120, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: 105-120/105-120/120.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.4k-16_9.prores-2k', 'Apple ProRes 2K', 'Apple ProRes', 2048, 1152, a35Rates('Apple ProRes', '2K', [{ maximum: 120, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: 120/120/120.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.4k-16_9.prores-hd', 'Apple ProRes HD', 'Apple ProRes', 1920, 1080, a35Rates('Apple ProRes', 'HD', [{ maximum: 120, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: 120/120/120.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  ], [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  mode('arri.alexa-35.4k-2_1', '4K 2:1', 4096, 2048, 24.88, 12.44, 'anamorphic-oriented', [
    output('arri.alexa-35.4k-2_1.arriraw', 'ARRIRAW 4K 2:1', 'ARRIRAW', 4096, 2048, a35Rates('ARRIRAW', '4K 2:1', [{ maximum: 65, media: 'Compact Drive 1TB', notes: 'AFRO V6.3 max FPS notation: -/65/120.' }, { maximum: 120, media: 'Compact Drive 2TB', notes: 'AFRO V6.3 max FPS notation: -/65/120.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.4k-2_1.prores', 'Apple ProRes 4K 2:1', 'Apple ProRes', 4096, 2048, a35Rates('Apple ProRes', '4K 2:1', [{ maximum: 120, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 lists 100-120/100-120/120.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  ], [sources.a35Product, sources.a35Manual, sources.a35Afro], { anamorphic: { orientation: 'horizontal', notes: 'Capture geometry is stored without applying lens squeeze; the official mode is part of ARRI anamorphic workflows.' } }),
  mode('arri.alexa-35.3_8k-16_9', '3.8K 16:9', 3840, 2160, 23.325, 13.12, 'window', [
    output('arri.alexa-35.3_8k-16_9.arriraw', 'ARRIRAW UHD', 'ARRIRAW', 3840, 2160, a35Rates('ARRIRAW', 'UHD', [{ maximum: 65, media: 'Compact Drive 1TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: -/65/120.' }, { maximum: 120, media: 'Compact Drive 2TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: -/65/120.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.3_8k-16_9.prores', 'Apple ProRes UHD', 'Apple ProRes', 3840, 2160, a35Rates('Apple ProRes', 'UHD', [{ maximum: 120, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: 105-120/105-120/120.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  ], [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  mode('arri.alexa-35.3_3k-6_5', '3.3K 6:5', 3328, 2790, 20.22, 16.95, 'anamorphic-oriented', [
    output('arri.alexa-35.3_3k-6_5.arriraw', 'ARRIRAW 3.3K', 'ARRIRAW', 3328, 2790, a35Rates('ARRIRAW', '3.3K', [{ maximum: 55, media: 'Compact Drive 1TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: -/55/100.' }, { maximum: 100, media: 'Compact Drive 2TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: -/55/100.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.3_3k-6_5.prores', 'Apple ProRes 3.3K', 'Apple ProRes', 3328, 2790, a35Rates('Apple ProRes', '3.3K', [{ maximum: 75, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: 75/75/75.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.3_3k-6_5.prores-ana', 'Apple ProRes 3.8K 2.39:1 Ana 2x', 'Apple ProRes', 3840, 1608, a35Rates('Apple ProRes', '3.8K 2.39:1 Ana 2x', [{ maximum: 90, media: 'Compact Drive 1TB or 2TB', notes: 'ARRI documents this as an output of the original ALEXA 35 3.3K 6:5 sensor mode.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro], { notes: 'Output resolution is distinct from the 3.3K 6:5 sensor active area.' }),
  ], [sources.a35Product, sources.a35Manual, sources.a35Afro], { anamorphic: { orientation: 'horizontal', notes: 'ARRI documents this sensor mode and its 3.8K 2.39:1 Ana 2x ProRes output for anamorphic workflows.' } }),
  mode('arri.alexa-35.3k-1_1', '3K 1:1', 3072, 3072, 18.66, 18.66, 'anamorphic-oriented', [
    output('arri.alexa-35.3k-1_1.arriraw', 'ARRIRAW 3K', 'ARRIRAW', 3072, 3072, a35Rates('ARRIRAW', '3K', [{ maximum: 55, media: 'Compact Drive 1TB', notes: 'AFRO V6.3 max FPS notation: -/55/100.' }, { maximum: 100, media: 'Compact Drive 2TB', notes: 'AFRO V6.3 max FPS notation: -/55/100.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.3k-1_1.prores', 'Apple ProRes 3K', 'Apple ProRes', 3072, 3072, a35Rates('Apple ProRes', '3K', [{ maximum: 90, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 lists 90/90/90.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
    output('arri.alexa-35.3k-1_1.prores-ana', 'Apple ProRes 3.8K 2:1 Ana 2x', 'Apple ProRes', 3840, 1920, a35Rates('Apple ProRes', '3.8K 2:1 Ana 2x', [{ maximum: 100, media: 'Compact Drive 1TB or 2TB', notes: 'ARRI identifies this as a desqueezed/scaled anamorphic output.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  ], [sources.a35Product, sources.a35Manual, sources.a35Afro], { anamorphic: { orientation: 'horizontal', notes: 'ARRI documents this mode for 2x anamorphic 2:1 delivery.' } }),
  mode('arri.alexa-35.2_7k-8_9', '2.7K 8:9', 2743, 3086, 16.66, 18.75, 'anamorphic-oriented', [
    output('arri.alexa-35.2_7k-8_9.prores-ana', 'Apple ProRes UHD 16:9 Ana 2x', 'Apple ProRes', 3840, 2160, a35Rates('Apple ProRes', 'UHD 16:9 Ana 2x', [{ maximum: 100, media: 'Compact Drive 1TB or 2TB', notes: 'ARRI states that desqueeze is applied in-camera; the Cine/Open Gate-Anamorphic license is required.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  ], [sources.a35Product, sources.a35Manual, sources.a35Afro], { anamorphic: { orientation: 'horizontal', notes: 'ARRI explicitly describes this as a 2x anamorphic workflow with in-camera desqueeze.' } }),
  mode('arri.alexa-35.2k-s16-16_9', '2K 16:9 S16', 2048, 1152, 12.44, 7.00, 'super-16-window', [
    output('arri.alexa-35.2k-s16-16_9.prores', 'Apple ProRes 2K', 'Apple ProRes', 2048, 1152, a35Rates('Apple ProRes', '2K', [{ maximum: 120, media: 'Compact Drive 1TB or 2TB', notes: 'AFRO V6.3 original ALEXA 35 Premium notation: 120 fps.' }]), [sources.a35Product, sources.a35Manual, sources.a35Afro]),
  ], [sources.a35Product, sources.a35Manual, sources.a35Afro]),
]

const arriSources = [
  {
    id: sources.miniProduct,
    sourceType: 'manufacturer-specification' as const,
    manufacturerId: 'arri',
    documentTitle: 'ALEXA Mini LF | Camera Systems — Technical Data',
    url: 'https://www.arri.com/en/cine-systems/cine-cameras/alexa-mini-lf',
    documentRevision: 'Current technical data page',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
  },
  {
    id: sources.miniFaq,
    sourceType: 'manufacturer-specification' as const,
    manufacturerId: 'arri',
    documentTitle: 'ALEXA Mini LF Frequently Asked Questions',
    url: 'https://www.arri.com/en/learn-help/learn-help-camera-system/frequently-asked-questions/alexa-mini-lf',
    documentRevision: 'Current FAQ page',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
  },
  {
    id: sources.miniManual,
    sourceType: 'manufacturer-manual' as const,
    manufacturerId: 'arri',
    documentTitle: 'ALEXA Mini LF SUP 7.3 User Manual',
    url: 'https://www.arri.com/resource/blob/347174/6b8fd84caac842b3c9292c910fcee693/alexa-mini-lf-sup-7-3-user-manual-data.pdf',
    documentRevision: 'SUP 7.3',
    publicationDate: '2023-10-09',
    firmwareRelevance: 'SUP 7.3; applicable to SUP 7.3.2',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
    notes: 'Current SUP 7.3.2 release notes direct users to this SUP 7.3 manual. It documents nine Mini LF modes; no 4.5K LF 1.89:1 mode was found.',
  },
  {
    id: sources.miniSup,
    sourceType: 'firmware-documentation' as const,
    manufacturerId: 'arri',
    documentTitle: 'ALEXA Mini LF SUP 7.3.2',
    url: 'https://www.arri.com/en/technical-service/firmware/software-and-firmware-updates-for-cameras/alexa-mini-lf-sup-7-3-2',
    documentRevision: 'SUP 7.3.2',
    publicationDate: '2025-06-12',
    firmwareRelevance: 'Current Mini LF software update',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
    notes: 'Release notes describe bug fixes and compatibility improvements and direct users to the SUP 7.3 User Manual for camera operation.',
  },
  {
    id: sources.miniFormats,
    sourceType: 'manufacturer-specification' as const,
    manufacturerId: 'arri',
    documentTitle: 'ALEXA Mini LF Recording Format Sheet DIN A4',
    url: 'https://www.arri.com/resource/blob/261408/46205a6cdd14c7667b1bc9fc6e3a91a9/alexa-mini-lf-recording-format-sheet-din-a4-data.pdf',
    documentRevision: 'SUP 7.1 format sheet',
    publicationDate: '2021-12-20',
    firmwareRelevance: 'SUP 7.1',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
    notes: 'Used as an official recording-format cross-check; current mode geometry and output variants are cross-checked against the current ARRI overview.',
  },
  {
    id: sources.miniAfro,
    sourceType: 'manufacturer-specification' as const,
    manufacturerId: 'arri',
    documentTitle: 'ARRI Formats and Resolutions Overview V6.3 — ALEXA Mini LF',
    url: 'https://www.arri.com/resource/blob/405022/a7f09a1b2b341f7231be2503b9660c84/2026-07-arri-formatsandresolutionsoverview-v6-3-data.pdf',
    documentRevision: 'V6.3',
    publicationDate: '2026-07-15',
    firmwareRelevance: 'Current ARRI formats overview',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
  },
  {
    id: sources.a35Product,
    sourceType: 'manufacturer-specification' as const,
    manufacturerId: 'arri',
    documentTitle: 'ALEXA 35 | Camera Systems — Technical Data',
    url: 'https://www.arri.com/en/cine-systems/cine-cameras/legacy-cine-cameras/alexa-35',
    documentRevision: 'Current technical data page',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
  },
  {
    id: sources.a35Manual,
    sourceType: 'manufacturer-manual' as const,
    manufacturerId: 'arri',
    documentTitle: 'ALEXA 35 SUP 6.1.0 User Manual',
    url: 'https://www.arri.com/resource/blob/406922/b3de0f288676a2665befd33a217fd524/alexa-35-sup-6-1-0-user-manual-en-data.pdf',
    documentRevision: 'SUP 6.1.0',
    publicationDate: '2026-07-07',
    firmwareRelevance: 'Original ALEXA 35 / SUP 6.1.0',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
  },
  {
    id: sources.a35ManualSup60,
    sourceType: 'manufacturer-manual' as const,
    manufacturerId: 'arri',
    documentTitle: 'ALEXA 35 SUP 6.0.0 User Manual',
    url: 'https://www.arri.com/resource/blob/403596/9bca057cb6a962cff63484fd092e4b33/alexa-35-sup-6-0-0-user-manual-en-data.pdf',
    documentRevision: 'SUP 6.0.0',
    publicationDate: '2026-04-15',
    firmwareRelevance: 'Historical ALEXA 35 SUP 6.0.0 conflict reference',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
    notes: 'Historical conflict reference: this manual lists HD 16:9 S16; it is not attached to the active original ALEXA 35 sensor-mode records, which follow the current original-model table.'
  },
  {
    id: sources.a35Formats,
    sourceType: 'manufacturer-specification' as const,
    manufacturerId: 'arri',
    documentTitle: 'ALEXA 35 Recording Formats Poster',
    url: 'https://www.arri.com/resource/blob/296424/812bdde50a7339a6748441a2983a90c9/alexa-35-recording-format-poster-data.pdf',
    documentRevision: 'Published 2023-07-25',
    publicationDate: '2023-07-25',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
    notes: 'Historical recording-format poster retained as a cross-check; current production values are governed by the V6.3 overview and SUP 6.1 documentation.',
  },
  {
    id: sources.a35Afro,
    sourceType: 'manufacturer-specification' as const,
    manufacturerId: 'arri',
    documentTitle: 'ARRI Formats and Resolutions Overview V6.3 — ALEXA 35',
    url: 'https://www.arri.com/resource/blob/405022/a7f09a1b2b341f7231be2503b9660c84/2026-07-arri-formatsandresolutionsoverview-v6-3-data.pdf',
    documentRevision: 'V6.3',
    publicationDate: '2026-07-15',
    firmwareRelevance: 'Original ALEXA 35 / SUP 6.1 or higher',
    accessedAt: ACCESSED_AT,
    verificationStatus: 'verified' as const,
  },
]

export const ARRI_CAMERA_DATASET: CameraDataset = {
  version: '1.0.0',
  manufacturers: [{ id: 'arri', displayName: 'ARRI' }],
  sources: arriSources,
  cameras: [
    {
      id: 'arri.alexa-mini-lf',
      manufacturerId: 'arri',
      manufacturerDisplayName: 'ARRI',
      displayName: 'ALEXA Mini LF',
      family: 'ALEXA LF',
      status: 'verified',
      sourceIds: [sources.miniProduct, sources.miniFaq, sources.miniManual, sources.miniSup, sources.miniFormats, sources.miniAfro],
      physicalSensor: {
        id: 'arri.alexa-mini-lf.alev-iii-a2x',
        name: 'Large Format ARRI ALEV III (A2X)',
        family: 'ALEV III (A2X)',
        widthMm: 36.70,
        heightMm: 25.54,
        nativeWidthPx: 4448,
        nativeHeightPx: 3096,
        sourceIds: [sources.miniProduct, sources.miniFaq, sources.miniManual, sources.miniSup, sources.miniAfro],
      },
      recordingModes: miniModes,
    },
    {
      id: 'arri.alexa-35',
      manufacturerId: 'arri',
      manufacturerDisplayName: 'ARRI',
      displayName: 'ALEXA 35',
      family: 'ALEXA 35',
      status: 'verified',
      sourceIds: [sources.a35Product, sources.a35Manual, sources.a35Formats, sources.a35Afro],
      physicalSensor: {
        id: 'arri.alexa-35.alev-4',
        name: 'ARRI ALEV 4',
        family: 'ALEV 4',
        widthMm: 27.99,
        heightMm: 19.22,
        nativeWidthPx: 4608,
        nativeHeightPx: 3164,
        sourceIds: [sources.a35Product, sources.a35Manual, sources.a35Afro],
      },
      recordingModes: a35Modes,
    },
  ],
}

export const ARRI_BATCH_1_CAMERA_IDS = ['arri.alexa-mini-lf', 'arri.alexa-35'] as const
