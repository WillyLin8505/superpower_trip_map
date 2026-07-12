# 點卡片在 Google Maps 開啟該地點 Design Spec

**日期：** 2026-07-12
**Lane：** Manager / TASK-012（取代原「右側 place drawer」設計 —— 改為直接開新分頁到 Google Maps）
**產品決策：** 使用者改需求（2026-07-12）：不做 in-app 右側抽屜（會與 TASK-022 的 3 頁籤側欄搶版面,且照片詳情已由 TASK-011 燈箱涵蓋）。改為點卡片直接**在新分頁開啟 Google Maps 搜尋該地點**。

## 1. 目標

在每張地點卡片上提供「在 Google Maps 開啟」的入口,點了就用新分頁開啟該地點的 Google Maps 頁面(用 `place_id` 精準定位)。純外部連結,不動 app 版面。

## 2. 背景（現況）

- `lib/utils/mapUrl.ts` 已有 `buildDayEmbedUrl(places, mode)`(嵌入整天路線圖)。
- 地點型別 `Place`：`placeId`(Google Place ID)、`name`、`address`。
- 卡片元件:`ItineraryCard.tsx` / `CardContent.tsx`(行程與 timeline 共用)、`RecommendationCard.tsx`、`CandidatePanel.tsx`。
- **原 TASK-012「右側抽屜」spec 從未寫成檔**(懸空引用);本案是它的實際設計,並解掉與 TASK-022 的版面重疊。

## 3. 範圍

- 新增 `buildPlaceMapsUrl(place)` 於 `lib/utils/mapUrl.ts`。
- 在地點卡片加「🗺️ 在 Google Maps 開啟」入口(link/button,新分頁)。
- **不做** in-app 抽屜、**不改**版面、**不改**排程。

## 4. URL 設計

```ts
// lib/utils/mapUrl.ts
export function buildPlaceMapsUrl(place: { name: string; placeId?: string | null; address?: string }): string {
  const params = new URLSearchParams({ api: '1', query: place.name || place.address || '' })
  if (place.placeId) params.set('query_place_id', place.placeId)
  return `https://www.google.com/maps/search/?${params.toString()}`
}
```

- 有 `placeId` → 帶 `query_place_id` 精準定位;沒有 → 用 `name`(退而用 `address`)。
- 官方 Maps URLs（`api=1`）格式,不需 API key、不計費。

## 5. UI

- 卡片上一個小 icon/連結:`🗺️ 在 Google Maps 開啟`,`aria-label="在 Google Maps 開啟"`。
- 用 `<a href={buildPlaceMapsUrl(place)} target="_blank" rel="noopener noreferrer">` 或 `window.open(url, '_blank', 'noopener')`。
- 位置:與現有卡片按鈕群(鎖/刪除/封存)並列,不干擾拖曳。
- 沿用 `DESIGN.md` token。

## 6. 錯誤 / 邊界

- 無 `placeId` 且無 `name`/`address` → 不顯示該入口(或 disabled）。
- 純前端 + 外部連結,無 server、無金鑰、無費用。

## 7. 測試（TDD）

1. **`buildPlaceMapsUrl`**：有 placeId → URL 含 `query_place_id`；無 placeId → 用 name；皆正確 encode。
2. **卡片**：`ItineraryCard`/`RecommendationCard`/`CandidatePanel` 顯示「在 Google Maps 開啟」入口,`href` 正確、`target="_blank"`、`rel` 含 `noopener`。
3. **回歸**：卡片既有行為(鎖/刪除/封存/照片燈箱)不受影響。

## 8. Global Constraints

- TypeScript strict,無 production `any`。
- 遵循 `DESIGN.md`。
- 既有全測試保持綠;`next build` 成功。

## 9. Self-Review

- **Placeholder scan：** 無 TBD。
- **範圍：** 一個純函式 + 卡片上一個外部連結。小型,單一 plan。
- **重疊解除：** 不再碰右側面板 → 與 TASK-022（3 頁籤 + 封存）**無版面衝突**;僅共同觸及卡片元件檔(加按鈕),屬低度衝突。
- **依賴：** 無(place 型別既有)。
