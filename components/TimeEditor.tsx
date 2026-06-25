'use client'
import { useState } from 'react'

interface Props {
  value: string         // "HH:MM"
  onChange: (v: string) => void
  label: string
}

export function TimeEditor({ value, onChange, label }: Props) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <input
        type="time"
        defaultValue={value}
        autoFocus
        onBlur={(e) => { onChange(e.target.value); setEditing(false) }}
        className="border border-blue-400 rounded px-2 py-0.5 text-sm w-24"
      />
    )
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm text-blue-600 underline underline-offset-2"
    >
      {label}: {value}
    </button>
  )
}
