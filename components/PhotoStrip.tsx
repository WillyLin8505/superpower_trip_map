'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { PhotoLightbox } from './PhotoLightbox'
import type { PlaceType } from '@/lib/types'

interface Props {
  photos: string[]
  placeId?: string
  placeName: string
  className?: string
  emptyFallback?: ReactNode
  placeType?: PlaceType
  aliases?: string[]
  lat?: number
  lng?: number
  onPhotoUnavailable?: () => void
  autoFetch?: boolean
  previewCount?: number
  autoFetchKind?: 'cover' | 'all'
  deferGooglePhotoMedia?: boolean
}

const MAX_PHOTOS = 5
const photoRequestCache = new Map<string, Promise<string[]>>()
const PHOTO_LOOKUP_VERSION = '6'
const PHOTO_CACHE_PREFIX = `photo-strip:v${PHOTO_LOOKUP_VERSION}`

function mergePhotos(primary: string[], fetched: string[]): string[] {
  return Array.from(new Set([...primary, ...fetched].filter(Boolean))).slice(0, MAX_PHOTOS)
}

function photoCacheKey(placeId: string, kind: 'cover' | 'all'): string {
  return `${PHOTO_CACHE_PREFIX}:${kind}:${placeId}`
}

function isGooglePlaceId(placeId: string | null | undefined): placeId is string {
  return Boolean(placeId && placeId.length >= 16 && !placeId.includes(':'))
}

function isOpenDataPlaceId(placeId: string | null | undefined): placeId is string {
  if (!placeId?.includes(':')) return false
  const [source] = placeId.split(':')
  return ['osm', 'overture', 'wikidata', 'user'].includes(source)
}

function isGooglePhotoProxyUrl(url: string): boolean {
  return url.startsWith('/api/photo?') || url.startsWith('/api/photo/')
}

function readCachedPhotos(placeId: string, kind: 'cover' | 'all'): string[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(photoCacheKey(placeId, kind))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : null
  } catch {
    return null
  }
}

function writeCachedPhotos(placeId: string, kind: 'cover' | 'all', photoUrls: string[]): void {
  if (typeof window === 'undefined' || photoUrls.length === 0) return
  try {
    window.sessionStorage.setItem(photoCacheKey(placeId, kind), JSON.stringify(photoUrls.slice(0, MAX_PHOTOS)))
  } catch {
  }
}

function placePhotosUrl(
  placeId: string,
  placeName: string,
  kind: 'cover' | 'all',
  placeType?: PlaceType,
  aliases: string[] = [],
  lat?: number,
  lng?: number
): string {
  const params = new URLSearchParams({ placeId })
  if (placeName.trim()) params.set('placeName', placeName.trim())
  params.set('v', PHOTO_LOOKUP_VERSION)
  if (placeType) params.set('placeType', placeType)
  if (typeof lat === 'number' && Number.isFinite(lat)) params.set('lat', String(lat))
  if (typeof lng === 'number' && Number.isFinite(lng)) params.set('lng', String(lng))
  aliases.forEach((alias) => {
    if (alias.trim() && alias.trim() !== placeName.trim()) params.append('alias', alias.trim())
  })
  if (kind === 'cover') params.set('limit', '1')
  return `/api/place-photos?${params.toString()}`
}

async function fetchPhotoUrls(
  placeId: string,
  placeName: string,
  kind: 'cover' | 'all',
  placeType?: PlaceType,
  aliases: string[] = [],
  lat?: number,
  lng?: number
): Promise<string[]> {
  const allCached = readCachedPhotos(placeId, 'all')
  if (kind === 'cover' && allCached?.length) return allCached.slice(0, 1)

  const cached = readCachedPhotos(placeId, kind)
  if (cached?.length && (kind === 'cover' || cached.length >= MAX_PHOTOS)) {
    return kind === 'cover' ? cached.slice(0, 1) : cached.slice(0, MAX_PHOTOS)
  }

  const requestKey = `${kind}:${placeId}`
  const existingRequest = photoRequestCache.get(requestKey)
  if (existingRequest) return existingRequest

  const request = fetch(placePhotosUrl(placeId, placeName, kind, placeType, aliases, lat, lng))
    .then(async (response) => {
      if (!response.ok) return []
      const data = await response.json() as { photoUrls?: string[] }
      const photoUrls = (data.photoUrls ?? []).filter(Boolean).slice(0, kind === 'cover' ? 1 : MAX_PHOTOS)
      if (photoUrls.length > 0) {
        writeCachedPhotos(placeId, kind, photoUrls)
        if (kind === 'all') writeCachedPhotos(placeId, 'cover', photoUrls.slice(0, 1))
      }
      return photoUrls
    })
    .catch(() => [])
    .finally(() => {
      photoRequestCache.delete(requestKey)
    })

  photoRequestCache.set(requestKey, request)
  return request
}

