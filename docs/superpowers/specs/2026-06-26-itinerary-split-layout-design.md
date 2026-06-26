# Design: Itinerary Split Layout — Per-Day Map on Right

**Date:** 2026-06-26
**Status:** Approved

## Goal

Restructure the itinerary page so each day's schedule cards appear on the left and its Google Maps Embed iframe appears on the right, side by side. The iframe is sticky within its day section, updates when places are reordered/added/deleted.

---

## Layout

Each `ItineraryDay` section becomes a two-column flex layout:

```
第 1 天
┌────────────────────┬──────────────────┐
│ [卡片 1]           │                  │
│ [卡片 2]           │  Google Maps     │
│ [卡片 3]  ← 左欄  │  iframe  ← 右欄 │
│ [卡片 4]   flex-1  │  sticky top-4   │
└────────────────────┴──────────────────┘

第 2 天
┌────────────────────┬──────────────────┐
│ ...                │  Day 2 iframe   │
└────────────────────┴──────────────────┘
```

- The whole page scrolls normally (no independent scroll panels)
- The right-column iframe uses `sticky top-4` so it stays in view while reading that day's cards, then scrolls away with the section when the next day comes into view
- `ItineraryClient.tsx` requires no layout change — the two-column structure lives inside `ItineraryDay`

---

## iframe Update on Drag / Add / Delete

`buildDayEmbedUrl(day.places, mode)` is called in render. When `day.places` changes (drag reorder, add, delete), React detects the new URL and reloads the iframe. No extra mechanism needed — the embed URL is derived directly from the current places array.

---

## Files Changed

**`components/ItineraryDay.tsx`** — single change:

Replace the current layout (cards in a `space-y-3` div, iframe below) with:

```tsx
<section className="mb-12">
  <h2 ...>第 {day.day} 天</h2>
  {day.aiSummary && ...}
  <div className="flex gap-6 items-start">
    {/* Left: place cards */}
    <div className="flex-1 space-y-3">
      {day.places.map((place, i) => <ItineraryCard ... />)}
    </div>
    {/* Right: sticky map */}
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
```

No other files need to change.

---

## Edge Cases

- **1 place in a day** — `buildDayEmbedUrl` returns `''`, iframe hidden, cards render full-width
- **Day with many cards (taller than 500px)** — iframe stays sticky at `top-4` until the section end, exactly the desired behavior
- **Day with few cards (shorter than 500px)** — iframe may overflow the section slightly; acceptable since the next day's section follows immediately below
- **Drag reorder** — `handleDragEnd` updates `day.places` immediately → new URL → iframe reloads with new route order
- **Mobile** — at narrow viewports the flex layout stacks; acceptable for now (mobile not in scope)

---

## Testing

| Area | Test |
|------|------|
| `ItineraryDay` render | existing `__tests__/itinerary-day-embed.test.tsx` already mocks `buildDayEmbedUrl` and checks iframe presence — update mock/assertions for new layout position |
| iframe hidden for 1 place | existing test covers this |
| No regressions | full `npx jest --no-coverage` suite |
