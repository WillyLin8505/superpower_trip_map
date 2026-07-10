# Task 3 Report: ItineraryDay（襯線每日標題 + 控制列收色）

## Status: DONE

## Commit
`e9c7e47` — style(design): serif day headers + clay controls in ItineraryDay

## Changes made (components/ItineraryDay.tsx, className-only, no logic touched)

- Line 50 (day `<h2>`): `text-xl font-bold text-gray-800 mb-1` → `font-display text-2xl font-semibold text-ink mb-1 text-balance` (exact swap per brief Step 1).
- Line 54 (「這天沒有住宿」warning): `text-orange-600` → `text-warn`.
- Line 60 (「散到其他天」button, in the `isOverflow` action row): `border-orange-300 text-orange-700 hover:bg-orange-50` → `border-warn text-warn hover:bg-warn/10`. **Not explicitly listed in the brief's line-133 mapping or the Token Mapping table** (which only covers `text-orange-600` and `border-orange-300`). Since the grep gate requires zero `orange-` matches, I extended the same warn-semantic mapping to the paired `text-orange-700`/`hover:bg-orange-50` classes on this button (there is no dedicated warn-tint token, so I used the `warn/10` opacity modifier — the same opacity-modifier technique the brief itself specifies for `border-blue-300` → `border-clay/40`).
- Line 73 (activity-window row text): `text-gray-500` → `text-muted`.
- Lines 77, 81 (activity-window time inputs): `border-gray-200` → `border-border` (×2).
- Lines 96, 106 (整天鎖開始/整天鎖停留 buttons): `border-gray-200 hover:bg-gray-50` → `border-border hover:bg-paper`. `hover:bg-gray-50` isn't in the given Token Mapping table either; mapped to the existing neutral `paper` surface token (`#FBF7F0`) since these are neutral toggle buttons, not clay/warn actions.
- Line 133 (智慧排程 button — brief mislabels this as "整天鎖" but the line content matches exactly): `border-blue-300 text-blue-700 hover:bg-blue-50` → `border-clay/40 text-clay-deep hover:bg-clay-tint` (per brief Step 2, line 133).
- Line 139 (`day.aiSummary` text): `text-gray-500` → `text-muted`.
- Line 143 (drag-over highlight on droppable zone): `ring-2 ring-blue-400 bg-blue-50` → `ring-2 ring-clay bg-clay-tint` (per brief Step 2, line 143).
- Line 168 (free-block pill): `text-gray-500 bg-gray-100` → `text-muted bg-paper`.
- Line 181 (map iframe wrapper border): `border-gray-200` → `border-border`.

Left untouched (out of scope — not gray/blue/orange): `border-red-300 text-red-600 hover:bg-red-50` on the 刪除這天 (delete) button (line 66).

No JS logic, hooks, props, conditions, or dnd wiring (`useDroppable`, `isOver`, `setNodeRef`) were modified — verified via `git diff` review, only `className` string literals changed.

## Verification

- `grep -nE "blue-|gray-[0-9]|orange-" components/ItineraryDay.tsx` → 0 matches (exit 1).
- `npx jest --silent` → 89 suites / 401 tests, all passed.
- `npm run build` → compiled successfully, types valid, all routes generated.
- Visual confirmation via gstack/dev server was **not** performed per task instructions (controller handles visual QA).

## Concerns

1. Two exact-string mappings in the brief (line 60 orange trio, lines 96/106 gray-hover) fell outside the literal Token Mapping table provided. I extended the existing semantic pattern (warn for orange, paper for neutral gray hover, using the opacity-modifier technique already sanctioned for `border-clay/40`) rather than leaving stray classes, to satisfy the zero-match grep gate. Worth a visual check that `hover:bg-warn/10` and `hover:bg-paper` render as intended alongside the rest of the palette.
2. Brief's Step 2 line-133 label ("整天鎖" button) doesn't match the actual button at that line (which is 智慧排程/smart-arrange) — applied the swap to the line/content specified since it matched verbatim, not the label.
