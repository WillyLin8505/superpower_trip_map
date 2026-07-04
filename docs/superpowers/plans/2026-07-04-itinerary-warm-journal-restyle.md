# 行程頁套用「溫暖旅誌」設計系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `DESIGN.md`（溫暖旅誌）視覺系統套到行程頁：暖紙底、赭土主色取代全站藍、Fraunces + Noto Serif TC 襯線每日標題、Noto Sans TC 內文、類別暖色左邊框、收斂按鈕。純視覺，零行為改動。

**Architecture:** Token 先行——先在 `tailwind.config.ts` 建語意色/字型 token 與 `app/layout.tsx` 字型載入，再讓元件改用語意 class（`bg-clay`、`text-ink`…）。類別色集中在 `lib/placeType.ts` 的 `TYPE_META`（改一處，所有卡片跟著變）。

**Tech Stack:** Next.js 14 App Router、Tailwind CSS 3.4、`next/font/google`、TypeScript strict、Jest + RTL。

**Spec:** `docs/superpowers/specs/2026-07-04-itinerary-warm-journal-restyle-design.md`

## Global Constraints

- 純樣式改動：不改排程、server actions、資料模型、元件 props 語意或行為；文案一字不動。
- TypeScript strict、無 production `any`、不新增 npm 套件（字型走 `next/font/google`）。
- 既有 ~316 測試維持綠；只允許更新本計畫指名的 3 個綁色 class 斷言。
- 驗證 gate 必含 `next build`（非只 `npm test`／`lint`）。
- 依 `CLAUDE.md`：非 trivial 改動經 Codex review（`codex ... -m gpt-5.5`）後才算完成。
- 色彩一律走語意 token，不散落 hex；行程頁範圍內不得殘留 `blue-*`。

## Token Mapping（所有 restyle 任務共用的替換對照）

| 舊 class | 新 class |
|---|---|
| `bg-blue-600` | `bg-clay` |
| `hover:bg-blue-700` | `hover:bg-clay-deep` |
| `bg-blue-100` | `bg-clay-tint` |
| `bg-blue-50` | `bg-clay-tint` |
| `text-blue-700` / `text-blue-600` | `text-clay-deep` / `text-clay` |
| `border-blue-300` | `border-clay/40` |
| `border-blue-500` | `border-clay` |
| `ring-blue-400` / `focus:ring-blue-500` | `ring-clay` / `focus:ring-clay` |
| `text-gray-900` / `text-gray-800` | `text-ink` |
| `text-gray-500` / `text-gray-600` | `text-muted` |
| `border-gray-200` | `border-border` |
| `text-orange-600`（警告文字） | `text-warn` |
| `border-orange-300`（outsideHours 邊框） | `border-warn` |
| `text-purple-700`（nightIndex） | `text-lodging-ink` |

**類別色**由 `TYPE_META` 決定（Task 2 統一改），元件不再各自寫類別色。

---

## Task 1: 設計 token 打底（字型 + Tailwind theme + globals）

**Files:**
- Modify: `app/layout.tsx`
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`

**Interfaces — Produces:** Tailwind 語意色 token（`paper surface border(+strong) ink muted clay(DEFAULT/deep/tint) sea(+tint) attraction/restaurant/lodging/dessert(各 DEFAULT/tint/ink) success warn error`）與字型 utility（`font-display`、`font-body`），供後續所有任務使用。

- [ ] **Step 1: 換字型載入** — 用 Task 內容整檔覆寫 `app/layout.tsx`：

```tsx
import type { Metadata } from 'next'
import { Fraunces, Noto_Serif_TC, Noto_Sans_TC } from 'next/font/google'
import Script from 'next/script'
import { Header } from '@/components/Header'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-fraunces', display: 'swap' })
const notoSerifTC = Noto_Serif_TC({ weight: ['500', '600', '700'], variable: '--font-noto-serif-tc', display: 'swap', preload: false })
const notoSansTC = Noto_Sans_TC({ weight: ['400', '500', '700'], variable: '--font-noto-sans-tc', display: 'swap', preload: false })

