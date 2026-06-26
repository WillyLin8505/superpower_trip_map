# Batch Itinerary Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-by-one place search with a textarea where users paste free-form travel text; Claude extracts all place names + classifies types; Google verifies each; country is auto-detected (or user-confirmed if uncertain).

**Architecture:** A new server action `extractItinerary` calls Claude once to get places + country from free-form text. A new client component `ItineraryPasteInput` orchestrates the 3-phase UX (analyzing → country confirm if needed → verifying). `searchPlace` gains an optional `countryName` param appended to the query for better geographic scoping.

**Tech Stack:** Next.js 14 App Router, `@anthropic-ai/sdk` (via existing `callClaude`), Google Places API (`findplacefromtext`), React, TypeScript strict, Jest + jsdom for tests.

## Global Constraints

- TypeScript strict — no `any`
- Model: `claude-haiku-4-5-20251001` via `callClaude` — do not instantiate `Anthropic` directly
- All new server code lives in `app/actions/` with `'use server'` directive
- All new client code uses `'use client'` directive
- Chinese UI copy in Traditional Chinese (繁體中文)
- Max 25 places (existing limit, enforce in `handlePlacesFound`)
- `searchPlace` signature change must be backward-compatible (new param is optional)
- Jest test files under `__tests__/`; jsdom tests require `/** @jest-environment jsdom */` at line 1
- No new npm packages

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `app/actions/ai.ts` | Modify | Add `extractItinerary` + `ExtractedItinerary` type |
| `app/actions/places.ts` | Modify | Add optional `countryName` param to `searchPlace` |
| `components/ItineraryPasteInput.tsx` | Create | Textarea + 3-phase UX component |
| `app/page.tsx` | Modify | Replace `PlaceSearch` + `handleAdd` with new component |
| `components/PlaceSearch.tsx` | No change | Left in place (file still exists, just no longer imported) |
| `__tests__/extract-itinerary.test.ts` | Create | Unit tests for `extractItinerary` |
| `__tests__/itinerary-paste-input.test.tsx` | Create | Component tests for `ItineraryPasteInput` |

---

### Task 1: `extractItinerary` server action

**Files:**
- Modify: `app/actions/ai.ts`
- Test: `__tests__/extract-itinerary.test.ts`

**Interfaces:**
- Consumes: `callClaude(prompt: string): Promise<string>` from `@/lib/claude`
- Produces:
  ```typescript
  export interface ExtractedItinerary {
    country: string | null       // e.g. "Japan" — null if uncertain
    countryCode: string | null   // e.g. "jp" — null if uncertain
    places: Array<{ name: string; type: 'attraction' | 'restaurant' }>
  }
  export async function extractItinerary(text: string): Promise<ExtractedItinerary>
  ```

- [ ] **Step 1: Write the failing tests**

Create `__tests__/extract-itinerary.test.ts`:

```typescript
import { extractItinerary } from '@/app/actions/ai'
import { callClaude } from '@/lib/claude'

jest.mock('@/lib/claude')
const mockCallClaude = callClaude as jest.Mock

describe('extractItinerary', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns parsed places and country from valid JSON response', async () => {
    mockCallClaude.mockResolvedValue(JSON.stringify({
      country: 'Japan',
      countryCode: 'jp',
      places: [
        { name: '淺草寺', type: 'attraction' },
        { name: '一蘭拉麵', type: 'restaurant' },
      ],
    }))
    const result = await extractItinerary('去東京旅遊')
    expect(result.country).toBe('Japan')
    expect(result.countryCode).toBe('jp')
    expect(result.places).toHaveLength(2)
    expect(result.places[0]).toEqual({ name: '淺草寺', type: 'attraction' })
  })

  it('returns null country when JSON has null country', async () => {
    mockCallClaude.mockResolvedValue(JSON.stringify({
      country: null,
      countryCode: null,
      places: [{ name: '某個地方', type: 'attraction' }],
    }))
    const result = await extractItinerary('隨便一段文字')
    expect(result.country).toBeNull()
    expect(result.countryCode).toBeNull()
    expect(result.places).toHaveLength(1)
  })

  it('strips markdown code fences before parsing', async () => {
    mockCallClaude.mockResolvedValue('```json\n{"country":"Taiwan","countryCode":"tw","places":[{"name":"九份","type":"attraction"}]}\n```')
    const result = await extractItinerary('台灣行程')
    expect(result.country).toBe('Taiwan')
    expect(result.places[0].name).toBe('九份')
  })

  it('returns empty places and null country on unparseable response', async () => {
    mockCallClaude.mockResolvedValue('這不是 JSON')
    const result = await extractItinerary('隨便')
    expect(result.country).toBeNull()
    expect(result.countryCode).toBeNull()
    expect(result.places).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/extract-itinerary.test.ts --no-coverage
```

