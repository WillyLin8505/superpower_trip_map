import { createHash } from 'crypto'

export interface ApiUsageEventInput {
  provider: string
  endpoint: string
  skuHint?: string | null
  method?: string
  units?: number
  cacheHit?: boolean
  statusCode?: number | null
  requestHashSource?: string | null
  metadata?: Record<string, unknown>
  userId?: string | null
  tripId?: string | null
}

export interface ApiUsageEventRow {
  provider: string
  endpoint: string
  sku_hint: string | null
  method: string
  units: number
  cache_hit: boolean
  estimated_cost_usd: number | null
  status_code: number | null
  request_hash: string | null
  metadata: Record<string, unknown>
  user_id: string | null
  trip_id: string | null
  created_at: string
}

const ESTIMATED_USD_PER_1000_UNITS: Record<string, number> = {
  nearby_search_pro: 32,
  text_search_essentials_ids_only: 0,
  find_place_from_text_id_only: 0,
  place_details_ids_only: 0,
  place_details_essentials: 5,
  place_details_pro: 17,
  place_details_photos: 7,
  place_photo_media: 7,
  distance_matrix_essentials: 5,
}

function isEnabled(): boolean {
  const mode = process.env.API_USAGE_EVENTS_MODE ?? (process.env.NODE_ENV === 'test' ? 'off' : 'on')
  return mode !== 'off'
}

function hasSupabaseAdminEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function isMissingUsageTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

function hashRequestSource(value: string | null | undefined): string | null {
  const clean = value?.trim()
  if (!clean) return null
  return createHash('sha256').update(redactGoogleMapsApiKey(clean)).digest('hex')
}

export function redactGoogleMapsApiKey(value: string): string {
  try {
    const url = new URL(value)
    if (url.searchParams.has('key')) url.searchParams.set('key', 'REDACTED')
    return url.toString()
  } catch {
    return value.replace(/([?&]key=)[^&]+/i, '$1REDACTED')
  }
}

export function estimateApiUsageCostUsd(skuHint: string | null | undefined, units: number): number | null {
  if (!skuHint) return null
  const per1000 = ESTIMATED_USD_PER_1000_UNITS[skuHint]
  if (per1000 === undefined) return null
  return Number(((per1000 * units) / 1000).toFixed(6))
}

export function buildApiUsageEventRow(input: ApiUsageEventInput, now = new Date()): ApiUsageEventRow {
  const units = Math.max(1, Math.trunc(input.units ?? 1))
  const skuHint = input.skuHint ?? null
  return {
    provider: input.provider,
    endpoint: input.endpoint,
    sku_hint: skuHint,
    method: (input.method ?? 'GET').toUpperCase(),
    units,
    cache_hit: input.cacheHit ?? false,
    estimated_cost_usd: estimateApiUsageCostUsd(skuHint, units),
    status_code: input.statusCode ?? null,
    request_hash: hashRequestSource(input.requestHashSource),
    metadata: input.metadata ?? {},
    user_id: input.userId ?? null,
    trip_id: input.tripId ?? null,
    created_at: now.toISOString(),
  }
}

export async function recordApiUsageEvent(input: ApiUsageEventInput): Promise<void> {
  if (!isEnabled() || !hasSupabaseAdminEnv()) return

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { error } = await createAdminClient()
    .from('api_usage_events')
    .insert(buildApiUsageEventRow(input))

  if (isMissingUsageTable(error) || !error) return
}

export async function trackedApiFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  usage: Omit<ApiUsageEventInput, 'statusCode' | 'method' | 'requestHashSource'> & {
    method?: string
    requestHashSource?: string | null
  }
): Promise<Response> {
  const requestSource = usage.requestHashSource ?? String(input)
  try {
    const response = init === undefined ? await fetch(input) : await fetch(input, init)
    await recordApiUsageEvent({
      ...usage,
      method: usage.method ?? init?.method ?? 'GET',
      statusCode: response.status,
      requestHashSource: requestSource,
    })
    return response
  } catch (error) {
    await recordApiUsageEvent({
      ...usage,
      method: usage.method ?? init?.method ?? 'GET',
      statusCode: null,
      requestHashSource: requestSource,
      metadata: {
        ...(usage.metadata ?? {}),
        error: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    throw error
  }
}