export const metadata: Metadata = { title: '旅遊行程規劃' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${fraunces.variable} ${notoSerifTC.variable} ${notoSansTC.variable}`}>
      <head>
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
          strategy="beforeInteractive"
        />
      </head>
      <body className="font-body bg-paper text-ink"><Header />{children}</body>
    </html>
  )
}
```
> `preload: false` 給兩個 TC 字型是必要的：CJK 字型太大，next/font 未設 subsets 時 preload 會報錯。

- [ ] **Step 2: 建 Tailwind token** — 整檔覆寫 `tailwind.config.ts`：

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#FBF7F0",
        surface: "#FFFDF9",
        border: { DEFAULT: "#EBE3D7", strong: "#DED3C3" },
        ink: "#2B2320",
        muted: "#7A6F66",
        clay: { DEFAULT: "#C65D3B", deep: "#A94A2E", tint: "#F6E7DF" },
        sea: { DEFAULT: "#3E7C7B", tint: "#E1EBEA" },
        attraction: { DEFAULT: "#E8B04B", tint: "#F7EBCF", ink: "#8A6516" },
        restaurant: { DEFAULT: "#D98C6A", tint: "#F5E4DA", ink: "#A5512E" },
        lodging: { DEFAULT: "#7C8B6A", tint: "#E7ECDF", ink: "#4D5A3A" },
        dessert: { DEFAULT: "#C17B9B", tint: "#F3E4EC", ink: "#8A4C6B" },
        success: "#4E8A5B", warn: "#D08A2C", error: "#C0392B",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "var(--font-noto-serif-tc)", "serif"],
        body: ["var(--font-noto-sans-tc)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
```
> 舊的 `colors: { background, foreground }`（指向已刪的 CSS 變數）一併移除。先 `grep -rE "bg-background|text-foreground" app components`；預期 0 筆，若有需一併換成 `bg-paper`/`text-ink`。dessert 色 DESIGN.md 未列，本處補一個暖莓色並在收尾把它補進 DESIGN.md 類別清單。

- [ ] **Step 3: 換 globals.css** — 整檔覆寫 `app/globals.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: #FBF7F0;
  color: #2B2320;
  font-family: var(--font-noto-sans-tc), system-ui, sans-serif;
}

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}
```
> 移除舊 `:root` 變數、`@media (prefers-color-scheme: dark)` 區塊與 `Arial` fallback（深色留待 follow-up）。

- [ ] **Step 4: 驗證（build + 視覺）**

Run: `npx jest --silent` → 全綠（本步無改元件，既有測試不受影響）。
Run: `npm run build` → 成功、無 type error。
啟 dev（注意實際 port，見 [[local-ui-preview-recipe]]），用 gstack browse 確認：
```
$B goto http://localhost:PORT
$B js "getComputedStyle(document.body).backgroundColor"   # 期望 rgb(251, 247, 240)
$B js "getComputedStyle(document.body).fontFamily"          # 期望含 Noto Sans TC
```
Expected: body 底色暖紙、字型 Noto Sans TC。

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx tailwind.config.ts app/globals.css
git commit -m "style(design): token foundation — warm palette + Fraunces/Noto TC fonts + globals"
```

---

## Task 2: 類別色 + ItineraryCard 套用（含 3 個測試斷言更新）

**Files:**
- Modify: `lib/placeType.ts`（`TypeMeta` 加 `accent`、`TYPE_META` 換色）
- Modify: `components/ItineraryCard.tsx`
- Modify: `__tests__/itinerary-card-info.test.tsx`（第 94-95 行斷言）
- Modify: `__tests__/itinerary-card-type.test.tsx`（第 39 行斷言）

**Interfaces:**
- Consumes: Task 1 的 `attraction/restaurant/lodging/dessert/clay/ink/muted/border/warn` token。
- Produces: `TYPE_META[type].accent`（`border-l-<類別>` class）供卡片左邊框；卡片底色改為 `bg-surface` + 類別左邊框。

- [ ] **Step 1: 先改測試斷言（讓它失敗）** — 這是 restyle 的 TDD 迴圈：把兩支測試改成期望的新 class。

`__tests__/itinerary-card-info.test.tsx` 第 94-95 行改成：
```tsx
  expect(badge.className).toContain('bg-dessert-tint')
  expect(badge.className).toContain('text-dessert-ink')
```
`__tests__/itinerary-card-type.test.tsx` 第 39 行改成：
```tsx
  expect(screen.getByTestId('card-p1').className).toContain('border-l-lodging')
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest itinerary-card-info itinerary-card-type --silent`
Expected: FAIL（元件仍輸出舊 pink/purple class）。

