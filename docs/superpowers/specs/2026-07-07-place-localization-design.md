# Design: Place Localization

**Date:** 2026-07-07
**Status:** Draft for Manager Review
**Manager task:** TASK-003

## Goal

Make place names and addresses display in the best available language for Taiwan trip planning: Traditional Chinese first, English second, and the original source text as the final fallback.

This spec formalizes DEC-201 to DEC-203 for later implementation in TASK-008.

## Product Decisions

### DEC-201 - Display Language Priority

For every place-facing surface, display language priority is:

1. Traditional Chinese
2. English
3. Original source text

When a secondary or original value is different from the primary display value, show it as supporting text. Do not repeat identical values.

### DEC-202 - AI Translation Scope

AI translation may be used only for attractions when Google Places does not provide a Traditional Chinese name. Restaurants, dessert shops, stores, and lodging names should not be force-translated because translated commercial names can look incorrect or misleading.

### DEC-203 - Localization Applies Everywhere

The same name and address resolution rules apply to:

- Google place search results
- AI-added places from article, URL, or pasted itinerary extraction
- Recommendation cards
- Itinerary cards
- Any map or drawer surfaces that display place names in later tasks

## User Experience

### Primary and Secondary Text

Each place has a primary display name and optional secondary display name.

Example with Traditional Chinese and English:

```text
國立故宮博物院
National Palace Museum
```

Example with English only:

```text
Starbucks Taipei 101
```

Example with original-only text:

```text
Source-provided place name
```

Secondary text is hidden when it is empty or exactly matches the primary text after trimming.

### Address Display

Addresses follow the same fallback order as names:

1. Traditional Chinese address
2. English address
3. Original address

Only one address should be shown by default. If later UI has a detail drawer, it may expose alternate address values there, but card/list surfaces should stay concise.

### Category-Specific AI Translation

If a place is an attraction and no Traditional Chinese name is available from Google, the implementation may request an AI Traditional Chinese translation.

For non-attraction categories, keep the best Google/source-provided value:

- `restaurant`
- `dessert`
- `accommodation`
- any future commercial or lodging category

This protects brand names and shop names from low-confidence translation.

## Data Model Direction

Current `Place` records have one `name`, one `address`, and one `photoUrl`. TASK-008 should extend the model without breaking existing records.

Recommended shape:

```typescript
interface LocalizedText {
  zhTw?: string | null
  en?: string | null
  original?: string | null
}

interface Place {
  name: string
  address?: string | null
  localizedName?: LocalizedText | null
  localizedAddress?: LocalizedText | null
}
```

Rules:

- Keep `name` and `address` as backward-compatible fallback fields.
- Store Google/source values in `localizedName` and `localizedAddress` when available.
- Treat current `name` as `original` for legacy data if no localized fields exist.
- Do not require a migration before rendering existing trips.

## Resolution Helpers

TASK-008 should centralize fallback behavior in helper functions instead of duplicating display logic in components.

Suggested API:

```typescript
interface ResolvedLocalizedText {
  primary: string
  secondary: string | null
}

function resolveLocalizedText(
  localized: LocalizedText | null | undefined,
  fallback: string | null | undefined
): ResolvedLocalizedText
```

Resolution order:

1. `localized.zhTw`
2. `localized.en`
3. `localized.original`
4. `fallback`

Secondary text should be the next available different value after the primary. Return `null` if none exists.

Address helpers may return a single string:

```typescript
function resolveLocalizedAddress(
  localized: LocalizedText | null | undefined,
  fallback: string | null | undefined
): string | null
```

## Source Behavior

### Google Places Search

Google Places results should preserve the existing search behavior while capturing the best localized values that are available from Google responses.

Implementation options:

- Prefer Traditional Chinese data from the existing request locale when available.
- Fetch English details as a secondary pass only if practical and within API budget.
- If only one language is returned, populate the matching localized field when it can be identified; otherwise populate `original`.

