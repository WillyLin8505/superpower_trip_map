import { buildDistanceMatrix } from '@/app/actions/directions'
import type { Place } from '@/lib/types'

function p(name: string, lat = 0, lng = 0): Place {
  return { id: name, placeId: name, name, type: 'attraction', lat, lng, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null }
}

const origFetch = global.fetch
afterEach(() => { global.fetch = origFetch })

it('parses Google distance.value into a meters matrix', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: 'OK',
      rows: [
        { elements: [{ status: 'OK', duration: { value: 0 }, distance: { value: 0 } }, { status: 'OK', duration: { value: 600 }, distance: { value: 5000 } }] },
        { elements: [{ status: 'OK', duration: { value: 600 }, distance: { value: 5000 } }, { status: 'OK', duration: { value: 0 }, distance: { value: 0 } }] },
      ],
    }),
  }) as unknown as typeof fetch
  const res = await buildDistanceMatrix([p('A'), p('B', 0, 0.05)], 'driving')
  expect(res.matrix[0][1]).toBe(600)
  expect(res.distances?.[0]?.[1]).toBe(5000)
})

it('falls back to haversine meters when an element has no distance', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: 'OK',
      rows: [
        { elements: [{ status: 'OK', duration: { value: 0 } }, { status: 'ZERO_RESULTS', duration: { value: 0 } }] },
        { elements: [{ status: 'ZERO_RESULTS', duration: { value: 0 } }, { status: 'OK', duration: { value: 0 } }] },
      ],
    }),
  }) as unknown as typeof fetch
  // 0.01° lng ≈ 1113m straight-line
  const res = await buildDistanceMatrix([p('A', 0, 0), p('B', 0, 0.01)], 'driving')
  expect(res.distances?.[0]?.[1]).toBeGreaterThan(1000)
})

it('includes a haversine distances matrix on API failure', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
  const res = await buildDistanceMatrix([p('A', 0, 0), p('B', 0, 0.01)], 'driving')
  expect(res.distances?.[0]?.[1]).toBeGreaterThan(1000)
})
