# Combined Smart Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `PlaceSearchBar` + `ItineraryPasteInput` on the `/itinerary` page with a single `CombinedInput` component that auto-detects search vs. article-paste vs. URL on submit and routes to the right pipeline.

**Architecture:** One client component owns a textarea, a computed mode badge, and a small phase state machine. On submit it branches: `search` → `searchPlace` → single result card → `onAdd`; `article` → `extractItinerary` → verify each via `searchPlace` → `onAddPlaces`; `url` → `scrapeText` → same article pipeline. The article/URL branch reuses the exact verify + confirm-country flow already proven in `ItineraryPasteInput`.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), React client component, Tailwind CSS, Jest + Testing Library (jsdom).

## Global Constraints

- TypeScript strict — no `any`.
- No new npm dependencies.
- Traditional Chinese UI copy throughout.
- `PlaceSearchBar` component file is kept (not deleted) — only removed from `ItineraryClient.tsx`.
- `ItineraryPasteInput` on `app/page.tsx` is untouched.
- Detection runs on submit (button click or Enter), not while typing. Priority: URL (`^https?://`) → article (`length > 150` OR contains `\n`) → search.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `components/CombinedInput.tsx` | New component: textarea + mode detection + phase machine routing to search/article/url pipelines. |
| `__tests__/combined-input.test.tsx` | Unit tests with `scrapeText`, `extractItinerary`, `searchPlace` mocked. |
| `app/itinerary/ItineraryClient.tsx` | Swap the two old components for `CombinedInput`. |

**Reused signatures (do not redefine):**
- `extractItinerary(text: string): Promise<{ country: string \| null; countryCode: string \| null; places: Array<{ name: string; type: PlaceType }> }>` — from `@/app/actions/ai`
- `searchPlace(query: string, countryName?: string): Promise<Place \| null>` — from `@/app/actions/places`
- `scrapeText(url: string): Promise<string \| null>` — from `@/app/actions/scrape`
- `Place`, `PlaceType` — from `@/lib/types`

---

## Task 1: CombinedInput — search mode + mode badge

**Files:**
- Create: `components/CombinedInput.tsx`
- Test: `__tests__/combined-input.test.tsx`

**Interfaces:**
- Consumes: `searchPlace` from `@/app/actions/places`; `Place`, `PlaceType` from `@/lib/types`.
- Produces:
  - `export function CombinedInput(props: { onAdd: (place: Place) => void; onAddPlaces: (places: Place[]) => void }): JSX.Element`
  - module-private `detectMode(text: string): 'search' | 'article' | 'url' | null`
  - module-private `inferType(query: string): PlaceType`

- [ ] **Step 1: Write the failing tests (search mode + badge)**

