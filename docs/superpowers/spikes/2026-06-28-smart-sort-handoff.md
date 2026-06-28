# 避峰智慧排序 — 交接 Lane A（Handoff Brief）

**日期：** 2026-06-28
**狀態：** 概念確認 → **實作歸 Lane A**（動到核心 optimizer/scheduler）
**依賴：** Lane B 的人潮資料層（見下方「依賴」與 [crowd-data findings](2026-06-28-crowd-data-findings.md)）

---

## 功能
把人潮資料納入排程：optimizer 不只看「最短路線」，還讓**熱門景點自動排到該地點人少的時段**（例：故宮排早上開門、夜市排稍晚），把需求 4 從「被動提醒」升級成「主動避峰」。

## 為什麼歸 Lane A
會動到 Lane A 擁有的核心檔：`app/actions/optimize.ts`、`app/actions/schedule.ts`、`lib/utils/clientScheduler.ts`。Lane B 不碰核心碼。

## 依賴（Lane B 先提供，Lane A 再接）
需要一個乾淨的人潮查詢介面：`getCrowdForecast(place) → CrowdForecast`（星期×小時相對 0–100，附 source）。**這個資料層是 Lane B 可獨立先做的**（新檔、不動核心）；Lane A 的智慧排序只需呼叫它。

## 關鍵設計問題（Lane A 規劃時要決定的不確定點）
1. **人潮放在「時段選擇」還是「2-opt 距離成本」？**
   建議：**放時段選擇，不要塞進 2-opt 距離成本**——2-opt 負責路線（距離），排程階段負責時段。否則距離與人潮兩個單位混在一個成本函數，權重很難調且破壞既有路線品質。
2. **簡單可行的 v1**：同一天景點分配到 AM/PM（或更細時段）時，對每個景點查它在各候選時段的人潮，**優先把高人氣景點放到它自己人較少的時段**；距離排序仍由現有 2-opt 決定。
3. **多目標共存**：與住宿錨點（子專案 #3）、餐別時段、`outsideHours` 規則如何疊加，優先序要定義。
4. 維持**決定性**、可 TDD。

## 交接邊界
- Lane B 交付：人潮資料層介面 + 決策文件（本檔 + crowd-data findings）。
- Lane A 接手：把人潮偏好併入排程/時段邏輯 + 測試 + 進主線。