- [ ] **Step 3: 改 `lib/placeType.ts`** — `TypeMeta` interface 加一欄，`TYPE_META` 換色。

介面（在既有 `badge`/`cardBg` 附近）加：
```ts
  accent: string       // 類別左邊框 Tailwind 類別（border-l-<類別>）
```
`TYPE_META` 四型改為（底色統一 `bg-surface`，類別以左邊框 + tint 徽章表達）：
```ts
export const TYPE_META: Record<PlaceType, TypeMeta> = {
  attraction:    { label: '景點', emoji: '🏔', badge: 'bg-attraction-tint text-attraction-ink', cardBg: 'bg-surface', accent: 'border-l-attraction' },
  accommodation: { label: '住宿', emoji: '🏨', badge: 'bg-lodging-tint text-lodging-ink',       cardBg: 'bg-surface', accent: 'border-l-lodging' },
  restaurant:    { label: '餐廳', emoji: '🍽', badge: 'bg-restaurant-tint text-restaurant-ink', cardBg: 'bg-surface', accent: 'border-l-restaurant' },
  dessert:       { label: '甜點', emoji: '🍰', badge: 'bg-dessert-tint text-dessert-ink',       cardBg: 'bg-surface', accent: 'border-l-dessert' },
}
```
> `cardBg` 保留欄位（其他元件 RecommendationCard/TimelineCard 仍讀它），值改為 `bg-surface`。

- [ ] **Step 4: 改 `components/ItineraryCard.tsx`** — 精確替換：

- 第 53 行外層 class：
  舊 `` className={`border rounded-xl p-4 ${meta.cardBg} ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`} ``
  新 `` className={`border border-l-4 rounded-xl p-4 ${meta.cardBg} ${meta.accent} ${place.outsideHours ? 'border-warn' : 'border-border'}`} ``
- 第 65 行徽章：`bg-blue-600` → `bg-clay`。
- 第 70 行名稱：`text-gray-900` → `text-ink`。
- 第 78 行 nightIndex：`text-purple-700` → `text-lodging-ink`。
- 第 80/118/121/124 行警告文字：`text-orange-600` → `text-warn`。
- 第 85/94 行時間：`text-sm text-gray-500` → `text-sm text-clay-deep tabular-nums`（時間改赭土 + 對齊數字）。
- 第 92 行箭頭 `text-gray-400` → `text-muted`；第 109/112 行 `text-gray-500` → `text-muted`；第 153 行 `text-gray-400` → `text-muted`。

- [ ] **Step 5: 跑測試確認通過 + 迴歸**

Run: `npx jest itinerary-card-info itinerary-card-type --silent` → PASS。
Run: `npx jest --silent` → 全綠（TYPE_META 級聯到 CardContent/RecommendationCard/TimelineCard，皆只換色不改行為）。
Run: `npm run build` → 成功。

- [ ] **Step 6: Commit**

```bash
git add lib/placeType.ts components/ItineraryCard.tsx __tests__/itinerary-card-info.test.tsx __tests__/itinerary-card-type.test.tsx
git commit -m "style(design): warm category tints + ItineraryCard (clay badge, category left-border, clay times)"
```

---

## Task 3: ItineraryDay（襯線每日標題 + 控制列收色）

**Files:**
- Modify: `components/ItineraryDay.tsx`

**Interfaces:**
- Consumes: Task 1 `font-display`、`clay/clay-tint/clay-deep`、`ink/muted/warn` token。

- [ ] **Step 1: 每日標題改襯線** — 第 50 行：
  舊 `<h2 className="text-xl font-bold text-gray-800 mb-1">`
  新 `<h2 className="font-display text-2xl font-semibold text-ink mb-1 text-balance">`

- [ ] **Step 2: 控制列與拖放區收色** — 精確替換：
- 第 54 行「這天沒有住宿」：`text-orange-600` → `text-warn`。
- 第 133 行「整天鎖」按鈕：`border-blue-300 text-blue-700 hover:bg-blue-50` → `border-clay/40 text-clay-deep hover:bg-clay-tint`。
- 第 143 行拖放高亮：`ring-2 ring-blue-400 bg-blue-50` → `ring-2 ring-clay bg-clay-tint`。
- 該檔其餘 `text-gray-*`/`border-gray-*` 依 Token Mapping 表換（`grep -nE "gray-|blue-|orange-" components/ItineraryDay.tsx` 逐一對照，只換樣式）。

