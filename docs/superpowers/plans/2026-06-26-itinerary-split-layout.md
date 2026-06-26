# Itinerary Split Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move each day's Google Maps Embed iframe from below the place cards to the right side of the cards, with `sticky top-4` so it stays visible while scrolling through that day's itinerary.

**Architecture:** Single file change in `components/ItineraryDay.tsx` — replace a vertical stack (cards then iframe below) with a horizontal flex (cards left, iframe sticky right). No new components, no data changes, no API changes.

**Tech Stack:** React, Tailwind CSS, existing `buildDayEmbedUrl` from `lib/utils/mapUrl.ts`.

## Global Constraints

- All tests in `__tests__/` matching `testMatch: ['<rootDir>/__tests__/**/*.{ts,tsx}']`
- No new npm dependencies
- Traditional Chinese UI copy unchanged
- iframe `title` must remain exactly `第 ${day.day} 天路線地圖` (existing tests depend on it)
- iframe `height` changes from `"400"` to `"500"`
- `mb-8` on section changes to `mb-12` to give breathing room between days

---

### Task 1: Move iframe to right-side sticky column in ItineraryDay

**Files:**
- Modify: `components/ItineraryDay.tsx`
- Test: `__tests__/itinerary-day-embed.test.tsx` (existing — must still pass, no changes needed)

**Interfaces:**
- Consumes: `buildDayEmbedUrl(places: ScheduledPlace[], mode: TransportMode): string` from `@/lib/utils/mapUrl` (unchanged)
- Produces: updated `ItineraryDay` component — same props interface, same iframe title, different DOM structure

---

- [ ] **Step 1: Run existing tests to confirm baseline**

```bash
npx jest __tests__/itinerary-day-embed.test.tsx --no-coverage
```

Expected: 3 tests pass. This is the baseline — the same 3 tests must pass after the change.

- [ ] **Step 2: Update `components/ItineraryDay.tsx`**

Replace the entire file with:

```tsx
import { ItineraryCard } from './ItineraryCard'
import { buildDayEmbedUrl } from '@/lib/utils/mapUrl'
import type { DayItinerary, TransportMode } from '@/lib/types'

interface Props {
  day: DayItinerary
  mode: TransportMode
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
}

export function ItineraryDay({ day, mode, draggable, onTimeChange }: Props) {
  const embedUrl = buildDayEmbedUrl(day.places, mode)

  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold text-gray-800 mb-1">第 {day.day} 天</h2>
      {day.aiSummary && <p className="text-sm text-gray-500 mb-4">{day.aiSummary}</p>}
      <div className="flex gap-6 items-start">
        <div className="flex-1 space-y-3">
          {day.places.map((place, i) => (
            <ItineraryCard
              key={place.id}
              place={place}
              index={i}
              draggable={draggable}
              onTimeChange={onTimeChange}
            />
          ))}
        </div>
        {embedUrl && (
          <div className="w-96 shrink-0 sticky top-4 rounded-xl overflow-hidden border border-gray-200">
            <iframe
              src={embedUrl}
              width="100%"
              height="500"
              style={{ border: 0 }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              title={`第 ${day.day} 天路線地圖`}
            />
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Run existing embed tests to verify they still pass**

```bash
npx jest __tests__/itinerary-day-embed.test.tsx --no-coverage
```

Expected: 3 tests pass (iframe present for 2+ places, absent for 1 place, mode passed correctly).

- [ ] **Step 4: Run full suite to check for regressions**

```bash
npx jest --no-coverage 2>&1 | tail -6
```

Expected: all tests pass (same count as before — 31 passing).

- [ ] **Step 5: Commit**

```bash
git add components/ItineraryDay.tsx
git commit -m "feat: move per-day map iframe to sticky right column"
```
