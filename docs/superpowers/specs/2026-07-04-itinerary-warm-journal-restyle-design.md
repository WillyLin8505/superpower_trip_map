# 行程頁套用「溫暖旅誌」設計系統 Design Spec

**日期：** 2026-07-04
**Lane：** A（主 worktree / `main`）
**設計來源：** `DESIGN.md`（溫暖旅誌 / Warm Travel Journal，commit `de43eff`）

## 目標

把已定案的 `DESIGN.md` 視覺系統，**行程頁優先**套用到程式碼：暖紙背景、赭土主色取代現有全站藍、Fraunces + Noto Serif TC 襯線每日標題、Noto Sans TC 內文、類別暖色調、收斂的按鈕與控制列。北極星：「規劃行程竟然這麼輕鬆」——暖但不亂。

**本 spec 只界定「做什麼／範圍／驗收」；任務拆解（怎麼做）交給後續 writing-plans。**

## 範圍

**In（本次要改）：**
1. **Token 打底（全站底層，先做）**：字型載入、Tailwind theme 色彩/字型 token、`globals.css`。
2. **行程頁畫面**：`app/itinerary/ItineraryClient.tsx`、`components/ItineraryCard.tsx`、`components/ItineraryDay.tsx`、每日標頭、AI 重排框（`AiRearrangeInput`）、新增行程區。
3. **行程頁上出現的共用元件**：`components/CombinedInput.tsx`、`components/TypePicker.tsx`（隨行程頁一起換到 token）。
4. 順手更新因換色/換 class 而失效的 **3 個測試斷言**（見下「測試影響」）。

**Out（本次不做，之後另開）：**
- 輸入頁 `app/page.tsx` 的**版面**改造（會因 token 打底自動繼承字型/色彩，但不做專屬版面調整；天數 stepper 屬 Lane B）。
- 登入頁、`儲存/分享`、`/itinerary/[tripId]`、MembersPanel 等頁面的專屬改造。
- 地圖 iframe 內部（Google Maps 樣式無法改）、AI 摘要邏輯。
- **任何行為 / 排程 / 資料邏輯改動**——這是純視覺套用。

## Global Constraints

- 純視覺 / 樣式改動：不動排程、不動 server actions、不動資料模型、不改元件的 props 語意與行為。
- TypeScript strict、無 production `any`、不新增非必要 npm 套件（字型走 `next/font/google`，不需新套件）。
- UI 文案維持繁體中文，一字不改（本次只換樣式，不改字）。
- 既有 ~316 測試維持綠（僅允許更新下述 3 個綁色 class 的斷言）。
- 驗證 gate 必含 `next build`（非只 `npm test`／`lint`）——見 [[verify-with-next-build]] 教訓。
- 依 `CLAUDE.md`：非 trivial 改動經 Codex review（`-m gpt-5.5`）後才算完成。

## 方法（token 先行）

**決策（已定，可於審查否決）：**

1. **色彩 token：** 於 `tailwind.config.ts` `theme.extend.colors` 新增語意色：`paper / surface / border / ink / muted / clay(+deep,+tint) / sea(+tint) / attraction / restaurant / lodging（各含 tint）/ success / warn / error`，值取自 DESIGN.md。元件一律用語意 class（`bg-clay`、`text-ink`、`border-border`…），**不散落 hex**。
2. **字型：** 用 `next/font/google` 載入 `Fraunces`、`Noto_Serif_TC`、`Noto_Sans_TC`，各自曝露 CSS 變數（`--font-serif-display`、`--font-serif-tc`、`--font-sans-tc`），在 `tailwind.config.ts` `fontFamily` 對應 `font-display` / `font-body`。移除現有 `Inter` 與 `globals.css` 的 `Arial` fallback。
3. **globals.css：** `body` 背景改暖紙、文字改墨色、預設字型改 Noto Sans TC；**移除/中和** 現有 template 的 `@media (prefers-color-scheme: dark)` 舊區塊（避免與新系統衝突）。
4. **深色模式：** DESIGN.md 已定義暖色深色 token，但**本次只保證淺色模式完成度**；深色 token 先寫進 theme、但完整深色 QA 延後為 follow-up（現行 app 尚非深色完備）。
5. **元件換色：** 全站 `blue-*`（28 處／16 檔）換為 `clay` 語意；卡片類別底色（甜點粉、住宿紫等舊色）換為 DESIGN.md 類別暖色調。
6. **每日標頭：** 「第 N 天 · M/D（週）」改用 `font-display`（Fraunces + Noto Serif TC）大字襯線。
7. **按鈕語言統一：** 主要=實心赭土、次要=赭土外框、ghost=灰外框（`送出/儲存/重排/智慧排程` 依語意歸位）。
8. **簽名動效（最後、可延後）：** 自動排程／AI 重排完成時，每日卡片 staggered ease-out 進場 + 「行程好了」暖色提示；`transform/opacity` only；尊重 `prefers-reduced-motion`。若接排程/loading 流程有風險，可切成獨立 follow-up，不阻擋前面的視覺套用。

## 測試影響（已盤點）

其餘測試皆驗行為/文字，restyle 不影響。**僅 3 個斷言綁死顏色 class，需隨改：**
- `__tests__/itinerary-card-info.test.tsx:94-95` — 甜點徽章 `bg-pink-100 / text-pink-700` → 新類別色 class。
- `__tests__/itinerary-card-type.test.tsx:39` — 住宿卡 `bg-purple-50` → 新住宿色 class。

更新斷言為套用工作的一部分（改樣式同時改對應斷言），不新增/不放寬其他測試。

## 驗收標準

1. 行程頁（`:3002` 以 [[local-ui-preview-recipe]] seed 後）視覺符合 DESIGN.md：暖紙底、赭土按鈕、襯線每日標題、類別暖色調、tabular 時間、收斂控制列——以 gstack browse 前後截圖佐證。
2. 全站無殘留 `blue-*`（行程頁與其共用元件、token 範圍內）；無散落 hex（走 token）。
3. 全測試綠（含更新後的 3 個斷言）；`npm run lint` 過；`next build` 成功。
4. 零行為/邏輯改動：排程、鎖定、拖拉、AI 重排、儲存等功能與改前一致。
5. Codex review 通過（依 CLAUDE.md）。

## Non-Goals

- 不改任何文案、不改互動行為、不改元件 API。
- 不做輸入頁/其他頁的專屬版面；不保證深色模式完成度（token 就緒即可）。
- 不碰地圖 iframe 內部、AI 摘要內容。

## Self-Review

- **Placeholder scan：** 無 TBD；所有決策已定值或明確標「延後」。
- **一致性：** 範圍（token 先行 + 行程頁）↔ 方法 ↔ 驗收一致；動效與深色明確標為可延後，不擴張本次承諾。
- **範圍：** 單一 spec 可拆成一條 SDD plan（token→卡片→標頭/控制列→按鈕/警告→動效）；夠聚焦。
- **歧義：** 「行程頁優先」界定為 token（全站底層）+ 行程頁元件 + 其共用元件；輸入頁只被動繼承 token，不做專屬改造——已寫明。
