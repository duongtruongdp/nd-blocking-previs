export function parseCameraNumber(input: string, minimum: number, maximum: number): number | null {
  const value = Number(input)
  if (!Number.isFinite(value)) return null
  return Math.min(maximum, Math.max(minimum, value))
}

export function formatCameraNumber(value: number): string {
  return String(Number(value.toFixed(3)))
}

export function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180
}

export function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI
}
