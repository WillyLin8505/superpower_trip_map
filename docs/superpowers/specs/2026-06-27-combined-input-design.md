# Combined Smart Input Design

**Goal:** Replace `PlaceSearchBar` + `ItineraryPasteInput` on the `/itinerary` page with a single `CombinedInput` component that auto-detects whether the user is searching for a place, pasting article text, or pasting a URL.

**Scope:** Only the `/itinerary` page input section. `ItineraryPasteInput` on the home page (`/`) is unchanged.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS. No new npm packages.

---

## Auto-Detection Logic

Detection runs on submit (button click or Enter), not while typing. Priority order:

| Condition | Mode | Action |
|-----------|------|--------|
| Matches `^https?://` | URL | `scrapeText(url)` → `extractItinerary(scraped text)` → verify each place via `searchPlace` |
| `text.length > 150` OR text contains `\n` | Article | `extractItinerary(text)` → verify each place via `searchPlace` |
| Everything else | Search | `searchPlace(query)` → return single `Place` |

The URL and article paths share the same verification pipeline already used by `ItineraryPasteInput`.

---

## Component: `components/CombinedInput.tsx`

### Props

```typescript
interface Props {
  onAdd: (place: Place) => void           // single result — Google Places mode
  onAddPlaces: (places: Place[]) => void  // multiple results — URL / article mode
}
```

### State

```typescript
type Phase = 'idle' | 'loading' | 'confirm-country' | 'verifying' | 'result'
```

- `text: string` — textarea value
- `phase: Phase`
- `detectedMode: 'search' | 'article' | 'url' | null` — shown as hint badge while typing
- `singleResult: Place | null` — populated in Google Places mode after successful search
- `extracted: Array<{ name: string; type: PlaceType }>` — from `extractItinerary`
- `detectedCountry: string | null`
- `selectedCountryName: string`
- `verifyProgress: { done: number; total: number }`

### Mode badge (computed on each keystroke)

```typescript
function detectMode(text: string): 'search' | 'article' | 'url' | null {
  if (!text.trim()) return null
  if (/^https?:\/\//.test(text.trim())) return 'url'
  if (text.length > 150 || text.includes('\n')) return 'article'
  return 'search'
}
```

Badge renders below the textarea when `detectedMode` is not null:
- `url` → `🔗 分析網址`
- `article` → `📄 分析文章`
- `search` → `🔍 搜尋地點`

### UI structure

```
┌──────────────────────────────────────────┐
│ textarea (rows=3)                        │
│ placeholder: 搜尋地點、貼上行程文字，或貼上網址... │
└──────────────────────────────────────────┘
  🔍 搜尋地點          ← mode badge (computed)
[ 送出 ]              ← button, disabled when text empty or loading
```

### Phase rendering

- **`idle`** — show textarea + badge + button
- **`loading`** — textarea disabled, button shows `分析中...`
- **`confirm-country`** — same as existing `ItineraryPasteInput`: country selector dropdown (same `COUNTRIES` array) + 繼續分析 button
- **`verifying`** — `驗證地點中... {done} / {total}`
- **`result`** (Google Places mode only) — show result card (name, address, type badge); clicking adds the place via `onAdd` and resets to `idle`; if `searchPlace` returns null, show `找不到此地點`

### Submit handler

```typescript
async function handleSubmit() {
  const trimmed = text.trim()
  if (!trimmed) return
  const mode = detectMode(trimmed)
  setPhase('loading')

  if (mode === 'url') {
    const scraped = await scrapeText(trimmed)
    if (!scraped) { setPhase('idle'); return }
    await runExtract(scraped)
  } else if (mode === 'article') {
    await runExtract(trimmed)
  } else {
    // Google Places search
    const found = await searchPlace(trimmed)
    if (!found) { setSingleResult(null); setPhase('result'); return }
    setSingleResult(found)
    setPhase('result')
  }
}
```

`runExtract` reuses the same logic as `ItineraryPasteInput.handleAnalyze`:
1. Call `extractItinerary(text)`
2. If country detected → immediately call `runVerify(places, country)`
3. If no country → transition to `confirm-country` phase
4. `runVerify` calls `searchPlace(name, countryName)` for each place in parallel, collecting `Place[]`, then calls `onAddPlaces(valid)` and resets

### Reset

After `onAdd` or `onAddPlaces` is called, reset all state to `idle` with empty `text`.

---

## ItineraryClient.tsx changes

In `app/itinerary/ItineraryClient.tsx`:

1. Remove imports of `PlaceSearchBar` and `ItineraryPasteInput`
2. Add import of `CombinedInput`
3. Replace the `<section>` containing both components:

```tsx
<section className="mb-6">
  <CombinedInput onAdd={handleAddPlace} onAddPlaces={handleAddPlaces} />
</section>
```

`handleAddPlace` and `handleAddPlaces` are already implemented from the previous plan — no changes needed.

---

## Global Constraints

- TypeScript strict — no `any`
- No new npm dependencies
- Traditional Chinese UI copy throughout
- `PlaceSearchBar` component file is kept (not deleted) — only removed from `ItineraryClient.tsx`
- `ItineraryPasteInput` on `app/page.tsx` is untouched

---

## Files Changed

| File | Action |
|------|--------|
| `components/CombinedInput.tsx` | Create |
| `app/itinerary/ItineraryClient.tsx` | Modify — swap two components for CombinedInput |

---

## Tests

One test file: `__tests__/combined-input.test.tsx`

Mock `scrapeText`, `extractItinerary`, and `searchPlace`. Test:
1. Short text → calls `searchPlace`, shows result card
2. Short text → `searchPlace` returns null → shows `找不到此地點`
3. Long text → calls `extractItinerary`, then `onAddPlaces`
4. URL text → calls `scrapeText` then `extractItinerary`, then `onAddPlaces`
5. Mode badge updates as text changes
6. Result card click → calls `onAdd` and clears input
