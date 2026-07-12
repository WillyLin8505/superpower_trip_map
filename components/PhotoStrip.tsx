'use client'
import { useState } from 'react'
import { PhotoLightbox } from './PhotoLightbox'

interface Props {
  photos: string[]
  placeName: string
  className?: string
}

export function PhotoStrip({ photos, placeName, className = '' }: Props) {
  const visiblePhotos = photos.slice(0, 5)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

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
