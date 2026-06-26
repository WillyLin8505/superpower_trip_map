# Time Picker, Lock Scheduler, and Itinerary Input Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the native time input with a 24h scroll-wheel picker, change time display to start→end format everywhere, upgrade the lock scheduler to backwards-fill before locked cards, and add search + AI-paste entry points to the itinerary page.

**Architecture:** Four independent UI/logic improvements layered onto the existing `ItineraryClient` + `ItineraryCard` + `TimeEditor` stack. The scroll-wheel picker is a new shared component. The scheduler change is a pure logic update inside `scheduleRecalc`. The itinerary page inputs reuse existing server actions (`searchPlace`, `extractItinerary`).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, `@dnd-kit`, no new npm packages.

## Global Constraints

- TypeScript strict — no `any`
- No new npm dependencies
- Traditional Chinese (繁體中文) UI copy throughout
- 24-hour time format everywhere — no AM/PM
- Scroll-wheel picker uses 5-minute steps for minutes (00, 05, 10 … 55)
- All existing 84 tests must continue to pass; new tests required for new logic
- Do not change `ScheduledPlace` type shape (all fields remain the same)

---

## Feature 1: Time Display — "HH:MM → HH:MM"

### What changes

Every `ItineraryCard` now shows the start and end time of a place instead of "停留 N 分鐘":

```
09:00 → 10:30
```

End time = `startTime + durationMin`, computed inline in the component. This applies to:
- Unlocked cards with `onTimeChange` (editable) — clicking either time opens the scroll-wheel picker
- Locked cards (`timeLocked: true`) — static display, no picker
- Cards without `onTimeChange` (read-only) — static display

### Current display (to remove)
- Locked: `{place.startTime} · 停留 {place.durationMin} 分鐘`
- Editable: `<TimeEditor label="開始" …> <TimeEditor label="停留" …>`
- Read-only: `{place.startTime} · 停留 {place.durationMin} 分鐘`

### New display

```tsx
// Import from lib/utils/time.ts
// In ItineraryCard, replace all three display branches with:
{place.timeLocked ? (
  <p className="text-sm text-gray-500">
    {place.startTime} → {addMinutes(place.startTime, place.durationMin)}
  </p>
) : onTimeChange ? (
  <div className="flex items-center gap-1 text-sm">
    <TimeScrollPicker
      value={place.startTime}
      onChange={(v) => onTimeChange(place.id, 'startTime', v)}
    />
    <span className="text-gray-400">→</span>
    <TimeScrollPicker
      value={addMinutes(place.startTime, place.durationMin)}
      onChange={(v) => {
        // Convert end time back to durationMin
        const [eh, em] = v.split(':').map(Number)
        const [sh, sm] = place.startTime.split(':').map(Number)
        const dur = (eh * 60 + em) - (sh * 60 + sm)
        if (dur > 0) onTimeChange(place.id, 'durationMin', dur)
      }}
    />
  </div>
) : (
  <p className="text-sm text-gray-500">
    {place.startTime} → {addMinutes(place.startTime, place.durationMin)}
  </p>
)}
```

---

## Feature 2: 24h Scroll-Wheel Time Picker

### New utility: `lib/utils/time.ts`

```typescript
export function addMinutes(startTime: string, minutes: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function minsToTime(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}
```

`minsToTime` already exists in `app/actions/schedule.ts` (private) — extract it here so both the scheduler and the client can use it.

### New component: `components/TimeScrollPicker.tsx`

Replaces `TimeEditor`. Inline picker with two scroll columns — hours and minutes.

**Props:**
```typescript
interface Props {
  value: string           // "HH:MM" 24h
  onChange: (v: string) => void
}
```

**Behaviour:**
- Clicking the displayed `HH:MM` toggles the picker open/closed
- Picker renders inline below the trigger (not a modal/portal)
- Two columns: hours (00–23) and minutes (00, 05, 10 … 55)
- Each column is a scrollable list; the selected value is centred and highlighted
- Clicking any value selects it immediately and calls `onChange` with the new `"HH:MM"` string
- Clicking outside closes the picker without changing the value
- `useEffect` scroll-into-view centres the current selection when picker opens

