'use client'
import { useState, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CardContent } from './CardContent'
import { pxToDuration, PX_PER_MIN, MIN_CARD_PX } from '@/lib/utils/timeline'
import { TYPE_META } from '@/lib/placeType'
import type { PlaceType, ScheduledPlace } from '@/lib/types'

interface Props {
  place: ScheduledPlace
  index: number
  dateIso: string
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
}

export function TimelineCard({ place, index, dateIso, draggable, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: place.id, disabled: !draggable || place.startLocked })
  const [previewDur, setPreviewDur] = useState<number | null>(null)
  const startRef = useRef<{ y: number; dur: number } | null>(null)

  const dur = previewDur ?? place.durationMin
  const heightPx = Math.max(dur * PX_PER_MIN, MIN_CARD_PX)
  const meta = TYPE_META[place.type]

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    height: `${heightPx}px`,
  }

  const onResizeDown = (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const clientY = e.nativeEvent.clientY ?? e.clientY
    startRef.current = { y: clientY, dur: place.durationMin }
    setPreviewDur(place.durationMin)
  }
  const onResizeMove = (e: ReactPointerEvent) => {
    if (!startRef.current) return
    e.stopPropagation()
    const clientY = e.nativeEvent.clientY ?? e.clientY
    setPreviewDur(pxToDuration(startRef.current.dur, clientY - startRef.current.y))
  }
  const onResizeUp = (e: ReactPointerEvent) => {
    if (!startRef.current) return
    e.stopPropagation()
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    const clientY = e.nativeEvent.clientY ?? e.clientY
    const finalDur = pxToDuration(startRef.current.dur, clientY - startRef.current.y)
    startRef.current = null
    setPreviewDur(null)
    if (finalDur !== place.durationMin) onTimeChange?.(place.id, 'durationMin', finalDur)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative border rounded-xl p-3 overflow-hidden ${meta.cardBg} ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}
      data-testid={`timeline-card-${place.id}`}
    >
      <div className="flex items-start gap-2 h-full">
        {draggable && !place.startLocked && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-300 hover:text-gray-500 mt-0.5 select-none"
            data-testid="drag-handle"
          >&#x2807;</span>
        )}
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span>
        <CardContent
          place={place}
          dateIso={dateIso}
          onTimeChange={onTimeChange}
          onToggleStartLock={onToggleStartLock}
          onToggleDurationLock={onToggleDurationLock}
          onChangeType={onChangeType}
        />
      </div>
      {place.durationLocked ? (
        <span className="absolute bottom-0 right-2 text-[10px] text-gray-400 select-none" data-testid="duration-locked-mark">🔒</span>
      ) : (
        <div
          role="separator"
          aria-label="拖曳調整停留時間"
          data-testid={`resize-handle-${place.id}`}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-blue-200/50"
        />
      )}
    </div>
  )
}
