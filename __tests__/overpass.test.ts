import { buildOverpassQuery, overpassElementToRow, fetchOverpassPois } from '@/lib/overpass'

describe('buildOverpassQuery', () => {
  it('includes the category tag filters and the around clause', () => {
    const q = buildOverpassQuery(25, 121, 4000, 'dessert')
    expect(q).toContain('[amenity=cafe]')
    expect(q).toContain('[shop=bakery]')
    expect(q).toContain('around:4000,25,121')
    expect(q).toContain('out center 80')
  })

  it('uses restaurant tags for restaurant', () => {
    const q = buildOverpassQuery(0, 0, 1000, 'restaurant')
    expect(q).toContain('[amenity=restaurant]')
    expect(q).toContain('[amenity=fast_food]')
    expect(q).not.toContain('[amenity=cafe]')
  })
})

describe('overpassElementToRow', () => {
  it('maps a named node with a zh name', () => {
    const row = overpassElementToRow(
      { type: 'node', id: 123, lat: 25, lon: 121, tags: { name: 'Din Tai Fung', 'name:zh': '鼎泰豐', amenity: 'restaurant' } },
      'restaurant',
    )
    expect(row).toMatchObject({
      source: 'osm', source_place_id: 'node/123', name_primary: 'Din Tai Fung', name_zh: '鼎泰豐', lat: 25, lng: 121, category: 'restaurant',
    })
  })

  it('uses way center coordinates', () => {
    const row = overpassElementToRow({ type: 'way', id: 9, center: { lat: 24, lon: 120 }, tags: { name: 'Park' } }, 'attraction')
    expect(row).toMatchObject({ source_place_id: 'way/9', lat: 24, lng: 120 })
  })

  it('returns null for a nameless element', () => {
    expect(overpassElementToRow({ type: 'node', id: 1, lat: 1, lon: 1, tags: { amenity: 'cafe' } }, 'dessert')).toBeNull()
  })

  it('returns null when coordinates are missing', () => {
    expect(overpassElementToRow({ type: 'node', id: 1, tags: { name: 'X' } }, 'dessert')).toBeNull()
  })
})

describe('fetchOverpassPois', () => {
  afterEach(() => {
    const f = global.fetch as unknown as jest.Mock
    if (f && typeof f.mockReset === 'function') f.mockReset()
  })

  it('parses and dedups elements, skipping nameless ones', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        elements: [
          { type: 'node', id: 1, lat: 25, lon: 121, tags: { name: 'A' } },
          { type: 'node', id: 1, lat: 25, lon: 121, tags: { name: 'A' } }, // duplicate id
          { type: 'node', id: 2, lat: 25, lon: 121, tags: { amenity: 'cafe' } }, // nameless
        ],
      }),
    })) as unknown as typeof fetch

    const rows = await fetchOverpassPois(25, 121, 4000, 'restaurant')
    expect(rows).toHaveLength(1)
    expect(rows[0].source_place_id).toBe('node/1')
  })

  it('throws on a non-ok response so the backfill is not cached', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 429 })) as unknown as typeof fetch
    await expect(fetchOverpassPois(25, 121, 4000, 'restaurant')).rejects.toThrow(/overpass_429/)
  })
})
