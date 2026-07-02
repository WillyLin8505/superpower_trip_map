# Lane C 脊椎路線圖（C1–C5）

**日期：** 2026-07-01
**Lane：** C（多人協作揪團旅行）
**來源：** [`2026-07-01-laneC-c1-auth-persistence-design.md` §0](./2026-07-01-laneC-c1-auth-persistence-design.md)

---

## 總覽

Lane C 把目前**單機、單人、零持久化**的行程規劃器，演進成**多人揪團協作**工具。

| 子專案 | 標題 | 狀態 | 依賴 |
|--------|------|------|------|
| **C1** | 登入 + 持久化地基 | **DONE** (branch: `lane/c1-auth-persistence`) | 無（地基） |
| C2 | 分享 + 成員（邀請連結 → 別人能加入同一趟 trip）| pending | C1 |
| C3 | 共享候選池（append-only 口袋名單）| pending | C1 |
| C4 | 候選池一鍵 `smart-arrange` 排程 | pending | C3 |
| C5 | 即時並發共編 / 任務分工 / 變更牆（選配） | pending | C2, C3 |

---

## C1 — 登入 + 持久化地基（DONE）

- **身份：** Google（Supabase 原生）+ LINE（Supabase 自訂 OIDC）
- **持久化：** 行程存入 Supabase Postgres `trips` 表；重整不再消失；穩定網址 `/itinerary/[tripId]`
- **擁有權：** RLS owner-only 政策
- **非破壞性：** 保留「首頁 → 即時試用」匿名流程；只有按「儲存」才需登入

---

## 刻意的排序理由

- **並發衝突最難**，故行程本體先以整包 JSONB `last-write-wins` 存（小團體可接受）；真正的 realtime 共編延到 C5。
- **append-only 候選池（C3）先上**，即能拿到「群體一起收集 + 一鍵排程（C4）」的核心協作價值，不需等 C5 的複雜並發基礎設施。
- **C2（分享/成員）與 C3（候選池）可並行**，但都依賴 C1 的身份與 DB 地基。

---

## 產品決策（已確認）

- 砍掉投票與分帳
- 登入只做 **Google + LINE** 兩種
- 資料庫地基用 **Supabase**（Postgres + Auth + RLS + Storage）
