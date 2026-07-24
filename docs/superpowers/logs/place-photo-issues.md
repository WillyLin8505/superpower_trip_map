# Place Photo Issue Log

This is the living log for recurring place-photo problems.

## Logging Policy

- Keep the same problem domain in this file instead of creating a new dated file each time.
- Append new findings under the closest matching issue section.
- Add a new section only when the root cause or failure mode is materially different.
- Keep QA evidence paths, final metrics, and the exact verification method in the same section as the problem.
- Do not split screenshot links, fixes, and regression tests into separate files for the same issue.

## Active Invariants

- Free image sources should satisfy place-card photos before any paid Google photo fallback.
- Paid Google photo URLs must not be returned unless the user explicitly accepts the cost.
- Recommendation, itinerary, LINE discussion, backup, and map-saved cards should render consistent photo behavior.
- Cards that request photos should settle with 5 usable images whenever a fallback source can provide them.
- Openverse thumbnail proxy URLs are not trusted as embeddable final image URLs.
- QA screenshots must be captured after scrolling through the page once and waiting for visible images to settle.

## 2026-07-24 - Free Place Photo Stabilization

### Context

Target itinerary used for QA:

- Production URL reported by user: `https://superpower-trip-map.vercel.app/itinerary/fec9bbb2-3fd5-4db7-af03-d6ce0bd8860a`
- Local verification route used after build: `http://localhost:3000/share/5d7ec31d-5a31-4407-aa0a-a40195fc3f4f`

The `/itinerary/...` route may require auth, so browser QA should also verify the public `/share/...` route for the same trip data when direct itinerary access is unavailable.

### Problems Observed

1. Some place cards reused the same full 5-image set across unrelated places.
2. Some cards still exposed a manual `載入照片` flow instead of loading photos automatically.
3. Some cards showed no image or a gray placeholder while the page was in a settled state.
4. Some free image URLs from Openverse thumbnail proxy endpoints rendered as broken images in the browser.
5. Wikimedia Commons search could return technically valid image files that were unrelated to the place because the match was too loose.
6. Legacy saved cards with 5 stale image URLs did not refetch, so bad persisted data kept showing even after the resolver was improved.
7. QA screenshots taken during lazy loading can falsely show placeholders; final QA must scroll through the page first, wait for visible images to settle, then scroll back and capture.

### Root Causes

- `PhotoStrip` skipped fetching when a card already had 5 stored images, even if those images were stale or generic.
- Recommendation cards and itinerary cards had different fetch/eager behavior, which made manual-load and auto-load behavior inconsistent.
- Openverse category fallback had a small generic pool and deterministic selection was too similar for nearby or related places.
- Wikimedia Commons search accepted broad title hits and non-photo-like file pages, causing irrelevant book scans or unrelated place images.
- Openverse `api.openverse.org/v1/images/.../thumb/` URLs are not reliable embeddable image URLs for the app.
- The QA script initially counted repeated sets without separating same-place duplicates from different places sharing one image set.

### Fixes Applied

- Bumped image resolver/cache versions so stale session and resolver caches are invalidated.
- Added `refreshFetchedPhotos` to `PhotoStrip`, allowing itinerary cards to replace full legacy photo sets with fresh free-photo API results.
- Enabled itinerary cards to refresh fetched photos, not just cards with fewer than 5 images.
- Kept recommendation cards eager-loading all 5 photos and hiding the manual `載入照片` gate.
- Filtered non-embeddable Openverse thumbnail proxy URLs from incoming, cached, and fetched photo lists.
- Tightened Wikimedia Commons search by requiring image title/query relevance and rejecting non-photo-like file pages.
- Added built-in free category fallback pools and seeded shuffling so free fallback still returns 5 images without using paid Google photo media.
- Changed the place photo route so full free results return before any paid Google photo fallback.

### Regression Tests Added Or Updated

- `__tests__/photo-strip.test.tsx`
  - Full legacy 5-photo sets can be refreshed.
  - Broken Openverse thumb proxy URLs are filtered.
  - Photo lookup cache version expectations were updated.
