# Lane C / C3 — 共享候選池 Design Spec

**日期：** 2026-07-04
**Lane：** C(多人協作揪團旅行)
**子專案：** C3(Lane C 脊椎第 3 項)
**依賴：** C1(trips + auth + `/itinerary/[tripId]` + ItineraryClient autosave)、C2(`trip_members`、`is_trip_participant()`、participant RLS)。**C3 疊在 C1+C2 之上**(branch `lane/c3-candidate-pool` from `lane/c1-auth-persistence` @ 9265a7f)。
**狀態：** 設計定稿,待寫 plan

---

## 0. 定位

C2 讓大家能一起編輯同一份行程。C3 補上揪團的核心前置動作:**一起收集想去的地方**。每個 trip 有一個**共享候選池**——成員搜尋地點丟進池、看到彼此丟的、可移除;之後把某個候選**放進指定的某一天**行程(移動語義:放進後從池消失)。

**已確認的產品決策:** 候選池為 **append-only 集合(row-per-place,避開 plan blob 並發衝突)**;放進某天用 **day-picker 下拉**(不做池↔天拖拉);候選**顯示「誰加的」**(沿用 C2 的 admin 補名);放進某天採**移動語義**(從池移除)。一鍵自動排整池屬 **C4**,不在本案。

---

## 1. 目標

1. **共享池**:participant 可搜尋地點加入候選池、列出全部候選(含誰加的)、移除。
2. **放進某天**:把一個候選放進使用者選定的第 N 天(加到那天末尾,經既有 recalc + autosave 存回 plan),並從池移除。
3. **權限**:靠 RLS——participant 可看/加;移除限 adder 或 owner。

### 非目標(明確排除)
- **不做一鍵自動排程**(C4:把整池最佳化排入行程)。
- 不做候選投票 / 標籤。
- 不做池↔天的拖拉(用 day-picker;dnd 未來再說)。
- 不做即時同步(靠本地樂觀更新;realtime 屬 C5)。
- 不改 C1/C2 既有編輯核心;只新增候選池周邊 + 一個「加到指定天」的 client handler。

---

## 2. 資料模型

### 2.1 migration `0003_candidates.sql`
```sql
create table if not exists public.trip_candidates (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  place      jsonb not null,                          -- 完整 Place（複用既有型別）
  added_by   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists trip_candidates_trip_id_idx on public.trip_candidates(trip_id);

alter table public.trip_candidates enable row level security;

-- participant 可看 / 可加（複用 C2 的 is_trip_participant）
create policy "participant_select_candidates" on public.trip_candidates
  for select using (public.is_trip_participant(trip_id));
create policy "participant_insert_candidates" on public.trip_candidates
  for insert with check (public.is_trip_participant(trip_id) and added_by = auth.uid());
-- 移除限 adder 或 owner
create policy "adder_or_owner_delete_candidates" on public.trip_candidates
  for delete using (
    added_by = auth.uid()
    or exists(select 1 from public.trips where id = trip_id and owner_id = auth.uid())
  );
```
- `place` 存整個 `Place`(與 plan 一致的 JSONB 存法);app 端型別權威不變。
- insert policy 強制 `added_by = auth.uid()`(不能冒名)。

### 2.2 app 端型別(`lib/types.ts` 追加)
```ts
export interface Candidate {
  id: string
  place: Place
  addedBy: string        // user id
  addedByName: string    // 顯示名稱
}
```

---

## 3. Server actions(新檔 `app/actions/candidates.ts`)

```ts
addCandidate(tripId: string, place: Place): Promise<{ id: string }>   // participant，一般 server client（RLS）
listCandidates(tripId: string): Promise<Candidate[]>                  // participant；RLS 閘門後補名
removeCandidate(candidateId: string): Promise<void>                  // adder/owner，RLS
```
- **`addCandidate`**:server client(RLS)`insert { trip_id, place, added_by: user.id }`;未登入 → `NOT_AUTHENTICATED`;RLS 擋非 participant(insert 0 列或 error)→ 明確錯誤。回新 `id`。
- **`listCandidates`**:
  1. server client(RLS)`select id, place, added_by, created_at from trip_candidates where trip_id = ? order by created_at`——RLS 使非 participant 得空。
  2. 補顯示名稱:沿用 C2 `listMembers` 的做法(admin `getUserById` 逐 `added_by` 補名;小團體 N+1 可接受)。去重 user id 以減少呼叫。
  - 回 `Candidate[]`。
- **`removeCandidate`**:server client `delete ... where id = ?`;RLS `adder_or_owner_delete` 強制權限;未登入 → `NOT_AUTHENTICATED`;0 列(無權/不存在)→ 明確錯誤(沿用 C2 的 `.select('id')` + `!data?.length` 偵測,避免靜默假成功)。

---

## 4.「放進某天」流程(client;移動語義)

plan 為 client 權威(ItineraryClient + autosave);promote **不在 server 改 plan**(會與 autosave 打架)。故:

- **CandidatePanel 渲染在 ItineraryClient 內**(唯一同時握有 plan state + 新增地點邏輯 + autosave + 候選 state 之處)。
- ItineraryClient 新增 handler:
```ts
// 把一個候選 Place 加到指定第 dayIndex 天末尾（不是 findClosestDay），再從池移除
handleAddCandidateToDay(place: Place, dayIndex: number, candidateId: string): void
```
  作法:比照既有 `handleAddPlace`(建 `ScheduledPlace`:startTime '09:00'、`durationMin: DWELL[place.type]`、其餘旗標同既有)但 target 是**選定的 dayIndex**(非 findClosestDay)→ append 到該天 → `scheduleRecalc(next, true)`(既有 recalc + autosave)→ 呼叫 `removeCandidate(candidateId)` → 從本地候選 state 移除。
