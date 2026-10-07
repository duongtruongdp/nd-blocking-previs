export const cameraDatabaseVersion = 2

export type CameraVerificationStatus = 'verified-official' | 'verified-secondary' | 'incomplete'
export type CameraLifecycle = 'current' | 'legacy' | 'rental-specialist'

export type CameraSource = {
  manufacturer: string
  title: string
  url: string
  accessedAt: string
  verificationStatus?: CameraVerificationStatus
  notes?: string
}

export type SensorDefinition = { name: string; physicalWidthMm: number; physicalHeightMm: number }
export type CaptureModeDefinition = {
  id: string
  name: string
  recordingWidthPx: number
  recordingHeightPx: number
  activeWidthMm: number
  activeHeightMm: number
  maxFrameRate?: number
  compatibleCodecs?: readonly string[]
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
  lifecycle?: CameraLifecycle
  lensMounts?: readonly string[]
  monitorDesqueezeFactors?: readonly number[]
  defaultCaptureModeId?: string
}

const ACCESSED_AT = '2026-10-06'
const source = (manufacturer: string, title: string, url: string, notes?: string): CameraSource => ({ manufacturer, title, url, accessedAt: ACCESSED_AT, verificationStatus: 'verified-official', notes })
const mode = (id: string, name: string, width: number, height: number, activeWidth: number, activeHeight: number, provenance: CameraSource, options: Pick<CaptureModeDefinition, 'maxFrameRate' | 'compatibleCodecs' | 'notes'> = {}): CaptureModeDefinition => ({ id, name, recordingWidthPx: width, recordingHeightPx: height, activeWidthMm: activeWidth, activeHeightMm: activeHeight, provenance, ...options })
const camera = (id: string, manufacturer: string, model: string, sensor: SensorDefinition, provenance: CameraSource, captureModes: readonly CaptureModeDefinition[], options: Pick<CameraDefinition, 'lifecycle' | 'lensMounts' | 'defaultCaptureModeId' | 'monitorDesqueezeFactors'> = {}): CameraDefinition => ({ id, manufacturer, model, sensor, provenance, captureModes, ...options })

