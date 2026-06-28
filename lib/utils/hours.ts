import { weekdayIndex } from '@/lib/utils/date'

function entryFor(openingHours: string[] | null, dateIso: string): string | null {
  if (!openingHours || openingHours.length === 0) return null
  return openingHours[weekdayIndex(dateIso)] ?? null
}

export function getHoursForDate(openingHours: string[] | null, dateIso: string): string | null {
  const entry = entryFor(openingHours, dateIso)
  if (!entry) return null
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  if (!rest) return null
  if (/closed|休息|不營業/i.test(rest)) return '休息'
  return rest
}

function getCloseMin(openingHours: string[] | null, dateIso: string): number | null {
  const entry = entryFor(openingHours, dateIso)
  if (!entry) return null
  if (/closed|休息|不營業/i.test(entry)) return null
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  const match = rest.match(/^.+?[–-]\s*(.+)$/)
  if (!match) return null
  const closeStr = match[1].trim()
  const ampm = closeStr.match(/^(\d+):(\d+)\s*([AP]M)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    if (ampm[3].toUpperCase() === 'PM' && h !== 12) h += 12
    if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const plain = closeStr.match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1], 10) * 60 + parseInt(plain[2], 10)
  return null
}

function getOpenMin(openingHours: string[] | null, dateIso: string): number | null {
  const entry = entryFor(openingHours, dateIso)
  if (!entry) return null
  if (/closed|休息|不營業/i.test(entry)) return null
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  const match = rest.match(/^(.+?)\s*[–-]/)
  if (!match) return null
  const openStr = match[1].trim()
  const ampm = openStr.match(/^(\d+):(\d+)\s*([AP]M)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    if (ampm[3].toUpperCase() === 'PM' && h !== 12) h += 12
    if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const plain = openStr.match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1], 10) * 60 + parseInt(plain[2], 10)
  return null
}

export function checkOutsideHours(startTime: string, openingHours: string[] | null, dateIso: string): boolean {
  const entry = entryFor(openingHours, dateIso)
  if (!entry) return false
  if (/closed|休息|不營業/i.test(entry)) return true
  const openMin = getOpenMin(openingHours, dateIso)
  const closeMin = getCloseMin(openingHours, dateIso)
  if (openMin === null || closeMin === null) return false
  const [sh, sm] = startTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  return startMin < openMin || startMin >= closeMin
}

export function checkLateExit(startTime: string, durationMin: number, openingHours: string[] | null, dateIso: string): boolean {
  const closeMin = getCloseMin(openingHours, dateIso)
  if (closeMin === null) return false
  const [h, m] = startTime.split(':').map(Number)
  return h * 60 + m + durationMin > closeMin
}
