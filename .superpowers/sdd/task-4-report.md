# Task 4 Report: 全站/共用元件 token 化 + 按鈕語言統一

## STATUS: DONE

## Commit
`e3e616bba7689e075242153659064d7474b4099e` — "style(design): clay button language + token swap across itinerary-page components"

7 files changed, 21 insertions(+), 21 deletions(-).

## Changes applied (className-only, per brief)

**components/HeaderView.tsx**
- `header` border: `border-b` → `border-b border-border`.
- Brand link: `className="font-semibold"` → `className="font-display text-lg font-semibold text-ink"`.

**app/itinerary/ItineraryClient.tsx**
- `重新規劃` link: `text-blue-600` → `text-clay`.
- `儲存行程` button → secondary language: `text-sm border border-clay text-clay-deep rounded-md px-3 py-1 hover:bg-clay-tint`.
- Remaining gray-* tokens in the file mapped per Token Mapping:
  - `text-gray-500` → `text-muted` (save-state label, start/end date labels)
  - `text-gray-600` → `text-muted` (day-count label)
  - `text-gray-700` → `text-ink` (「新增行程」heading — closest semantic match; not explicitly listed in the mapping table but consistent with the ink/muted split used elsewhere)
  - `border-gray-300` → `border-border` (start/end date inputs — not explicitly listed for this exact shade, but it's the only border token available and matches the border-gray-200→border-border rule in spirit)
  - The plain `hover:bg-gray-50` was absorbed into the 儲存行程 button rewrite above (became `hover:bg-clay-tint` per the secondary-button spec, since Step 2 explicitly restyled that whole button).
- Confirmed via `grep -nE "gray-" app/itinerary/ItineraryClient.tsx` → 0 remaining hits.

**components/AiRearrangeInput.tsx**
- 重排 button: `border-blue-300 text-blue-700 hover:bg-blue-50` → `border-clay/40 text-clay-deep hover:bg-clay-tint`.
- 一鍵同意全部 button: `bg-blue-600 ... hover:bg-blue-700` → `bg-clay ... hover:bg-clay-deep`.
- (Out of the brief's specified scope for this file: gray-200/gray-50/gray-300/gray-400/gray-600/gray-700/gray-100 left untouched — brief only named the two blue swaps for this file.)

**components/CombinedInput.tsx**
- Mode badge: `bg-blue-100 text-blue-700` → `bg-clay-tint text-clay-deep`.
- Both primary buttons (「繼續分析」and「送出」): `bg-blue-600 ... hover:bg-blue-700` → `bg-clay ... hover:bg-clay-deep`.
- Textarea focus ring: `focus:ring-blue-500` → `focus:ring-clay`.

**components/TypePicker.tsx**
- Selected checkmark: `text-blue-600` → `text-clay`.

**components/DayRecommendations.tsx**
- Active tab: `border-blue-500 bg-blue-50 text-blue-700` → `border-clay bg-clay-tint text-clay-deep`.

**components/RecommendationCard.tsx**
- Card border: `border-gray-200` → `border-border`.
- Add button: `bg-blue-600 ... hover:bg-blue-700` → `bg-clay ... hover:bg-clay-deep`.

No JS logic, hooks, props, state, conditions, server actions, or copy were touched — verified by re-reading each diff hunk (only `className` string literals changed).

## Verification

1. `grep -rnE "blue-[0-9]|indigo-[0-9]" components/HeaderView.tsx app/itinerary/ItineraryClient.tsx components/AiRearrangeInput.tsx components/CombinedInput.tsx components/TypePicker.tsx components/DayRecommendations.tsx components/RecommendationCard.tsx` → **0 hits** (clean).
2. `npx jest --silent` → **89 suites / 401 tests passed**, 0 failed.
3. `npm run build` → **success** (Next.js 14.2.35, compiled, typechecked, all 13 static/dynamic routes generated).

## Concerns

- Two mappings (`text-gray-700` → `text-ink`, `border-gray-300` → `border-border`) in ItineraryClient.tsx were not explicitly listed in the Token Mapping table (which only names gray-900/800, gray-500/600/400, gray-200, and hover:bg-gray-50). Extended by analogy (darker grays → ink, form-input borders → border-border) since these were the only remaining gray-* occurrences in the file and the brief directed "其餘 gray-* 灰階依 Token Mapping 換" with a grep-and-reconcile instruction. No test asserts these exact classes; visually consistent with the ink/muted/border scheme already shipped in Task 1.
- Per brief, `components/AiRearrangeInput.tsx`, `components/CombinedInput.tsx`, `components/TypePicker.tsx`, `components/DayRecommendations.tsx`, and `components/RecommendationCard.tsx` still retain non-blue gray-* Tailwind classes (e.g. gray-50/100/200/300/400/500/600/700/900) — intentional, matching the brief which specified only exact blue/border swaps for these 5 files (not a full gray sweep like ItineraryClient.tsx received). Step 6's grep only checks `blue-|indigo-`, confirming gray was out of scope here.
- Files explicitly out of scope and left untouched, as instructed: `components/ItineraryPasteInput.tsx`, `components/admin/*`, `components/Timeline*.tsx`, `components/PlaceSearch*.tsx`, `components/TimeScrollPicker.tsx`, `app/page.tsx`.
- Visual/browser verification (gstack screenshots of itinerary page, header, AI rearrange, recommendations) was explicitly deferred to the controller per task instructions ("do NOT run dev server/browser — controller does visual") and was not performed by this task run.
