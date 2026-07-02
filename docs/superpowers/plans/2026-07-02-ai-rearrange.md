# AI 對話重排 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 行程頁的口語指令框讓 AI 重排行程（搬移/改停留/改活動窗），先用天分類列出每項變動、可逐項 ✗，按「一鍵同意全部」套用剩下的項。

**Architecture:** 純函式 `lib/utils/rearrangeChanges.ts`（`diffPlan` 產原子變動、`applyChanges` 套接受子集）；伺服器動作 `app/actions/rearrange.ts`（prompt + 既有 `callClaude` + 驗證 + `diffPlan`）；元件 `AiRearrangeInput`（輸入/預覽清單/✗/一鍵同意全部）；`ItineraryClient` 只加一個 `handleAiApply` → 重用 #4 的 `scheduleRecalc(newPlan, true)`。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Jest + Testing Library (jsdom), Anthropic SDK（既有 `callClaude`）。

## Global Constraints

- TypeScript strict，無 `any`。不新增 npm 套件（`@anthropic-ai/sdk` 已在）。
- UI 文案繁體中文。
- AI 只能 permute 現有地點：ref 為 1..N 排列、天數不變、`HH:MM` 合法、`durationMin > 0`；驗證不過即拒絕。
- `durationLocked` 地點不產生/不套用停留變動（硬保留）；`startLocked` 軟尊重。
- 決定性純函式（`diffPlan`/`applyChanges` 無隨機/時間相依）。
- `ItineraryClient` 改動最小化（避 Lane C 衝突）；重活在新檔。
- 既有全測試需保持綠。

---

## File Structure

| 檔案 | 責任 |
|------|------|
| `lib/utils/rearrangeChanges.ts`（新，純） | `Change` 型別、`diffPlan`、`applyChanges` |
| `app/actions/rearrange.ts`（新，server） | `rearrangeItinerary`：prompt + `callClaude` + 驗證 + `diffPlan` |
| `components/AiRearrangeInput.tsx`（新） | 輸入 + 預覽清單（用天分類、✗、一鍵同意全部、取消）+ 錯誤 |
| `app/itinerary/ItineraryClient.tsx`（改，最小） | 渲染 `<AiRearrangeInput>` + `handleAiApply` |

---

## Task 1: 純變動引擎 `rearrangeChanges.ts`

**Files:** Create `lib/utils/rearrangeChanges.ts`; Test `__tests__/rearrange-changes.test.ts`

**Interfaces — Produces:**
- `type Change`（見下）
- `diffPlan(current: PlanResult, proposed: PlanResult): Change[]`
- `applyChanges(current: PlanResult, accepted: Change[]): PlanResult`

