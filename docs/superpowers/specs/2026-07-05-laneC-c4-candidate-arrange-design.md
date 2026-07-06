# Lane C / C4 — 候選池依地理分到各天（帶箭頭加入）Design Spec

**日期：** 2026-07-05
**Lane：** C（多人協作揪團旅行）／ C4
**依賴：** C3（共享候選池，已 SHIPPED 到 main `95a408f`）
**Roadmap：** [`2026-07-01-laneC-roadmap.md`](./2026-07-01-laneC-roadmap.md) C4

---

## 0. 目標

把 C3 收集到的共享候選池，**依地理位置自動分配到各天**，並讓每個候選**像「推薦行程」卡片一樣、帶一個 `←` 箭頭**顯示在它所屬的那一天下方；使用者點箭頭就把該候選加入那一天（成為真正的行程站點）並從池中移除。**逐個加入、無「全部接受」、無觸發按鈕**——只要池裡有候選就自動顯示建議。

「smart-arrange」在 C4 的體現＝**智慧的「哪一天」分配**（依地理就近）。每天內部的路線順序沿用既有的每日「智慧排程」按鈕（Lane A），C4 不重做。

---

## 1. 使用者故事

團員在候選池丟了一堆想去的地點。使用者打開某趟 trip（`/itinerary/[tripId]`），看到每一天下方自動列出「地理上最適合這天」的候選（帶 `←`）。他掃過每天的建議，點箭頭把要的加進去；不想要的就在候選面板按「移除」，或留在池裡。

---

## 2. 架構總覽

全部在 **client、衍生計算**，分配不需任何 server 呼叫（`findClosestDay` 用 haversine 算 lat/lng）。接受某候選才走既有的 `scheduleRecalc`（結構性，重算時間 + 交通）與 C3 的 `removeCandidate`（RLS）。

```
candidates (C3 state) ── groupByNearestDay(plan.days) ──► candidatesByDay: Candidate[][]
                                                             │
                       ItineraryDay(dayIdx) ◄── candidatesByDay[dayIdx] + onAddCandidate
                             │
                     DayCandidateSuggestions (mirrors DayRecommendations)
                             │  每張卡帶 ← 箭頭（mirrors RecommendationCard）
                       點 ← ─┤
                             ▼
        handleAddCandidateToDay(place, dayIdx, candidateId)  ← 沿用 C3
          = append 到該天 + scheduleRecalc(_, true) + removeCandidate（移動語義）
```

---

## 3. 分配演算法 `groupCandidatesByDay`（純函式）

**輸入：** `days: DayItinerary[]`、`candidates: Candidate[]`
**輸出：** `Candidate[][]`（長度 = `days.length`，`out[i]` = 分到第 i 天的候選）

規則：
- 對每個候選，用既有 `findClosestDay(days, candidate.place)` 取得最近的一天索引。
- **空天無法吸附**：`findClosestDay` 以各天現有地點的重心計算；沒有地點的天不會成為最近目標。
- **全空 fallback**：若 `findClosestDay` 對某候選回傳不到有效天（例如所有天皆空、無重心可比），改用 **round-robin 依索引**分配（第 k 個 fallback 候選 → 第 `k % days.length` 天），確保不會全擠第 0 天、且每天都可能拿到。
- 純函式、無副作用、可獨立測試。輸出順序在每天內沿用 `candidates` 原順序（建立時間序，C3 `listCandidates` 已 `order created_at asc`）。

> 放 `lib/utils/candidateArrange.ts`。

---

## 4. 元件

### 4.1 `DayCandidateSuggestions`（新，mirrors `DayRecommendations`）
- Props：`{ candidates: Candidate[]; onAdd: (candidateId: string, place: Place) => void }`。
- 空 `candidates` → render `null`（該天無建議就不佔位）。
- 每個候選 render 一張卡（沿用 `RecommendationCard` 的視覺：`←` 藍圓鈕 + 名稱 + `由 {addedByName} 加入`）。點鈕 → `onAdd(candidate.id, candidate.place)`。
- 卡片樣式沿用**目前**推薦卡風格（與現行 itinerary 頁一致）；[[DESIGN.md]]「溫暖旅誌」尚未套用到 itinerary 頁，待設計 rollout 時與推薦卡一起改，不在本 C4 範圍。

### 4.2 `ItineraryDay`（改）
- 新增可選 props：`candidates?: Candidate[]`、`onAddCandidate?: (candidateId: string, place: Place) => void`。
- 在既有 `DayRecommendations` 附近（同一建議區塊）render `DayCandidateSuggestions`（當兩者皆有值時）。

