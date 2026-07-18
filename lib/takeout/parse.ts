export type SavedPlaceSource = 'takeout_starred' | 'takeout_list' | 'takeout_labeled'

export interface SavedPlaceEntry {
  listName: string
  source: SavedPlaceSource
  title: string
  note: string | null
  lat: number | null
  lng: number | null
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (inQuotes) {
      if (c === '"' && content[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row) }
  return rows
}

function parseCsv(filename: string, content: string): SavedPlaceEntry[] {
  const base = filename.replace(/\.csv$/i, '')
  const isLabeled = /^labeled places$/i.test(base) || base === '已加標籤的地點'
  const source: SavedPlaceSource = isLabeled ? 'takeout_labeled' : 'takeout_list'
  const rows = parseCsvRows(content)
  const [header, ...body] = rows
  if (!header) return []
  const titleIdx = header.findIndex((h) => /^title$/i.test(h.trim()))
  const noteIdx = header.findIndex((h) => /^note$/i.test(h.trim()))
  return body
    .map((cols) => ({
      listName: base,
      source,
      title: (cols[titleIdx] ?? '').trim(),
      note: noteIdx >= 0 && cols[noteIdx]?.trim() ? cols[noteIdx].trim() : null,
      lat: null,
      lng: null,
    }))
    .filter((e) => e.title.length > 0)
}

interface GeoFeature {
  geometry: { coordinates?: [number, number] } | null
  properties?: { Title?: string; Location?: { ['Business Name']?: string } }
}

function parseGeoJson(content: string): SavedPlaceEntry[] {
  const data = JSON.parse(content) as { features?: GeoFeature[] }
  return (data.features ?? [])
    .map((f) => {
      const coords = f.geometry?.coordinates
      const title = f.properties?.Title ?? f.properties?.Location?.['Business Name'] ?? ''
      return {
        listName: '已加星號',
        source: 'takeout_starred' as const,
        title: title.trim(),
        note: null,
        lat: Array.isArray(coords) ? coords[1] : null,
        lng: Array.isArray(coords) ? coords[0] : null,
      }
    })
    .filter((e) => e.title.length > 0)
}

export function parseTakeoutFile(filename: string, content: string): SavedPlaceEntry[] {
  const trimmed = content.trimStart()
  if (/\.json$/i.test(filename) || (trimmed.startsWith('{') && trimmed.includes('FeatureCollection'))) {
    return parseGeoJson(content)
  }
  if (/\.csv$/i.test(filename) || /^title\s*,/i.test(trimmed)) {
    return parseCsv(filename, content)
  }
  throw new Error('無法辨識的檔案格式，請上傳 Google Takeout 匯出的 JSON 或 CSV')
}
