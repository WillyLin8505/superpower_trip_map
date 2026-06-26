'use client'
import { useState, useEffect, useRef } from 'react'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

interface Props {
  value: string
  onChange: (v: string) => void
}

export function TimeScrollPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [h, setH] = useState(value.split(':')[0])
  const [m, setM] = useState(value.split(':')[1])
  const containerRef = useRef<HTMLDivElement>(null)
  const selHourRef = useRef<HTMLLIElement>(null)
  const selMinRef = useRef<HTMLLIElement>(null)

  // Sync internal state when value prop changes externally
  useEffect(() => {
    setH(value.split(':')[0])
    setM(value.split(':')[1])
  }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Scroll selected items into view when picker opens
  useEffect(() => {
    if (!open) return
    selHourRef.current?.scrollIntoView({ block: 'center' })
    selMinRef.current?.scrollIntoView({ block: 'center' })
  }, [open])

  const selectHour = (newH: string) => {
    setH(newH)
    onChange(`${newH}:${m}`)
  }

  const selectMin = (newM: string) => {
    setM(newM)
    onChange(`${h}:${newM}`)
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-blue-600 underline underline-offset-2"
      >
        {h}:{m}
      </button>
      {open && (
        <div className="absolute z-50 top-7 left-0 bg-white border border-gray-200 rounded-lg shadow-lg flex gap-0 overflow-hidden">
          <ul className="overflow-y-auto h-40 w-12 scroll-smooth" data-testid="hours-col">
            {HOURS.map((hr) => (
              <li
                key={hr}
                ref={hr === h ? selHourRef : undefined}
                onClick={() => selectHour(hr)}
                className={`h-8 flex items-center justify-center text-sm cursor-pointer select-none ${
                  hr === h ? 'font-semibold text-blue-700 bg-blue-50 rounded' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {hr}
              </li>
            ))}
          </ul>
          <div className="w-px bg-gray-100" />
          <ul className="overflow-y-auto h-40 w-12 scroll-smooth" data-testid="minutes-col">
            {MINUTES.map((mn) => (
              <li
                key={mn}
                ref={mn === m ? selMinRef : undefined}
                onClick={() => selectMin(mn)}
                className={`h-8 flex items-center justify-center text-sm cursor-pointer select-none ${
                  mn === m ? 'font-semibold text-blue-700 bg-blue-50 rounded' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {mn}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
