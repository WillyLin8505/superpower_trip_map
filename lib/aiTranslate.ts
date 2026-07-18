import { createHash } from 'crypto'
import { unstable_cache } from 'next/cache'

import { callClaude } from '@/lib/claude'

const TARGET_LANGUAGE = 'zh-TW'
const AI_TRANSLATION_TTL_SECONDS = 60 * 60 * 24 * 30

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function hasHanText(value: string | null | undefined): boolean {
  return /[\u3400-\u9fff]/.test(value ?? '')
}

const localChinesePlaceRules: Array<{ pattern: RegExp; suffix: string }> = [
  { pattern: /\b(coffee|cafe|café|espresso|roastery|coffeehouse|coffee house|coffee shop)\b|cà\s*phê/i, suffix: '咖啡' },
  { pattern: /\b(tea|milk tea|boba|bubble tea)\b/i, suffix: '茶飲' },
  { pattern: /\b(waffle|cake|dessert|bakery|bakes|pastry|patisserie|gelato|ice cream|sweet|tart)\b/i, suffix: '甜點' },
  { pattern: /\b(noodle|noodles|ramen|pho)\b|phở/i, suffix: '麵店' },
  { pattern: /\b(restaurant|kitchen|bistro|eatery|grill|bbq|bar)\b/i, suffix: '餐廳' },
]

function fallbackPlaceNameToZhTw(source: string): string | null {
  const cleanedSource = cleanText(source.replace(/\s+/g, ' '))
  if (!cleanedSource || hasHanText(cleanedSource)) return cleanedSource

  for (const rule of localChinesePlaceRules) {
    if (!rule.pattern.test(cleanedSource)) continue
    const brandName = cleanText(cleanedSource
      .replace(rule.pattern, ' ')
      .replace(/[|/·・•,，.。:：;；!?？()[\]{}"'“”‘’]+/g, ' ')
      .replace(/\s+/g, ' '))
    return brandName ? `${brandName} ${rule.suffix}` : rule.suffix
  }

  return null
}

function fillLocalFallbacks(sources: string[], translated: Record<string, string>): Record<string, string> {
  const withFallbacks = { ...translated }
  for (const source of sources) {
    if (cleanText(withFallbacks[source])) continue
    const fallback = fallbackPlaceNameToZhTw(source)
    if (fallback) withFallbacks[source] = fallback
  }
  return withFallbacks
}

function uniqueCleanTexts(texts: string[]): string[] {
  return Array.from(new Set(texts.map((text) => cleanText(text)).filter((text): text is string => text !== null)))
}

function cacheKeyForTexts(texts: string[]): string {
  return createHash('sha256').update(JSON.stringify(texts)).digest('hex')
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const objectText = withoutFence.match(/\{[\s\S]*\}/)?.[0] ?? withoutFence
  const parsed = JSON.parse(objectText)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

function buildPrompt(texts: string[]): string {
  return [
    '你是旅遊景點名稱翻譯器。',
    `請把以下地點或店名翻成繁體中文（${TARGET_LANGUAGE}）。`,
    '保留品牌辨識度；若是店名，翻成自然可讀的中文名稱，不要加入說明文字。',
    '只回 JSON object，key 必須完全等於原始字串，value 是繁體中文翻譯。',
    '不要 Markdown，不要額外文字。',
    '',
    JSON.stringify(texts),
  ].join('\n')
}

async function translateTextsUncached(texts: string[]): Promise<Record<string, string>> {
  if (texts.length === 0) return {}
  const response = await callClaude(buildPrompt(texts))
  const parsed = parseJsonObject(response)
  const translated: Record<string, string> = {}

  for (const source of texts) {
    const value = parsed[source]
    if (typeof value !== 'string') continue
    const cleaned = cleanText(value)
    if (cleaned) translated[source] = cleaned
  }

  return translated
}

function cachedAiTranslations(texts: string[]): Promise<Record<string, string>> {
  return unstable_cache(
    () => translateTextsUncached(texts),
    ['ai-translate', TARGET_LANGUAGE, cacheKeyForTexts(texts)],
    { revalidate: AI_TRANSLATION_TTL_SECONDS },
  )()
}

export async function translateTextsToZhTw(texts: string[]): Promise<Record<string, string>> {
  const sources = uniqueCleanTexts(texts)
  const translated: Record<string, string> = {}
  const needsAi: string[] = []

  for (const source of sources) {
    if (hasHanText(source)) translated[source] = source
    else needsAi.push(source)
  }

  if (needsAi.length === 0) return translated

  try {
    return fillLocalFallbacks(needsAi, {
      ...translated,
      ...(await cachedAiTranslations(needsAi)),
    })
  } catch (error) {
    console.error('[ai-translate] failed to translate place names', {
      target: TARGET_LANGUAGE,
      count: needsAi.length,
      error: error instanceof Error ? error.message : 'unknown',
    })
    return fillLocalFallbacks(needsAi, translated)
  }
}

export async function translateTextToZhTw(text: string | null | undefined): Promise<string | null> {
  const source = cleanText(text)
  if (!source) return null
  const translated = await translateTextsToZhTw([source])
  return cleanText(translated[source])
}
