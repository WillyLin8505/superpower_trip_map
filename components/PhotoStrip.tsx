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

export function PhotoStrip({ photos, placeId, placeName, className = '' }: Props) {
  const photoKey = photos.join('\u0000')
  const incomingPhotos = useMemo(() => (photoKey ? photoKey.split('\u0000') : []), [photoKey])
  const [resolvedPhotos, setResolvedPhotos] = useState(incomingPhotos)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const coverRequestRef = useRef<string | null>(null)
  const [fetchedCover, setFetchedCover] = useState(false)
  const [fetchedMore, setFetchedMore] = useState(false)
  const coverPhoto = resolvedPhotos[0]
  const canLoadMore = resolvedPhotos.length > 1 || Boolean(placeId && !fetchedMore)

  useEffect(() => {
    setResolvedPhotos(incomingPhotos)
    coverRequestRef.current = null
    setFetchedCover(false)
    setFetchedMore(false)
  }, [incomingPhotos, placeId])

  useEffect(() => {
    if (coverPhoto || !placeId || fetchedCover || coverRequestRef.current === placeId || typeof fetch !== 'function') return

    let cancelled = false
    coverRequestRef.current = placeId
    fetch(`/api/place-photos?placeId=${encodeURIComponent(placeId)}&limit=1`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { photoUrls?: string[] } | null) => {
        if (cancelled || !data?.photoUrls?.length) return
        setResolvedPhotos(data.photoUrls.slice(0, 1))
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return
        setFetchedCover(true)
        coverRequestRef.current = null
      })

    return () => {
      cancelled = true
      if (coverRequestRef.current === placeId) coverRequestRef.current = null
    }
  }, [coverPhoto, fetchedCover, placeId])

  const loadMorePhotos = useCallback(async (): Promise<string[]> => {
    if (resolvedPhotos.length > 1) return resolvedPhotos.slice(0, 5)
    if (!placeId || fetchedMore || typeof fetch !== 'function') return resolvedPhotos.slice(0, 5)

    setFetchedMore(true)
    try {
      const response = await fetch(`/api/place-photos?placeId=${encodeURIComponent(placeId)}`)
      if (!response.ok) return resolvedPhotos.slice(0, 5)
      const data = await response.json() as { photoUrls?: string[] }
      const nextPhotos = mergePhotos(resolvedPhotos, data.photoUrls ?? [])
      setResolvedPhotos(nextPhotos)
      return nextPhotos
    } catch {
      return resolvedPhotos.slice(0, 5)
    }
  }, [fetchedMore, placeId, resolvedPhotos])

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
          <img src={coverPhoto} alt="" aria-hidden="true" className="h-full w-full object-cover" />
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