- [ ] **Step 1: 失敗測試** — Create `__tests__/rearrange-changes.test.ts`:
```ts
import { diffPlan, applyChanges, type Change } from '@/lib/utils/rearrangeChanges'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function dayOf(day: number, places: ScheduledPlace[], over: Partial<DayItinerary> = {}): DayItinerary {
  return { day, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', ...over }
}
function plan(days: DayItinerary[]): PlanResult {
  return { days, transportMode: 'driving', startDate: '2026-07-10' }
}

it('diffPlan: a place moved to another day → one move change on the source day', () => {
  const A = sp('A'), B = sp('B'), C = sp('C')
  const current = plan([dayOf(1, [A, B]), dayOf(2, [C])])
  const proposed = plan([dayOf(1, [A]), dayOf(2, [C, B])]) // B moved 1→2
  expect(diffPlan(current, proposed)).toEqual([
    { id: 'move-B', day: 1, kind: 'move', placeId: 'B', placeName: 'B', toDay: 2 },
  ])
})

it('diffPlan: duration change (unlocked) → duration change; locked → none', () => {
  const A = sp('A', { durationMin: 90 })
  const L = sp('L', { durationMin: 90, durationLocked: true })
  const current = plan([dayOf(1, [A, L])])
  const proposed = plan([dayOf(1, [sp('A', { durationMin: 60 }), sp('L', { durationMin: 60, durationLocked: true })])])
  expect(diffPlan(current, proposed)).toEqual([
    { id: 'dur-A', day: 1, kind: 'duration', placeId: 'A', placeName: 'A', from: 90, to: 60 },
  ])
})

it('diffPlan: activity window change → per-field window changes', () => {
  const A = sp('A')
  const current = plan([dayOf(1, [A], { dayStart: '09:00', dayEnd: '21:00' })])
  const proposed = plan([dayOf(1, [A], { dayStart: '10:00', dayEnd: '21:00' })])
  expect(diffPlan(current, proposed)).toEqual([
    { id: 'win-1-dayStart', day: 1, kind: 'window', field: 'dayStart', from: '09:00', to: '10:00' },
  ])
})

it('diffPlan: no changes → []', () => {
  const A = sp('A')
  expect(diffPlan(plan([dayOf(1, [A])]), plan([dayOf(1, [sp('A')])]))).toEqual([])
})

it('applyChanges: move removes from source and appends to target', () => {
  const A = sp('A'), B = sp('B'), C = sp('C')
  const current = plan([dayOf(1, [A, B]), dayOf(2, [C])])
  const move: Change = { id: 'move-B', day: 1, kind: 'move', placeId: 'B', placeName: 'B', toDay: 2 }
  const out = applyChanges(current, [move])
  expect(out.days[0].places.map((p) => p.placeId)).toEqual(['A'])
  expect(out.days[1].places.map((p) => p.placeId)).toEqual(['C', 'B'])
})

it('applyChanges: duration set (locked kept), window set', () => {
  const A = sp('A', { durationMin: 90 })
  const L = sp('L', { durationMin: 90, durationLocked: true })
  const current = plan([dayOf(1, [A, L])])
  const changes: Change[] = [
    { id: 'dur-A', day: 1, kind: 'duration', placeId: 'A', placeName: 'A', from: 90, to: 60 },
    { id: 'dur-L', day: 1, kind: 'duration', placeId: 'L', placeName: 'L', from: 90, to: 60 },
    { id: 'win-1-dayStart', day: 1, kind: 'window', field: 'dayStart', from: '09:00', to: '10:00' },
  ]
  const out = applyChanges(current, changes)
  expect(out.days[0].places.find((p) => p.placeId === 'A')!.durationMin).toBe(60)
  expect(out.days[0].places.find((p) => p.placeId === 'L')!.durationMin).toBe(90) // locked kept
  expect(out.days[0].dayStart).toBe('10:00')
})

it('applyChanges: subset — rejecting one change leaves it unapplied, others still apply', () => {
  const A = sp('A'), B = sp('B'), C = sp('C')
  const current = plan([dayOf(1, [A, B]), dayOf(2, [C])])
  const moveB: Change = { id: 'move-B', day: 1, kind: 'move', placeId: 'B', placeName: 'B', toDay: 2 }
  const winC: Change = { id: 'win-2-dayEnd', day: 2, kind: 'window', field: 'dayEnd', from: '21:00', to: '22:00' }
  // accept only winC (moveB rejected)
  const out = applyChanges(current, [winC])
  expect(out.days[0].places.map((p) => p.placeId)).toEqual(['A', 'B']) // B NOT moved
  expect(out.days[1].dayEnd).toBe('22:00')
})

it('applyChanges does not mutate the input plan', () => {
  const A = sp('A'), B = sp('B')
  const current = plan([dayOf(1, [A, B])])
  applyChanges(current, [{ id: 'dur-A', day: 1, kind: 'duration', placeId: 'A', placeName: 'A', from: 90, to: 60 }])
  expect(current.days[0].places[0].durationMin).toBe(90) // unchanged
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest rearrange-changes --silent` → FAIL（模組不存在）。