Create `__tests__/combined-input.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Place } from '@/lib/types'

jest.mock('@/app/actions/ai', () => ({ extractItinerary: jest.fn() }))
jest.mock('@/app/actions/places', () => ({ searchPlace: jest.fn() }))
jest.mock('@/app/actions/scrape', () => ({ scrapeText: jest.fn() }))

import { CombinedInput } from '@/components/CombinedInput'
import { extractItinerary } from '@/app/actions/ai'
import { searchPlace } from '@/app/actions/places'
import { scrapeText } from '@/app/actions/scrape'

const mockExtract = extractItinerary as jest.Mock
const mockSearch = searchPlace as jest.Mock
const mockScrape = scrapeText as jest.Mock

const MOCK_PLACE: Place = {
  id: 'uuid-1', placeId: 'place-abc', name: '淺草寺', type: 'attraction',
  lat: 35.71, lng: 139.79, address: '東京', openingHours: null,
  rating: null, photoUrl: null, description: null,
}

const PLACEHOLDER = /搜尋地點/

describe('CombinedInput', () => {
  beforeEach(() => jest.clearAllMocks())

  it('short text searches and shows a result card', async () => {
    mockSearch.mockResolvedValue(MOCK_PLACE)
    render(<CombinedInput onAdd={jest.fn()} onAddPlaces={jest.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: '淺草寺' } })
    fireEvent.click(screen.getByText('送出'))
    await waitFor(() => expect(screen.getByText('淺草寺')).toBeInTheDocument())
    expect(mockSearch).toHaveBeenCalledWith('淺草寺')
  })

  it('shows 找不到此地點 when search returns null', async () => {
    mockSearch.mockResolvedValue(null)
    render(<CombinedInput onAdd={jest.fn()} onAddPlaces={jest.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: '不存在' } })
    fireEvent.click(screen.getByText('送出'))
    await waitFor(() => expect(screen.getByText('找不到此地點')).toBeInTheDocument())
  })

  it('result card click calls onAdd and clears the input', async () => {
    mockSearch.mockResolvedValue(MOCK_PLACE)
    const onAdd = jest.fn()
    render(<CombinedInput onAdd={onAdd} onAddPlaces={jest.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: '淺草寺' } })
    fireEvent.click(screen.getByText('送出'))
    await waitFor(() => expect(screen.getByText('淺草寺')).toBeInTheDocument())
    fireEvent.click(screen.getByText('淺草寺'))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: '淺草寺' })))
    expect((screen.getByPlaceholderText(PLACEHOLDER) as HTMLTextAreaElement).value).toBe('')
  })

  it('updates the mode badge as text changes', () => {
    render(<CombinedInput onAdd={jest.fn()} onAddPlaces={jest.fn()} />)
    const ta = screen.getByPlaceholderText(PLACEHOLDER)
    fireEvent.change(ta, { target: { value: '淺草寺' } })
    expect(screen.getByText('🔍 搜尋地點')).toBeInTheDocument()
    fireEvent.change(ta, { target: { value: 'https://example.com/blog' } })
    expect(screen.getByText('🔗 分析網址')).toBeInTheDocument()
    fireEvent.change(ta, { target: { value: 'line one\nline two' } })
    expect(screen.getByText('📄 分析文章')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest combined-input --silent`
Expected: FAIL — `Cannot find module '@/components/CombinedInput'`.

- [ ] **Step 3: Create the component (search mode only for now)**