### AI Extraction

AI extraction should continue producing place candidates. During verification, each candidate should be resolved through Google Places where possible.

If Google resolution fails, keep the AI/source text as `original` and do not invent a Traditional Chinese name unless the place is an attraction and the translation rule applies.

### Recommendations

Recommendation cards should use the same resolved display values as itinerary cards. Recommendations should not need separate localization rules.

## UI Surfaces

### Place Search Results

Render:

- Primary resolved place name
- Secondary name if present and different
- Resolved address
- Existing category/rating metadata

### Combined Input and AI-Added Places

When article, URL, or pasted itinerary extraction returns places, verified places should use the same localized display values before being added to the trip.

### Recommendation Card

Use primary localized name as the card title. Show secondary name only when space allows and it is different. Use resolved address where address is currently shown.

### Itinerary Card

Use primary localized name as the main place title. Show secondary name below the title in subdued text when present. Use resolved address in any card detail area that currently displays an address.

## Non-Goals

- Do not implement full i18n for all UI labels.
- Do not translate user-written notes.
- Do not force-translate commercial place names.
- Do not migrate historical trip data as part of the spec task.
- Do not change recommendation ranking, routing, scheduling, or map behavior.
- Do not add photo/lightbox behavior; that remains TASK-011.
- Do not add Google Maps drawer behavior; that remains TASK-012.

## Files Expected To Change In TASK-008

Likely implementation files:

| File | Expected change |
|------|-----------------|
| `lib/types.ts` | Add localized text fields while preserving legacy fields |
| `app/actions/places.ts` | Populate localized name/address data from Google/source values |
| `components/PlaceSearch.tsx` | Render resolved primary/secondary text |
| `components/CombinedInput.tsx` | Preserve localized values when adding verified places |
| `components/RecommendationCard.tsx` | Render localized name/address |
| `components/ItineraryCard.tsx` | Render localized name/address |
| `lib/utils/localizedPlace.ts` | New centralized resolution helpers |
| `__tests__/localized-place.test.ts` | Unit tests for fallback and secondary text rules |

## Acceptance Criteria

- Traditional Chinese names display before English and original names.
- English names display when Traditional Chinese names are unavailable.
- Original names display when neither Traditional Chinese nor English values are available.
- Secondary name text appears only when it differs from the primary name.
- Addresses use the same Traditional Chinese -> English -> original fallback order.
- Attraction names may be AI-translated only when Google has no Traditional Chinese value.
- Restaurants, dessert shops, stores, and lodging names are not force-translated.
- Search results, AI-added places, recommendation cards, and itinerary cards all use the same resolution helpers.
- Existing places with only `name` and `address` still render correctly.

## Testing Strategy For TASK-008

TASK-008 should use test-driven development before production code changes.

Required unit tests:

| Behavior | Test |
|----------|------|
| Name fallback | `zhTw` wins over `en`, `original`, and legacy fallback |
| English fallback | `en` displays when `zhTw` is missing |
| Original fallback | `original` displays when localized Chinese and English are missing |
| Legacy fallback | legacy `name` displays when localized fields are missing |
| Secondary text | next different value is shown; duplicate values are hidden |
| Address fallback | address uses Traditional Chinese -> English -> original -> legacy fallback |
| AI translation scope | attraction allows translation path; commercial categories do not |

Required render tests:

| Surface | Test |
|---------|------|
| Place search | Shows primary and secondary name correctly |
| Recommendation card | Uses resolved localized name |
| Itinerary card | Uses resolved localized name and hides duplicate secondary text |
| Combined input flow | Adds verified places without dropping localized fields |

## Open Questions For Manager Review

- Should Google Places details make a second English-language request when the primary request already returns Traditional Chinese data?
- Should alternate names be stored exactly as returned by Google, or should whitespace/punctuation normalization happen at ingest time?
- Should lodging names be exempt from AI translation even when categorized as an attraction by ambiguous source data?