- [ ] **Step 3: 實作** — Create `lib/utils/rearrangeChanges.ts`:
```ts
import type { PlanResult, ScheduledPlace } from '@/lib/types'

export type Change =
  | { id: string; day: number; kind: 'move'; placeId: string; placeName: string; toDay: number }
  | { id: string; day: number; kind: 'duration'; placeId: string; placeName: string; from: number; to: number }
  | { id: string; day: number; kind: 'window'; field: 'dayStart' | 'dayEnd'; from: string; to: string }

function placeDayMap(plan: PlanResult): Map<string, number> {
  const m = new Map<string, number>()
  plan.days.forEach((d) => d.places.forEach((p) => m.set(p.placeId, d.day)))
  return m
}
function findPlace(plan: PlanResult, placeId: string): ScheduledPlace | undefined {
  for (const d of plan.days) {
    const p = d.places.find((x) => x.placeId === placeId)
    if (p) return p
  }
  return undefined
}

export function diffPlan(current: PlanResult, proposed: PlanResult): Change[] {
  const changes: Change[] = []
  const curDay = placeDayMap(current)
  const propDay = placeDayMap(proposed)

  for (const d of current.days) {
    for (const p of d.places) {
      const from = curDay.get(p.placeId) ?? d.day
      const to = propDay.get(p.placeId)
      if (to !== undefined && to !== from) {
        changes.push({ id: `move-${p.placeId}`, day: from, kind: 'move', placeId: p.placeId, placeName: p.name, toDay: to })
      }
      const pp = findPlace(proposed, p.placeId)
      if (pp && !p.durationLocked && pp.durationMin !== p.durationMin) {
        changes.push({ id: `dur-${p.placeId}`, day: from, kind: 'duration', placeId: p.placeId, placeName: p.name, from: p.durationMin, to: pp.durationMin })
      }
    }
  }

  for (const cd of current.days) {
    const pd = proposed.days.find((x) => x.day === cd.day)
    if (!pd) continue
    if (pd.dayStart !== cd.dayStart) {
      changes.push({ id: `win-${cd.day}-dayStart`, day: cd.day, kind: 'window', field: 'dayStart', from: cd.dayStart, to: pd.dayStart })
    }
    if (pd.dayEnd !== cd.dayEnd) {
      changes.push({ id: `win-${cd.day}-dayEnd`, day: cd.day, kind: 'window', field: 'dayEnd', from: cd.dayEnd, to: pd.dayEnd })
    }
  }
  return changes
}

export function applyChanges(current: PlanResult, accepted: Change[]): PlanResult {
  const days = current.days.map((d) => ({ ...d, places: d.places.map((p) => ({ ...p })) }))
  const byDay = new Map(days.map((d) => [d.day, d]))

  for (const c of accepted) {
    if (c.kind === 'duration') {
      for (const d of days) {
        const p = d.places.find((x) => x.placeId === c.placeId)
        if (p && !p.durationLocked) p.durationMin = c.to
      }
    }
  }
  for (const c of accepted) {
    if (c.kind === 'window') {
      const d = byDay.get(c.day)
      if (d) {
        if (c.field === 'dayStart') d.dayStart = c.to
        else d.dayEnd = c.to
      }
    }
  }
  for (const c of accepted) {
    if (c.kind === 'move') {
      let moved: ScheduledPlace | undefined
      for (const d of days) {
        const idx = d.places.findIndex((x) => x.placeId === c.placeId)
        if (idx !== -1) { moved = d.places.splice(idx, 1)[0]; break }
      }
      const target = byDay.get(c.toDay)
      if (moved && target) target.places.push(moved)
    }
  }
  return { ...current, days }
}
```

