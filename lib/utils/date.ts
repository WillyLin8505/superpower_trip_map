// 全部以「本地午夜」解析 'YYYY-MM-DD'，避免 UTC 位移
function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, n: number): string {
  const d = parseLocal(iso)
  d.setDate(d.getDate() + n)
  return toIso(d)
}

export function dayDate(startDate: string, dayNumber: number): string {
  return addDays(startDate, dayNumber - 1)
}

// 0=Mon..6=Sun（Monday-first，對齊 openingHours 陣列）
export function weekdayIndex(iso: string): number {
  return (parseLocal(iso).getDay() + 6) % 7
}

const WEEKDAY_TW = ['一', '二', '三', '四', '五', '六', '日']
export function formatDateLabel(iso: string): string {
  const d = parseLocal(iso)
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_TW[weekdayIndex(iso)]}）`
}

export function daysBetween(startIso: string, endIso: string): number {
  const ms = parseLocal(endIso).getTime() - parseLocal(startIso).getTime()
  return Math.floor(ms / 86400000) + 1
}