Create `components/CombinedInput.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { extractItinerary } from '@/app/actions/ai'
import { searchPlace } from '@/app/actions/places'
import { scrapeText } from '@/app/actions/scrape'
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

const TYPE_LABEL: Record<PlaceType, string> = {
  attraction: '景點',
  restaurant: '餐廳',
  dessert: '甜點',
}

type DetectedMode = 'search' | 'article' | 'url'
type Phase = 'idle' | 'loading' | 'confirm-country' | 'verifying' | 'result'

interface ExtractedPlace {
  name: string
  type: PlaceType
}

function detectMode(text: string): DetectedMode | null {
  const t = text.trim()
  if (!t) return null
  if (/^https?:\/\//.test(t)) return 'url'
  if (text.length > 150 || text.includes('\n')) return 'article'
  return 'search'
}

function inferType(query: string): PlaceType {
  const q = query.toLowerCase()
  if (q.includes('甜點') || q.includes('dessert') || q.includes('咖啡') || q.includes('cafe') || q.includes('ice cream') || q.includes('蛋糕')) return 'dessert'
  if (q.includes('餐') || q.includes('restaurant') || q.includes('食堂') || q.includes('bistro')) return 'restaurant'
  return 'attraction'
}

const MODE_BADGE: Record<DetectedMode, string> = {
  url: '🔗 分析網址',
  article: '📄 分析文章',
  search: '🔍 搜尋地點',
}

interface Props {
  onAdd: (place: Place) => void
  onAddPlaces: (places: Place[]) => void
}

export function CombinedInput({ onAdd, onAddPlaces }: Props) {
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [singleResult, setSingleResult] = useState<Place | null>(null)
  const [extracted, setExtracted] = useState<ExtractedPlace[]>([])
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null)
  const [selectedCountryName, setSelectedCountryName] = useState('')
  const [verifyProgress, setVerifyProgress] = useState({ done: 0, total: 0 })

  const detectedMode = detectMode(text)

  const reset = () => {
    setPhase('idle')
    setText('')
    setSingleResult(null)
    setExtracted([])
    setDetectedCountry(null)
    setSelectedCountryName('')
  }

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
        const validType: PlaceType =
          p.type === 'restaurant' ? 'restaurant' :
          p.type === 'dessert' ? 'dessert' :
          'attraction'
        return { ...found, type: validType } as Place
      })
    )
    const valid = results.filter((p): p is Place => p !== null)
    onAddPlaces(valid)
    reset()
  }

  const runExtract = async (raw: string) => {
    const result = await extractItinerary(raw)
    setExtracted(result.places)
    if (result.country && result.places.length > 0) {
      setDetectedCountry(result.country)
      await runVerify(result.places, result.country)
    } else if (result.places.length > 0) {
      setPhase('confirm-country')
    } else {
      reset()
    }
  }

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const mode = detectMode(trimmed)
    setPhase('loading')
    try {
      if (mode === 'url') {
        const scraped = await scrapeText(trimmed)
        if (!scraped) { setPhase('idle'); return }
        await runExtract(scraped)
      } else if (mode === 'article') {
        await runExtract(trimmed)
      } else {
        const found = await searchPlace(trimmed)
        setSingleResult(found)
        setPhase('result')
      }
    } catch {
      setPhase('idle')
    }
  }

  const handleConfirmCountry = async () => {
    if (!selectedCountryName) return
    try {
      await runVerify(extracted, selectedCountryName)
    } catch {
      setPhase('idle')
    }
  }

  const handleAddSingle = (place: Place) => {
    onAdd({ ...place, type: inferType(text) })
    reset()
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
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={phase === 'loading'}
        placeholder="搜尋地點、貼上行程文字，或貼上網址..."
        rows={3}
        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60"
      />
      {detectedMode && phase !== 'loading' && (
        <p className="text-xs text-gray-500">{MODE_BADGE[detectedMode]}</p>
      )}
      {phase === 'result' && singleResult === null && (
        <p className="text-sm text-red-500">找不到此地點</p>
      )}
      {phase === 'result' && singleResult && (
        <button
          type="button"
          onClick={() => handleAddSingle(singleResult)}
          className="w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 text-sm">{singleResult.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {TYPE_LABEL[inferType(text)]}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{singleResult.address}</p>
        </button>
      )}
      <button
        onClick={handleSubmit}
        disabled={!text.trim() || phase === 'loading'}
        className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {phase === 'loading' ? '分析中...' : '送出'}
      </button>
    </div>
  )
}
```