export function PhotoStrip({ photos, placeId, placeName, className = '', emptyFallback = null, placeType, aliases = [], lat, lng, onPhotoUnavailable, autoFetch = true, previewCount = MAX_PHOTOS, autoFetchKind = 'all', deferGooglePhotoMedia = false }: Props) {
  const photoKey = photos.join('\u0000')
  const aliasKey = aliases.join('\u0000')
  const rawIncomingPhotos = useMemo(() => (photoKey ? photoKey.split('\u0000').slice(0, MAX_PHOTOS) : []), [photoKey])
  const deferredGooglePhotos = useMemo(
    () => deferGooglePhotoMedia ? rawIncomingPhotos.filter(isGooglePhotoProxyUrl) : [],
    [deferGooglePhotoMedia, rawIncomingPhotos]
  )
  const photoAliases = useMemo(() => (aliasKey ? aliasKey.split('\u0000') : []), [aliasKey])
  const [googlePhotoMediaReleased, setGooglePhotoMediaReleased] = useState(false)
  const incomingPhotos = useMemo(
    () => deferGooglePhotoMedia && !googlePhotoMediaReleased
      ? rawIncomingPhotos.filter((photo) => !isGooglePhotoProxyUrl(photo))
      : rawIncomingPhotos,
    [deferGooglePhotoMedia, googlePhotoMediaReleased, rawIncomingPhotos]
  )
  const [resolvedPhotos, setResolvedPhotos] = useState(incomingPhotos)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const slotRef = useRef<HTMLDivElement | null>(null)
  const [photosEligible, setPhotosEligible] = useState(() => typeof IntersectionObserver === 'undefined')
  const [fetchedPhotos, setFetchedPhotos] = useState(false)
  const [manualFetchRequested, setManualFetchRequested] = useState(false)
  const notifiedUnavailableRef = useRef(false)
  const fetchablePlaceId = isGooglePlaceId(placeId) || isOpenDataPlaceId(placeId) ? placeId : null
  const targetPhotoCount = autoFetchKind === 'cover' ? 1 : MAX_PHOTOS
  const coverPhoto = resolvedPhotos[0]
  const displayPhotos = resolvedPhotos.slice(0, MAX_PHOTOS)
  const previewPhotos = displayPhotos.slice(0, Math.min(MAX_PHOTOS, Math.max(1, Math.trunc(previewCount))))
  const shouldFetchPhotos = Boolean(fetchablePlaceId && resolvedPhotos.length < targetPhotoCount && (autoFetch || manualFetchRequested))
  const canLoadMore = Boolean(fetchablePlaceId && resolvedPhotos.length < MAX_PHOTOS && !fetchedPhotos)

  useEffect(() => {
    setResolvedPhotos(incomingPhotos)
  }, [incomingPhotos])

  useEffect(() => {
    setPhotosEligible(typeof IntersectionObserver === 'undefined')
    setFetchedPhotos(false)
    setManualFetchRequested(false)
    setGooglePhotoMediaReleased(false)
    notifiedUnavailableRef.current = false
  }, [photoKey, placeId, placeName, placeType, aliasKey])

  useEffect(() => {
    if (!shouldFetchPhotos || fetchedPhotos || photosEligible) return
    if (typeof IntersectionObserver === 'undefined') {
      setPhotosEligible(true)
      return
    }

    const node = slotRef.current
    if (!node) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setPhotosEligible(true)
      observer.disconnect()
    }, { rootMargin: '400px 0px' })

    observer.observe(node)
    return () => observer.disconnect()
  }, [fetchedPhotos, photosEligible, shouldFetchPhotos])

  useEffect(() => {
    if (!fetchablePlaceId || !shouldFetchPhotos || fetchedPhotos || !photosEligible || typeof fetch !== 'function') return

    let cancelled = false
    fetchPhotoUrls(fetchablePlaceId, placeName, autoFetchKind, placeType, photoAliases, lat, lng)
      .then((photoUrls) => {
        if (cancelled) return
        if (!photoUrls.length) {
          if (!resolvedPhotos.length && !notifiedUnavailableRef.current) {
            notifiedUnavailableRef.current = true
            onPhotoUnavailable?.()
          }
          return
        }
        setResolvedPhotos((current) => mergePhotos(current, photoUrls))
      })
      .finally(() => {
        if (cancelled) return
        setFetchedPhotos(true)
      })

    return () => {
      cancelled = true
    }
  }, [autoFetchKind, fetchablePlaceId, fetchedPhotos, onPhotoUnavailable, photosEligible, lat, lng, placeName, placeType, photoAliases, resolvedPhotos.length, shouldFetchPhotos])

  const loadMorePhotos = useCallback(async (): Promise<string[]> => {
    if (resolvedPhotos.length >= MAX_PHOTOS) return resolvedPhotos.slice(0, MAX_PHOTOS)
    if (!fetchablePlaceId || fetchedPhotos || typeof fetch !== 'function') return resolvedPhotos.slice(0, MAX_PHOTOS)

    setFetchedPhotos(true)
    const photoUrls = await fetchPhotoUrls(fetchablePlaceId, placeName, 'all', placeType, photoAliases, lat, lng)
    const nextPhotos = mergePhotos(resolvedPhotos, photoUrls)
    setResolvedPhotos(nextPhotos)
    return nextPhotos
  }, [fetchablePlaceId, fetchedPhotos, lat, lng, placeName, placeType, photoAliases, resolvedPhotos])

  if (!coverPhoto && deferredGooglePhotos.length > 0 && !googlePhotoMediaReleased && (fetchedPhotos || !shouldFetchPhotos)) {
    return (
      <button
        type="button"
        className={`flex min-h-24 w-full max-w-xs items-center justify-center rounded-lg border border-dashed border-border bg-surface text-sm text-muted hover:border-clay hover:text-clay ${className}`}
        onClick={() => setGooglePhotoMediaReleased(true)}
      >
        載入照片
      </button>
    )
  }

  if (!coverPhoto && fetchablePlaceId && !autoFetch && !manualFetchRequested && !fetchedPhotos) {
    return (
      <button
        type="button"
        className={`flex min-h-24 w-full max-w-xs items-center justify-center rounded-lg border border-dashed border-border bg-surface text-sm text-muted hover:border-clay hover:text-clay ${className}`}
        onClick={() => {
          setManualFetchRequested(true)
          setPhotosEligible(true)
        }}
      >
        載入照片
      </button>
    )
  }

  if (!coverPhoto && fetchablePlaceId && !fetchedPhotos) {
    return (
      <div
        ref={slotRef}
        data-testid="photo-placeholder"
        className={`grid grid-cols-4 gap-1 overflow-hidden rounded-lg ${className}`}
        aria-label={`正在載入 ${placeName} 照片`}
      >
        <div className="col-span-2 row-span-2 min-h-24 rounded-lg bg-gray-100" />
      </div>
    )
  }

  if (!coverPhoto) return <>{emptyFallback}</>

  return (
    <>
      <div ref={slotRef} className={`grid grid-cols-4 gap-1 overflow-hidden rounded-lg ${className}`}>
        {previewPhotos.map((photo, index) => (
          <button
            key={`${photo}:${index}`}
            type="button"
            aria-label={`檢視 ${placeName} 照片 ${index + 1}`}
            data-testid={`photo-thumb-${index}`}
            onClick={(event) => {
              event.stopPropagation()
              setSelectedIndex(index)
            }}
            className={index === 0 ? 'relative col-span-2 row-span-2 min-h-24' : 'relative min-h-12'}
          >
            <Image
              src={photo}
              alt=""
              aria-hidden="true"
              fill
              unoptimized
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
      {selectedIndex !== null && (
          <PhotoLightbox
          photos={displayPhotos}
          placeName={placeName}
          initialIndex={selectedIndex}
          onClose={() => setSelectedIndex(null)}
          canLoadMore={canLoadMore}
          onLoadMore={loadMorePhotos}
        />
      )}
    </>
  )
}
