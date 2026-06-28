# 住宿標籤 + 手動改標籤 + 卡片顏色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `accommodation`（住宿）為第四種 `PlaceType`，可在首頁清單與行程頁卡片點標籤改類型，並依類型給卡片淡色底色；同時把重複的 type 常數/邏輯收斂到 `lib/placeType.ts`。

**Architecture:** 先建立單一資料來源 `lib/placeType.ts`（`PlaceType` 常數、`TYPE_META`、`DWELL`、`inferType`、`validateType`），並把散落各元件的重複定義改為 import（Task 1）。再做共用的 `TypePicker` 彈出徽章元件（Task 2），接進行程卡片（含底色，Task 3）與首頁清單（Task 4）。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, Jest + Testing Library (jsdom)。不新增 npm 套件。

## Global Constraints

- TypeScript strict，無 `any`。
- 不新增 npm 套件。
- UI 文案皆為繁體中文。
- `lib/placeType.ts` 為 type 相關常數/邏輯的**單一來源**；不得在元件內重新定義 `inferType` / `TYPE_LABEL` / `TYPE_STYLE` / `DWELL` / 類型驗證三元式。
- 改類型只更新 `place.type`（連帶顏色、標籤），**不改 `durationMin`、不觸發重排**。
- 配色：景點 blue / 住宿 purple / 餐廳 amber / 甜點 pink；卡片底色用 bg-50；`outsideHours` 橘色邊框維持不變。
- 既有測試需全數通過；新功能以 TDD 補測試。

---

## File Structure

| 檔案 | 責任 |
|------|------|
| `lib/placeType.ts`（新） | type 單一來源：`PLACE_TYPES`、`TypeMeta`、`TYPE_META`、`DWELL`、`inferType`、`validateType` |
| `components/TypePicker.tsx`（新） | 點徽章 → 四選一彈出選單，共用於清單與卡片 |
| `lib/types.ts` | `PlaceType` 加 `accommodation` |
| `components/ItineraryCard.tsx` | 卡片底色、徽章改 `TypePicker`、新增 `onChangeType` |
| `components/ItineraryDay.tsx` | 傳遞 `onChangeType` |
| `app/itinerary/ItineraryClient.tsx` | `handleChangeType`（不重排）、`handleAddPlace`/`handleAddPlaces` 改用 `DWELL` |
| `components/PlaceList.tsx` | 二選一 → `TypePicker` 四選一 |
| `components/RecommendPanel.tsx` | 預設停留改用 `DWELL` |
| `app/actions/schedule.ts` | `DWELL` 改 import；住宿比照景點排入 |
| `app/actions/ai.ts` | `extractItinerary` prompt 加住宿分類 |
| `components/CombinedInput.tsx`、`components/PlaceSearchBar.tsx`、`components/ItineraryPasteInput.tsx` | 改 import `inferType`/`TYPE_META`/`validateType` |

---

## Task 1: 共用 placeType 模組 + 擴充 PlaceType + 收斂重複定義（build 維持綠燈）

**Files:**
- Create: `lib/placeType.ts`
- Modify: `lib/types.ts:1`
- Modify: `components/CombinedInput.tsx`, `components/PlaceSearchBar.tsx`, `components/ItineraryPasteInput.tsx`, `components/ItineraryCard.tsx`, `app/actions/schedule.ts`, `app/actions/ai.ts`
- Test: `__tests__/place-type.test.ts`

**Interfaces:**
- Produces:
  - `export type PlaceType = 'attraction' | 'restaurant' | 'dessert' | 'accommodation'`（在 `lib/types.ts`）
  - `export const PLACE_TYPES: PlaceType[]`
  - `export interface TypeMeta { label: string; emoji: string; badge: string; cardBg: string }`
  - `export const TYPE_META: Record<PlaceType, TypeMeta>`
  - `export const DWELL: Record<PlaceType, number>`
  - `export function inferType(query: string): PlaceType`
  - `export function validateType(t: string): PlaceType`

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/place-type.test.ts`:

```ts
import { inferType, validateType, TYPE_META, DWELL, PLACE_TYPES } from '@/lib/placeType'