- [ ] **Step 3: 驗證（build + 視覺 + 迴歸）**

Run: `npx jest --silent` → 全綠。
Run: `npm run build` → 成功。
gstack browse（seed 行程後，見 [[local-ui-preview-recipe]]）確認：每日標題為襯線大字、無殘留藍。

- [ ] **Step 4: Commit**

```bash
git add components/ItineraryDay.tsx
git commit -m "style(design): serif day headers + clay controls in ItineraryDay"
```

---

## Task 4: 全站/共用元件 token 化 + 按鈕語言統一

**Files:**
- Modify: `components/HeaderView.tsx`
- Modify: `app/itinerary/ItineraryClient.tsx`
- Modify: `components/AiRearrangeInput.tsx`
- Modify: `components/CombinedInput.tsx`
- Modify: `components/TypePicker.tsx`
- Modify: `components/DayRecommendations.tsx`
- Modify: `components/RecommendationCard.tsx`

**Interfaces:**
- Consumes: Task 1 token。按鈕語言：主要=`bg-clay text-white hover:bg-clay-deep`、次要=`border border-clay text-clay-deep hover:bg-clay-tint`、ghost=`border border-border text-muted hover:text-ink`。

- [ ] **Step 1: HeaderView 頂欄** — `components/HeaderView.tsx`：
- 外層 `header` `border-b` → `border-b border-border`。
- 品牌字 `<Link href="/" className="font-semibold">行程規劃</Link>` → `className="font-display text-lg font-semibold text-ink"`。

- [ ] **Step 2: ItineraryClient 頂列 + 按鈕** — `app/itinerary/ItineraryClient.tsx`：
- 第 604 行 `重新規劃`：`text-blue-600` → `text-clay`。
- 「儲存行程」按鈕（約 576 行）`className="text-sm border rounded px-3 py-1 hover:bg-gray-50"` → `className="text-sm border border-clay text-clay-deep rounded-md px-3 py-1 hover:bg-clay-tint"`（次要按鈕）。
- 該檔其餘 `gray-*` 灰階依 Token Mapping 換（`grep -nE "blue-|gray-" app/itinerary/ItineraryClient.tsx` 對照，只換樣式）。

- [ ] **Step 3: AiRearrangeInput** — `components/AiRearrangeInput.tsx`：
- 第 65 行：`border-blue-300 text-blue-700 hover:bg-blue-50` → `border-clay/40 text-clay-deep hover:bg-clay-tint`。
- 第 94 行「一鍵同意全部」：`bg-blue-600 text-white ... hover:bg-blue-700` → `bg-clay text-white ... hover:bg-clay-deep`。

- [ ] **Step 4: CombinedInput** — `components/CombinedInput.tsx`：
- 第 146 行 mode badge：`bg-blue-100 text-blue-700` → `bg-clay-tint text-clay-deep`。
- 第 174 與 216 行主按鈕：`bg-blue-600 text-white ... hover:bg-blue-700` → `bg-clay text-white ... hover:bg-clay-deep`。
- 第 190 行 textarea：`focus:ring-blue-500` → `focus:ring-clay`。

- [ ] **Step 5: TypePicker / DayRecommendations / RecommendationCard**
- `components/TypePicker.tsx` 第 51 行勾號：`text-blue-600` → `text-clay`。
- `components/DayRecommendations.tsx` 第 36 行 active tab：`border-blue-500 bg-blue-50 text-blue-700` → `border-clay bg-clay-tint text-clay-deep`。
- `components/RecommendationCard.tsx` 第 24 行加入鈕：`bg-blue-600 ... hover:bg-blue-700` → `bg-clay ... hover:bg-clay-deep`；第 17 行 `border-gray-200` → `border-border`。

- [ ] **Step 6: 驗證（build + 全站無藍 + 迴歸）**

Run: `grep -rnE "blue-[0-9]|indigo-[0-9]" components/HeaderView.tsx app/itinerary/ItineraryClient.tsx components/AiRearrangeInput.tsx components/CombinedInput.tsx components/TypePicker.tsx components/DayRecommendations.tsx components/RecommendationCard.tsx` → 0 筆。
Run: `npx jest --silent` → 全綠。
Run: `npm run build` → 成功。
gstack browse 前後截圖：行程頁按鈕、頂欄、AI 重排、推薦皆赭土語言。
> 範圍外仍有藍（`ItineraryPasteInput`、`admin/SourceForm`、`Timeline*`、`PlaceSearch*`、`TimeScrollPicker`、`app/page.tsx`）——本計畫不動，留待輸入頁階段。