Expected: 4 failures — `extractItinerary` does not exist yet.

- [ ] **Step 3: Add `extractItinerary` to `app/actions/ai.ts`**

Add after the existing imports and before `generateDaySummaries`. The existing function stays unchanged.

```typescript
// Add to imports at top (PlaceType already importable from @/lib/types):
import type { DayItinerary, PlaceType } from '@/lib/types'

// Add this interface and function:
export interface ExtractedItinerary {
  country: string | null
  countryCode: string | null
  places: Array<{ name: string; type: PlaceType }>
}

export async function extractItinerary(text: string): Promise<ExtractedItinerary> {
  const prompt = `你是旅遊助理。以下是一段旅遊行程文字。請：
1. 找出所有景點和餐廳名稱
2. 判斷每個地點是景點(attraction)還是餐廳(restaurant)
3. 判斷行程的國家（例如 Taiwan、Japan、South Korea）

回傳純 JSON，不要包含 markdown 或其他說明：
{
  "country": "Japan",
  "countryCode": "jp",
  "places": [
    { "name": "地點名稱", "type": "attraction" }
  ]
}

若無法判斷國家，country 和 countryCode 設為 null。
若無法判斷地點類型，設為 attraction。

行程文字：
${text}`

  try {
    const raw = await callClaude(prompt)
    const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) return { country: null, countryCode: null, places: [] }
    const parsed = JSON.parse(match[0])
    return {
      country: parsed.country ?? null,
      countryCode: parsed.countryCode ?? null,
      places: Array.isArray(parsed.places) ? parsed.places : [],
    }
  } catch {
    return { country: null, countryCode: null, places: [] }
  }
}
```

The full updated top of `app/actions/ai.ts` becomes:

```typescript
'use server'
import type { DayItinerary, PlaceType } from '@/lib/types'
import { callClaude } from '@/lib/claude'

export interface ExtractedItinerary {
  country: string | null
  countryCode: string | null
  places: Array<{ name: string; type: PlaceType }>
}

export async function extractItinerary(text: string): Promise<ExtractedItinerary> {
  const prompt = `你是旅遊助理。以下是一段旅遊行程文字。請：
1. 找出所有景點和餐廳名稱
2. 判斷每個地點是景點(attraction)還是餐廳(restaurant)
3. 判斷行程的國家（例如 Taiwan、Japan、South Korea）

回傳純 JSON，不要包含 markdown 或其他說明：
{
  "country": "Japan",
  "countryCode": "jp",
  "places": [
    { "name": "地點名稱", "type": "attraction" }
  ]
}

若無法判斷國家，country 和 countryCode 設為 null。
若無法判斷地點類型，設為 attraction。

行程文字：
${text}`

  try {
    const raw = await callClaude(prompt)
    const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) return { country: null, countryCode: null, places: [] }
    const parsed = JSON.parse(match[0])
    return {
      country: parsed.country ?? null,
      countryCode: parsed.countryCode ?? null,
      places: Array.isArray(parsed.places) ? parsed.places : [],
    }
  } catch {
    return { country: null, countryCode: null, places: [] }
  }
}

interface AiDayResult {
  summary: string
  descriptions: Record<string, string>
}

export async function generateDaySummaries(
  days: DayItinerary[]
): Promise<DayItinerary[]> {
  // ... existing implementation unchanged
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/extract-itinerary.test.ts --no-coverage
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/actions/ai.ts __tests__/extract-itinerary.test.ts
git commit -m "feat: add extractItinerary server action with country detection"
```

---

### Task 2: Update `searchPlace` to accept country name

**Files:**
- Modify: `app/actions/places.ts` (lines 36–48, `searchPlace` function)
- Test: `__tests__/search-place-country.test.ts`

