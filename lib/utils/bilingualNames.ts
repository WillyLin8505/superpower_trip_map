import type { Candidate, Place, PlanResult } from '@/lib/types'
import { translateTextToZhTw } from '@/lib/googleTranslate'

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function hasHanText(value: string | null | undefined): boolean {
  return /[\u3400-\u9fff]/.test(value ?? '')
}

function nativeNameFor(place: Place): string | null {
  return (
    cleanText(place.localizedName?.original) ??
    cleanText(place.localizedName?.en) ??
    cleanText(place.name)
  )
}

async function ensurePlaceChineseName<T extends Place>(place: T): Promise<T> {
  const existingZh = cleanText(place.localizedName?.zhTw)
  if (existingZh && hasHanText(existingZh)) return place

  const nativeName = nativeNameFor(place)
  const translatedZh = await translateTextToZhTw(nativeName)
  if (!translatedZh) return place

  return {
    ...place,
    name: translatedZh,
    localizedName: {
      ...(place.localizedName ?? {}),
      zhTw: translatedZh,
      original: cleanText(place.localizedName?.original) ?? cleanText(place.name) ?? nativeName,
    },
  }
}

export async function ensurePlanChineseNames(plan: PlanResult): Promise<PlanResult> {
  const days = await Promise.all(
    plan.days.map(async (day) => ({
      ...day,
      places: await Promise.all(day.places.map((place) => ensurePlaceChineseName(place))),
    })),
  )
  return { ...plan, days }
}

export async function ensureCandidateChineseNames(candidates: Candidate[]): Promise<Candidate[]> {
  return Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      place: await ensurePlaceChineseName(candidate.place),
    })),
  )
}
