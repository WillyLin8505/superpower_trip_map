# 甜點類別 + 時間鎖定 + 超出營業時間提醒 Design Spec

## Goal

Three additive features on the itinerary card system:

1. **甜點 category** — a third `PlaceType` alongside 景點 and 餐廳, with its own color.
2. **Time lock** — a per-card lock toggle that prevents `startTime` and `durationMin` from being overwritten by the auto-recalculator.
3. **Late-exit warning** — a warning when `startTime + durationMin` exceeds the place's closing time (distinct from the existing "starts outside hours" warning).

---

## Data Model Changes (`lib/types.ts`)

```typescript
export type PlaceType = 'attraction' | 'restaurant' | 'dessert'

export interface ScheduledPlace extends Place {
  startTime: string
  durationMin: number
  travelMinToNext: number | null
  aiDescription: string | null
  outsideHours: boolean   // existing: startTime falls outside open hours
  lateExit: boolean       // NEW: startTime + durationMin exceeds closing time
  timeLocked: boolean     // NEW: recalc skips this place's startTime + durationMin
}
```

All existing code that constructs `ScheduledPlace` must set `lateExit: false` and `timeLocked: false`.

---

## Feature 1: 甜點 Category

### Type union
`PlaceType = 'attraction' | 'restaurant' | 'dessert'`

### Default dwell time
`DWELL['dessert'] = 60` in `app/actions/schedule.ts`.

### Badge colors (`components/ItineraryCard.tsx`)
| type | bg | text |
|------|----|------|
| attraction | `bg-blue-100` | `text-blue-700` |
| restaurant | `bg-orange-100` | `text-orange-700` |
| dessert | `bg-pink-100` | `text-pink-700` |

Label: 景點 / 餐廳 / **甜點**

### Scheduler placement (`app/actions/schedule.ts`)
Dessert is treated like a restaurant for day-split purposes — it is NOT forced to lunch (12:00) or dinner (18:00) slots. It fills in at the next available cursor position.

### Batch paste extraction (`components/ItineraryPasteInput.tsx` + `app/actions/ai.ts`)
The Claude prompt for `extractItinerary` must list all three types:
```
type: "attraction" | "restaurant" | "dessert"
```
Validation in `ItineraryPasteInput` must accept `'dessert'` as a valid type.

---

## Feature 2: Time Lock

### Toggle UX
A lock icon button sits in the top-right corner of each `ItineraryCard`. Clicking it calls `onToggleLock(placeId)`. The icon renders:
- 🔓 (unlocked, gray) when `timeLocked: false`
- 🔒 (locked, blue) when `timeLocked: true`

### Effect on editors
When `timeLocked: true`, the `TimeEditor` inputs for start time and duration are replaced with static `<p>` text (same values, but non-editable). The user must unlock before editing.

### Effect on `scheduleRecalc` (`app/itinerary/ItineraryClient.tsx`)
```
cursor = 9 * 60
for each place in day:
  if timeLocked:
    // anchor: do not change startTime or durationMin
    cursor = hhmm_to_mins(place.startTime) + place.durationMin + (travelMinToNext ?? 0)
  else:
    place.startTime = mins_to_hhmm(cursor)
    cursor += place.durationMin + (travelMinToNext ?? 0)
```
Locked places anchor the timeline. Unlocked places before a locked one fill in from whatever the cursor is at; they do not try to "avoid" the locked place — the recalc is purely sequential.

### Prop changes
- `ItineraryCard` gains `onToggleLock?: (placeId: string) => void`
- `ItineraryDay` gains `onToggleLock?: (placeId: string) => void` (passes through)
- `ItineraryClient` implements `handleToggleLock(dayIdx, placeId)` which flips `timeLocked` and calls `scheduleRecalc`

### New places
`timeLocked: false` for all newly added places (from `RecommendPanel` and initial scheduling).

---

## Feature 3: Late-Exit Warning

### Logic (`lib/utils/hours.ts`)
Add a new exported function:

```typescript
export function checkLateExit(
  startTime: string,      // "HH:MM"
  durationMin: number,
  openingHours: string[] | null
): boolean
```

Returns `true` when `startTime + durationMin` (in minutes) exceeds the closing time parsed from `openingHours` for today. Returns `false` if `openingHours` is null, empty, or unparseable.

The existing `isOutsideHours` function in `app/actions/schedule.ts` stays in place for now (it's a server-side private function). The new `checkLateExit` is a pure client/server-shared utility.

### Bug fix: recalc doesn't recompute warnings
`scheduleRecalc` in `ItineraryClient.tsx` currently spreads `...p`, which preserves stale `outsideHours` and will preserve stale `lateExit`. Fix: after computing the new `startTime`, call `checkLateExit` to set the correct `lateExit` value. `outsideHours` is already set at schedule time (server-side) and is less dynamic, so it is left as-is in the client recalc — fixing only `lateExit` for the client-side case is sufficient for this spec.

### Card UI
When `lateExit: true`, show below the existing `outsideHours` warning:
```
⚠ 結束時間超出營業時間
```
Same orange style (`text-xs text-orange-600 font-medium`). Both warnings can show simultaneously if both conditions are true.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/types.ts` | Add `'dessert'` to `PlaceType`; add `lateExit` and `timeLocked` to `ScheduledPlace` |
| `lib/utils/hours.ts` | Add `checkLateExit` |
| `app/actions/schedule.ts` | Add `DWELL['dessert'] = 60`; set `lateExit` and `timeLocked` on each scheduled place |
| `app/actions/ai.ts` | Update `extractItinerary` prompt to include `dessert` type |
| `components/ItineraryCard.tsx` | Add dessert color; lock icon toggle; replace TimeEditors with static text when locked; `lateExit` warning |
| `components/ItineraryDay.tsx` | Pass `onToggleLock` through to `ItineraryCard` |
| `components/ItineraryPasteInput.tsx` | Accept `'dessert'` as valid type |
| `components/RecommendPanel.tsx` | Set `lateExit: false`, `timeLocked: false` on new places |
| `app/itinerary/ItineraryClient.tsx` | Add `handleToggleLock`; update `scheduleRecalc` for lock + `lateExit` |
| `app/test-drag/page.tsx` | Set `lateExit: false`, `timeLocked: false` on fixture places |

---

## Testing

### Unit tests (Jest)
- `__tests__/today-hours.test.ts` — extend with `checkLateExit` cases: null input, end within hours, end exactly at close (not late), end after close (late), unparseable format
- `__tests__/itinerary-card-info.test.tsx` — add: lock icon renders, clicking lock calls `onToggleLock`, TimeEditors hidden when locked, `lateExit` warning text renders

### Full suite
`npx jest --no-coverage` must pass after each task.

---

## Out of Scope

- Per-field locking (start-only or duration-only lock) — single toggle covers both
- Sorting/filtering by type — not requested
- Changing the closing-time check for `outsideHours` (start-before-open already works correctly)
- Conflict detection between a locked place and surrounding unlocked places — sequential cursor handles it implicitly