const ARRI_ALEXA_35_SOURCE = source('ARRI', 'ALEXA 35 technical data', 'https://www.arri.com/en/camera-systems/cameras/alexa-35')
const ARRI_ALEXA_35_XTREME_SOURCE = source('ARRI', 'ALEXA 35 Xtreme technical data', 'https://www.arri.com/en/cine-systems/cine-cameras/alexa-35-xtreme')
const ARRI_ALEXA_265_SOURCE = source('ARRI', 'ALEXA 265 technical data', 'https://www.arri.com/en/cine-systems/cine-cameras/alexa-265')
const ARRI_ALEXA_65_SOURCE = source('ARRI', 'ALEXA 65 technical data', 'https://www.arri.com/en/cine-systems/cine-cameras/alexa-65')
const ARRI_MINI_SOURCE = source('ARRI', 'ALEXA Mini technical data', 'https://www.arri.com/en/camera-systems/cameras/alexa-mini')
const ARRI_MINI_LF_SOURCE = source('ARRI', 'ALEXA Mini LF technical data', 'https://www.arri.com/en/cine-systems/cine-cameras/alexa-mini-lf')
const ARRI_LF_SOURCE = source('ARRI', 'ALEXA LF technical data', 'https://www.arri.com/en/cine-systems/cine-cameras/alexa-lf')
const SONY_BURANO_SOURCE = source('Sony', 'BURANO Cinema Line camera', 'https://electronics.sony.com/imaging/cinema-line-cameras/burano')
const SONY_FX5_SOURCE = source('Sony', 'ILME-FX5 Help Guide / specifications', 'https://helpguide.sony.net/ilc/2630/v1/en/contents/rec_format.html', 'Sony documents the imager modes and raster sizes in the Help Guide; the camera specifications document the 35.9 × 24.0 mm full-frame sensor.')
const SONY_FX5_HELP_SOURCE = source('Sony', 'ILME-FX5 Help Guide, actual image size', 'https://helpguide.sony.net/ilc/2630/v1/en/contents/basic_action.html', 'Actual image sizes are manufacturer-published pixel windows. FF 5K 3:2 is the full-frame open-gate physical baseline; crop windows use the documented FFc/S35 terminology.')
const SONY_FX6_SOURCE = source('Sony', 'ILME-FX6 specifications', 'https://www.sony.com/electronics/support/camcorders-and-video-cameras-interchangeable-lens-camcorders/ilme-fx6v/specifications')
const SONY_FX3_SOURCE = source('Sony', 'ILME-FX3 specifications', 'https://www.sony.com/electronics/support/interchangeable-lens-cameras-body/ilme-fx3/specifications')
const SONY_FX2_SOURCE = source('Sony', 'ILME-FX2 Cinema Line camera', 'https://electronics.sony.com/imaging/interchangeable-lens-cameras/all-interchangeable-lens-cameras/p/ilmefx2')
const SONY_FX30_SOURCE = source('Sony', 'ILME-FX30 specifications', 'https://www.sony.com/electronics/support/e-mount-body-ilme-fx-series/ilme-fx30/specifications')
const SONY_VENICE_2_SOURCE = source('Sony', 'VENICE 2 digital cinema camera', 'https://pro.sony/en_GB/products/digital-cinema-cameras/venice-2')
const SONY_VENICE_SOURCE = source('Sony', 'VENICE digital cinema camera', 'https://pro.sony/en_GB/products/digital-cinema-cameras/venice')
const SONY_FR7_SOURCE = source('Sony', 'ILME-FR7 specifications', 'https://www.sony.com/electronics/support/professional-cameras-interchangeable-lens-camcorders/ilme-fr7/specifications')
const RED_VRAPTOR_SOURCE = source('RED', 'V-RAPTOR technical specifications', 'https://docs.red.com/955-0199/955-0199_V1.2_Rev_A_RED_PS_V-RAPTOR_Operation_Guide/Content/C_TechSpecs/Specs_V-RAPTOR.htm')
const RED_VRAPTOR_XL_SOURCE = source('RED', 'V-RAPTOR XL technical specifications', 'https://docs.red.com/955-0227/955-0227_V1.7_Rev-C_RED_PS%2C_V-RAPTOR_XL_%5BX%5D8K_VV_Operation_Guide/Content/C_TechSpecs/Specs_V-RAPTOR_XL.htm')
const RED_KOMODO_X_SOURCE = source('RED', 'KOMODO-X technical specifications', 'https://docs.red.com/955-0219/955-0219_V2.0%20Rev-B%20RED%20PS%2C%20KOMODO-X%20Operation%20Guide%20HTML/Content/C_TechSpecs/Specs_KOMODO-X.htm')
const RED_KOMODO_SOURCE = source('RED', 'KOMODO technical specifications', 'https://docs.red.com/955-0190_v1.3/955-0190_v1.3_REV-01_2_RED_PS_KOMODO_Operation_Guide.pdf')
const CANON_C400_SOURCE = source('Canon', 'EOS C400 technical specifications', 'https://www.usa.canon.com/shop/p/eos-c400')
const CANON_C80_SOURCE = source('Canon', 'EOS C80 technical specifications', 'https://www.usa.canon.com/shop/p/eos-c80')
const CANON_C50_SOURCE = source('Canon', 'EOS C50 Cinema EOS specifications', 'https://www.usa.canon.com/shop/p/eos-c50')
const CANON_C70_SOURCE = source('Canon', 'EOS C70 technical specifications', 'https://www.usa.canon.com/shop/p/eos-c70')
const CANON_C500_SOURCE = source('Canon', 'EOS C500 Mark II technical specifications', 'https://www.usa.canon.com/shop/p/eos-c500-mark-ii')
const CANON_C300_SOURCE = source('Canon', 'EOS C300 Mark III technical specifications', 'https://www.usa.canon.com/shop/p/eos-c300-mark-iii')
const CANON_R5C_SOURCE = source('Canon', 'EOS R5 C technical specifications', 'https://www.usa.canon.com/shop/p/eos-r5-c')
const BLACKMAGIC_URSA_CINE_SOURCE = source('Blackmagic Design', 'URSA Cine technical specifications', 'https://www.blackmagicdesign.com/products/blackmagicursacine/techspecs')
const BLACKMAGIC_PYXIS_SOURCE = source('Blackmagic Design', 'PYXIS technical specifications', 'https://www.blackmagicdesign.com/products/blackmagicpyxis/techspecs')
const BLACKMAGIC_CINEMA_SOURCE = source('Blackmagic Design', 'Cinema Camera 6K technical specifications', 'https://www.blackmagicdesign.com/products/blackmagiccinemacamera/techspecs')
const BLACKMAGIC_URSA_MINI_SOURCE = source('Blackmagic Design', 'URSA Mini Pro 12K technical specifications', 'https://www.blackmagicdesign.com/uk/products/blackmagicursaminipro/techspecs')
const PANASONIC_BS1H_SOURCE = source('Panasonic / LUMIX', 'LUMIX BS1H specifications', 'https://www.panasonic.com/in/consumer/cameras-camcorders/camera/lumix-box-style-cameras/dc-bs1h.html')
const PANASONIC_BGH1_SOURCE = source('Panasonic / LUMIX', 'LUMIX BGH1 specifications', 'https://www.panasonic.com/global/consumer/lumix/bgh1.html')
const PANASONIC_EVA1_SOURCE = source('Panasonic / LUMIX', 'AU-EVA1 technical specifications', 'https://pro-av.panasonic.net/en/eva1/')
const PANASONIC_S1H_SOURCE = source('Panasonic / LUMIX', 'LUMIX S1H specifications', 'https://www.panasonic.com/global/consumer/lumix/s1h.html')
const DJI_RONIN_4D_SOURCE = source('DJI', 'Ronin 4D / Zenmuse X9 specifications', 'https://www.dji.com/ronin-4d/specs')

const S35 = { name: 'Super 35', physicalWidthMm: 27.03, physicalHeightMm: 14.26 }
const ARRI_S35 = { name: 'Super 35 ALEV 4', physicalWidthMm: 27.99, physicalHeightMm: 19.22 }
const ARRI_LF = { name: 'Large Format ALEV 3', physicalWidthMm: 36.70, physicalHeightMm: 25.54 }
const ARRI_65 = { name: '65 mm A3X', physicalWidthMm: 54.12, physicalHeightMm: 25.58 }
const FULL_FRAME = { name: 'Full Frame', physicalWidthMm: 36, physicalHeightMm: 24 }

