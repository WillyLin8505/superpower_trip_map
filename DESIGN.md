# Design System — 旅遊行程規劃（溫暖旅誌 / Warm Travel Journal）

> Always read this before any visual or UI change. Font choices, colors, spacing,
> radius, and motion are defined here. Do not deviate without explicit user approval.

## Product Context
- **What this is:** A Traditional-Chinese travel-itinerary planner. Paste a travel article or search places; it auto-schedules them into a day-by-day plan the user fine-tunes (reorder, retime, lock stops, swap transport, AI re-arrange).
- **Who it's for:** Individuals and small groups planning trips (Taiwan / Asia focus).
- **Space/industry:** Travel planning. Peers: Wanderlog, Mindtrip, TripIt, Google Travel.
- **Project type:** Web app (Next.js 14 + Tailwind). The **itinerary editing page is the workspace** and the primary surface.

## North Star
**「規劃行程竟然這麼輕鬆」** — planning a trip is *surprisingly effortless*. Every design decision serves warmth **and** lightness. Warmth must never tip into clutter; the felt outcome is calm, effortless flow.

## Aesthetic Direction
- **Direction:** Warm editorial-organic — a travel journal that happens to be a powerful planner.
- **Decoration level:** intentional (warmth comes from color temperature, type, and rhythm — not ornament). No decorative blobs, no gradients-as-decoration.
- **Mood:** Calm, human, paper-warm. The plan should read like the pleasant story of your day, not a productivity dashboard.
- **Deliberate departure from category:** competitors are cool blue/gray dashboards. We own warmth (clay primary on warm paper) + an editorial serif journal voice. Anti-AI-slop by construction.

## Typography
Must carry Traditional Chinese — CJK-capable fonts are non-negotiable.
- **Display / Day headers / moments:** `Fraunces` (Latin) + `Noto Serif TC` (Chinese) — warm high-contrast editorial serif. Journal voice for 「第 1 天 · 7/10（五）」. **Headers only** (serif TC is heavy at small sizes).
- **Body / UI:** `Noto Sans TC` — clean warm-neutral humanist sans; covers 繁中 + Latin.
- **Data / times / ratings:** `Noto Sans TC` with `font-variant-numeric: tabular-nums` so 09:00→10:30 columns align.
- **Loading:** Google Fonts — `Fraunces:opsz,wght@9..144,400;500;600`, `Noto Serif TC:wght@500;600;700`, `Noto Sans TC:wght@400;500;700`, `display=swap`. (Self-host later if FOUT matters.)
- **Scale (px):** display 40–68 (clamp), h2 30, h3/card-name 17, body 16, sub/label 13, micro 12. Line-height: 1.6 body, 1.05–1.15 headings. Headings use `text-wrap: balance`.

## Color
- **Approach:** balanced, warm-forward. One warm primary + a cool secondary for wayfinding; warm type tints for categories.
- **Paper (bg):** `#FBF7F0` — warm sand, never stark white. The biggest lever away from "dashboard".
- **Surface (cards):** `#FFFDF9`; border `#EBE3D7`, strong border `#DED3C3`.
- **Ink (text):** `#2B2320` warm near-black; muted `#7A6F66`.
- **Primary — Clay:** `#C65D3B` (hover `#A94A2E`, tint `#F6E7DF`). Actions, number badges, the active "moment". **Replaces all existing blue.**
- **Secondary — Sea:** `#3E7C7B` (tint `#E1EBEA`). Maps, transport, wayfinding — a cool counterpoint that keeps routes legible without breaking warmth.
- **Category tints (warm family):** 景點 amber `#E8B04B` (tint `#F7EBCF`) · 餐廳 clay-rose `#D98C6A` (tint `#F5E4DA`) · 住宿 sage `#7C8B6A` (tint `#E7ECDF`). Used as card left-border + tag pill.
- **Semantic:** success 香草綠 `#4E8A5B`, warning 琥珀 `#D08A2C`, error 磚紅 `#C0392B`, info = Sea `#3E7C7B`.
- **Contrast:** hold WCAG AA — body ≥4.5:1, large/UI ≥3:1. Clay on paper and ink on paper both pass; verify any clay-on-tint text.
- **Dark mode (warm dark, not inverted gray):** paper `#211C18`, surface `#2B2420`, ink `#F1EADF`, muted `#B3A597`, borders `#3A322C`. Accents lifted/desaturated: clay `#E0764F`, sea `#69A8A6`, sage `#9BAA86`, clay-rose `#E0A585`. `color-scheme: dark` on `<html>`.

## Spacing
- **Base unit:** 8px.
- **Density:** comfortable — breathing room is the "effortless" lever; group tightly *inside* a card, separate sections generously.
- **Scale (px):** 2xs 2 · xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48 · 3xl 64.

## Layout
- **Approach:** grid-disciplined (App UI). Predictable alignment; scannable.
- **Itinerary page:** day sections stacked; each = large serif day header → vertical list of place cards with transport legs between them → warm map panel on the right (sea-tint). Retain the existing left-plan / right-map split.
- **Max content width:** ~1120px workspace; forms ~672px.
- **Border radius (hierarchical):** sm 6px (pills-in-card, inputs) · md 10px (buttons) · lg 16px (cards, panels) · full 9999px (number badges, tag pills, toggles). Not uniform bubbly radius.

## Motion
- **Approach:** intentional, restrained.
- **Signature moment:** when auto-schedule (or AI re-arrange) finishes, day cards **settle in with a gentle staggered ease-out** — the felt beat of 「竟然這麼輕鬆」, paired with a warm 「行程好了」 line. This is the one place motion earns expressiveness.
- **Everything else calm:** hover (150–200ms), drag feedback, focus ring (clay, 3px tint). Only animate `transform`/`opacity`.
- **Easing:** enter `ease-out`, exit `ease-in`, move `ease-in-out`. **Duration:** micro 50–100ms · short 150–250ms · medium 250–400ms · long 400–700ms. Respect `prefers-reduced-motion` (drop the reveal to a fade).

## Component Notes
- **Buttons:** primary = solid clay / white text; secondary = clay outline on transparent; ghost = muted outline. No gradient CTAs.
- **Place card:** clay number badge · serif-free bold name · category tag pill · time range in clay with tabular-nums · rating · category-colored left border. Transport leg is a muted dashed connector between cards, not a boxed control.
- **Tag pills / lock buttons:** small, `full` radius, tinted by category/state; keep tiny controls from shouting.
- **Alerts:** left-border + tint by semantic color (success/warn/error), warm surface.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-04 | Initial design system 「溫暖旅誌」 created | /design-consultation. Direction: warm editorial-organic. North star: 「規劃行程竟然這麼輕鬆」. Chose clay `#C65D3B` primary over category-standard blue to own warmth + avoid AI-slop; Fraunces + Noto Serif TC editorial headers; Noto Sans TC body (CJK coverage). Preview approved by user (HTML preview, light+dark). AI-mockup path skipped (no OpenAI key). Apply itinerary-page-first. |
