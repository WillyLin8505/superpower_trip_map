# 旅遊行程規劃工具 — 設計文件

**日期：** 2026-06-25  
**狀態：** 已核准

---

## 概述

一個通用型旅遊行程規劃工具。終端使用者輸入自己想去的景點與餐廳，系統自動計算最順路的每日行程；同時從**網站設計者預先設定的參考網站**中，自動分析並推薦適合融入行程的額外地點。

角色分工：
- **網站設計者（你）**：透過後台管理頁面設定參考網站 URL（美食部落格、旅遊網站等）
- **終端使用者**：輸入景點與餐廳，取得行程規劃 + 自動推薦

---

## 功能範圍

**終端使用者功能：**
- Google Places Autocomplete 地點搜尋
- 自動抓取每個地點的營業時間、評分、照片、票價（Google Places API）
- 2-opt TSP 演算法計算最短路線
- 使用者指定天數與交通方式
- 時段感知排程（餐廳自動分配到午晚餐時段）
- Google Maps 嵌入顯示完整路線
- Claude CLI 生成每日行程摘要與地點特色說明
- **可編輯行程**：拖拉重排 + 手動調整時間，停止操作 2 秒後自動重算
- **自動推薦**：行程生成時同步從參考網站推薦額外地點，使用者可勾選加入並重新規劃

**後台管理功能（設計者用）：**
- 新增 / 刪除參考網站 URL
- 為每個 URL 加上標籤（如「台北美食部落格」）
- 查看 URL 上次爬取狀態

**明確不在範圍內：**
- 使用者帳號或行程儲存
- 訂位或購票整合
- 多人協作規劃
- 後台管理的身份驗證（本機使用，不對外公開）

---

## 頁面結構

### 輸入頁面 `/`

- 地點搜尋框（Google Places Autocomplete）
- 已選地點列表，類型標籤（景點 / 餐廳）可切換，支援刪除
- 設定欄：天數、交通方式（開車 / 步行 / 大眾運輸）
- 「開始規劃」按鈕 → 同時觸發行程計算 + 推薦分析

### 行程頁面 `/itinerary`

頁面分為三個區域：

**左側 — 可編輯行程列表**
- 按天分組，每天一個區塊
- 每個地點卡片：名稱、類型、開始時間（可編輯）、停留時長（可編輯）、營業時間、評分、票價（如有）、交通時間到下一站、AI 生成的 1 句特色說明
- 每天頂部顯示 AI 生成的 3-4 句行程摘要
- 支援拖拉重排（同天內 / 跨天）
- 停止操作 2 秒後自動重算時間與地圖路線
- 超出營業時間顯示橘色警告

**右側 — Google Maps**
- 依序標示所有停靠點（數字標記）
- 顯示完整路線，行程變動後即時更新
- 點擊地圖標記跳到左側對應卡片

**底部 — 自動推薦區塊**
- 行程生成時同步在背景分析，完成後自動顯示
- 每個推薦卡片包含：地點名稱、類型、Claude 推薦理由（1-2 句）、來源網站標籤
- 使用者勾選想加入的地點 → 「加入並重新規劃」→ 整合到現有行程，重新計算最順路排法

### 後台管理頁面 `/admin`

- 參考網站清單（URL + 標籤 + 上次爬取狀態）
- 新增網站表單（URL + 標籤欄位）
- 每筆資料旁有刪除按鈕
- 資料存在 `config/sources.json`（JSON 檔，不需要資料庫）

---

## 核心邏輯

### 「開始規劃」同步觸發兩個流程

```
使用者按下「開始規劃」
       ↓
  [並行執行]
  ┌─────────────────────────┐   ┌──────────────────────────────┐
  │   行程計算流程           │   │   推薦分析流程               │
  │ 1. Google Places 取得   │   │ 1. 讀取 sources.json         │
  │    地點詳細資訊          │   │ 2. 爬取各參考網站 HTML        │
  │ 2. Distance Matrix 建立 │   │ 3. Claude CLI 分析內容        │
  │    距離矩陣              │   │    找出適合的推薦地點         │
  │ 3. 2-opt TSP 優化        │   │ 4. Google Places 驗證地點    │
  │ 4. 時段排程              │   │    是否存在                  │
  │ 5. Claude CLI 生成       │   └──────────────────────────────┘
  │    行程摘要與說明         │
  └─────────────────────────┘
       ↓                               ↓
  行程頁面先顯示             推薦區塊顯示 loading，
  （主流程先完成）           分析完成後自動填入
```

### 路線優化

```
1. 取得所有地點經緯度（Google Places Details API）
2. 呼叫 Google Distance Matrix API 建立 N×N 距離矩陣
   - 超過 25 個地點時改用 Haversine 直線距離補充
3. 最近鄰演算法建立初始路線
4. 2-opt 改善：反覆交換兩段路線，直到無法繼續優化
5. 按天數平均切割路線
```

### 時段排程