- [ ] **Step 4: 跑測試 + build** — `npx jest rearrange-changes --silent` PASS（8 tests）；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add lib/utils/rearrangeChanges.ts __tests__/rearrange-changes.test.ts
git commit -m "feat: rearrange change engine — diffPlan + applyChanges (subset-safe)"
```

---

## Task 2: 伺服器動作 `rearrangeItinerary`

**Files:** Create `app/actions/rearrange.ts`; Test `__tests__/rearrange-action.test.ts`

**Interfaces — Consumes:** `callClaude`（`@/lib/claude`）；`diffPlan`、`Change`（`@/lib/utils/rearrangeChanges`，Task 1）。
**Produces:**
```ts
type RearrangeResult = { ok: true; changes: Change[]; summary: string } | { ok: false; error: string }
rearrangeItinerary(plan: PlanResult, instruction: string): Promise<RearrangeResult>
```

- [ ] **Step 1: 失敗測試** — Create `__tests__/rearrange-action.test.ts`:
```ts
import { rearrangeItinerary } from '@/app/actions/rearrange'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'

const callClaude = jest.fn()
jest.mock('@/lib/claude', () => ({ callClaude: (p: string) => callClaude(p) }))

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function d(day: number, places: ScheduledPlace[]): DayItinerary {
  return { day, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}
// refs: 1=A 2=B (day1), 3=C (day2)
function plan(): PlanResult {
  return { days: [d(1, [sp('A'), sp('B')]), d(2, [sp('C')])], transportMode: 'driving', startDate: '2026-07-10' }
}

beforeEach(() => { callClaude.mockReset() })

it('valid AI output → ok with the derived changes', async () => {
  // move ref 2 (B) from day1 to day2
  callClaude.mockResolvedValue(JSON.stringify({
    summary: '把 B 移到第 2 天',
    days: [
      { day: 1, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 1, durationMin: 90 }] },
      { day: 2, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 3, durationMin: 90 }, { ref: 2, durationMin: 90 }] },
    ],
  }))
  const res = await rearrangeItinerary(plan(), '把B移到第二天')
  expect(res.ok).toBe(true)
  if (res.ok) {
    expect(res.summary).toBe('把 B 移到第 2 天')
    expect(res.changes).toContainEqual({ id: 'move-B', day: 1, kind: 'move', placeId: 'B', placeName: 'B', toDay: 2 })
  }
})

it('malformed JSON → ok:false', async () => {
  callClaude.mockResolvedValue('sorry I cannot do that')
  const res = await rearrangeItinerary(plan(), 'x')
  expect(res.ok).toBe(false)
})

it('refs not a 1..N permutation (missing ref) → ok:false', async () => {
  callClaude.mockResolvedValue(JSON.stringify({
    summary: 'x',
    days: [ { day: 1, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 1, durationMin: 90 }] },
            { day: 2, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 3, durationMin: 90 }] } ], // ref 2 missing
  }))
  expect((await rearrangeItinerary(plan(), 'x')).ok).toBe(false)
})

it('day count mismatch → ok:false', async () => {
  callClaude.mockResolvedValue(JSON.stringify({
    summary: 'x',
    days: [ { day: 1, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 1, durationMin: 90 }, { ref: 2, durationMin: 90 }, { ref: 3, durationMin: 90 }] } ], // 1 day, current has 2
  }))
  expect((await rearrangeItinerary(plan(), 'x')).ok).toBe(false)
})

