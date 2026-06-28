# 住宿標籤 + 手動改標籤 + 卡片顏色 Design

**Goal:** 在四種標籤（住宿 / 餐廳 / 甜點 / 景點）的基礎上，讓使用者點標籤就能手動改類型（首頁清單與行程頁卡片都可改），並依類型給卡片不同的淡色底色。

**Scope:** 子專案 #1（需求 1）。屬於 12 項需求拆解後的第一個。住宿的真正排程語意（入住時間、每天接續前一天住宿＝需求 10）**不在本範圍**，留給子專案 #3。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS。不新增 npm 套件。

---

## 1. 資料模型與共用模組

### 1.1 PlaceType 新增 accommodation

`lib/types.ts`：
```typescript
export type PlaceType = 'attraction' | 'restaurant' | 'dessert' | 'accommodation'
```

### 1.2 新建 `lib/placeType.ts`（集中所有 type 相關常數與邏輯）

目前 `inferType`、`TYPE_LABEL`、`TYPE_STYLE`、`DWELL` 在多個檔案重複定義（`CombinedInput.tsx`、`PlaceSearchBar.tsx`、`ItineraryCard.tsx`、`app/actions/schedule.ts` 等）。因為加入第 4 種類型必須改到每一處，於此收斂為單一來源。

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
```

偵測優先序：**accommodation → dessert → restaurant → attraction(預設)**。住宿關鍵字最具辨識性，故最先判斷。邊界情況（例如飯店內餐廳）使用者可手動改，可接受。

---

## 2. 自動偵測（Claude 解析）

`app/actions/ai.ts` 的 `extractItinerary` prompt：類型分類加入 `accommodation（住宿，例如飯店、旅館、民宿）`。

各處貼上/搜尋結果的類型驗證（目前 `restaurant → restaurant`、`dessert → dessert`、其餘 → `attraction`）改為集中函式，明確納入 `accommodation`：

`lib/placeType.ts` 再加：
```typescript
export function validateType(t: string): PlaceType {
  return t === 'restaurant' || t === 'dessert' || t === 'accommodation'
    ? t
    : 'attraction'
}
```
取代 `CombinedInput.tsx` 與 `ItineraryPasteInput.tsx` 內部的三元驗證。

---

## 3. TypePicker 元件（點標籤 → 四選一彈出選單）

新建 `components/TypePicker.tsx`，首頁 `PlaceList` 與行程頁 `ItineraryCard` 共用。

### Props
```typescript
interface Props {
  type: PlaceType
  onChange: (type: PlaceType) => void
  size?: 'sm' | 'md'   // sm 用於緊湊清單，md 用於卡片；預設 'md'
}
```

### 行為
- 顯示目前類型徽章：`{emoji} {label} ▾`，套用 `TYPE_META[type].badge`。
- 點徽章 → 切換彈出選單開合（`useState` 控制 `open`）。
- 彈出選單依 `PLACE_TYPES` 順序列出四個選項，每項 `{emoji} {label}`；目前類型顯示 `✓`。
- 點某選項 → 呼叫 `onChange(t)` 並關閉選單。
- 點選單以外區域 → 關閉（以 `onBlur`/外部點擊偵測；用一層透明全螢幕 overlay 接收點擊關閉，避免額外套件）。
- 純前端互動，不影響其他狀態。

### 樣式
- 徽章為 `<button type="button">`，避免在卡片內觸發拖曳或表單送出。
- 選單 `absolute z-10`，定位於徽章下方。

---

## 4. 卡片底色

`components/ItineraryCard.tsx`：卡片最外層套用 `TYPE_META[place.type].cardBg`（淡色 bg-50）。

| 類型 | emoji | 徽章 | 卡片底色 |
|------|-------|------|----------|
| 景點 attraction | 🏔 | bg-blue-100 / text-blue-700 | bg-blue-50 |
| 住宿 accommodation | 🏨 | bg-purple-100 / text-purple-700 | bg-purple-50 |
| 餐廳 restaurant | 🍽 | bg-amber-100 / text-amber-700 | bg-amber-50 |
| 甜點 dessert | 🍰 | bg-pink-100 / text-pink-700 | bg-pink-50 |

- `outsideHours` 的橘色邊框（`border-orange-300`）與警告字維持不變，疊在底色之上。底色為 bg-50 對比足夠，橘色邊框仍清楚。
- 卡片原本的 `TYPE_STYLE` 徽章改用 `TypePicker`（行程頁卡片的徽章本來不可點，改為可點）。

---

## 5. 排程與停留時間行為

- **改類型只更新 `place.type`（連帶顏色、標籤、排程分類），不改 `durationMin`。** 符合需求 7「停留時間只由我手動改」。
- 行程頁改類型**不觸發重排**：client 端 `recalcDay` 依 `durationMin` 與 `travelMinToNext` 計算，不看 `type`，故改類型無需 `scheduleRecalc`。
- `handleAddPlace`（`ItineraryClient.tsx`）新增地點時的預設停留時間改用 `DWELL[place.type]`（取代現行 `type === 'attraction' ? 90 : 60`），住宿因此得到 60 分預設。
- 住宿在伺服器端 `schedulePlaces` 中**比照景點順序排入**（與 attraction 同流，不綁定餐別時段）。本子專案不為住宿做特別排程。

---

## 6. 不在範圍

- 住宿排程語意：入住時間、每天開頭接續前一天住宿（需求 10）→ 子專案 #3。
- 推薦系統 `app/actions/recommend.ts` 與 `components/RecommendCard.tsx` 仍只處理景點/餐廳，不動（推薦不會回傳住宿）。

---

## 7. Global Constraints

- TypeScript strict，無 `any`。
- 不新增 npm 套件。
- UI 文案皆為繁體中文。
- 既有測試需全數通過；新功能以 TDD 補測試。
- `lib/placeType.ts` 為 type 相關常數/邏輯的單一來源；不得在元件內重新定義 `inferType`/`TYPE_LABEL`/`TYPE_STYLE`/`DWELL`。

---

## 8. 變更檔案

| 檔案 | 動作 |
|------|------|
| `lib/placeType.ts` | 新增：PlaceType 常數、TYPE_META、DWELL、inferType、validateType |
| `components/TypePicker.tsx` | 新增：四選一彈出徽章 |
| `lib/types.ts` | 修改：PlaceType 加 accommodation |
| `app/actions/schedule.ts` | 修改：DWELL 改 import；住宿比照景點排入 |
| `app/actions/ai.ts` | 修改：extractItinerary prompt 加 accommodation 分類 |
| `components/ItineraryCard.tsx` | 修改：卡片底色、徽章改 TypePicker、加 onChangeType |
| `components/PlaceList.tsx` | 修改：二選一 → TypePicker 四選一 |
| `components/CombinedInput.tsx` | 修改：inferType/TYPE_LABEL/validateType 改 import |
| `components/PlaceSearchBar.tsx` | 修改：inferType/TYPE_LABEL 改 import |
| `components/ItineraryPasteInput.tsx` | 修改：類型驗證改 validateType；COUNTRIES 維持原樣 |
| `app/itinerary/ItineraryClient.tsx` | 修改：handleAddPlace 用 DWELL；接 ItineraryCard 的 onChangeType（更新 type，不重排、不改 durationMin） |

---

## 9. 測試

新增 `__tests__/place-type.test.ts`：
1. `inferType('Toyoko Hotel')` / `'某某飯店'` / `'阿里山民宿'` → `'accommodation'`。
2. `inferType` 既有的甜點/餐廳/景點判斷不回歸。
3. `TYPE_META` 與 `DWELL` 皆含四鍵。
4. `validateType('accommodation')` → `'accommodation'`；`validateType('foo')` → `'attraction'`。

新增 `__tests__/type-picker.test.tsx`：
5. 點徽章 → 彈出四個選項（住宿/餐廳/甜點/景點）。
6. 點某選項 → 呼叫 `onChange` 帶該類型，選單關閉。
7. 目前類型選項顯示勾選標記。

修改 `__tests__/`（行程卡片相關，若有）：
8. 行程頁卡片點徽章改類型 → 卡片底色類別隨之改變、`durationMin` 不變。