export const CAMERA_DATABASE: readonly CameraDefinition[] = [
  camera('arri-alexa35-xtreme', 'ARRI', 'ALEXA 35 Xtreme', ARRI_S35, ARRI_ALEXA_35_XTREME_SOURCE, [mode('arri-alexa35-xtreme-open-gate', 'Open Gate 4.6K', 4608, 3164, 28.0, 19.2, ARRI_ALEXA_35_XTREME_SOURCE, { maxFrameRate: 660 }), mode('arri-alexa35-xtreme-16_9', '4.6K 16:9', 4608, 2592, 28.0, 15.7, ARRI_ALEXA_35_XTREME_SOURCE), mode('arri-alexa35-xtreme-4k', '4K 16:9', 4096, 2304, 24.9, 14.0, ARRI_ALEXA_35_XTREME_SOURCE), mode('arri-alexa35-xtreme-3_8k', '3.8K 16:9', 3840, 2160, 23.3, 13.1, ARRI_ALEXA_35_XTREME_SOURCE), mode('arri-alexa35-xtreme-3_8k-2_39', '3.8K 2.39:1', 3840, 1608, 23.3, 9.8, ARRI_ALEXA_35_XTREME_SOURCE), mode('arri-alexa35-xtreme-3_3k-6_5', '3.3K 6:5', 3328, 2790, 20.22, 16.95, ARRI_ALEXA_35_XTREME_SOURCE), mode('arri-alexa35-xtreme-s16', '2K 16:9 S16', 2048, 1152, 12.4, 7.0, ARRI_ALEXA_35_XTREME_SOURCE), mode('arri-alexa35-xtreme-hd-s16', 'HD 16:9 S16', 1920, 1080, 11.7, 6.6, ARRI_ALEXA_35_XTREME_SOURCE)], { lifecycle: 'current', lensMounts: ['LPL', 'PL'] }),
  camera('arri-alexa35', 'ARRI', 'ALEXA 35', ARRI_S35, ARRI_ALEXA_35_SOURCE, [mode('arri-alexa35-open-gate', 'Open Gate 4.6K', 4608, 3164, 27.99, 19.22, ARRI_ALEXA_35_SOURCE), mode('arri-alexa35-4_6k-16_9', '4.6K 16:9', 4608, 2592, 27.99, 15.74, ARRI_ALEXA_35_SOURCE), mode('arri-alexa35-4k-16_9', '4K 16:9', 4096, 2304, 24.88, 13.99, ARRI_ALEXA_35_SOURCE), mode('arri-alexa35-3_8k-16_9', '3.8K 16:9', 3840, 2160, 23.3, 13.1, ARRI_ALEXA_35_SOURCE), mode('arri-alexa35-3_8k-2_39', '3.8K 2.39:1', 3840, 1608, 23.3, 9.8, ARRI_ALEXA_35_SOURCE), mode('arri-alexa35-3_3k-6_5', '3.3K 6:5', 3328, 2790, 20.22, 16.95, ARRI_ALEXA_35_SOURCE), mode('arri-alexa35-s16', '2K 16:9 S16', 2048, 1152, 12.4, 7.0, ARRI_ALEXA_35_SOURCE), mode('arri-alexa35-hd-s16', 'HD 16:9 S16', 1920, 1080, 11.7, 6.6, ARRI_ALEXA_35_SOURCE)], { lifecycle: 'current', lensMounts: ['LPL', 'PL'] }),
  camera('arri.alexa265', 'ARRI', 'ALEXA 265', ARRI_65, ARRI_ALEXA_265_SOURCE, [mode('arri-alexa265-open-gate', '6.5K 2.12:1 Open Gate', 6560, 3100, 54.12, 25.58, ARRI_ALEXA_265_SOURCE, { maxFrameRate: 60 }), mode('arri-alexa265-5_1k', '5.1K 1.65:1', 5120, 3100, 42.24, 25.58, ARRI_ALEXA_265_SOURCE), mode('arri-alexa265-4_5k-lf', '4.5K LF 3:2', 4448, 3096, 36.70, 25.54, ARRI_ALEXA_265_SOURCE), mode('arri-alexa265-4k-16_9', '4K 16:9', 4096, 2304, 33.75, 18.98, ARRI_ALEXA_265_SOURCE), mode('arri-alexa265-2_8k-2_39', '2.8K 2.39:1', 2880, 1206, 23.76, 9.95, ARRI_ALEXA_265_SOURCE)], { lifecycle: 'current', lensMounts: ['LPL'] }),
  camera('arri.alexa65', 'ARRI', 'ALEXA 65', ARRI_65, ARRI_ALEXA_65_SOURCE, [mode('arri-alexa65-open-gate', 'Open Gate 6.5K', 6560, 3100, 54.12, 25.58, ARRI_ALEXA_65_SOURCE)], { lifecycle: 'rental-specialist', lensMounts: ['XPL'] }),
  camera('arri-alexa-mini-lf', 'ARRI', 'ALEXA Mini LF', ARRI_LF, ARRI_MINI_LF_SOURCE, [mode('arri-mini-lf-open-gate', 'LF Open Gate 4.5K', 4448, 3096, 36.70, 25.54, ARRI_MINI_LF_SOURCE), mode('arri-mini-lf-16_9', 'LF 16:9 4.3K', 4320, 2430, 35.64, 20.05, ARRI_MINI_LF_SOURCE), mode('arri-mini-lf-3_8k-16_9', 'LF 16:9 3.8K', 3840, 2160, 31.68, 17.82, ARRI_MINI_LF_SOURCE), mode('arri-mini-lf-2_39', 'LF 2.39', 4448, 1856, 36.70, 15.31, ARRI_MINI_LF_SOURCE), mode('arri-mini-lf-1_1', 'LF 1:1 2.8K', 2880, 2880, 23.76, 23.76, ARRI_MINI_LF_SOURCE), mode('arri-mini-lf-s35-open-gate', 'S35 Open Gate 3.4K', 3424, 2202, 28.25, 18.16, ARRI_MINI_LF_SOURCE), mode('arri-mini-lf-s35-16_9', 'S35 16:9 3.2K', 3200, 1800, 26.40, 14.85, ARRI_MINI_LF_SOURCE), mode('arri-mini-lf-s35-4_3', 'S35 4:3 2.8K', 2880, 2160, 23.76, 17.81, ARRI_MINI_LF_SOURCE)], { lifecycle: 'current', lensMounts: ['LPL', 'PL'] }),
  camera('arri-alexa-lf', 'ARRI', 'ALEXA LF', ARRI_LF, ARRI_LF_SOURCE, [mode('arri-lf-open-gate', 'LF Open Gate 4.5K', 4448, 3096, 36.70, 25.54, ARRI_LF_SOURCE), mode('arri-lf-16_9', 'LF 16:9 4.3K', 4320, 2430, 35.64, 20.05, ARRI_LF_SOURCE), mode('arri-lf-3_8k-16_9', 'LF 16:9 3.8K', 3840, 2160, 31.68, 17.82, ARRI_LF_SOURCE), mode('arri-lf-2_39', 'LF 2.39', 4448, 1856, 36.70, 15.31, ARRI_LF_SOURCE), mode('arri-lf-1_1', 'LF 1:1 2.8K', 2880, 2880, 23.76, 23.76, ARRI_LF_SOURCE), mode('arri-lf-s35-open-gate', 'S35 Open Gate 3.4K', 3424, 2202, 28.25, 18.16, ARRI_LF_SOURCE), mode('arri-lf-s35-16_9', 'S35 16:9 3.2K', 3200, 1800, 26.40, 14.85, ARRI_LF_SOURCE)], { lifecycle: 'legacy', lensMounts: ['LPL', 'PL'] }),
  camera('arri.alexa-mini', 'ARRI', 'ALEXA Mini', { name: 'Super 35 ALEV III', physicalWidthMm: 28.25, physicalHeightMm: 18.17 }, ARRI_MINI_SOURCE, [mode('arri-alexa-mini-open-gate', 'Open Gate 3.4K', 3424, 2202, 28.25, 18.17, ARRI_MINI_SOURCE), mode('arri-alexa-mini-hd', 'HD 16:9', 2880, 1620, 23.76, 13.37, ARRI_MINI_SOURCE), mode('arri-alexa-mini-2k', '2K 16:9', 2868, 1612, 23.66, 13.30, ARRI_MINI_SOURCE), mode('arri-alexa-mini-3_2k', '3.2K 16:9', 3200, 1800, 26.40, 14.85, ARRI_MINI_SOURCE), mode('arri-alexa-mini-4k-uhd', '4K UHD 16:9', 3200, 1800, 26.40, 14.85, ARRI_MINI_SOURCE), mode('arri-alexa-mini-4_3', '4:3 2.8K', 2880, 2160, 23.76, 17.82, ARRI_MINI_SOURCE), mode('arri-alexa-mini-2_39-anamorphic', '2.39:1 2K Anamorphic', 2560, 2145, 21.12, 17.70, ARRI_MINI_SOURCE), mode('arri-alexa-mini-hd-anamorphic', 'HD Anamorphic', 1920, 2160, 15.84, 17.82, ARRI_MINI_SOURCE)], { lifecycle: 'legacy', lensMounts: ['PL', 'LPL'] }),

  camera('sony.burano', 'Sony', 'BURANO', { name: 'Full Frame 8.6K', physicalWidthMm: 36.2, physicalHeightMm: 24.1 }, SONY_BURANO_SOURCE, [mode('sony-burano-full-frame', '8.6K Full Frame 3:2', 8640, 5760, 36.2, 24.1, SONY_BURANO_SOURCE), mode('sony-burano-17_9', '8.2K Full Frame 17:9', 8192, 4320, 36.2, 19.1, SONY_BURANO_SOURCE), mode('sony-burano-16_9', '8.6K Full Frame 16:9', 8640, 4860, 36.2, 20.36, SONY_BURANO_SOURCE), mode('sony-burano-s35-6k', '6K Super 35 17:9', 6048, 3200, 24.3, 12.85, SONY_BURANO_SOURCE), mode('sony-burano-s35', '5.8K Super 35 16:9', 5792, 3056, 24.3, 12.8, SONY_BURANO_SOURCE)], { lifecycle: 'current', lensMounts: ['PL', 'E'] }),
  camera('sony.fx5', 'Sony', 'FX5', { name: 'Full Frame Exmor RS', physicalWidthMm: 35.9, physicalHeightMm: 24.0 }, SONY_FX5_SOURCE, [
    mode('sony-fx5-ff-5k-open-gate', 'FF 5K 3:2 Open Gate', 4992, 3328, 35.9, 24.0, SONY_FX5_HELP_SOURCE, { compatibleCodecs: ['X-OCN LT', 'X-OCN C1', 'X-OCN C2'], notes: 'Full-frame open gate; Sony identifies this mode as an X-OCN recording mode.' }),
    mode('sony-fx5-ff-5k-17_9', 'FF 5K 17:9', 4992, 2632, 35.9, 18.93, SONY_FX5_HELP_SOURCE),
    mode('sony-fx5-ff-5k-16_9', 'FF 5K 16:9', 4992, 2808, 35.9, 20.20, SONY_FX5_HELP_SOURCE),
    mode('sony-fx5-ffc-4_5k-17_9', 'FF crop 4.5K 17:9', 4552, 2400, 32.75, 17.26, SONY_FX5_HELP_SOURCE, { notes: 'Sony FFc crop window; physical dimensions follow the documented crop raster against the published full-frame sensor.' }),
    mode('sony-fx5-ffc-4_5k-16_9', 'FF crop 4.5K 16:9', 4552, 2560, 32.75, 18.40, SONY_FX5_HELP_SOURCE, { notes: 'Sony FFc crop window; physical dimensions follow the documented crop raster against the published full-frame sensor.' }),
    mode('sony-fx5-ffc-3_8k-16_9', 'FF crop 3.8K 16:9', 3840, 2160, 27.60, 15.53, SONY_FX5_HELP_SOURCE, { maxFrameRate: 120, notes: 'Sony FFc crop window; restricted at the highest frame-rate settings.' }),
    mode('sony-fx5-s35-3_2k-16_9', 'S35 3.2K 16:9', 3264, 1836, 23.30, 13.11, SONY_FX5_HELP_SOURCE),
  ], { lifecycle: 'current', lensMounts: ['E'], monitorDesqueezeFactors: [1.3, 1.5, 1.6, 1.8, 2] }),
  camera('sony.fx6', 'Sony', 'FX6', { name: 'Full Frame Exmor R', physicalWidthMm: 35.6, physicalHeightMm: 18.8 }, SONY_FX6_SOURCE, [mode('sony-fx6-full-frame', '4K Full Frame 17:9', 4096, 2160, 35.6, 18.8, SONY_FX6_SOURCE), mode('sony-fx6-full-frame-16_9', '4K Full Frame 16:9', 3840, 2160, 35.6, 20.0, SONY_FX6_SOURCE), mode('sony-fx6-s35-4k', '4K Super 35 17:9', 4096, 2160, 24.3, 12.8, SONY_FX6_SOURCE)], { lifecycle: 'current', lensMounts: ['E'] }),
  camera('sony.fx3', 'Sony', 'FX3', { name: 'Full Frame Exmor R', physicalWidthMm: 35.6, physicalHeightMm: 23.8 }, SONY_FX3_SOURCE, [mode('sony-fx3-full-frame', '4K Full Frame 16:9', 3840, 2160, 35.6, 20.0, SONY_FX3_SOURCE), mode('sony-fx3-full-frame-17_9', '4K Full Frame 17:9', 4096, 2160, 35.6, 18.8, SONY_FX3_SOURCE), mode('sony-fx3-s35', '4K Super 35 16:9', 3840, 2160, 23.3, 13.1, SONY_FX3_SOURCE)], { lifecycle: 'current', lensMounts: ['E'] }),
  camera('sony.fx2', 'Sony', 'FX2', { name: 'Full Frame Exmor R', physicalWidthMm: 35.9, physicalHeightMm: 24.0 }, SONY_FX2_SOURCE, [mode('sony-fx2-full-frame', 'Full Frame 16:9', 3840, 2160, 35.9, 20.2, SONY_FX2_SOURCE), mode('sony-fx2-super35', 'Super 35 16:9', 3840, 2160, 23.3, 13.1, SONY_FX2_SOURCE)], { lifecycle: 'current', lensMounts: ['E'] }),
  camera('sony.fx30', 'Sony', 'FX30', { name: 'Super 35 Exmor R', physicalWidthMm: 23.3, physicalHeightMm: 15.5 }, SONY_FX30_SOURCE, [mode('sony-fx30-super35', 'Super 35 4K 16:9', 3840, 2160, 23.3, 13.1, SONY_FX30_SOURCE), mode('sony-fx30-super35-17_9', 'Super 35 4K 17:9', 4096, 2160, 23.3, 12.3, SONY_FX30_SOURCE), mode('sony-fx30-super35-3_2', 'Super 35 3:2 Open Area', 4672, 3104, 23.3, 15.5, SONY_FX30_SOURCE)], { lifecycle: 'current', lensMounts: ['E'] }),
  camera('sony.venice2', 'Sony', 'VENICE 2', { name: 'Full Frame 8.6K', physicalWidthMm: 36.2, physicalHeightMm: 24.1 }, SONY_VENICE_2_SOURCE, [mode('sony-venice2-8_6k', '8.6K Full Frame 3:2', 8640, 5760, 36.2, 24.1, SONY_VENICE_2_SOURCE), mode('sony-venice2-17_9', '8.2K Full Frame 17:9', 8192, 4320, 36.2, 19.1, SONY_VENICE_2_SOURCE), mode('sony-venice2-16_9', '8.6K Full Frame 16:9', 8640, 4860, 36.2, 20.36, SONY_VENICE_2_SOURCE), mode('sony-venice2-s35-6k', '6K Super 35 17:9', 6048, 3200, 24.3, 12.85, SONY_VENICE_2_SOURCE), mode('sony-venice2-s35-4k', '4K Super 35 17:9', 4096, 2160, 24.3, 12.8, SONY_VENICE_2_SOURCE)], { lifecycle: 'current', lensMounts: ['PL', 'LPL'] }),
  camera('sony.venice', 'Sony', 'VENICE', { name: 'Full Frame 6K', physicalWidthMm: 36.2, physicalHeightMm: 24.1 }, SONY_VENICE_SOURCE, [mode('sony-venice-6k', '6K Full Frame 3:2', 6048, 4032, 36.2, 24.1, SONY_VENICE_SOURCE), mode('sony-venice-s35', 'Super 35 4K 17:9', 4096, 2160, 24.3, 12.8, SONY_VENICE_SOURCE)], { lifecycle: 'legacy', lensMounts: ['PL', 'LPL'] }),
  camera('sony.fr7', 'Sony', 'FR7', { name: 'Full Frame Exmor R', physicalWidthMm: 35.6, physicalHeightMm: 23.8 }, SONY_FR7_SOURCE, [mode('sony-fr7-full-frame', '4K Full Frame 16:9', 3840, 2160, 35.6, 20.0, SONY_FR7_SOURCE)], { lifecycle: 'current', lensMounts: ['E'] }),

  camera('red-v-raptor-8k-vv', 'RED', 'V-RAPTOR 8K VV', { name: 'V-RAPTOR 8K VV', physicalWidthMm: 40.96, physicalHeightMm: 21.60 }, RED_VRAPTOR_SOURCE, [mode('red-v-raptor-8k-vv-17_9', '8K 17:9', 8192, 4320, 40.96, 21.60, RED_VRAPTOR_SOURCE), mode('red-v-raptor-8k-vv-2_4', '8K 2.4:1', 8192, 3456, 40.96, 17.28, RED_VRAPTOR_SOURCE), mode('red-v-raptor-6k-vv-17_9', '6K 17:9', 6144, 3240, 30.72, 16.20, RED_VRAPTOR_SOURCE), mode('red-v-raptor-5k-vv-17_9', '5K 17:9', 5120, 2700, 25.60, 13.50, RED_VRAPTOR_SOURCE)], { lifecycle: 'current', lensMounts: ['PL', 'RF'] }),
  camera('red.v-raptor-8k-s35', 'RED', 'V-RAPTOR 8K S35', S35, RED_VRAPTOR_SOURCE, [mode('red-v-raptor-8k-s35-17_9', '8K 17:9 S35', 8192, 4320, 27.03, 14.26, RED_VRAPTOR_SOURCE), mode('red-v-raptor-6k-s35', '6K 17:9 S35', 6144, 3240, 27.03, 14.26, RED_VRAPTOR_SOURCE), mode('red-v-raptor-5k-s35', '5K 17:9 S35', 5120, 2700, 27.03, 14.26, RED_VRAPTOR_SOURCE)], { lifecycle: 'current', lensMounts: ['PL', 'RF'] }),
  camera('red.v-raptor-xl-8k-vv', 'RED', 'V-RAPTOR XL 8K VV', { name: 'V-RAPTOR XL 8K VV', physicalWidthMm: 40.96, physicalHeightMm: 21.60 }, RED_VRAPTOR_XL_SOURCE, [mode('red-v-raptor-xl-8k-vv-17_9', '8K 17:9', 8192, 4320, 40.96, 21.60, RED_VRAPTOR_XL_SOURCE)], { lifecycle: 'current', lensMounts: ['PL'] }),
  camera('red.komodo-x', 'RED', 'KOMODO-X', S35, RED_KOMODO_X_SOURCE, [mode('red-komodo-x-6k-17_9', '6K 17:9', 6144, 3240, 27.03, 14.26, RED_KOMODO_X_SOURCE, { maxFrameRate: 80 }), mode('red-komodo-x-5k-17_9', '5K 17:9', 5120, 2700, 22.53, 11.85, RED_KOMODO_X_SOURCE), mode('red-komodo-x-4k-17_9', '4K 17:9', 4096, 2160, 18.02, 9.49, RED_KOMODO_X_SOURCE), mode('red-komodo-x-2k-16_9', '2K 16:9', 2048, 1080, 13.52, 7.61, RED_KOMODO_X_SOURCE)], { lifecycle: 'current', lensMounts: ['RF', 'Z'] }),
  camera('red.komodo', 'RED', 'KOMODO 6K', S35, RED_KOMODO_SOURCE, [mode('red-komodo-6k-17_9', '6K 17:9', 6144, 3240, 27.03, 14.26, RED_KOMODO_SOURCE)], { lifecycle: 'legacy', lensMounts: ['RF'] }),

  camera('canon.c400', 'Canon', 'EOS C400', { name: 'Full Frame 6K', physicalWidthMm: 38.1, physicalHeightMm: 20.1 }, CANON_C400_SOURCE, [mode('canon-c400-full-frame-6k', '6K Full Frame 3:2', 5952, 3140, 38.1, 20.1, CANON_C400_SOURCE), mode('canon-c400-super35-4k', '4K Super 35', 4096, 2160, 26.2, 13.8, CANON_C400_SOURCE)], { lifecycle: 'legacy', lensMounts: ['RF'] }),
  camera('canon.c80', 'Canon', 'EOS C80', { name: 'Full Frame 6K BSI', physicalWidthMm: 38.1, physicalHeightMm: 20.1 }, CANON_C80_SOURCE, [mode('canon-c80-full-frame-6k', '6K Full Frame', 5952, 3140, 38.1, 20.1, CANON_C80_SOURCE), mode('canon-c80-super35-4k', '4K Super 35 Crop', 4096, 2160, 26.2, 13.8, CANON_C80_SOURCE)], { lifecycle: 'current', lensMounts: ['RF'] }),
  camera('canon.c50', 'Canon', 'EOS C50', FULL_FRAME, CANON_C50_SOURCE, [mode('canon-c50-open-gate-7k', '7K Open Gate 3:2', 6960, 4640, 36, 24, CANON_C50_SOURCE), mode('canon-c50-4k-16_9', '4K 16:9', 4096, 2160, 36, 19.0, CANON_C50_SOURCE)], { lifecycle: 'current', lensMounts: ['RF'] }),
  camera('canon.c70', 'Canon', 'EOS C70', { name: 'Super 35 DGO', physicalWidthMm: 26.2, physicalHeightMm: 13.8 }, CANON_C70_SOURCE, [mode('canon-c70-super35-4k', '4K Super 35', 4096, 2160, 26.2, 13.8, CANON_C70_SOURCE)], { lifecycle: 'current', lensMounts: ['RF'] }),
  camera('canon.c500-mark-ii', 'Canon', 'EOS C500 Mark II', { name: 'Full Frame 5.9K', physicalWidthMm: 38.1, physicalHeightMm: 20.1 }, CANON_C500_SOURCE, [mode('canon-c500-mark-ii-full-frame', '5.9K Full Frame', 5952, 3140, 38.1, 20.1, CANON_C500_SOURCE), mode('canon-c500-mark-ii-super35', '4K Super 35 Crop', 4096, 2160, 26.2, 13.8, CANON_C500_SOURCE)], { lifecycle: 'legacy', lensMounts: ['EF', 'PL'] }),
  camera('canon.c300-mark-iii', 'Canon', 'EOS C300 Mark III', { name: 'Super 35 DGO', physicalWidthMm: 26.2, physicalHeightMm: 13.8 }, CANON_C300_SOURCE, [mode('canon-c300-mark-iii-super35-4k', '4K Super 35', 4096, 2160, 26.2, 13.8, CANON_C300_SOURCE), mode('canon-c300-mark-iii-super16', '2K Super 16 Crop', 2048, 1080, 12.4, 7.0, CANON_C300_SOURCE)], { lifecycle: 'legacy', lensMounts: ['EF', 'PL'] }),
  camera('canon.r5-c', 'Canon', 'EOS R5 C', FULL_FRAME, CANON_R5C_SOURCE, [mode('canon-r5-c-full-frame-8k', '8K Full Frame 16:9', 8192, 4320, 36, 19.0, CANON_R5C_SOURCE)], { lifecycle: 'current', lensMounts: ['RF'] }),

  camera('blackmagic.ursa-cine-17k-65', 'Blackmagic Design', 'URSA Cine 17K 65', { name: '65 mm RGBW', physicalWidthMm: 51, physicalHeightMm: 24 }, BLACKMAGIC_URSA_CINE_SOURCE, [mode('blackmagic-ursa-cine-17k-65-open-gate', '17K 3:2 Open Gate', 17520, 8040, 51, 24, BLACKMAGIC_URSA_CINE_SOURCE)], { lifecycle: 'current', lensMounts: ['LPL'] }),
  camera('blackmagic.ursa-cine-12k-lf', 'Blackmagic Design', 'URSA Cine 12K LF', { name: 'Large Format RGBW', physicalWidthMm: 36, physicalHeightMm: 24 }, BLACKMAGIC_URSA_CINE_SOURCE, [mode('blackmagic-ursa-cine-12k-lf-open-gate', '12K 3:2 Open Gate', 12288, 8040, 36, 24, BLACKMAGIC_URSA_CINE_SOURCE), mode('blackmagic-ursa-cine-12k-lf-9k', '9K 3:2', 9408, 6264, 27.56, 18.08, BLACKMAGIC_URSA_CINE_SOURCE)], { lifecycle: 'current', lensMounts: ['PL', 'EF'] }),
  camera('blackmagic.pyxis-12k', 'Blackmagic Design', 'PYXIS 12K', { name: 'Full Frame RGBW', physicalWidthMm: 36, physicalHeightMm: 24 }, BLACKMAGIC_PYXIS_SOURCE, [mode('blackmagic-pyxis-12k-open-gate', '12K 3:2 Open Gate', 12288, 8040, 36, 24, BLACKMAGIC_PYXIS_SOURCE)], { lifecycle: 'current', lensMounts: ['L', 'PL', 'EF'] }),
  camera('blackmagic-pyxis-6k', 'Blackmagic Design', 'PYXIS 6K', FULL_FRAME, BLACKMAGIC_PYXIS_SOURCE, [mode('blackmagic-pyxis-6k-open-gate', '6K Open Gate 3:2', 6048, 4032, 36, 24, BLACKMAGIC_PYXIS_SOURCE, { maxFrameRate: 36 })], { lifecycle: 'current', lensMounts: ['L', 'PL', 'EF'] }),
  camera('blackmagic.cinema-camera-6k', 'Blackmagic Design', 'Cinema Camera 6K', FULL_FRAME, BLACKMAGIC_CINEMA_SOURCE, [mode('blackmagic-cinema-camera-6k-open-gate', '6K Open Gate 3:2', 6048, 4032, 36, 24, BLACKMAGIC_CINEMA_SOURCE)], { lifecycle: 'current', lensMounts: ['L'] }),
  camera('blackmagic.ursa-mini-pro-12k', 'Blackmagic Design', 'URSA Mini Pro 12K', { name: 'Super 35 RGBW', physicalWidthMm: 27.03, physicalHeightMm: 14.25 }, BLACKMAGIC_URSA_MINI_SOURCE, [mode('blackmagic-ursa-mini-pro-12k-12k', '12K 17:9', 12288, 6480, 27.03, 14.25, BLACKMAGIC_URSA_MINI_SOURCE), mode('blackmagic-ursa-mini-pro-12k-s16', '6K Super 16 Crop', 6144, 3240, 13.52, 7.13, BLACKMAGIC_URSA_MINI_SOURCE)], { lifecycle: 'legacy', lensMounts: ['PL', 'EF', 'F'] }),

  camera('panasonic.bs1h', 'Panasonic / LUMIX', 'BS1H', { name: 'Full Frame', physicalWidthMm: 35.6, physicalHeightMm: 23.8 }, PANASONIC_BS1H_SOURCE, [mode('panasonic-bs1h-full-frame-6k', '6K Full Area 3:2', 5952, 3968, 35.6, 23.8, PANASONIC_BS1H_SOURCE), mode('panasonic-bs1h-s35-4k', '4K Super 35', 4096, 2160, 23.8, 12.6, PANASONIC_BS1H_SOURCE)], { lifecycle: 'current', lensMounts: ['L'] }),
  camera('panasonic.bgh1', 'Panasonic / LUMIX', 'BGH1', { name: 'Micro Four Thirds', physicalWidthMm: 17.3, physicalHeightMm: 13.0 }, PANASONIC_BGH1_SOURCE, [mode('panasonic-bgh1-mft-4k', '4K 16:9', 4096, 2160, 17.3, 9.1, PANASONIC_BGH1_SOURCE)], { lifecycle: 'current', lensMounts: ['MFT'] }),
  camera('panasonic.eva1', 'Panasonic / LUMIX', 'AU-EVA1', { name: 'Super 35', physicalWidthMm: 24.6, physicalHeightMm: 13.1 }, PANASONIC_EVA1_SOURCE, [mode('panasonic-eva1-5_7k', '5.7K Super 35', 5720, 3016, 24.6, 13.1, PANASONIC_EVA1_SOURCE), mode('panasonic-eva1-4k', '4K 17:9', 4096, 2160, 24.6, 13.0, PANASONIC_EVA1_SOURCE)], { lifecycle: 'legacy', lensMounts: ['EF'] }),
  camera('panasonic.s1h', 'Panasonic / LUMIX', 'S1H', { name: 'Full Frame', physicalWidthMm: 35.6, physicalHeightMm: 23.8 }, PANASONIC_S1H_SOURCE, [mode('panasonic-s1h-full-frame-6k', '6K Full Area 3:2', 5952, 3968, 35.6, 23.8, PANASONIC_S1H_SOURCE), mode('panasonic-s1h-s35-4k', '4K Super 35', 4096, 2160, 23.8, 12.6, PANASONIC_S1H_SOURCE)], { lifecycle: 'legacy', lensMounts: ['L'] }),

  camera('dji.ronin-4d-x9-8k', 'DJI', 'Ronin 4D X9-8K', FULL_FRAME, DJI_RONIN_4D_SOURCE, [mode('dji-ronin-4d-x9-8k-full-frame', '8K Full Frame 17:9', 8192, 4320, 36, 19.0, DJI_RONIN_4D_SOURCE), mode('dji-ronin-4d-x9-8k-2_39', '8K Full Frame 2.39:1', 8192, 3430, 36, 15.1, DJI_RONIN_4D_SOURCE)], { lifecycle: 'current', lensMounts: ['DL', 'L', 'E', 'PL', 'M'] }),
  camera('dji.ronin-4d-x9-6k', 'DJI', 'Ronin 4D X9-6K', FULL_FRAME, DJI_RONIN_4D_SOURCE, [mode('dji-ronin-4d-x9-6k-full-frame', '6K Full Frame 17:9', 6016, 3168, 36, 19.0, DJI_RONIN_4D_SOURCE), mode('dji-ronin-4d-x9-6k-s35', '4K Super 35 2.39:1', 4096, 1716, 24.0, 10.1, DJI_RONIN_4D_SOURCE)], { lifecycle: 'current', lensMounts: ['DL', 'L', 'E', 'PL', 'M'] }),
]

export const CAMERA_MANUFACTURER_ORDER = ['ARRI', 'Sony', 'RED', 'Canon', 'Blackmagic Design', 'Panasonic / LUMIX', 'DJI'] as const
export const CAMERA_MANUFACTURERS: readonly string[] = CAMERA_MANUFACTURER_ORDER.filter((manufacturer) => CAMERA_DATABASE.some((camera) => camera.manufacturer === manufacturer))
export function camerasForManufacturer(manufacturer: string): readonly CameraDefinition[] { return CAMERA_DATABASE.filter((definition) => definition.manufacturer === manufacturer) }
export function resolveCameraDefinition(id: string): CameraDefinition | null { return CAMERA_DATABASE.find((definition) => definition.id === id) ?? null }
export function defaultCaptureModeForDefinition(definition: CameraDefinition): CaptureModeDefinition { return definition.captureModes.find((captureMode) => captureMode.id === definition.defaultCaptureModeId) ?? definition.captureModes[0] }
export function resolveCaptureMode(definition: CameraDefinition, id: string): CaptureModeDefinition { return definition.captureModes.find((captureMode) => captureMode.id === id) ?? defaultCaptureModeForDefinition(definition) }