it('callClaude throws → ok:false', async () => {
  callClaude.mockRejectedValue(new Error('network'))
  expect((await rearrangeItinerary(plan(), 'x')).ok).toBe(false)
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest rearrange-action --silent` → FAIL。

- [ ] **Step 3: 實作** — Create `app/actions/rearrange.ts`:
```ts
'use server'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'
import { callClaude } from '@/lib/claude'
import { diffPlan, type Change } from '@/lib/utils/rearrangeChanges'

export type RearrangeResult =
  | { ok: true; changes: Change[]; summary: string }
  | { ok: false; error: string }

const ERR = 'AI 重排失敗，請換個說法再試'

interface AiDay { day: number; dayStart: string; dayEnd: string; places: Array<{ ref: number; durationMin: number }> }

function isHHMM(s: unknown): s is string {
  return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s)
}

function buildProposed(current: PlanResult, refPlaces: ScheduledPlace[], aiDays: unknown): PlanResult | null {
  if (!Array.isArray(aiDays) || aiDays.length !== current.days.length) return null
  const N = refPlaces.length
  const seen = new Set<number>()
  const newDays: DayItinerary[] = []
  for (let i = 0; i < aiDays.length; i++) {
    const ad = aiDays[i] as AiDay
    if (!isHHMM(ad?.dayStart) || !isHHMM(ad?.dayEnd) || !Array.isArray(ad?.places)) return null
    const places: ScheduledPlace[] = []
    for (const ap of ad.places) {
      if (typeof ap?.ref !== 'number' || ap.ref < 1 || ap.ref > N || seen.has(ap.ref)) return null
      if (typeof ap?.durationMin !== 'number' || ap.durationMin <= 0) return null
      seen.add(ap.ref)
      const base = refPlaces[ap.ref - 1]
      places.push({ ...base, durationMin: base.durationLocked ? base.durationMin : ap.durationMin })
    }
    const curDay = current.days[i]
    newDays.push({ ...curDay, dayStart: ad.dayStart, dayEnd: ad.dayEnd, places })
  }
  if (seen.size !== N) return null
  return { ...current, days: newDays }
}

export async function rearrangeItinerary(plan: PlanResult, instruction: string): Promise<RearrangeResult> {
  const refPlaces: ScheduledPlace[] = plan.days.flatMap((d) => d.places)
  const dayOfPlace = new Map<string, number>()
  plan.days.forEach((d) => d.places.forEach((p) => dayOfPlace.set(p.placeId, d.day)))

  const refLines = refPlaces.map((p, i) => {
    const locks = [p.startLocked ? '鎖開始' : '', p.durationLocked ? '鎖停留' : ''].filter(Boolean).join('/')
    return `${i + 1}. ${p.name}（${p.type}，第${dayOfPlace.get(p.placeId)}天，停留${p.durationMin}分${locks ? '，' + locks : ''}）`
  }).join('\n')
  const dayLines = plan.days.map((d) => `第${d.day}天 活動窗 ${d.dayStart}-${d.dayEnd}`).join('\n')

  const prompt = `你是旅遊行程助理。以下是目前行程，每個地點有編號 ref：
${refLines}

各天活動窗：
${dayLines}

使用者指令：「${instruction}」

規則：只能把現有地點移到不同天、改停留時長、改活動窗；不可新增/刪除地點，不可增減天數。標「鎖停留」者不要改停留時長，「鎖開始」者盡量不要移動。ref 必須恰好是 1 到 ${refPlaces.length} 各出現一次。

只回傳純 JSON（不要 markdown）：
{"summary":"一句話說明你做了什麼","days":[{"day":1,"dayStart":"09:00","dayEnd":"21:00","places":[{"ref":1,"durationMin":90}]}]}`

  let raw: string
  try {
    raw = await callClaude(prompt)
  } catch {
    return { ok: false, error: ERR }
  }
  try {
    const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) return { ok: false, error: ERR }
    const parsed = JSON.parse(match[0]) as { summary?: string; days?: unknown }
    const proposed = buildProposed(plan, refPlaces, parsed.days)
    if (!proposed) return { ok: false, error: ERR }
    return { ok: true, changes: diffPlan(plan, proposed), summary: parsed.summary ?? '' }
  } catch {
    return { ok: false, error: ERR }
  }
}
```

- [ ] **Step 4: 跑測試 + build** — `npx jest rearrange-action --silent` PASS（5 tests）；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add app/actions/rearrange.ts __tests__/rearrange-action.test.ts
git commit -m "feat: rearrangeItinerary server action (ref-based, validated, diff)"
```

---

## Task 3: 元件 `AiRearrangeInput`

**Files:** Create `components/AiRearrangeInput.tsx`; Test `__tests__/ai-rearrange-input.test.tsx`

**Interfaces — Consumes:** `rearrangeItinerary`（Task 2）；`applyChanges`、`Change`（Task 1）；`PlanResult`。
**Produces:** `<AiRearrangeInput plan={PlanResult} onApply={(newPlan: PlanResult) => void} />`