### 4.3 `CandidatePanel`（改，C3）
- **拿掉 day-picker `<select>` + 「放進」按鈕**（每天 `←` 箭頭取代手動選天）。
- 保留：搜尋加入（`CombinedInput`）、候選清單（名稱 + `由 X 加入`）、「移除」。
- 對應拿掉 C3 傳入的 `dayCount` / `onPromote` props。

### 4.4 `ItineraryClient`（改）
- 新增衍生值 `candidatesByDay = groupCandidatesByDay(plan.days, candidates)`（`useMemo`，依 `plan.days` 與 `candidates`）。
- 傳 `candidates={candidatesByDay[dayIdx]}` + `onAddCandidate` 給每個 `ItineraryDay`（僅持久化模式 `tripId` 有值時；匿名不傳）。
- `dayIdx` 在 render 時**逐天綁定**（比照既有 `onAddRecommendation={(rec) => handleAddRecommendation(dayIdx, rec)}`）：`onAddCandidate={(candidateId, place) => handleAddCandidateToDay(place, dayIdx, candidateId)}`，直接呼叫**既有** C3 `handleAddCandidateToDay`（append + `scheduleRecalc(_, true)` + `removeCandidate`）。
- `CandidatePanel` 改用新 props（移除 `dayCount`/`onPromote`）。

---

## 5. 接受流程（點 `←`）

沿用 C3 `handleAddCandidateToDay`：
1. 以 `DWELL[type]` 等預設欄位把 `place` 建成 `ScheduledPlace`，append 到 `dayIdx` 該天末尾。
2. `scheduleRecalc(newPlan, true)`：重算時間 + 每段交通（結構性）→ 觸發 autosave。
3. `void removeCandidate(candidateId)`：從 DB 刪候選（RLS：任一 participant，C3 已放寬）+ 本地池移除。

**逐個、只在點擊時發生** → 不會 bulk 清空池，天然規避 C3 review 標記的「非交易性」風險放大。

---

## 6. 錯誤處理 / 邊界

- **匿名模式（無 `tripId`）**：不計算、不顯示候選建議（`ItineraryDay` 不收 `candidates`）。零影響匿名試用。
- **候選 place 缺 lat/lng**（理論上不會，Place 必填）：`findClosestDay` 已處理；fallback round-robin 兜底。
- **接受後 `removeCandidate` 失敗**（非 participant／RLS）：沿用 C3 `onRemoveCandidate` 的 `catch`——候選留在池、但地點已加入該天（與 C3 promote 行為一致；已登記為已知限制）。
- **天數變動**（刪天／散開）：`candidatesByDay` 依 `plan.days` 衍生，天數變則自動重算；`out` 長度恆等 `days.length`。

---

## 7. 測試

- **`groupCandidatesByDay` 純函式**（`__tests__/candidate-arrange.test.ts`）：就近分配（東群→有東邊錨的天、西群→西天）；全空 → round-robin；長度恆等 days.length；空候選 → 全空陣列。
- **`DayCandidateSuggestions`**（`__tests__/day-candidate-suggestions.test.tsx`）：空 → null；列出候選 + `由 X 加入`；點 `←` → `onAdd(id, place)`。
- **`ItineraryClient` 整合**（擴充或新測）：持久化模式下某天下方出現其地理候選 + `←`；點 `←` → 該地點進該天、候選離池（沿用 C3 `handleAddCandidateToDay`，`removeCandidate` mock）；匿名模式不顯示任何候選建議。
- **`CandidatePanel`**（改 C3 測）：day-picker/`放進` 移除後，仍能搜尋加入 + 列出 + 移除；不再有「放進」按鈕。
- **迴歸**：C3 全測試（candidates-actions / trip-page-candidates）+ 既有 ItineraryClient / recommendations 測試保持綠。

---

## 8. 明確不做（YAGNI / 範圍外）

- 不做「全部接受」按鈕、不做觸發按鈕（使用者已確認：自動顯示、逐個箭頭）。
- 不在接受時自動跑每日路線最佳化（`arrangeDayOrder`）——沿用推薦「append + recalc 時間」語義；路線順序交給既有每日智慧排程按鈕。
- 不做候選在池面板手動選天（day-picker 移除）。
- 不做交易性 promote RPC（C3 已知限制，留待 C5）。
- 不套用「溫暖旅誌」設計系統到候選卡（待 itinerary 頁整體 rollout）。
- live Supabase 驗證延後（等金鑰），沿用 C1–C3 code-first。