**Interfaces:**
- Before: `searchPlace(query: string): Promise<Place | null>`
- After: `searchPlace(query: string, countryName?: string): Promise<Place | null>`
- `verifyPlace` unchanged — it calls `searchPlace(name)` without country, which still works.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/search-place-country.test.ts`:

```typescript
import { searchPlace } from '@/app/actions/places'

const mockFetch = jest.fn()
global.fetch = mockFetch

const PLACE_DETAILS_RESPONSE = {
  status: 'OK',
  result: {
    name: '淺草寺',
    geometry: { location: { lat: 35.7147, lng: 139.7966 } },
    formatted_address: '東京都台東区浅草',
    opening_hours: null,
    rating: 4.5,
    photos: null,
    editorial_summary: null,
  },
}

describe('searchPlace with country', () => {
  beforeEach(() => jest.clearAllMocks())

  it('appends country name to query when countryName provided', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({ candidates: [{ place_id: 'place123' }] }),
      })
      .mockResolvedValueOnce({
        json: async () => PLACE_DETAILS_RESPONSE,
      })

    await searchPlace('淺草寺', 'Japan')

    const findPlaceCall = mockFetch.mock.calls[0][0] as string
    expect(findPlaceCall).toContain(encodeURIComponent('淺草寺, Japan'))
  })

  it('does not append anything when countryName is omitted', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({ candidates: [{ place_id: 'place123' }] }),
      })
      .mockResolvedValueOnce({
        json: async () => PLACE_DETAILS_RESPONSE,
      })

    await searchPlace('淺草寺')

    const findPlaceCall = mockFetch.mock.calls[0][0] as string
    expect(findPlaceCall).toContain(encodeURIComponent('淺草寺'))
    expect(findPlaceCall).not.toContain('Japan')
  })

  it('returns null when no candidates found', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ candidates: [] }),
    })

    const result = await searchPlace('不存在的地方', 'Taiwan')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/search-place-country.test.ts --no-coverage
```

Expected: test 1 fails (query doesn't include country yet).

- [ ] **Step 3: Update `searchPlace` in `app/actions/places.ts`**

Change the function signature and query construction:

```typescript
export async function searchPlace(query: string, countryName?: string): Promise<Place | null> {
  const input = countryName ? `${query}, ${countryName}` : query
  const url =
    `${BASE}/findplacefromtext/json` +
    `?input=${encodeURIComponent(input)}&inputtype=textquery` +
    `&fields=place_id&key=${KEY}`
  const res = await fetch(url)
  const data = await res.json()
  const placeId = data.candidates?.[0]?.place_id
  if (!placeId) return null
  return getPlaceDetails(placeId)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/search-place-country.test.ts --no-coverage
```

Expected: 3 passed.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
npx jest --no-coverage
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add app/actions/places.ts __tests__/search-place-country.test.ts
git commit -m "feat: add optional countryName param to searchPlace"
```

---

### Task 3: `ItineraryPasteInput` component

**Files:**
- Create: `components/ItineraryPasteInput.tsx`
- Test: `__tests__/itinerary-paste-input.test.tsx`

**Interfaces:**
- Consumes:
  - `extractItinerary(text: string): Promise<ExtractedItinerary>` from `@/app/actions/ai`
  - `searchPlace(query: string, countryName?: string): Promise<Place | null>` from `@/app/actions/places`
- Produces: `<ItineraryPasteInput onPlacesFound={(places: Place[]) => void} />`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/itinerary-paste-input.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ItineraryPasteInput } from '@/components/ItineraryPasteInput'
import { extractItinerary } from '@/app/actions/ai'
import { searchPlace } from '@/app/actions/places'
import type { Place } from '@/lib/types'

jest.mock('@/app/actions/ai')
jest.mock('@/app/actions/places')

const mockExtract = extractItinerary as jest.Mock
const mockSearch = searchPlace as jest.Mock

const MOCK_PLACE: Place = {
  id: 'uuid-1',
  placeId: 'place-abc',
  name: '淺草寺',
  type: 'attraction',
  lat: 35.71,
  lng: 139.79,
  address: '東京',
  openingHours: null,
  rating: null,
  photoUrl: null,
  ticketPrice: null,
}