- [ ] **Step 1: 失敗測試** — Create `__tests__/ai-rearrange-input.test.tsx`:
```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AiRearrangeInput } from '@/components/AiRearrangeInput'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'

const rearrangeItinerary = jest.fn()
jest.mock('@/app/actions/rearrange', () => ({ rearrangeItinerary: (...a: unknown[]) => rearrangeItinerary(...a) }))

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function d(day: number, places: ScheduledPlace[]): DayItinerary {
  return { day, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}
function plan(): PlanResult {
  return { days: [d(1, [sp('A'), sp('B')]), d(2, [sp('C')])], transportMode: 'driving', startDate: '2026-07-10' }
}
const CHANGES = [
  { id: 'move-B', day: 1, kind: 'move', placeId: 'B', placeName: 'B', toDay: 2 },
  { id: 'win-1-dayStart', day: 1, kind: 'window', field: 'dayStart', from: '09:00', to: '10:00' },
]

beforeEach(() => { rearrangeItinerary.mockReset() })

it('submits the instruction and lists changes grouped by day', async () => {
  rearrangeItinerary.mockResolvedValue({ ok: true, changes: CHANGES, summary: '摘要' })
  render(<AiRearrangeInput plan={plan()} onApply={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText(/第二天太滿/), { target: { value: '把B移到第二天' } })
  fireEvent.click(screen.getByRole('button', { name: '重排' }))
  await waitFor(() => expect(screen.getByText(/B 移到第 2 天/)).toBeInTheDocument())
  expect(screen.getByText(/活動開始 09:00 → 10:00/)).toBeInTheDocument()
  expect(rearrangeItinerary).toHaveBeenCalledWith(expect.anything(), '把B移到第二天')
})

it('removing a change with ✗ excludes it; 一鍵同意全部 applies only the rest', async () => {
  rearrangeItinerary.mockResolvedValue({ ok: true, changes: CHANGES, summary: '摘要' })
  const onApply = jest.fn()
  render(<AiRearrangeInput plan={plan()} onApply={onApply} />)
  fireEvent.change(screen.getByPlaceholderText(/第二天太滿/), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: '重排' }))
  await screen.findByText(/B 移到第 2 天/)
  // ✗ the move
  fireEvent.click(screen.getByRole('button', { name: '移除 B 移到第 2 天' }))
  fireEvent.click(screen.getByRole('button', { name: '一鍵同意全部' }))
  expect(onApply).toHaveBeenCalledTimes(1)
  const newPlan: PlanResult = onApply.mock.calls[0][0]
  // move rejected → B stays on day 1; window accepted → day1 start 10:00
  expect(newPlan.days[0].places.map((p) => p.placeId)).toEqual(['A', 'B'])
  expect(newPlan.days[0].dayStart).toBe('10:00')
})

it('shows an error and does not call onApply when the action fails', async () => {
  rearrangeItinerary.mockResolvedValue({ ok: false, error: 'AI 重排失敗，請換個說法再試' })
  const onApply = jest.fn()
  render(<AiRearrangeInput plan={plan()} onApply={onApply} />)
  fireEvent.change(screen.getByPlaceholderText(/第二天太滿/), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: '重排' }))
  await waitFor(() => expect(screen.getByText('AI 重排失敗，請換個說法再試')).toBeInTheDocument())
  expect(onApply).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest ai-rearrange-input --silent` → FAIL。