- 候選 state:ItineraryClient 持有 `candidates` 本地 state(初值由 props `initialCandidates`);add/remove/promote 皆樂觀更新此 state。

---

## 5. UI:CandidatePanel(ItineraryClient 內)

- **位置**:行程頁內、與每日行程並列的一個「候選池」區塊(在 ItineraryClient render 樹內)。
- **加候選**:複用既有地點搜尋。CandidatePanel 內放一個搜尋輸入(可重用 `CombinedInput` 的 `onAdd` 單筆路徑,或直接用 `app/actions/places.ts` 的搜尋)→ 得到 `Place` → `addCandidate(tripId, place)` → 樂觀加入本地 candidates。
- **看池**:候選卡片列(名稱、type、「由 XXX 加入」),每張有:
  - 「移除」→ `removeCandidate` + 本地移除。
  - 「放進…」→ 展開 day-picker(第 1…N 天)→ 選定 → `handleAddCandidateToDay(place, dayIndex, id)`。
- **空池**:「還沒有候選,搜尋想去的地方加進來吧」。

### 文案(繁體中文)
「候選池」「放進…」「第 N 天」「移除」「由 {name} 加入」「還沒有候選,搜尋想去的地方加進來吧」「加入失敗,請稍後再試」「移除失敗,請稍後再試」

---

## 6. 元件與職責邊界

| 檔案 | 職責 | 依賴 |
|---|---|---|
| `supabase/migrations/0003_candidates.sql`(新) | trip_candidates 表 + RLS(participant select/insert、adder/owner delete) | C2 `is_trip_participant` |
| `app/actions/candidates.ts`(新) | addCandidate / listCandidates / removeCandidate | server client、admin(補名) |
| `components/CandidatePanel.tsx`(新,client) | 搜尋加入 + 候選清單 + 移除 + 放進某天(day-picker) | candidates actions、地點搜尋 |
| `app/itinerary/ItineraryClient.tsx`(改) | 新增 `initialCandidates` prop + candidates state + `handleAddCandidateToDay` + 渲染 CandidatePanel | 上述 |
| `app/itinerary/[tripId]/page.tsx`(改) | `listCandidates` → 傳 `initialCandidates` 給 ItineraryClient | `listCandidates` |
| `lib/types.ts`(改) | 新增 `Candidate` | — |

> 匿名 `/itinerary`(無 tripId)路徑:candidates 為空、不顯示候選池(候選池是持久化 trip 專屬)。`initialCandidates` 可選,預設 `[]`,匿名模式零影響。

---

## 7. 錯誤處理與邊界

- **未登入**:候選 actions throw `NOT_AUTHENTICATED`(理論上持久化頁已登入)。
- **非 participant**:RLS 使 select 空、insert/delete 落空 → action 轉明確錯誤(繁中)。
- **移除他人候選(非 adder 非 owner)**:RLS delete 0 列 → `.select('id')` 偵測 → 報錯,不假成功。
- **promote 競態**:promote 先 recalc/autosave 加進 plan,再 removeCandidate;若 remove 失敗,候選仍在池(下次可再試)——地點已在行程(移動語義的「加入」已完成),使用者可手動移除殘留候選。可接受(非資料遺失)。
- **匿名模式**:無候選池,零影響。

---

## 8. 測試策略(TDD)

### RLS(本機 Supabase / 政策斷言;live 延後)
- participant 可 select/insert;非成員 select 空、insert 失敗;delete 限 adder/owner(他人不可)。

### server actions(mock supabase server + admin)
- addCandidate:insert 帶 `added_by`;未登入 → NOT_AUTHENTICATED;非 participant → 錯誤。
- listCandidates:RLS 空 → `[]`;有候選 → 補名正確、`addedByName` 對應。
- removeCandidate:0 列 → 報錯(非假成功);正常 → 無誤。

### 元件 / 整合(jsdom)
- CandidatePanel:搜尋加入呼叫 addCandidate + 樂觀顯示;移除呼叫 removeCandidate;「放進第 N 天」呼叫 `handleAddCandidateToDay(place, N, id)`。
- ItineraryClient:`handleAddCandidateToDay` 把地點加到**指定天**(非 closest)、recalc、autosave 觸發、候選從本地 state 移除;空 `initialCandidates` / 匿名模式不顯示候選池。

### 迴歸
- C1/C2 全測試保持綠(ItineraryClient 既有排程/拖拉/autosave/members/C2 行為不變)。

---

## 9. 全域約束

- TypeScript strict,無 `any`。
- UI 文案繁體中文。
- 候選池為 row-based append 集合(避 plan blob 並發);plan 仍 client 權威 last-write-wins。
- RLS 為權限單一真相;`added_by = auth.uid()` 於 insert policy 強制。
- `initialCandidates` 可選、匿名路徑零遷移;C1/C2 行為不變。
- 沿用 C2 admin 補名模式(小團體 N+1 可接受)。

---

## 10. 疊放與 live 待辦

- C3 疊在 C1+C2 之上(9265a7f)。stacked;C1+C2 併 main 後 rebase。
- live(同 C1/C2,等 Supabase 金鑰):套 `0003_candidates.sql`、跨成員候選 RLS 實測、多帳號共享池實測。