- [ ] **Step 7: Commit**

```bash
git add components/HeaderView.tsx app/itinerary/ItineraryClient.tsx components/AiRearrangeInput.tsx components/CombinedInput.tsx components/TypePicker.tsx components/DayRecommendations.tsx components/RecommendationCard.tsx
git commit -m "style(design): clay button language + token swap across itinerary-page components"
```

---

## Task 5（可延後）: 簽名動效——自動排程完成卡片進場

> 這是唯一碰 JS 行為的任務（加一個純視覺 state flag，不動排程結果）。若時間/風險考量可切成獨立 follow-up commit，不阻擋 Task 1-4 的驗收。

**Files:**
- Modify: `app/globals.css`（keyframes + utility）
- Modify: `app/itinerary/ItineraryClient.tsx`（`justArranged` flag）
- Modify: `components/ItineraryDay.tsx`（把 flag 傳到卡片容器做 stagger）

**Interfaces:**
- Consumes: 既有 `scheduleRecalc(plan, structural)` 呼叫點（drag/add/smart-arrange/AI 重排）。
- Produces: `ItineraryDay` 新增可選 prop `revealKey?: number`（每次結構重排 +1，觸發 CSS 進場）。

- [ ] **Step 1: CSS 進場 utility** — `app/globals.css` `@layer utilities` 內加：
```css
@keyframes card-settle { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.animate-settle { animation: card-settle .4s ease-out both; }
@media (prefers-reduced-motion: reduce) { .animate-settle { animation: none; } }
```

- [ ] **Step 2: ItineraryClient flag** — 在 `ItineraryClient`：
- 加 state：`const [revealKey, setRevealKey] = useState(0)`。
- 在 `scheduleRecalc` 的**結構分支**（`structural === true`）末端 `setRevealKey((k) => k + 1)`（只在結構重排時觸發，時間微調不觸發）。
- 把 `revealKey` 傳給每個 `<ItineraryDay ... revealKey={revealKey} />`。

- [ ] **Step 3: ItineraryDay stagger** — `ItineraryDay` 收 `revealKey?: number`；卡片外層加 `key`-based class：以卡片 index 給 `style={{ animationDelay: `${i * 40}ms` }}` 與 `className`（當 `revealKey` 改變時）套 `animate-settle`。最小作法：以 `revealKey` 為 React `key` 的一部分讓容器重掛，或包一層 `<div className="animate-settle" style={{animationDelay}}>`。

- [ ] **Step 4: 驗證** — `npx jest --silent` 全綠（無斷言依賴動畫）；`npm run build` 成功；gstack browse 觸發「智慧排程／AI 重排」後肉眼確認卡片依序淡入；`$B js "matchMedia('(prefers-reduced-motion: reduce)').matches"` 為 true 時無動畫。

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/itinerary/ItineraryClient.tsx components/ItineraryDay.tsx
git commit -m "style(design): staggered card reveal on auto-schedule (reduced-motion safe)"
```

---

## 收尾（whole-branch）
- Codex review（`-m gpt-5.5`，見 [[codex-cli-delegation]]）整段 diff。
- 把 dessert 暖莓色補進 `DESIGN.md` 類別清單、於 Decisions Log 記一行「itinerary-page 套用完成」。
- 最終 gate：`npx jest` 全綠 + `npm run build` 成功 + gstack 前後截圖存證。

## Self-Review

- **Spec coverage：** token 打底(Task1)｜行程頁元件 ItineraryCard/Day/Client(Task2-4)｜共用元件 CombinedInput/TypePicker(Task4)｜3 個測試斷言(Task2)｜按鈕語言(Task4)｜動效(Task5，標可延後)｜深色延後、輸入頁被動繼承(範圍註明)——皆對應。
- **Placeholder scan：** 無 TBD；每個樣式改動給出精確舊→新 class 或整檔內容。
- **Type consistency：** `TypeMeta.accent`（Task2 定義）於 `ItineraryCard` 第 53 行使用；token 名稱（clay/ink/muted/…）Task1 定義、後續任務一致引用；`revealKey` prop 於 Task5 定義並在 Client/Day 一致使用。