- [ ] **Step 3: 實作** — Create `components/AiRearrangeInput.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { PlanResult } from '@/lib/types'
import { rearrangeItinerary } from '@/app/actions/rearrange'
import { applyChanges, type Change } from '@/lib/utils/rearrangeChanges'

interface Props {
  plan: PlanResult
  onApply: (newPlan: PlanResult) => void
}

function changeLabel(c: Change): string {
  if (c.kind === 'move') return `${c.placeName} 移到第 ${c.toDay} 天`
  if (c.kind === 'duration') return `${c.placeName} 停留 ${c.from} → ${c.to} 分`
  return `活動${c.field === 'dayStart' ? '開始' : '結束'} ${c.from} → ${c.to}`
}

export function AiRearrangeInput({ plan, onApply }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [changes, setChanges] = useState<Change[] | null>(null)
  const [summary, setSummary] = useState('')
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!text.trim()) return
    setLoading(true); setError(null); setChanges(null); setRejected(new Set())
    const res = await rearrangeItinerary(plan, text.trim())
    setLoading(false)
    if (!res.ok) { setError(res.error); return }
    setChanges(res.changes); setSummary(res.summary)
  }

  function reject(id: string) {
    setRejected((prev) => new Set(prev).add(id))
  }

  function applyAll() {
    if (!changes) return
    const accepted = changes.filter((c) => !rejected.has(c.id))
    onApply(applyChanges(plan, accepted))
    setChanges(null); setText(''); setRejected(new Set())
  }

  function cancel() {
    setChanges(null); setRejected(new Set())
  }

  const days = changes
    ? Array.from(new Set(changes.filter((c) => !rejected.has(c.id)).map((c) => c.day))).sort((a, b) => a - b)
    : []

  return (
    <div className="border border-gray-200 rounded-xl p-4 mb-6 bg-gray-50">
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例：第二天太滿，分一些到第三天"
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          rows={2}
        />
        <button type="button" onClick={submit} disabled={loading || !text.trim()}
          className="px-3 py-1 rounded-full border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40 self-start">
          {loading ? 'AI 重排中…' : '重排'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-2" role="alert">{error}</p>}

      {changes && (
        <div className="mt-3">
          {summary && <p className="text-sm text-gray-600 mb-2">{summary}</p>}
          {days.length === 0 ? (
            <p className="text-sm text-gray-500">沒有需要調整的地方</p>
          ) : (
            days.map((day) => (
              <div key={day} className="mb-2">
                <p className="text-xs font-semibold text-gray-700">第 {day} 天</p>
                {changes.filter((c) => c.day === day && !rejected.has(c.id)).map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm py-0.5">
                    <span>• {changeLabel(c)}</span>
                    <button type="button" onClick={() => reject(c.id)}
                      aria-label={`移除 ${changeLabel(c)}`}
                      className="text-gray-400 hover:text-red-500 px-1">&#x2717;</button>
                  </div>
                ))}
              </div>
            ))
          )}
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={applyAll}
              className="px-3 py-1 rounded-full bg-blue-600 text-white text-sm hover:bg-blue-700">一鍵同意全部</button>
            <button type="button" onClick={cancel}
              className="px-3 py-1 rounded-full border border-gray-300 text-gray-600 text-sm hover:bg-gray-100">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 跑測試 + build** — `npx jest ai-rearrange-input --silent` PASS（3 tests）；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add components/AiRearrangeInput.tsx __tests__/ai-rearrange-input.test.tsx
git commit -m "feat: AiRearrangeInput — instruction box + per-day change list (✗ + apply-all)"
```

---

## Task 4: 接上 `ItineraryClient`（最小改動）

**Files:** Modify `app/itinerary/ItineraryClient.tsx`; Test `__tests__/itinerary-client-ai-rearrange.test.tsx`

**Interfaces — Consumes:** `AiRearrangeInput`（Task 3）；既有 `scheduleRecalc`（#4，接受 `(plan, structural)`）。

- [ ] **Step 1: 失敗測試** — Create `__tests__/itinerary-client-ai-rearrange.test.tsx`:

> **務必先複製** `__tests__/itinerary-client-smart-arrange.test.tsx` 頂部讓 `ItineraryClient` 能在 jsdom 渲染的所有 mock（dnd-kit、`CombinedInput`、`RecommendPanel` 等），與下方合併於同檔。此測試把 `AiRearrangeInput` mock 成一個會呼叫 `onApply` 的樁，驗證 client 有渲染它、且 `onApply` 會更新行程。

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'

// ⬇️ 連同 itinerary-client-smart-arrange.test.tsx 的 dnd-kit/CombinedInput/RecommendPanel mocks 一起放

