'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PhotoLightbox } from './PhotoLightbox'

interface Props {
  photos: string[]
  placeId?: string
  placeName: string
  className?: string
}

function mergePhotos(primary: string[], fetched: string[]): string[] {
  return Array.from(new Set([...primary, ...fetched].filter(Boolean))).slice(0, 5)
}

const photoRequestCache = new Map<string, Promise<string[]>>()
const PHOTO_CACHE_PREFIX = 'photo-strip:v1'

function photoCacheKey(placeId: string, kind: 'cover' | 'all'): string {
  return `${PHOTO_CACHE_PREFIX}:${kind}:${placeId}`
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
    window.sessionStorage.setItem(photoCacheKey(placeId, kind), JSON.stringify(photoUrls.slice(0, 5)))
  } catch {
  }
}

async function fetchPhotoUrls(placeId: string, kind: 'cover' | 'all'): Promise<string[]> {
  const allCached = readCachedPhotos(placeId, 'all')
  if (kind === 'cover' && allCached?.length) return allCached.slice(0, 1)

  const cached = readCachedPhotos(placeId, kind)
  if (cached?.length) return kind === 'cover' ? cached.slice(0, 1) : cached.slice(0, 5)

  const requestKey = `${kind}:${placeId}`
  const existingRequest = photoRequestCache.get(requestKey)
  if (existingRequest) return existingRequest

  const limitParam = kind === 'cover' ? '&limit=1' : ''
  const request = fetch(`/api/place-photos?placeId=${encodeURIComponent(placeId)}${limitParam}`)
    .then(async (response) => {
      if (!response.ok) return []
      const data = await response.json() as { photoUrls?: string[] }
      const photoUrls = (data.photoUrls ?? []).filter(Boolean).slice(0, kind === 'cover' ? 1 : 5)
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

export function PhotoStrip({ photos, placeId, placeName, className = '' }: Props) {
  const photoKey = photos.join('\u0000')
  const incomingPhotos = useMemo(() => (photoKey ? photoKey.split('\u0000') : []), [photoKey])
  const [resolvedPhotos, setResolvedPhotos] = useState(incomingPhotos)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const slotRef = useRef<HTMLDivElement | null>(null)
  const [coverEligible, setCoverEligible] = useState(() => typeof IntersectionObserver === 'undefined')
  const [fetchedCover, setFetchedCover] = useState(false)
  const [fetchedMore, setFetchedMore] = useState(false)
  const coverPhoto = resolvedPhotos[0]
  const canLoadMore = resolvedPhotos.length > 1 || Boolean(placeId && !fetchedMore)

  useEffect(() => {
    setResolvedPhotos(incomingPhotos)
    setCoverEligible(typeof IntersectionObserver === 'undefined')
    setFetchedCover(false)
    setFetchedMore(false)
  }, [incomingPhotos, placeId])

  useEffect(() => {
    if (coverPhoto || !placeId || fetchedCover || coverEligible) return
    if (typeof IntersectionObserver === 'undefined') {
      setCoverEligible(true)
      return
    }

    const node = slotRef.current
    if (!node) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setCoverEligible(true)
      observer.disconnect()
    }, { rootMargin: '400px 0px' })

    observer.observe(node)
    return () => observer.disconnect()
  }, [coverEligible, coverPhoto, fetchedCover, placeId])

  useEffect(() => {
    if (coverPhoto || !placeId || fetchedCover || !coverEligible || typeof fetch !== 'function') return

    let cancelled = false
    fetchPhotoUrls(placeId, 'cover')
      .then((photoUrls) => {
        if (cancelled || !photoUrls.length) return
        setResolvedPhotos(photoUrls.slice(0, 1))
      })
      .finally(() => {
        if (cancelled) return
        setFetchedCover(true)
      })

    return () => {
      cancelled = true
    }
  }, [coverEligible, coverPhoto, fetchedCover, placeId])

  const loadMorePhotos = useCallback(async (): Promise<string[]> => {
    if (resolvedPhotos.length > 1) return resolvedPhotos.slice(0, 5)
    if (!placeId || fetchedMore || typeof fetch !== 'function') return resolvedPhotos.slice(0, 5)

    setFetchedMore(true)
    const photoUrls = await fetchPhotoUrls(placeId, 'all')
    const nextPhotos = mergePhotos(resolvedPhotos, photoUrls)
    setResolvedPhotos(nextPhotos)
    return nextPhotos
  }, [fetchedMore, placeId, resolvedPhotos])

  if (!coverPhoto && placeId) {
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

  if (!coverPhoto) return null

  return (
    <>
      <div className={`grid grid-cols-4 gap-1 overflow-hidden rounded-lg ${className}`}>
        <button
          type="button"
          aria-label={`檢視 ${placeName} 照片 1`}
          data-testid="photo-thumb-0"
          onClick={(event) => {
            event.stopPropagation()
            setSelectedIndex(0)
          }}
          className="col-span-2 row-span-2 min-h-24"
        >
          <img
            src={coverPhoto}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </button>
      </div>
      {selectedIndex !== null && (
        <PhotoLightbox
          photos={[coverPhoto]}
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
