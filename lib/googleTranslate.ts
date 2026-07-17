import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { cachedGoogle } from '@/lib/googleCache'
import { googleMapsFetchOptions } from '@/lib/googleMapsCost'

const TRANSLATE_BASE = 'https://translation.googleapis.com/language/translate/v2'
const TARGET_LANGUAGE = 'zh-TW'

interface GoogleTranslateResponse {
  data?: {
    translations?: Array<{ translatedText?: string }>
  }
  error?: unknown
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function hasHanText(value: string | null | undefined): boolean {
  return /[\u3400-\u9fff]/.test(value ?? '')
}

function decodeTranslationText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function googleTranslateApiKey(): string | null {
  return cleanText(process.env.GOOGLE_TRANSLATE_API_KEY) ?? cleanText(process.env.GOOGLE_MAPS_API_KEY)
}

export async function translateTextToZhTw(text: string | null | undefined): Promise<string | null> {
  const source = cleanText(text)
  if (!source) return null
  if (hasHanText(source)) return source

  const key = googleTranslateApiKey()
  if (!key) return null

  try {
    return await cachedGoogle(['translate', TARGET_LANGUAGE, source], async () => {
      const params = new URLSearchParams({
        q: source,
        target: TARGET_LANGUAGE,
        format: 'text',
        key,
      })
      const url = `${TRANSLATE_BASE}?${params.toString()}`
      const response = await trackedApiFetch(url, googleMapsFetchOptions(), {
        provider: 'google_translate',
        endpoint: 'translate',
        skuHint: 'cloud_translation_basic_chars',
        units: source.length,
        metadata: { target: TARGET_LANGUAGE },
      })

      if (response.ok === false) throw new Error(`google_translate_http_${response.status}`)

      const data = (await response.json()) as GoogleTranslateResponse
      if (data.error) throw new Error('google_translate_error')

      return cleanText(decodeTranslationText(data.data?.translations?.[0]?.translatedText ?? ''))
    })
  } catch (error) {
    console.error('[google-translate] failed to translate place name', {
      target: TARGET_LANGUAGE,
      sourceLength: source.length,
      error: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}
