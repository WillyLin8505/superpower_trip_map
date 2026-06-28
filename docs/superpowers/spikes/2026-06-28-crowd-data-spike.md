# Spike Brief：人潮時段資料來源（子專案 #9 / 需求 4）

> 這是給 **Lane B（平行 worktree，另一個 Claude session）** 的研究任務。
> **不要碰核心檔案**（`lib/types.ts`、`lib/utils/clientScheduler.ts`、`app/actions/schedule.ts`、`components/ItineraryCard.tsx`、`app/itinerary/ItineraryClient.tsx`）——那些屬於 Lane A。
> 你的產出是一份**決策文件**，不是正式功能。

## 背景

需求 4：「我需要知道哪一個行程在哪一個時間段會特別多人，給我這樣的提醒。」

**已知硬限制：Google 官方 Places API 並不提供 popular times（人潮時段）。** 這個資料只出現在 Google Maps App UI，官方 API 拿不到。所以本 spike 的核心問題是：**這個專案（Next.js / TypeScript / 部署在 Vercel / 已有 Google Maps + Places + Distance Matrix 金鑰）該用什麼資料來源做「某地點在某時段的人潮程度」？**

## 要研究/比較的選項（至少涵蓋這些）

1. **`populartimes`（開源爬蟲，Python）** — 非官方爬 Google。評估：可靠度、會不會被封、ToS 風險、要不要額外 Python 服務（本專案是 TS/Vercel，跑 Python 爬蟲的部署成本）。
2. **BestTime.app API** — 付費，提供 foot-traffic / popular times。評估：免費額度、定價、資料涵蓋率（台灣/日本等亞洲地點覆蓋如何）、HTTP API 是否好從 server action 呼叫。
3. **Foursquare Places / 其他商用 foot-traffic（SafeGraph、Placer.ai 等）** — 評估涵蓋率、價格、是否個別地點可查。
4. **Google Maps Platform 是否有任何官方 busyness**（例如 Routes/Places 新版、Area Busyness、Maps JS 內嵌的 popular times widget）——確認到底有沒有官方途徑，把結論釘死。
5. **AI/啟發式估計（fallback）** — 用地點類型 + 時段 + 評論數/rating 由 Claude 估「大概人潮」。沒有真實資料，但零外部相依、零成本。評估準確度與可信度，是否只當「沒有資料時的退路」。

## 每個選項要回答

- 涵蓋率（尤其台灣、日本、韓國等本專案常用地區）
- 成本（免費額度 / 定價）
- 整合難度（能否從 Next.js server action 直接 HTTP 呼叫；需不需要額外服務）
- 可靠度與 ToS/法律風險
- 資料粒度（是否能給「星期 X 的 N 點」人潮值）與新鮮度

## 產出（寫到 `docs/superpowers/spikes/2026-06-28-crowd-data-findings.md`）

1. 一張比較表（上述維度）。
2. **明確推薦**一個主來源 +（可選）一個 fallback，附理由。
3. 整合草案：建議的資料模型（例如 `Place` 上加什麼欄位）、要呼叫的 API、快取策略——**只寫建議，不要實際改核心碼**。
4. 若可行，做一個**極小 PoC**：對「單一地點」拿到一次人潮資料（例如 BestTime 免費 key 或 populartimes 跑一個地點），把原始回應貼進文件佐證。PoC 程式碼放在獨立檔案（如 `spikes/crowd-poc.ts`），不接進主程式。

## 完成後

把分支 `lane/ai-research` push，回報結論。等 Lane A 的核心資料模型穩定後，需求 4 的正式實作會以這份決策文件為基礎，再排進主線。
