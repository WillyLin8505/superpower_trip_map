'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'

interface Props {
  photos: string[]
  placeName: string
  initialIndex: number
  onClose: () => void
  canLoadMore?: boolean
  onLoadMore?: () => Promise<string[]>
}

export function PhotoLightbox({ photos, placeName, initialIndex, onClose, canLoadMore = false, onLoadMore }: Props) {
  const photoKey = photos.join('\u0000')
  const initialPhotos = useMemo(() => (photoKey ? photoKey.split('\u0000') : []), [photoKey])
  const [index, setIndex] = useState(initialIndex)
  const [displayPhotos, setDisplayPhotos] = useState(initialPhotos.slice(0, 5))
  const [loadingMore, setLoadingMore] = useState(false)
  const hasNavigation = displayPhotos.length > 1 || canLoadMore

  useEffect(() => {
    setDisplayPhotos(initialPhotos.slice(0, 5))
    setIndex(Math.min(initialIndex, Math.max(initialPhotos.length - 1, 0)))
  }, [initialIndex, initialPhotos])

  const loadMore = useCallback(async (): Promise<string[]> => {
    if (!canLoadMore || !onLoadMore || loadingMore) return displayPhotos
    setLoadingMore(true)
    try {
      const nextPhotos = (await onLoadMore()).slice(0, 5)
      if (nextPhotos.length > 0) setDisplayPhotos(nextPhotos)
      return nextPhotos.length > 0 ? nextPhotos : displayPhotos
    } catch {
      return displayPhotos
    } finally {
      setLoadingMore(false)
    }
  }, [canLoadMore, displayPhotos, loadingMore, onLoadMore])

  const goPrevious = useCallback(async () => {
    if (displayPhotos.length <= 1) {
      const nextPhotos = await loadMore()
      if (nextPhotos.length > 1) setIndex(nextPhotos.length - 1)
      return
    }
    setIndex((current) => (current - 1 + displayPhotos.length) % displayPhotos.length)
  }, [displayPhotos.length, loadMore])

  const goNext = useCallback(async () => {
    if (index >= displayPhotos.length - 1) {
      const nextPhotos = await loadMore()
      if (nextPhotos.length > displayPhotos.length) {
        setIndex(Math.min(index + 1, nextPhotos.length - 1))
        return
      }
      if (displayPhotos.length > 1) setIndex(0)
      return
    }
    setIndex((current) => current + 1)
  }, [displayPhotos.length, index, loadMore])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && hasNavigation) void goPrevious()
      if (event.key === 'ArrowRight' && hasNavigation) void goNext()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [goNext, goPrevious, hasNavigation, onClose])

  if (displayPhotos.length === 0) return null

  const photo = displayPhotos[index] ?? displayPhotos[0]
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
        {/* unoptimized: dynamic Google place photos of unknown dimensions;
            w-auto/h-auto lets the browser size by intrinsic ratio, and
            priority keeps the just-clicked photo eager (next/image defaults
            to lazy). width/height are only an aspect placeholder. */}
        <Image
          src={photo}
          alt={alt}
          width={800}
          height={600}
          unoptimized
          priority
          className="h-auto w-auto max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
        />
        {hasNavigation && (
          <>
            <button
              type="button"
              data-testid="photo-prev"
              aria-label="上一張照片"
              onClick={() => { void goPrevious() }}
              disabled={loadingMore}
              className="fixed left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl text-gray-800 shadow disabled:opacity-60"
            >
              ‹
            </button>
            <button
              type="button"
              data-testid="photo-next"
              aria-label="下一張照片"
              onClick={() => { void goNext() }}
              disabled={loadingMore}
              className="fixed right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl text-gray-800 shadow disabled:opacity-60"
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  )
}