- `__tests__/open-poi.test.ts`
  - Wikimedia search rejects non-photo Commons hits.
  - Static free category fallback works when Openverse is unavailable or rate-limited.
  - Generic fallback varies across places.
  - Stale persisted free image metadata is ignored after resolver version changes.
- `__tests__/place-photos-route.test.ts`
  - Full free-image matches do not call paid Google photo metadata.
  - Generic free images can satisfy the requested limit before paid Google fallback.
- `__tests__/recommendation-card*.test.tsx`
  - Recommendation cards request all 5 photos and do not require the manual load button.

### Final QA Metrics

Final browser QA artifact:

- `D:\vibe_coding_project\food_map\superpowers_food_map\.gstack\qa-reports\screenshots\image-qa-2026-07-23-after-refresh-settled\analysis.json`

Final settled metrics:

- `brokenImages: 0`
- `cardsWithFew: 0`
- `manualLoadButtons: 0`
- `noPhotoTexts: 0`
- `withinCardDuplicates: 0`
- `repeatedSetCountDifferentTitles: 0`
- `responseUnderfills: 0`
- `googlePaidPhotoUrlsReturned: false`

One repeated set remained only for the same title/place duplicated in the trip. That is not the same bug as unrelated places sharing a fallback image set.

### QA Checklist For This Problem

1. Build first: `NEXT_PUBLIC_GOOGLE_MAPS_JS_MODE=off NEXT_PUBLIC_GOOGLE_MAPS_EMBED_MODE=off npm run build`.
2. Start production server with `npm start`.
3. Open the public `/share/...` route if `/itinerary/...` is auth-gated.
4. Scroll through the whole page once to trigger lazy/eager fetches.
5. Wait for visible placeholders to disappear and visible images to report non-zero natural dimensions.
6. Capture screenshots after the page is settled, not during first lazy-load.
7. Inspect `/api/place-photos` responses and confirm:
   - every response has 5 URLs when the card requests all photos;
   - no response URL starts with `/api/photo?`;
   - no response uses `api.openverse.org/v1/images/.../thumb/`.
8. Compute repeated image sets separately for:
   - different place titles sharing the same image set;
   - the same place title duplicated in the itinerary.
9. Do not re-enable paid Google photo fallback unless the user explicitly accepts the cost.

### Screenshot Evidence

- `D:\vibe_coding_project\food_map\superpowers_food_map\.gstack\qa-reports\screenshots\image-qa-2026-07-23-after-refresh-settled\02-settled-1600.png`
- `D:\vibe_coding_project\food_map\superpowers_food_map\.gstack\qa-reports\screenshots\image-qa-2026-07-23-after-refresh-settled\03-settled-2400.png`
- `D:\vibe_coding_project\food_map\superpowers_food_map\.gstack\qa-reports\screenshots\image-qa-2026-07-23-after-refresh-settled\07-settled-16561.png`

## 2026-07-24 - Exact Images Mixed With Generic Fallback

### Context

User reported `淺草寺` showing a tower image in:

- `https://superpower-trip-map.vercel.app/itinerary/fec9bbb2-3fd5-4db7-af03-d6ce0bd8860a`

Direct production API check:

- `https://superpower-trip-map.vercel.app/api/place-photos?placeId=user%3Aasakusa&placeName=%E6%B7%BA%E8%8D%89%E5%AF%BA&placeType=attraction&limit=5&v=11`

### Observed First Five URLs

1. `浅草寺_(52852135842).jpg` — accurate Senso-ji image.
2. `浅草寺宝蔵門20250719-P1070566.jpg` — accurate Senso-ji Hozomon image.
3. `Meiji-jingū_vin_de_Bourgogne.jpg` — inaccurate; unrelated Meiji Shrine image.
4. `Main_Hall,_Sensō-ji_Temple,_Tokyo...jpg` — accurate Senso-ji image.
5. `Akihabara_Electric_Town_9999_14.jpg` — inaccurate; unrelated Akihabara image.

The screenshot also showed a tower image. That can come from the generic attraction fallback pool, which currently includes Tokyo Skytree URLs.

### Root Cause