// stub AiRearrangeInput: a button that calls onApply with a plan whose day 1 has only A
jest.mock('@/components/AiRearrangeInput', () => ({
  AiRearrangeInput: ({ onApply, plan }: { onApply: (p: PlanResult) => void; plan: PlanResult }) => (
    <button onClick={() => onApply({ ...plan, days: plan.days.map((d, i) =>
      i === 0 ? { ...d, places: d.places.filter((p) => p.placeId === 'A') } : d) })}>stub-apply</button>
  ),
}))

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function d(day: number, places: ScheduledPlace[]): DayItinerary {
  return { day, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}
function plan(): PlanResult {
  return { days: [d(1, [sp('A'), sp('B')]), d(2, [sp('C')])], transportMode: 'driving', startDate: '2026-07-10' }
}

it('applying an AI rearrange updates the itinerary (B removed from day 1)', () => {
  render(<ItineraryClient initial={plan()} />)
  // day 1 initially shows both A and B
  expect(screen.getByTestId('card-B')).toBeInTheDocument()
  fireEvent.click(screen.getByText('stub-apply'))
  // after apply, day-1 no longer has B
  const day0 = screen.getByTestId('day-0')
  expect(day0.querySelector('[data-testid="card-B"]')).toBeNull()
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest itinerary-client-ai-rearrange --silent` → FAIL（元件未渲染）。

- [ ] **Step 3: 實作** — In `app/itinerary/ItineraryClient.tsx`：
  - import 加：`import { AiRearrangeInput } from '@/components/AiRearrangeInput'`。
  - 在其他 handler 旁加：
    ```ts
    const handleAiApply = useCallback((newPlan: PlanResult) => {
      scheduleRecalc(newPlan, true)
    }, [scheduleRecalc])
    ```
  - 在行程內容頂部（days 容器之前、日期列附近）渲染：
    ```tsx
    <AiRearrangeInput plan={plan} onApply={handleAiApply} />
    ```
    > 讀檔找到 days 的 `.map` 容器與頂部區塊，放在其上方（與既有 `arrangeError`/日期列同區）。`scheduleRecalc` 已接受 `(plan, structural)`（#4）；傳 `true` 讓套用後重算時間 + 2 秒 leg 重算。

- [ ] **Step 4: 跑測試 + build** — `npx jest itinerary-client-ai-rearrange --silent` PASS；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add app/itinerary/ItineraryClient.tsx __tests__/itinerary-client-ai-rearrange.test.tsx
git commit -m "feat: wire AiRearrangeInput into ItineraryClient (apply → scheduleRecalc)"
```

---

## Self-Review Notes

- **Spec 覆蓋：** §4 變動模型 → Task1（`diffPlan`/`applyChanges`）；§5 伺服器動作/ref 驗證 → Task2；§6 UI（用天分類、✗、一鍵同意全部、取消、錯誤）→ Task3；§7 架構/最小 ItineraryClient → Task4；§2 安全（ref 排列、天數、HH:MM、durationLocked）→ Task2 `buildProposed` + Task1 diff/apply；§8 邊界（無變動、全 ✗、AI 掛）→ Task2/Task3 測試。
- **子集安全：** `applyChanges` 三類獨立套在目前 plan 複本，✗ 任一不影響其他（Task1 subset 測試證明）。
- **零破壞：** 純新增檔 + `ItineraryClient` 只加 import/handler/一個元件；不動資料層；重用 #4 `scheduleRecalc(_, true)`。
- **型別一致：** `Change`、`diffPlan`、`applyChanges`、`RearrangeResult`、`rearrangeItinerary`、`AiRearrangeInput` props（`plan`/`onApply`）跨 task 命名一致。
- **不在範圍：** 同天內重排（交拖曳/#7）；新增/刪除地點或天數；多輪對話記憶。
- **Lane C：** ItineraryClient 僅 +import +handleAiApply +一行渲染，重疊面最小。