| 時段 | 時間 | 優先分配 |
|------|------|----------|
| 早上 | 09:00–12:00 | 景點 |
| 午餐 | 12:00–13:30 | 最近的餐廳 |
| 下午 | 13:30–18:00 | 景點 |
| 晚餐 | 18:30–20:00 | 最近的餐廳 |

若某天的餐廳不足則只排晚餐，午餐時段略過。

### 可編輯行程

- 拖拉使用 `@dnd-kit/core`，支援同天內重排和跨天移動
- 點擊開始時間 → 時間選擇器；點擊停留時長 → 下拉選單
- 使用者手動調整後，系統**尊重使用者排序**，不再重新 TSP 優化
- 只重算：各地點到達時間、交通時間、地圖路線
- 停止操作後 2 秒 debounce 觸發重算

### 推薦分析流程

```
1. 讀取 config/sources.json 取得所有參考網站 URL
2. 並行爬取每個 URL 的 HTML，提取純文字內容
3. 呼叫 Claude CLI：
   claude -p "使用者目前的行程地點：[地點列表]
   以下是旅遊參考網站的內容：[爬取的文字內容]
   請推薦最多 8 個尚未在使用者行程中、但適合加入的餐廳或景點。
   考量因素：與現有地點的地理相近性、行程的整體風格。
   每個推薦包含：name（地點名稱）、type（restaurant/attraction）、
   reason（推薦理由，繁體中文，1句）、source（來源網站標籤）。
   回傳 JSON 陣列。"
4. 解析 JSON，對每個地點呼叫 Google Places Search API 驗證
5. 有 Google 驗證的地點才顯示在推薦清單
```

### Claude CLI 行程摘要

```bash
claude -p "你是旅遊達人。第X天行程：[地點列表]
請用繁體中文回答：
1. 50字以內的今日摘要
2. 每個地點一句特色介紹（格式：地點名稱：介紹）
回傳 JSON。"
```

---

## 技術架構

**Tech Stack：**
- Next.js 14（App Router + Server Actions）
- Tailwind CSS
- `@dnd-kit/core`（拖拉排序）
- Google Maps JavaScript API（前端地圖）
- Google Places API（地點搜尋與詳細資訊）
- Google Distance Matrix API（距離矩陣）
- Google Directions API（路線顯示）
- Claude CLI（`child_process.exec`，可日後換成 Anthropic SDK）

**環境變數：**
```
GOOGLE_MAPS_API_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
```

**設定檔：**
```
config/sources.json   # 參考網站清單，由後台管理頁面讀寫
```

**專案結構：**
```
app/
  page.tsx                    # 輸入頁面
  itinerary/page.tsx          # 行程頁面
  admin/page.tsx              # 後台管理頁面
  actions/
    places.ts                 # Google Places API
    directions.ts             # 距離矩陣
    optimize.ts               # 2-opt TSP
    schedule.ts               # 時段排程
    ai.ts                     # Claude CLI subprocess
    scrape.ts                 # 網站爬取
    recommend.ts              # 推薦分析
    sources.ts                # sources.json 讀寫
components/
  PlaceSearch.tsx
  PlaceList.tsx
  ItineraryDay.tsx            # 單日區塊（拖拉容器）
  ItineraryCard.tsx           # 地點卡片（可拖拉）
  TimeEditor.tsx              # 時間 / 停留時長編輯器
  MapView.tsx                 # Google Maps
  RecommendPanel.tsx          # 推薦區塊
  RecommendCard.tsx           # 推薦地點卡片
  admin/
    SourceList.tsx            # 參考網站清單
    SourceForm.tsx            # 新增網站表單
config/
  sources.json                # 參考網站資料
```

**API 安全性：** 所有 Google API 與 Claude CLI 呼叫均在 Server Actions 執行，不暴露於前端。

---

## 錯誤處理

- Google Places 找不到地點 → 顯示提示，不阻止規劃
- Distance Matrix 無法計算 → 降級使用直線距離
- Claude CLI 失敗 → 行程仍正常顯示，推薦區塊顯示「暫時無法取得推薦」
- 網站爬取失敗（403 / timeout）→ 略過該網站，其他來源繼續處理
- 時間調整導致超出營業時間 → 橘色警告標示，不強制阻止
- 地點數超過 25 個 → 提示使用者上限

---

## 限制與假設

- 最多支援 25 個地點（Distance Matrix API 上限）
- Claude CLI 須本機已登入；部署至 Vercel 時需改用 Anthropic SDK
- 預設景點停留 1.5 小時、餐廳 1 小時（可透過編輯器手動調整）
- 行程預設 09:00 開始、20:00 結束（可手動調整）
- 參考網站需可公開爬取（不支援需登入或純 JavaScript 渲染的頁面）
- 後台管理頁面不含身份驗證（假設本機或內網使用）
- 使用者手動調整順序後，系統尊重其決策，不再自動 TSP 優化