describe('ItineraryPasteInput', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls onPlacesFound with verified places when country is detected', async () => {
    mockExtract.mockResolvedValue({
      country: 'Japan',
      countryCode: 'jp',
      places: [{ name: '淺草寺', type: 'attraction' }],
    })
    mockSearch.mockResolvedValue(MOCK_PLACE)

    const onPlacesFound = jest.fn()
    render(<ItineraryPasteInput onPlacesFound={onPlacesFound} />)

    fireEvent.change(screen.getByPlaceholderText(/貼上旅遊/), {
      target: { value: '去東京旅遊' },
    })
    fireEvent.click(screen.getByText('分析行程'))

    await waitFor(() => {
      expect(onPlacesFound).toHaveBeenCalledWith([
        expect.objectContaining({ name: '淺草寺', type: 'attraction' }),
      ])
    })
    expect(mockSearch).toHaveBeenCalledWith('淺草寺', 'Japan')
  })

  it('shows country selector when country cannot be detected', async () => {
    mockExtract.mockResolvedValue({
      country: null,
      countryCode: null,
      places: [{ name: '某地方', type: 'attraction' }],
    })

    render(<ItineraryPasteInput onPlacesFound={jest.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/貼上旅遊/), {
      target: { value: '隨便一段文字' },
    })
    fireEvent.click(screen.getByText('分析行程'))

    await waitFor(() => {
      expect(screen.getByText('無法自動判斷國家，請選擇行程所在地：')).toBeInTheDocument()
    })
  })

  it('filters out places that Google cannot verify', async () => {
    mockExtract.mockResolvedValue({
      country: 'Taiwan',
      countryCode: 'tw',
      places: [
        { name: '九份老街', type: 'attraction' },
        { name: '不存在的地方', type: 'attraction' },
      ],
    })
    mockSearch
      .mockResolvedValueOnce({ ...MOCK_PLACE, name: '九份老街' })
      .mockResolvedValueOnce(null)

    const onPlacesFound = jest.fn()
    render(<ItineraryPasteInput onPlacesFound={onPlacesFound} />)

    fireEvent.change(screen.getByPlaceholderText(/貼上旅遊/), {
      target: { value: '台灣行程文字' },
    })
    fireEvent.click(screen.getByText('分析行程'))

    await waitFor(() => {
      expect(onPlacesFound).toHaveBeenCalledWith([
        expect.objectContaining({ name: '九份老街' }),
      ])
    })
    expect(onPlacesFound.mock.calls[0][0]).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/itinerary-paste-input.test.tsx --no-coverage
```

Expected: 3 failures — component does not exist yet.

- [ ] **Step 3: Create `components/ItineraryPasteInput.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { extractItinerary } from '@/app/actions/ai'
import { searchPlace } from '@/app/actions/places'
import type { Place, PlaceType } from '@/lib/types'

const COUNTRIES = [
  { name: 'Taiwan', label: '台灣' },
  { name: 'Japan', label: '日本' },
  { name: 'South Korea', label: '韓國' },
  { name: 'Thailand', label: '泰國' },
  { name: 'France', label: '法國' },
  { name: 'Italy', label: '義大利' },
  { name: 'Germany', label: '德國' },
  { name: 'United Kingdom', label: '英國' },
  { name: 'United States', label: '美國' },
  { name: 'Singapore', label: '新加坡' },
  { name: 'Malaysia', label: '馬來西亞' },
  { name: 'Vietnam', label: '越南' },
]

interface ExtractedPlace {
  name: string
  type: PlaceType
}

interface Props {
  onPlacesFound: (places: Place[]) => void
}

export function ItineraryPasteInput({ onPlacesFound }: Props) {
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'confirm-country' | 'verifying'>('idle')
  const [extracted, setExtracted] = useState<ExtractedPlace[]>([])
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null)
  const [verifyProgress, setVerifyProgress] = useState({ done: 0, total: 0 })
  const [selectedCountryName, setSelectedCountryName] = useState('')

  const runVerify = async (places: ExtractedPlace[], countryName: string) => {
    setPhase('verifying')
    setVerifyProgress({ done: 0, total: places.length })
    let done = 0
    const results = await Promise.all(
      places.map(async (p) => {
        const found = await searchPlace(p.name, countryName)
        done++
        setVerifyProgress({ done, total: places.length })
        if (!found) return null
        return { ...found, type: p.type } as Place
      })
    )
    const valid = results.filter((p): p is Place => p !== null)
    onPlacesFound(valid)
    setPhase('idle')
    setText('')
    setDetectedCountry(null)
  }

  const handleAnalyze = async () => {
    if (!text.trim()) return
    setPhase('analyzing')
    const result = await extractItinerary(text)
    setExtracted(result.places)
    if (result.country) {
      setDetectedCountry(result.country)
      await runVerify(result.places, result.country)
    } else {
      setPhase('confirm-country')
    }
  }

  const handleConfirmCountry = async () => {
    if (!selectedCountryName) return
    await runVerify(extracted, selectedCountryName)
  }

  if (phase === 'analyzing') {
    return <p className="text-gray-500 text-sm py-6 text-center">分析行程中...</p>
  }

  if (phase === 'verifying') {
    return (
      <div className="py-6 text-center space-y-2">
        {detectedCountry && (
          <span className="inline-block bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full">
            偵測到：{detectedCountry}
          </span>
        )}
        <p className="text-gray-500 text-sm">
          驗證地點中... {verifyProgress.done} / {verifyProgress.total}
        </p>
      </div>
    )
  }

  if (phase === 'confirm-country') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">無法自動判斷國家，請選擇行程所在地：</p>
        <select
          value={selectedCountryName}
          onChange={(e) => setSelectedCountryName(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 w-full"
        >
          <option value="">請選擇國家</option>
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>{c.label}</option>
          ))}
        </select>
        <button
          onClick={handleConfirmCountry}
          disabled={!selectedCountryName}
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          繼續分析
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="貼上旅遊部落格、筆記或任何行程文字，自動分析所有景點與餐廳..."
        rows={6}
        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      <button
        onClick={handleAnalyze}
        disabled={!text.trim()}
        className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        分析行程
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/itinerary-paste-input.test.tsx --no-coverage
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add components/ItineraryPasteInput.tsx __tests__/itinerary-paste-input.test.tsx
git commit -m "feat: add ItineraryPasteInput component with country detection"
```

---

### Task 4: Wire into `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `<ItineraryPasteInput onPlacesFound={(places: Place[]) => void} />` from `@/components/ItineraryPasteInput`
- No new tests — existing page behavior (PlaceList, submit) is unchanged; component integration is covered by Task 3 tests.

- [ ] **Step 1: Replace `app/page.tsx`**

Full replacement (remove `PlaceSearch`, `handleAdd`; add `ItineraryPasteInput`, `handlePlacesFound`):

```tsx
'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Place, PlaceType, TransportMode } from '@/lib/types'
import { ItineraryPasteInput } from '@/components/ItineraryPasteInput'
import { PlaceList } from '@/components/PlaceList'

export default function InputPage() {
  const router = useRouter()
  const [places, setPlaces] = useState<Place[]>([])
  const [days, setDays] = useState(2)
  const [mode, setMode] = useState<TransportMode>('driving')

  const handlePlacesFound = useCallback((newPlaces: Place[]) => {
    setPlaces((prev) => {
      const combined = [...prev, ...newPlaces]
      return combined.slice(0, 25)
    })
  }, [])

  const handleTypeChange = useCallback((id: string, type: PlaceType) => {
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, type } : p)))
  }, [])

  const handleRemove = useCallback((id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const handleSubmit = () => {
    if (places.length < 2) return
    sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
    router.push(`/itinerary?days=${days}&mode=${mode}`)
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">旅遊行程規劃</h1>
      <p className="text-gray-500 mb-8">貼上旅遊文章或行程筆記，自動分析所有景點與餐廳</p>

      <section className="mb-6">
        <ItineraryPasteInput onPlacesFound={handlePlacesFound} />
        {places.length >= 25 && (
          <p className="text-red-500 text-sm mt-2">已達最多 25 個地點</p>
        )}
      </section>

      <section className="mb-6">
        <PlaceList places={places} onTypeChange={handleTypeChange} onRemove={handleRemove} />
      </section>

      <section className="flex gap-6 mb-8">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">天數</span>
          <input
            type="number"
            min={1}
            max={14}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-center"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">交通方式</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as TransportMode)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="driving">開車</option>
            <option value="walking">步行</option>
            <option value="transit">大眾運輸</option>
          </select>
        </label>
      </section>

      <button
        onClick={handleSubmit}
        disabled={places.length < 2}
        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        開始規劃 →
      </button>
    </main>
  )
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass (21 existing + 7 new = 28 total).

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: replace place search with batch itinerary paste input"
```