- Exact free sources returned fewer than 5 images.
- The resolver then continued to generic category fallback to force-fill 5 images.
- `mergeFreeImageResults()` preserves the first result's `source`, so a mixed exact-plus-generic result can still be labeled `wikimedia_commons`.
- `mergeFreeImageResults()` also marks `generic` as true only when both current and next results are generic, so mixed results can incorrectly report `generic: false`.

### Product Decision Needed

There is a direct conflict between:

- showing exactly 5 images for every place;
- guaranteeing all images are actually from that exact place.

The safer default should be exactness first: do not fill exact place cards with generic category fallback images unless the UI clearly labels them as generic or the user explicitly accepts approximate images.

### Regression Checklist

1. Query `淺草寺` and confirm unrelated tower, Meiji Shrine, and Akihabara URLs are not mixed into the first five exact place photos.
2. If fewer than 5 exact photos exist, return fewer exact photos or clearly label approximate fallback.
3. Ensure the API response exposes enough provenance to distinguish exact, mixed, and generic photos.
4. Add a test where an exact Commons result has fewer than 5 URLs and generic fallback has unrelated URLs.

## 2026-07-24 - Official Website Metadata Pipeline

### Decision

Do not search the open web blindly by place name. The image pipeline should use official URLs only when the URL comes from structured metadata:

- OSM `website`, `contact:website`, or `url`.
- Wikidata `P856` official website.
- Admin-configured image sources when they identify a provider-specific source.

The official website fetch should read only page-level metadata images:

- `og:image`
- `og:image:secure_url`
- `twitter:image`
- `twitter:image:src`
- schema.org / JSON-LD `image`

Do not crawl arbitrary `<img>` tags from the whole site. That increases wrong-image, logo, ad, and copyright risk.

### Confidence Rules

Scores are deterministic 0-100 values:

- `official_website`: 95
- `metadata`: 92
- `wikidata`: 90
- `wikipedia`: 86
- `wikimedia_commons`: 82
- `openverse`: 72
- `static_free` or generic category fallback: 30

The score measures source precision, not visual quality. Generic fallback is intentionally low confidence and must not be mixed into an exact place result just to fill five slots.

### Implementation Notes

- `/api/place-photos` should return per-image provenance in addition to `photoUrls`.
- `free_image` cache metadata should persist `confidence` and per-photo `photos[]` provenance.
- Exact sources should be exhausted first.
- Generic category fallback should be used only when no exact images exist, unless the UI explicitly labels approximate images.

## 2026-07-24 - Admin-Managed Image Source Order

### Rule

Image source priority must be controlled from `/admin`, not hard-coded only in `lib/openPoi.ts`.

Default intended order:

1. Regional official tourism source for the place area, such as Tokyo or Osaka official tourism sites.
2. National official tourism source for the place country, such as JNTO for Japan.
3. Structured official website metadata from OSM or Wikidata `P856`.
4. Public exact sources: Wikidata image, Wikipedia summary image, Wikimedia Commons exact match, Openverse strict match.
5. Generic fallback only when no exact image exists, and only with low confidence.

### Regression Checklist

1. `/admin` must show every image source rule with provider, scope, country, region, condition, priority, and enabled status.
2. Dragging image source rows must update `sources.config.priority`.
3. `getImageSources()` must return enabled image sources in priority order.
4. The free image resolver must read managed image source order before falling back to built-in defaults.
5. Stale cached image metadata must be invalidated when resolver semantics change by bumping `FREE_IMAGE_LOOKUP_VERSION`.

## 2026-07-24 - Collapse Regional Official Sources

### Decision

Do not list every regional official tourism site as a separate `/admin` image rule. The regional-official category should be one rule:

- Provider: `official_website`
- Scope: `regional_official`
- Condition: `依地點 country + region 對應該區域官方旅遊網站；不逐一列出區域站`

Examples such as Tokyo, Osaka, Kyoto, Nara, Hokkaido, Okinawa, and Hiroshima are implementation details, not separate manager-facing rules.

### Regression Checklist

1. `/admin` should show one regional official image rule, not one row per region.
2. New image source form placeholders should guide agents to add one generic regional condition.
3. The regional official rule should remain priority `10`, before national official and public image sources.
