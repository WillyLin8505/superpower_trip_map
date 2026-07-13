'use client'
import { useEffect, useMemo, useState } from 'react'
import { PhotoLightbox } from './PhotoLightbox'

interface Props {
  photos: string[]
  placeId?: string
  placeName: string
  className?: string
}

export function PhotoStrip({ photos, placeId, placeName, className = '' }: Props) {
  const photoKey = photos.join('\u0000')
  const incomingPhotos = useMemo(() => (photoKey ? photoKey.split('\u0000') : []), [photoKey])
  const [resolvedPhotos, setResolvedPhotos] = useState(incomingPhotos)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const visiblePhotos = resolvedPhotos.slice(0, 5)

  useEffect(() => {
    setResolvedPhotos(incomingPhotos)
  }, [incomingPhotos, placeId])

  useEffect(() => {
    if (!placeId || incomingPhotos.length >= 5 || typeof fetch !== 'function') return

    let cancelled = false
    fetch(`/api/place-photos?placeId=${encodeURIComponent(placeId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { photoUrls?: string[] } | null) => {
        if (cancelled || !data?.photoUrls?.length) return
        setResolvedPhotos(data.photoUrls)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [incomingPhotos.length, photoKey, placeId])

  if (visiblePhotos.length === 0) return null

  return (
    <>
      <div className={`grid grid-cols-4 gap-1 overflow-hidden rounded-lg ${className}`}>
        {visiblePhotos.map((photo, index) => (
          <button
            key={`${photo}-${index}`}
            type="button"
            aria-label={`檢視 ${placeName} 照片 ${index + 1}`}
            data-testid={`photo-thumb-${index}`}
            onClick={(event) => {
              event.stopPropagation()
              setSelectedIndex(index)
            }}
            className={index === 0 ? 'col-span-2 row-span-2 min-h-24' : 'min-h-12'}
          >
            <img src={photo} alt="" aria-hidden="true" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {selectedIndex !== null && (
        <PhotoLightbox
          photos={visiblePhotos}
          placeName={placeName}
          initialIndex={selectedIndex}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </>
  )
}