describe('inferType', () => {
  it('detects accommodation keywords', () => {
    expect(inferType('Toyoko Hotel')).toBe('accommodation')
    expect(inferType('某某飯店')).toBe('accommodation')
    expect(inferType('阿里山民宿')).toBe('accommodation')
  })
  it('does not regress restaurant/dessert/attraction (guards removed "inn" bug)', () => {
    expect(inferType('dinner restaurant')).toBe('restaurant')
    expect(inferType('蛋糕店')).toBe('dessert')
    expect(inferType('淺草寺')).toBe('attraction')
  })
})

describe('validateType', () => {
  it('passes through known types', () => {
    expect(validateType('accommodation')).toBe('accommodation')
    expect(validateType('restaurant')).toBe('restaurant')
    expect(validateType('dessert')).toBe('dessert')
  })
  it('falls back to attraction for unknown', () => {
    expect(validateType('foo')).toBe('attraction')
  })
})

describe('type maps', () => {
  it('PLACE_TYPES, TYPE_META and DWELL cover all four types', () => {
    expect(PLACE_TYPES).toHaveLength(4)
    for (const t of PLACE_TYPES) {
      expect(TYPE_META[t]).toBeDefined()
      expect(typeof DWELL[t]).toBe('number')
    }
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest place-type --silent`
Expected: FAIL — `Cannot find module '@/lib/placeType'`.

- [ ] **Step 3: 擴充 PlaceType**

In `lib/types.ts`, replace line 1:

```typescript
export type PlaceType = 'attraction' | 'restaurant' | 'dessert' | 'accommodation'
```

- [ ] **Step 4: 建立 `lib/placeType.ts`**

Create `lib/placeType.ts`:

```typescript
import type { PlaceType } from '@/lib/types'

// 顯示與 UI 排序用的固定順序（彈出選單依此順序）
export const PLACE_TYPES: PlaceType[] = ['accommodation', 'restaurant', 'dessert', 'attraction']

export interface TypeMeta {
  label: string        // 中文標籤
  emoji: string
  badge: string        // 徽章 Tailwind 類別（背景+文字）
  cardBg: string       // 卡片底色 Tailwind 類別
}

export const TYPE_META: Record<PlaceType, TypeMeta> = {
  attraction:    { label: '景點', emoji: '🏔', badge: 'bg-blue-100 text-blue-700',     cardBg: 'bg-blue-50' },
  accommodation: { label: '住宿', emoji: '🏨', badge: 'bg-purple-100 text-purple-700', cardBg: 'bg-purple-50' },
  restaurant:    { label: '餐廳', emoji: '🍽', badge: 'bg-amber-100 text-amber-700',   cardBg: 'bg-amber-50' },
  dessert:       { label: '甜點', emoji: '🍰', badge: 'bg-pink-100 text-pink-700',     cardBg: 'bg-pink-50' },
}

// 預設停留時間（分鐘）。accommodation 暫定 60，僅為佔位避免排程出錯；
// 真正的住宿排程語意由子專案 #3 定義。
export const DWELL: Record<PlaceType, number> = {
  attraction: 90,
  restaurant: 60,
  dessert: 60,
  accommodation: 60,
}

export function inferType(query: string): PlaceType {
  const q = query.toLowerCase()
  if (
    q.includes('飯店') || q.includes('旅館') || q.includes('旅店') || q.includes('民宿') ||
    q.includes('住宿') || q.includes('度假村') || q.includes('hotel') || q.includes('hostel') ||
    q.includes('motel') || q.includes('resort') || q.includes('guesthouse') || q.includes('airbnb') ||
    q.includes('ホテル') || q.includes('ryokan')
  ) return 'accommodation'
  if (
    q.includes('甜點') || q.includes('dessert') || q.includes('咖啡') || q.includes('cafe') ||
    q.includes('ice cream') || q.includes('蛋糕')
  ) return 'dessert'
  if (
    q.includes('餐') || q.includes('restaurant') || q.includes('食堂') || q.includes('bistro')
  ) return 'restaurant'
  return 'attraction'
}

export function validateType(t: string): PlaceType {
  return t === 'restaurant' || t === 'dessert' || t === 'accommodation'
    ? t
    : 'attraction'
}
```

- [ ] **Step 5: 收斂 CombinedInput**

In `components/CombinedInput.tsx`:
- 刪除本地 `TYPE_LABEL`（約 line 23-26）與本地 `inferType`（約 line 45-49）定義。
- 在 import 區加入：`import { inferType, validateType, TYPE_META } from '@/lib/placeType'`
- 將驗證三元式（約 line 95-99）：
  ```typescript
        const validType: PlaceType =
          p.type === 'restaurant' ? 'restaurant' :
          p.type === 'dessert' ? 'dessert' :
          'attraction'
        return { ...found, type: validType } as Place
  ```
  改為：
  ```typescript
        return { ...found, type: validateType(p.type) } as Place
  ```
- 將 `TYPE_LABEL[inferType(searchQuery)]`（約 line 223）改為 `TYPE_META[inferType(searchQuery)].label`。
- 若 `PlaceType` import 變成未使用則移除，避免 lint 警告。

- [ ] **Step 6: 收斂 PlaceSearchBar**

In `components/PlaceSearchBar.tsx`:
- 刪除本地 `TYPE_LABEL`（約 line 6-9）與本地 `inferType`（約 line 12-16）。
- 加入：`import { inferType, TYPE_META } from '@/lib/placeType'`
- 將 `TYPE_LABEL[inferType(query)]`（約 line 75）改為 `TYPE_META[inferType(query)].label`。
- `inferType(query)`（約 line 38）保持不變（現在來自 import）。

- [ ] **Step 7: 收斂 ItineraryPasteInput**

In `components/ItineraryPasteInput.tsx`:
- 加入：`import { validateType } from '@/lib/placeType'`
- 將驗證三元式（約 line 49-53）：
  ```typescript
        const validType: PlaceType =
          p.type === 'restaurant' ? 'restaurant' :
          p.type === 'dessert' ? 'dessert' :
          'attraction'
        return { ...found, type: validType } as Place
  ```
  改為：
  ```typescript
        return { ...found, type: validateType(p.type) } as Place
  ```

- [ ] **Step 8: 收斂 ItineraryCard 徽章（暫不加底色/Picker，僅修編譯）**

In `components/ItineraryCard.tsx`:
- 刪除本地 `TYPE_STYLE`（line 9-13）。
- 加入：`import { TYPE_META } from '@/lib/placeType'`
- 將 `const typeStyle = TYPE_STYLE[place.type]`（line 35）改為 `const meta = TYPE_META[place.type]`。
- 將徽章（line 59-61）：
  ```tsx
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeStyle.bg} ${typeStyle.text}`}>
              {typeStyle.label}
            </span>
  ```
  改為：
  ```tsx
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>
              {meta.label}
            </span>
  ```
- 若 `PlaceType` import 變成未使用則移除。

- [ ] **Step 9: 收斂 schedule.ts + 住宿排程**

In `app/actions/schedule.ts`:
- 刪除 line 5 本地 `const DWELL...`。
- 加入：`import { DWELL } from '@/lib/placeType'`
- 將 line 40 的 attractions 過濾改為納入住宿：
  ```typescript
    const attractions = chunk.filter((p) => p.type === 'attraction' || p.type === 'dessert' || p.type === 'accommodation')
  ```

- [ ] **Step 10: ai.ts prompt 加住宿分類**

In `app/actions/ai.ts`, `extractItinerary` 的 prompt（line 13-14）：
```
1. 找出所有景點、餐廳和甜點名稱
2. 判斷每個地點的類型：景點(attraction)、餐廳(restaurant)、甜點(dessert)
```
改為：
```
1. 找出所有景點、餐廳、甜點和住宿名稱
2. 判斷每個地點的類型：景點(attraction)、餐廳(restaurant)、甜點(dessert)、住宿(accommodation，例如飯店、旅館、民宿)
```

- [ ] **Step 11: 跑測試 + build 確認綠燈**

Run: `npx jest place-type --silent` → Expected: PASS（3 個 describe 全過）。
Run: `npm run build` → Expected: 編譯成功、無 TypeScript 錯誤。
Run: `npx jest --silent` → Expected: 既有測試全數通過。

- [ ] **Step 12: Commit**

```bash
git add lib/placeType.ts lib/types.ts __tests__/place-type.test.ts components/CombinedInput.tsx components/PlaceSearchBar.tsx components/ItineraryPasteInput.tsx components/ItineraryCard.tsx app/actions/schedule.ts app/actions/ai.ts
git commit -m "feat: add accommodation PlaceType and centralize type logic in lib/placeType"
```

---

## Task 2: TypePicker 元件

**Files:**
- Create: `components/TypePicker.tsx`
- Test: `__tests__/type-picker.test.tsx`

**Interfaces:**
- Consumes: `PLACE_TYPES`, `TYPE_META` from `@/lib/placeType`; `PlaceType` from `@/lib/types`。
- Produces: `export function TypePicker(props: { type: PlaceType; onChange: (type: PlaceType) => void; size?: 'sm' | 'md' }): JSX.Element`

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/type-picker.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { TypePicker } from '@/components/TypePicker'

describe('TypePicker', () => {
  it('shows current type and opens a menu with four options', () => {
    render(<TypePicker type="attraction" onChange={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /景點/ }))
    expect(screen.getByText('🏨 住宿')).toBeInTheDocument()
    expect(screen.getByText('🍽 餐廳')).toBeInTheDocument()
    expect(screen.getByText('🍰 甜點')).toBeInTheDocument()
    expect(screen.getByText('🏔 景點')).toBeInTheDocument()
  })

  it('calls onChange with the selected type and closes the menu', () => {
    const onChange = jest.fn()
    render(<TypePicker type="attraction" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /景點/ }))
    fireEvent.click(screen.getByText('🏨 住宿'))
    expect(onChange).toHaveBeenCalledWith('accommodation')
    expect(screen.queryByText('🍽 餐廳')).not.toBeInTheDocument()
  })

  it('marks the current type with a check', () => {
    render(<TypePicker type="restaurant" onChange={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /餐廳/ }))
    // the selected option row contains both the label and a check mark
    expect(screen.getByText('✓')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest type-picker --silent`
Expected: FAIL — `Cannot find module '@/components/TypePicker'`.

- [ ] **Step 3: 實作 TypePicker**

Create `components/TypePicker.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { PLACE_TYPES, TYPE_META } from '@/lib/placeType'
import type { PlaceType } from '@/lib/types'

interface Props {
  type: PlaceType
  onChange: (type: PlaceType) => void
  size?: 'sm' | 'md'
}

export function TypePicker({ type, onChange, size = 'md' }: Props) {
  const [open, setOpen] = useState(false)
  const meta = TYPE_META[type]
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'

  const select = (t: PlaceType) => {
    onChange(t)
    setOpen(false)
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full font-medium ${pad} ${meta.badge}`}
      >
        {meta.emoji} {meta.label} ▾
      </button>
      {open && (
        <>
          {/* 透明全螢幕 overlay：點外面即關閉，不需額外套件 */}
          <button
            type="button"
            aria-label="關閉選單"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[7rem]">
            {PLACE_TYPES.map((t) => {
              const m = TYPE_META[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => select(t)}
                  className="flex items-center justify-between w-full px-3 py-1.5 text-sm hover:bg-gray-50 text-left"
                >
                  <span>{m.emoji} {m.label}</span>
                  {t === type && <span className="text-blue-600 ml-2">✓</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </span>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest type-picker --silent`
Expected: PASS — 3 tests。

- [ ] **Step 5: Commit**

```bash
git add components/TypePicker.tsx __tests__/type-picker.test.tsx
git commit -m "feat: add TypePicker four-option popover badge"
```

---

## Task 3: 行程卡片底色 + TypePicker + 串接 onChangeType

**Files:**
- Modify: `components/ItineraryCard.tsx`
- Modify: `components/ItineraryDay.tsx:13-17,30-39`
- Modify: `app/itinerary/ItineraryClient.tsx`
- Test: `__tests__/itinerary-card-type.test.tsx`

**Interfaces:**
- Consumes: `TypePicker` from `@/components/TypePicker`; `TYPE_META` from `@/lib/placeType`。
- Produces:
  - `ItineraryCard` Props 新增 `onChangeType?: (placeId: string, type: PlaceType) => void`
  - `ItineraryDay` Props 新增 `onChangeType?: (placeId: string, type: PlaceType) => void`
  - `ItineraryClient` 新增 `handleChangeType(dayIdx: number, placeId: string, type: PlaceType): void`（即時 setPlan + planRef，**不重排、不改 durationMin**）

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/itinerary-card-type.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

const BASE: ScheduledPlace = {
  id: 'p1', placeId: 'g1', name: '某飯店', type: 'attraction',
  lat: 0, lng: 0, address: '地址', openingHours: null, rating: null,
  photoUrl: null, description: null, startTime: '09:00', durationMin: 90,
  travelMinToNext: null, aiDescription: null, outsideHours: false,
  lateExit: false, timeLocked: false,
}

it('renders accommodation card with purple background', () => {
  render(<ItineraryCard place={{ ...BASE, type: 'accommodation' }} index={0} />)
  expect(screen.getByTestId('card-p1').className).toContain('bg-purple-50')
})

it('clicking the badge and picking a type calls onChangeType without changing duration', () => {
  const onChangeType = jest.fn()
  render(<ItineraryCard place={BASE} index={0} onChangeType={onChangeType} />)
  fireEvent.click(screen.getByRole('button', { name: /景點/ }))
  fireEvent.click(screen.getByText('🏨 住宿'))
  expect(onChangeType).toHaveBeenCalledWith('p1', 'accommodation')
})

it('shows a static badge (no picker) when onChangeType is absent', () => {
  render(<ItineraryCard place={BASE} index={0} />)
  // static label present, but no ▾ trigger
  expect(screen.getByText('景點')).toBeInTheDocument()
  expect(screen.queryByText(/▾/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest itinerary-card-type --silent`
Expected: FAIL — 卡片無 `bg-purple-50`、無可點徽章。

- [ ] **Step 3: ItineraryCard 加底色 + Picker + onChangeType**

In `components/ItineraryCard.tsx`:
- import 區加入：`import { TypePicker } from './TypePicker'`，並確保 `import type { PlaceType, ScheduledPlace } from '@/lib/types'`（`PlaceType` 會用到）。
- Props（line 15-21）新增 `onChangeType`：
  ```typescript
  interface Props {
    place: ScheduledPlace
    index: number
    draggable?: boolean
    onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
    onToggleLock?: (placeId: string) => void
    onChangeType?: (placeId: string, type: PlaceType) => void
  }
  ```
  並在解構加入 `onChangeType`。
- 外層卡片 `className`（line 41）加入底色 `${meta.cardBg}`，並把預設白底移除：
  ```tsx
      className={`border rounded-xl p-4 ${meta.cardBg} ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}
  ```
- 徽章區（Task 1 已改成 `<span ...>{meta.label}</span>`，line 59-61）改為：
  ```tsx
            {onChangeType ? (
              <TypePicker type={place.type} onChange={(t) => onChangeType(place.id, t)} />
            ) : (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>
                {meta.label}
              </span>
            )}
  ```

- [ ] **Step 4: ItineraryDay 傳遞 onChangeType**

In `components/ItineraryDay.tsx`:
- Props（line 7-15）新增 `onChangeType?: (placeId: string, type: PlaceType) => void`，並 `import type { DayItinerary, TransportMode, PlaceType } from '@/lib/types'`。
- 解構（line 17）加入 `onChangeType`。
- `<ItineraryCard>`（line 31-38）加入 `onChangeType={onChangeType}`。

- [ ] **Step 5: ItineraryClient 加 handleChangeType 並下傳**

In `app/itinerary/ItineraryClient.tsx`:
- import 型別加 `PlaceType`：`import type { PlanResult, ScheduledPlace, Place, PlaceType } from '@/lib/types'`。
- 在 `handleToggleLock` 之後新增（鏡像其「即時 setPlan + planRef、不重排」模式）：
  ```typescript
  const handleChangeType = useCallback((dayIdx: number, placeId: string, type: PlaceType) => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      return {
        ...d,
        places: d.places.map((p) =>
          p.id === placeId ? { ...p, type } : p
        ),
      }
    })
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)
  }, [])
  ```
- 在 `<ItineraryDay>`（line 216-226）加入：
  ```tsx
                onChangeType={(placeId, type) => handleChangeType(dayIdx, placeId, type)}
  ```

- [ ] **Step 6: 跑測試 + build**

Run: `npx jest itinerary-card-type --silent` → Expected: PASS（3 tests）。
Run: `npx jest --silent` → Expected: 全數通過（含既有 `itinerary-card-info`）。
Run: `npm run build` → Expected: 成功。

- [ ] **Step 7: Commit**

```bash
git add components/ItineraryCard.tsx components/ItineraryDay.tsx app/itinerary/ItineraryClient.tsx __tests__/itinerary-card-type.test.tsx
git commit -m "feat: itinerary cards get type-based background and clickable TypePicker"
```

---

## Task 4: 首頁清單四選一 + 新增地點停留時間改用 DWELL

**Files:**
- Modify: `components/PlaceList.tsx`
- Modify: `app/itinerary/ItineraryClient.tsx:152,172`
- Modify: `components/RecommendPanel.tsx:62`
- Test: `__tests__/place-list-type.test.tsx`

**Interfaces:**
- Consumes: `TypePicker` from `@/components/TypePicker`; `DWELL` from `@/lib/placeType`。
- Produces: 無新對外介面（`PlaceList` 的 `onTypeChange` 簽章不變：`(id: string, type: PlaceType) => void`）。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/place-list-type.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { PlaceList } from '@/components/PlaceList'
import type { Place } from '@/lib/types'

const PLACE: Place = {
  id: 'p1', placeId: 'g1', name: '東橫飯店', type: 'attraction',
  lat: 0, lng: 0, address: '地址', openingHours: null, rating: null,
  photoUrl: null, description: null,
}

it('lets the user change a place to accommodation via the four-option picker', () => {
  const onTypeChange = jest.fn()
  render(<PlaceList places={[PLACE]} onTypeChange={onTypeChange} onRemove={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /景點/ }))
  fireEvent.click(screen.getByText('🏨 住宿'))
  expect(onTypeChange).toHaveBeenCalledWith('p1', 'accommodation')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest place-list-type --silent`
Expected: FAIL — 目前只有景點/餐廳二選一，無「🏨 住宿」選項。

- [ ] **Step 3: PlaceList 改用 TypePicker**

In `components/PlaceList.tsx`，將類型按鈕（line 19-28）整段：
```tsx
          <button
            onClick={() => onTypeChange(p.id, p.type === 'attraction' ? 'restaurant' : 'attraction')}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              p.type === 'attraction'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-orange-100 text-orange-700'
            }`}
          >
            {p.type === 'attraction' ? '景點' : '餐廳'}
          </button>
```
改為：
```tsx
          <TypePicker type={p.type} onChange={(t) => onTypeChange(p.id, t)} />
```
並在檔首加入：`import { TypePicker } from './TypePicker'`。

- [ ] **Step 4: 新增地點停留時間改用 DWELL**

In `app/itinerary/ItineraryClient.tsx`：
- 檔首加入：`import { DWELL } from '@/lib/placeType'`
- `handleAddPlace`（line 152）`durationMin: place.type === 'attraction' ? 90 : 60,` 改為 `durationMin: DWELL[place.type],`
- `handleAddPlaces`（line 172）同樣改為 `durationMin: DWELL[place.type],`

In `components/RecommendPanel.tsx`（line 62）`durationMin: r.type === 'attraction' ? 90 : 60,` 改為：
- 檔首加入 `import { DWELL } from '@/lib/placeType'`
- `durationMin: DWELL[r.type],`

- [ ] **Step 5: 跑測試 + build**

Run: `npx jest place-list-type --silent` → Expected: PASS。
Run: `npx jest --silent` → Expected: 全數通過。
Run: `npm run build` → Expected: 成功。

- [ ] **Step 6: Commit**

```bash
git add components/PlaceList.tsx app/itinerary/ItineraryClient.tsx components/RecommendPanel.tsx __tests__/place-list-type.test.tsx
git commit -m "feat: four-option TypePicker on place list, DWELL-based default durations"
```

---

## Self-Review Notes

- **Spec 覆蓋：** §1 資料模型/共用模組 → Task 1；§2 偵測（inferType + ai prompt + validateType）→ Task 1；§3 TypePicker → Task 2；§3 兩個畫面接線 → 卡片 Task 3、清單 Task 4；§4 卡片底色 → Task 3；§5 改類型不改 durationMin、不重排（handleChangeType）+ DWELL 預設 → Task 3/4；§9 測試 1-8 全部對應到 Task 1-4 的測試。
- **編譯綠燈：** 擴充 `PlaceType` 會破壞三個 exhaustive `Record<PlaceType>`（ItineraryCard `TYPE_STYLE`、CombinedInput/PlaceSearchBar `TYPE_LABEL`），Task 1 同一任務內全部改為 import `TYPE_META`，故 Task 1 結束即綠燈。
- **型別一致：** `inferType`/`validateType`/`TYPE_META`/`DWELL`/`PLACE_TYPES`/`TypeMeta` 在各 Task 命名一致；`onChangeType(placeId, type)` 簽章在 ItineraryCard/ItineraryDay/ItineraryClient 一致。
- **不在範圍：** 住宿排程語意（#3）、推薦系統回傳住宿、人潮（#9）皆未納入。
