'use client'
import { useEffect, useState } from 'react'

interface Props {
  photos: string[]
  placeName: string
  initialIndex: number
  onClose: () => void
}

export function PhotoLightbox({ photos, placeName, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex)
  const hasMultiple = photos.length > 1

  const goPrevious = () => setIndex((current) => (current - 1 + photos.length) % photos.length)
  const goNext = () => setIndex((current) => (current + 1) % photos.length)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && hasMultiple) goPrevious()
      if (event.key === 'ArrowRight' && hasMultiple) goNext()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [hasMultiple, onClose])

  if (photos.length === 0) return null

  const photo = photos[index]
  const alt = `${placeName} 照片 ${index + 1}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          aria-label="關閉照片"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 rounded-full bg-white/90 px-3 py-1 text-lg text-gray-800 shadow"
        >
          ×
        </button>
        <img src={photo} alt={alt} className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl" />
        {hasMultiple && (
          <>
            <button
              type="button"
              aria-label="上一張照片"
              onClick={goPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl text-gray-800 shadow"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="下一張照片"
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl text-gray-800 shadow"
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  )
}