**Visual structure:**
```
[09:30]   ← trigger button (text-blue-600 underline, same style as old TimeEditor)

┌────────────────────────┐
│  07  │  20             │
│  08  │  25             │
│▶ 09 ◀│▶ 30 ◀   ← selected row highlighted bg-blue-50
│  10  │  35             │
│  11  │  40             │
└────────────────────────┘
  時      分
```

- Column height: 5 visible rows, `overflow-y-auto`, `scroll-snap-type: y mandatory`
- Each row: `h-8 flex items-center justify-center text-sm cursor-pointer`
- Selected row: `font-semibold text-blue-700 bg-blue-50`
- Hours array: `['00','01',…,'23']`
- Minutes array: `['00','05','10','15','20','25','30','35','40','45','50','55']`

**State:**
```typescript
const [open, setOpen] = useState(false)
const [hours, setHours] = useState(value.split(':')[0])
const [mins, setMins] = useState(value.split(':')[1])
```

On hour or minute select: call `onChange(`${newH}:${newM}`)`, keep picker open so user can also adjust the other column.

Close picker on outside click via `useEffect` with `mousedown` listener on `document`.

### Delete `components/TimeEditor.tsx`

`TimeScrollPicker` fully replaces it. All import sites updated.

---

## Feature 3: Backwards-Fill Scheduler for Locked Cards

### Algorithm

`scheduleRecalc` in `app/itinerary/ItineraryClient.tsx` is rewritten to handle locked cards as time anchors.

**Concept:** Split the day's place array into segments separated by locked cards. Each segment is scheduled independently:

```
[unlocked…] [LOCKED] [unlocked…] [LOCKED] [unlocked…]
     ↑ backwards          ↑ forwards          ↑ backwards
  from LOCKED.start    from LOCKED.end     from LOCKED.start
```

**Algorithm steps for one day:**

```
1. Locate all locked cards and their indices.
2. If no locked cards: schedule forward from 09:00 (existing behaviour).
3. Otherwise:
   a. Split places into segments: segments[0] = places before first lock,
      segments[1] = places between lock[0] and lock[1], etc.,
      segments[last] = places after last lock.
   b. For each LEADING segment (before the first locked card):
      - Schedule backwards from firstLocked.startMin:
        last card in segment ends at firstLocked.startMin,
        each preceding card ends where the next one starts.
      - If the earliest computed startMin < DAY_START (9*60), mark those cards
        with `outsideHours: true` (reuse existing orange border as "早於開始時間" warning).
   c. For each BETWEEN segment (between two locked cards):
      - Schedule forward from leftLocked.endMin.
   d. For each TRAILING segment (after the last locked card):
      - Schedule forward from lastLocked.endMin.
   Summary: Leading → backwards from first lock's start; Between locks → forwards from left lock's end; Trailing → forwards from last lock's end.
```

**Backwards-fill helper:**
```typescript
function scheduleBackwards(
  places: ScheduledPlace[],
  endAtMin: number   // the minute the LAST place in this segment must end by
): ScheduledPlace[] {
  // Walk in reverse: assign end times, derive start times
  let cursor = endAtMin
  return [...places].reverse().map((p) => {
    const endMin = cursor
    const startMin = endMin - p.durationMin
    const startTime = minsToTime(startMin)
    cursor = startMin - (p.travelMinToNext ?? 0)
    return {
      ...p,
      startTime,
      outsideHours: checkOutsideHours(startTime, p.openingHours),
      lateExit: checkLateExit(startTime, p.durationMin, p.openingHours),
    }
  }).reverse()
}
```

**"塞不下" warning:** If any card computed by `scheduleBackwards` has a `startMin < DAY_START`, that card gets `outsideHours: true` (displays existing orange border + "請確認營業時間" badge). No new field needed.

