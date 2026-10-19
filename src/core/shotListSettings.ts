export const SHOT_LIST_COLUMNS = ['thumbnail', 'scene', 'shot', 'camera', 'lens', 'shotSize', 'angle', 'movement', 'equipment', 'duration', 'notes'] as const
export type ShotListColumn = typeof SHOT_LIST_COLUMNS[number]

export type ShotListSettings = {
  visibleColumns: ShotListColumn[]
  shotSizeOptions: string[]
  angleOptions: string[]
  movementOptions: string[]
  equipmentOptions: string[]
}

export const DEFAULT_SHOT_SIZE_OPTIONS = ['CU', 'MCU', 'ECU', 'MS', 'FS', 'LS', 'MLS', 'ELS', 'WS', 'CU (OTS)', 'MCU (OTS)', 'ECU (OTS)', 'MS (OTS)', 'WS -> MS', 'MS -> WS', 'CU -> MS', 'MS -> CU'] as const
export const DEFAULT_ANGLE_OPTIONS = ['Eyelevel', 'Low Angle', 'High Angle', 'Extreme Low', 'Extreme High', 'Dutch Tilt', 'POV', 'Top Down', 'Cowboy', 'Ground Level', 'Profile', 'Hip Level'] as const
export const DEFAULT_MOVEMENT_OPTIONS = ['Static', 'Pan', 'Tilt', 'Pedestal', 'Dolly', 'Track', 'Arc', 'Steadicam', 'Handheld', 'Crane / Boom', 'Tracking Shot', 'Zoom', 'Rack Focus', 'Crash Zoom', 'Dolly Zoom', 'Breathing'] as const
export const DEFAULT_EQUIPMENT_OPTIONS = ['Handheld', 'Hihat', 'Jib Arm', 'Dolly', 'Steadicam', 'Movi', 'Technocrane', 'Condor', 'Cherry Picker', 'Camera Car', 'Drone', 'Helicam', 'Tripod', 'Gimbal'] as const

export const DEFAULT_SHOT_LIST_SETTINGS: ShotListSettings = {
  visibleColumns: [...SHOT_LIST_COLUMNS],
  shotSizeOptions: [...DEFAULT_SHOT_SIZE_OPTIONS],
  angleOptions: [...DEFAULT_ANGLE_OPTIONS],
  movementOptions: [...DEFAULT_MOVEMENT_OPTIONS],
  equipmentOptions: [...DEFAULT_EQUIPMENT_OPTIONS],
}

export function createDefaultShotListSettings(): ShotListSettings {
  return {
    visibleColumns: [...DEFAULT_SHOT_LIST_SETTINGS.visibleColumns],
    shotSizeOptions: [...DEFAULT_SHOT_LIST_SETTINGS.shotSizeOptions],
    angleOptions: [...DEFAULT_SHOT_LIST_SETTINGS.angleOptions],
    movementOptions: [...DEFAULT_SHOT_LIST_SETTINGS.movementOptions],
    equipmentOptions: [...DEFAULT_SHOT_LIST_SETTINGS.equipmentOptions],
  }
}

export function normalizeShotListSettings(value: unknown): ShotListSettings {
  const record = isRecord(value) ? value : {}
  const visibleColumns = uniqueColumns(record.visibleColumns)
  return {
    visibleColumns: visibleColumns.includes('shot') ? visibleColumns : [...visibleColumns, 'shot'],
    shotSizeOptions: normalizeOptions(record.shotSizeOptions, DEFAULT_SHOT_SIZE_OPTIONS),
    angleOptions: normalizeOptions(record.angleOptions, DEFAULT_ANGLE_OPTIONS),
    movementOptions: normalizeOptions(record.movementOptions, DEFAULT_MOVEMENT_OPTIONS),
    equipmentOptions: normalizeOptions(record.equipmentOptions, DEFAULT_EQUIPMENT_OPTIONS),
  }
}

export function updateShotListOption(settings: ShotListSettings, field: keyof Pick<ShotListSettings, 'shotSizeOptions' | 'angleOptions' | 'movementOptions' | 'equipmentOptions'>, index: number, value: string): ShotListSettings | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const options = settings[field]
  if (index < 0 || index >= options.length) return null
  if (options.some((option, optionIndex) => optionIndex !== index && option.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) return null
  return { ...settings, [field]: options.map((option, optionIndex) => optionIndex === index ? trimmed : option) }
}

export function addShotListOption(settings: ShotListSettings, field: keyof Pick<ShotListSettings, 'shotSizeOptions' | 'angleOptions' | 'movementOptions' | 'equipmentOptions'>, value: string): ShotListSettings | null {
  const trimmed = value.trim()
  if (!trimmed || settings[field].some((option) => option.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) return null
  return { ...settings, [field]: [...settings[field], trimmed] }
}

export function removeShotListOption(settings: ShotListSettings, field: keyof Pick<ShotListSettings, 'shotSizeOptions' | 'angleOptions' | 'movementOptions' | 'equipmentOptions'>, index: number): ShotListSettings | null {
  if (index < 0 || index >= settings[field].length) return null
  return { ...settings, [field]: settings[field].filter((_, optionIndex) => optionIndex !== index) }
}

function normalizeOptions(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const values = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
  return uniqueStrings(values)
}

function uniqueColumns(value: unknown): ShotListColumn[] {
  if (!Array.isArray(value)) return [...SHOT_LIST_COLUMNS]
  return SHOT_LIST_COLUMNS.filter((column) => value.includes(column))
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
