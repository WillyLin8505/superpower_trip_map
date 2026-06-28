'use client'
import { useState } from 'react'
import { PLACE_TYPES, TYPE_META } from '@/lib/placeType'
import type { PlaceType } from '@/lib/types'

interface Props {
  type: PlaceType
  onChange: (type: PlaceType) => void
}

export function TypePicker({ type, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const meta = TYPE_META[type]

  const select = (t: PlaceType) => {
    onChange(t)
    setOpen(false)
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded-full font-medium px-2 py-0.5 text-xs ${meta.badge}`}
      >
        {meta.emoji} {meta.label} ▾
      </button>
      {open && (
        <>
          {/* 透明全螢幕 overlay：點外面即關閉，不需額外套件 */}
          <button
            type="button"
            aria-label="關閉選單"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[7rem]">
            {PLACE_TYPES.map((t) => {
              const m = TYPE_META[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => select(t)}
                  className="flex items-center justify-between w-full px-3 py-1.5 text-sm hover:bg-gray-50 text-left"
                >
                  <span>{m.emoji} {m.label}</span>
                  {t === type && <span className="text-blue-600 ml-2">✓</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </span>
  )
}
