import { isRemoveDuplicatesInstruction, findDuplicateRemovals } from '@/lib/utils/dedupePlaces'
import { applyChanges } from '@/lib/utils/rearrangeChanges'
import type { PlanResult, ScheduledPlace } from '@/lib/types'

function sp(overrides: Partial<ScheduledPlace> & { id: string }): ScheduledPlace {
  return {
    placeId: `place-${overrides.id}`,
    name: 'Place',
    type: 'attraction',
    lat: 35.68,
    lng: 139.76,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    description: null,
    startTime: '09:00',
    durationMin: 60,
    travelMinToNext: null,
    aiDescription: null,
    outsideHours: false,
    lateExit: false,
    startLocked: false,
    durationLocked: false,
    ...overrides,
  }
}

function plan(days: ScheduledPlace[][]): PlanResult {
  return {
    days: days.map((places, i) => ({
      day: i + 1,
      places,
      aiSummary: null,
      dayStart: '09:00',
      dayEnd: '21:00',
    })),
    transportMode: 'walking',
    startDate: '2026-07-01',
  }
}

describe('isRemoveDuplicatesInstruction', () => {
  it('recognizes typed remove-duplicates intent (zh + en)', () => {
    expect(isRemoveDuplicatesInstruction('刪掉重複的')).toBe(true)
    expect(isRemoveDuplicatesInstruction('刪除重複行程')).toBe(true)
    expect(isRemoveDuplicatesInstruction('把重複的地點移除')).toBe(true)
    expect(isRemoveDuplicatesInstruction('remove duplicates')).toBe(true)
    expect(isRemoveDuplicatesInstruction('dedupe')).toBe(true)
  })

  it('does not treat a normal rearrange instruction as remove-duplicates', () => {
    expect(isRemoveDuplicatesInstruction('第二天太滿，分一些到第三天')).toBe(false)
    expect(isRemoveDuplicatesInstruction('把淺草寺移到第三天')).toBe(false)
    expect(isRemoveDuplicatesInstruction('')).toBe(false)
  })
})

describe('findDuplicateRemovals', () => {
  it('proposes removing the later copy of a place duplicated across days', () => {
    const p = plan([
      [sp({ id: 'a1', placeId: 'X', name: '淺草寺' })],
      [sp({ id: 'a2', placeId: 'X', name: '淺草寺' })],
    ])
    const changes = findDuplicateRemovals(p)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      kind: 'remove',
      instanceId: 'a2',
      day: 2,
      keptDay: 1,
      placeName: '淺草寺',
    })
    expect(changes[0].id).toBe('remove-a2')
  })

  it('returns no removals when there are no duplicates', () => {
    const p = plan([
      [
        sp({ id: 'a', placeId: 'X', name: '晴空塔', lat: 35.71, lng: 139.81 }),
        sp({ id: 'b', placeId: 'Y', name: '明治神宮', lat: 35.676, lng: 139.699 }),
      ],
    ])
    expect(findDuplicateRemovals(p)).toEqual([])
  })

  it('keeps a locked copy and removes the unlocked duplicate', () => {
    const p = plan([
      [sp({ id: 'a1', placeId: 'X' })],
      [sp({ id: 'a2', placeId: 'X', startLocked: true })],
    ])
    const changes = findDuplicateRemovals(p)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ instanceId: 'a1', keptDay: 2 })
  })

  it('merges same-name pins at the same spot even with different place ids', () => {
    const p = plan([
      [sp({ id: 'a1', placeId: 'osm:1', name: 'Le Pain Quotidien', lat: 35.6812, lng: 139.7671 })],
      [sp({ id: 'a2', placeId: 'ChIJabc', name: 'Le Pain Quotidien', lat: 35.6812, lng: 139.7671 })],
    ])
    expect(findDuplicateRemovals(p)).toHaveLength(1)
  })

  it('does NOT merge same-name pins that are far apart (different branches)', () => {
    const p = plan([
      [sp({ id: 'a1', placeId: 'ChIJ_shibuya', name: 'Starbucks', lat: 35.6595, lng: 139.7005 })],
      [sp({ id: 'a2', placeId: 'ChIJ_ueno', name: 'Starbucks', lat: 35.7138, lng: 139.777 })],
    ])
    expect(findDuplicateRemovals(p)).toEqual([])
  })

  it('removes all but one for a triplicated place, keeping the earliest', () => {
    const p = plan([
      [sp({ id: 'a1', placeId: 'X' }), sp({ id: 'a2', placeId: 'X' })],
      [sp({ id: 'a3', placeId: 'X' })],
    ])
    const changes = findDuplicateRemovals(p)
    expect(changes).toHaveLength(2)
    expect(changes.map((c) => c.instanceId).sort()).toEqual(['a2', 'a3'])
  })
})

describe('applyChanges with remove', () => {
  it('drops the targeted duplicate instance and keeps the rest intact', () => {
    const p = plan([
      [sp({ id: 'a1', placeId: 'X', name: '淺草寺' })],
      [sp({ id: 'a2', placeId: 'X', name: '淺草寺' }), sp({ id: 'b', placeId: 'Y' })],
    ])
    const changes = findDuplicateRemovals(p)
    const next = applyChanges(p, changes)
    const ids = next.days.flatMap((d) => d.places.map((x) => x.id))
    expect(ids).toEqual(['a1', 'b'])
  })
})