**`timeLocked` cards in `scheduleRecalc`:** Keep startTime and durationMin unchanged (existing behaviour); only recompute `outsideHours` and `lateExit`.

---

## Feature 4: Itinerary Page — Search + Paste Input

### Layout addition in `ItineraryClient.tsx`

Insert above the day list:

```tsx
<section className="mb-6 space-y-3">
  <PlaceSearchBar onAdd={handleAddPlace} />
  <ItineraryPasteInput onPlacesFound={handleAddPlaces} />
</section>
```

### New component: `components/PlaceSearchBar.tsx`

Reuses the existing `searchPlace` server action.

**Props:**
```typescript
interface Props {
  onAdd: (place: Place) => void
}
```

**Behaviour:**
- Text input with placeholder "搜尋景點、餐廳或甜點…"
- On submit (Enter or click 🔍 button): call `searchPlace(query)` from `app/actions/places.ts` → returns `Place | null`
- If found: show result in a small dropdown card (name, address, type badge); clicking it calls `onAdd(place)` and clears the input
- If not found: show "找不到此地點" inline
- Loading state: button shows spinner

**`handleAddPlace` in `ItineraryClient`:**
```typescript
const handleAddPlace = useCallback((place: Place) => {
  const newPlace: ScheduledPlace = {
    ...place,
    startTime: '09:00',
    durationMin: place.type === 'attraction' ? 90 : 60,
    travelMinToNext: null,
    aiDescription: null,
    outsideHours: false,
    lateExit: false,
    timeLocked: false,
  }
  const targetDayIdx = findClosestDay(planRef.current.days, place)
  const newDays = planRef.current.days.map((d, i) =>
    i === targetDayIdx ? { ...d, places: [...d.places, newPlace] } : d
  )
  scheduleRecalc({ ...planRef.current, days: newDays })
}, [scheduleRecalc])
```

**`handleAddPlaces`** (from paste): same logic but for an array of places, each assigned to its own closest day independently.

### Geographic closest-day utility: `lib/utils/geo.ts`

Imports `haversineSeconds` from `lib/haversine.ts` (already exists; takes `{lat, lng}` objects; returns seconds proportional to distance — usable as a distance comparator since speed is constant).

```typescript
import { haversineSeconds } from '@/lib/haversine'
import type { DayItinerary } from '@/lib/types'

// Returns the index of the day whose places' centroid is closest to the given place
export function findClosestDay(
  days: DayItinerary[],
  place: { lat: number; lng: number }
): number {
  if (days.length === 1) return 0
  const distances = days.map((day) => {
    if (day.places.length === 0) return Infinity
    const centroidLat = day.places.reduce((s, p) => s + p.lat, 0) / day.places.length
    const centroidLng = day.places.reduce((s, p) => s + p.lng, 0) / day.places.length
    return haversineSeconds({ lat: centroidLat, lng: centroidLng }, place)
  })
  return distances.indexOf(Math.min(...distances))
}
```

---

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `lib/utils/time.ts` | Create | `addMinutes`, `minsToTime` shared utilities |
| `lib/utils/geo.ts` | Create | `findClosestDay` centroid distance |
| `components/TimeScrollPicker.tsx` | Create | New 24h scroll-wheel picker |
| `components/TimeEditor.tsx` | Delete | Replaced by TimeScrollPicker |
| `components/ItineraryCard.tsx` | Modify | New time display, use TimeScrollPicker |
| `components/PlaceSearchBar.tsx` | Create | Search box for itinerary page |
| `app/itinerary/ItineraryClient.tsx` | Modify | Backwards-fill recalc, new handlers, SearchBar + PasteInput |
| `__tests__/time-scroll-picker.test.tsx` | Create | Picker open/close, value selection, onChange |
| `__tests__/schedule-backwards.test.ts` | Create | Backwards-fill algorithm unit tests |
| `__tests__/find-closest-day.test.ts` | Create | Centroid distance tests |
| `__tests__/itinerary-card-info.test.tsx` | Modify | Update time display assertions |
