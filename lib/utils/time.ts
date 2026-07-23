// "HH:MM" → minutes since midnight. Shared helper (several modules had private copies).
export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minsToTime(mins: number): string {
  const clamped = Math.max(0, mins)
  return `${String(Math.floor(clamped / 60) % 24).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

export function addMinutes(startTime: string, minutes: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const total = h * 60 + m + minutes
  const clamped = ((total % 1440) + 1440) % 1440  // wrap 0–1439
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}
