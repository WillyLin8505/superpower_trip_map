# Design: Cross-Day Drag and Drop

**Date:** 2026-06-26
**Status:** Approved

## Goal

Allow users to drag a place card from any day and drop it into any position in any other day. The Google Maps Embed iframe per day already shows waypoints as labeled markers (A, B, C…) in sequence — no extra work needed for numbered map markers.

---

## Architecture

### Current State

Each day has its own `DndContext` + `SortableContext`. Cross-day drag is impossible because `@dnd-kit` only fires `onDragEnd` within the same context.

### New State

One `DndContext` at the top level (in `ItineraryClient`), wrapping all days. Each day section uses:
- `SortableContext` — handles sort order within the day
- `useDroppable` — makes the day a valid drop target when dragging from another day

```
DndContext  (single, in ItineraryClient)
  Day 0:
    SortableContext (items = day0.places ids)
      ItineraryDay dayIdx=0  (useDroppable id="day-0")
        [ItineraryCard × N]  (useSortable — unchanged)
        [sticky iframe]
  Day 1:
    SortableContext (items = day1.places ids)
      ItineraryDay dayIdx=1  (useDroppable id="day-1")
        ...
```

---

## Logic: handleDragEnd

```
findContainer(id: string, days: DayItinerary[]): number
  if id.startsWith('day-'): return parseInt(id.replace('day-', ''))
  for each (day, idx): if day.places.some(p => p.id === id): return idx
  return -1

handleDragEnd(event: DragEndEvent):
  { active, over } = event
  if !over: return

  sourceDayIdx = findContainer(active.id, plan.days)
  targetDayIdx = findContainer(over.id, plan.days)
  if sourceDayIdx === -1 || targetDayIdx === -1: return

  if sourceDayIdx === targetDayIdx:
    // within-day reorder (existing arrayMove logic)
    oldIdx = sourceDay.places.findIndex(p => p.id === active.id)
    newIdx = sourceDay.places.findIndex(p => p.id === over.id)
    if oldIdx === newIdx: return
    newPlaces = arrayMove(sourceDay.places, oldIdx, newIdx)
      .map(p => ({ ...p, travelMinToNext: null }))
    update sourceDayIdx with newPlaces

  else:
    // cross-day move
    movedPlace = sourceDay.places.find(p => p.id === active.id)
    newSourcePlaces = sourceDay.places
      .filter(p => p.id !== active.id)
      .map(p => ({ ...p, travelMinToNext: null }))

    if over.id.startsWith('day-'):
      // dropped on day container → append at end
      newTargetPlaces = [...targetDay.places, { ...movedPlace, travelMinToNext: null }]
    else:
      // dropped on a specific card → insert at that card's index
      overIdx = targetDay.places.findIndex(p => p.id === over.id)
      newTargetPlaces = [...targetDay.places]
      newTargetPlaces.splice(overIdx, 0, { ...movedPlace, travelMinToNext: null })

    update both sourceDayIdx and targetDayIdx
    scheduleRecalc(newPlan)
```

---

## Files Changed

### `app/itinerary/ItineraryClient.tsx`
- Remove `DndContext` from inside the per-day loop
- Add one `DndContext` wrapping all days
- Keep per-day `SortableContext` (still needed for within-day sort)
- Replace `handleDragEnd(event, dayIdx)` with `handleDragEnd(event)` using `findContainer`
- Add `dayIdx` prop to `ItineraryDay`

### `components/ItineraryDay.tsx`
- Add `'use client'` directive
- Add `dayIdx: number` to Props
- Import `useDroppable` from `@dnd-kit/core`
- Wrap the cards `<div>` with the droppable ref: `<div ref={setNodeRef} className="flex-1 space-y-3">`
- The droppable `id` = `"day-${dayIdx}"`

### `components/ItineraryCard.tsx`
- No changes needed (`useSortable` already in place)

---

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Day with 0 places after move | Allowed — empty day renders with no cards, iframe hidden |
| Drag over the day header or iframe | `over` will be the day container id → place appends to end |
| Same place, same position | `oldIdx === newIdx` guard returns early (no state update) |
| Cross-day to empty day | `overIdx` not found (`-1`) → splice at 0 → place becomes first |

**Edge case fix:** if `over.id` is a place ID that doesn't belong to the target day (shouldn't happen with correct droppable setup, but as safety net): fallback to append.

---

## Testing

| Test | File |
|------|------|
| `findContainer` returns correct dayIdx for place id | `__tests__/cross-day-drag.test.ts` (new) |
| `findContainer` returns correct dayIdx for `"day-N"` id | same |
| Same-day reorder still works | same |
| Cross-day move: place removed from source, inserted at target index | same |
| Cross-day move to day container: appended at end | same |
| Empty source day after move | same |
| `travelMinToNext` cleared on both source and target places | same |
| Existing itinerary-day-embed tests still pass | `__tests__/itinerary-day-embed.test.tsx` |
