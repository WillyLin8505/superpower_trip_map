export function getTodayHours(openingHours: string[] | null): string | null {
  if (!openingHours || openingHours.length === 0) return null
  const idx = (new Date().getDay() + 6) % 7
  const entry = openingHours[idx]
  if (!entry) return null
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  if (!rest) return null
  if (/closed|休息|不營業/i.test(rest)) return '休息'
  return rest
}

function getCloseMin(openingHours: string[] | null): number | null {
  if (!openingHours || openingHours.length === 0) return null
  const idx = (new Date().getDay() + 6) % 7
  const entry = openingHours[idx]
  if (!entry) return null
  if (/closed|休息|不營業/i.test(entry)) return null
  // Strip day name prefix (handles ":" U+003A and "：" U+FF1A)
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  // Match "open – close" using en-dash or hyphen; capture the close part
  const match = rest.match(/^.+?[–-]\s*(.+)$/)
  if (!match) return null
  const closeStr = match[1].trim()
  // AM/PM format: "5:00 PM"
  const ampm = closeStr.match(/^(\d+):(\d+)\s*([AP]M)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    const period = ampm[3].toUpperCase()
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  // 24h format: "17:00"
  const plain = closeStr.match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1], 10) * 60 + parseInt(plain[2], 10)
  return null
}

export function checkLateExit(
  startTime: string,
  durationMin: number,
  openingHours: string[] | null
): boolean {
  const closeMin = getCloseMin(openingHours)
  if (closeMin === null) return false
  const [h, m] = startTime.split(':').map(Number)
  const endMin = h * 60 + m + durationMin
  return endMin > closeMin
}