> Note: this implementation already contains the article/url branches (Task 2 tests exercise them). It is complete here because the branches share the same component file and the verify/confirm-country flow must exist for the search-mode render path to compile. Task 2 only adds tests.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest combined-input --silent`
Expected: PASS — 4 tests in this file.

- [ ] **Step 5: Commit**

```bash
git add components/CombinedInput.tsx __tests__/combined-input.test.tsx
git commit -m "feat: add CombinedInput with search mode and mode badge"
```

---

## Task 2: Article + URL extraction pipelines

**Files:**
- Modify: `__tests__/combined-input.test.tsx` (append two tests)

**Interfaces:**
- Consumes: `CombinedInput`, `extractItinerary`, `searchPlace`, `scrapeText` (already mocked in the file from Task 1).
- Produces: nothing new — verifies behavior already implemented in `components/CombinedInput.tsx`.

- [ ] **Step 1: Write the failing tests (article + url)**

Append inside the `describe('CombinedInput', ...)` block in `__tests__/combined-input.test.tsx`:

```tsx
  it('long text extracts then calls onAddPlaces with verified places', async () => {
    mockExtract.mockResolvedValue({
      country: 'Japan', countryCode: 'jp',
      places: [{ name: '淺草寺', type: 'attraction' }],
    })
    mockSearch.mockResolvedValue(MOCK_PLACE)
    const onAddPlaces = jest.fn()
    const longText = '我去日本玩，' + '行程文字'.repeat(50)
    render(<CombinedInput onAdd={jest.fn()} onAddPlaces={onAddPlaces} />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: longText } })
    fireEvent.click(screen.getByText('送出'))
    await waitFor(() =>
      expect(onAddPlaces).toHaveBeenCalledWith([expect.objectContaining({ name: '淺草寺' })])
    )
    expect(mockExtract).toHaveBeenCalledWith(longText)
    expect(mockSearch).toHaveBeenCalledWith('淺草寺', 'Japan')
  })

  it('url text scrapes then extracts then calls onAddPlaces', async () => {
    mockScrape.mockResolvedValue('scraped blog body about Japan')
    mockExtract.mockResolvedValue({
      country: 'Japan', countryCode: 'jp',
      places: [{ name: '淺草寺', type: 'attraction' }],
    })
    mockSearch.mockResolvedValue(MOCK_PLACE)
    const onAddPlaces = jest.fn()
    render(<CombinedInput onAdd={jest.fn()} onAddPlaces={onAddPlaces} />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: 'https://blog.example.com/japan' } })
    fireEvent.click(screen.getByText('送出'))
    await waitFor(() => expect(onAddPlaces).toHaveBeenCalled())
    expect(mockScrape).toHaveBeenCalledWith('https://blog.example.com/japan')
    expect(mockExtract).toHaveBeenCalledWith('scraped blog body about Japan')
  })
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npx jest combined-input --silent`
Expected: PASS — 6 tests total. (Implementation already present from Task 1; these tests confirm the article/url branches.)

- [ ] **Step 3: Commit**

```bash
git add __tests__/combined-input.test.tsx
git commit -m "test: cover CombinedInput article and url extraction paths"
```

---

## Task 3: Wire CombinedInput into ItineraryClient

**Files:**
- Modify: `app/itinerary/ItineraryClient.tsx` (imports at lines 24-25; section at lines 200-201)

**Interfaces:**
- Consumes: `CombinedInput` from `@/components/CombinedInput`; existing `handleAddPlace: (place: Place) => void` and `handleAddPlaces: (places: Place[]) => void` already defined in `ItineraryClient`.
- Produces: nothing — final integration.

- [ ] **Step 1: Inspect the current section**

Run: `npx jest --version >/dev/null; grep -n "PlaceSearchBar\|ItineraryPasteInput\|handleAddPlace\|handleAddPlaces" app/itinerary/ItineraryClient.tsx`
Expected: confirms imports on lines 24-25, usage near lines 200-201, and that `handleAddPlace` / `handleAddPlaces` exist.

- [ ] **Step 2: Replace the imports**

In `app/itinerary/ItineraryClient.tsx`, replace these two lines:

```tsx
import { PlaceSearchBar } from '@/components/PlaceSearchBar'
import { ItineraryPasteInput } from '@/components/ItineraryPasteInput'
```

with:

```tsx
import { CombinedInput } from '@/components/CombinedInput'
```

- [ ] **Step 3: Replace the input section**

Replace:

```tsx
        <PlaceSearchBar onAdd={handleAddPlace} />
        <ItineraryPasteInput onPlacesFound={handleAddPlaces} />
```

with:

```tsx
        <CombinedInput onAdd={handleAddPlace} onAddPlaces={handleAddPlaces} />
```

> If `handleAddPlace`/`handleAddPlaces` names differ from Step 1's grep output, use the actual names — do not invent new handlers.

- [ ] **Step 4: Verify build + full test suite pass**

Run: `npm run build && npx jest --silent`
Expected: build succeeds with no TypeScript errors; all test suites pass (including `combined-input`).

- [ ] **Step 5: Commit**

```bash
git add app/itinerary/ItineraryClient.tsx
git commit -m "feat: use CombinedInput on itinerary page, retire PlaceSearchBar+paste"
```

---

## Self-Review Notes

- **Spec coverage:** detection logic (Task 1 `detectMode`), mode badges (Task 1 test 4), search mode + result card + 找不到此地點 (Task 1), article + url pipelines (Task 2), confirm-country + verifying phases (Task 1 implementation, reused from `ItineraryPasteInput`), ItineraryClient swap keeping `PlaceSearchBar` file and home-page `ItineraryPasteInput` intact (Task 3 + Global Constraints). All 6 spec test cases mapped.
- **Type consistency:** `detectMode`, `inferType`, `runVerify`, `runExtract`, `Phase`, `ExtractedPlace`, `Props` used consistently across tasks.
- **Reused-signature fidelity:** `searchPlace(name, countryName)`, `extractItinerary(text)`, `scrapeText(url)` match the live action signatures verified against `app/actions/`.
