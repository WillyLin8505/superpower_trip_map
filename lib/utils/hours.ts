export function getTodayHours(openingHours: string[] | null): string | null {
  if (!openingHours || openingHours.length === 0) return null
  // weekday_text: index 0 = Monday, index 6 = Sunday
  // Date.getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const idx = (new Date().getDay() + 6) % 7
  const entry = openingHours[idx]
  if (!entry) return null
  // Strip leading day name (handles both ":" U+003A and "：" U+FF1A)
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  if (!rest) return null
  if (/closed|休息|不營業/i.test(rest)) return '休息'
  return rest
}
