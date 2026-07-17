'use client'
import { useState } from 'react'
import { extractItinerary } from '@/app/actions/ai'
import { searchPlace } from '@/app/actions/places'
import type { Place, PlaceType } from '@/lib/types'
import { validateType } from '@/lib/placeType'

const COUNTRIES = [
  { name: 'Taiwan', label: '台灣' },
  { name: 'Japan', label: '日本' },
  { name: 'South Korea', label: '韓國' },
  { name: 'Thailand', label: '泰國' },
  { name: 'France', label: '法國' },
  { name: 'Italy', label: '義大利' },
  { name: 'Germany', label: '德國' },
  { name: 'United Kingdom', label: '英國' },
  { name: 'United States', label: '美國' },
  { name: 'Singapore', label: '新加坡' },
  { name: 'Malaysia', label: '馬來西亞' },
  { name: 'Vietnam', label: '越南' },
]

interface ExtractedPlace {
  name: string
  type: PlaceType
}

interface Props {
  onPlacesFound: (places: Place[]) => void
}

export function ItineraryPasteInput({ onPlacesFound }: Props) {
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'confirm-country' | 'verifying'>('idle')
  const [extracted, setExtracted] = useState<ExtractedPlace[]>([])
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null)
  const [verifyProgress, setVerifyProgress] = useState({ done: 0, total: 0 })
  const [selectedCountryName, setSelectedCountryName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const runVerify = async (places: ExtractedPlace[], countryName: string) => {
    setPhase('verifying')
    setVerifyProgress({ done: 0, total: places.length })
    let done = 0
    const results = await Promise.all(
      places.map(async (p) => {
        const found = await searchPlace(p.name, countryName)
        done++
        setVerifyProgress({ done, total: places.length })
        if (!found) return null
        return { ...found, type: validateType(p.type) } as Place
      })
    )
    const valid = results.filter((p): p is Place => p !== null)
    onPlacesFound(valid)
    if (places.length > 0 && valid.length === 0) {
      setError('找到地點，但都無法在 Google 驗證。請確認名稱或稍後再試。')
    }
    setPhase('idle')
    setText('')
    setDetectedCountry(null)
    setSelectedCountryName('')
  }

  const handleAnalyze = async () => {
    if (!text.trim()) return
    setError(null)
    setPhase('analyzing')
    try {
      const result = await extractItinerary(text)
      if (result.error === 'ai_failed') {
        setError('分析服務暫時無法使用（請確認 API 設定或稍後再試）。')
        setPhase('idle')
        return
      }
      setExtracted(result.places)
      if (result.country && result.places.length > 0) {
        setDetectedCountry(result.country)
        await runVerify(result.places, result.country)
      } else if (result.places.length > 0) {
        setPhase('confirm-country')
      } else {
        setError('找不到可辨識的地點，請換一段行程文字再試。')
        setPhase('idle')
      }
    } catch {
      setError('分析失敗，請稍後再試。')
      setPhase('idle')
    }
  }

  const handleConfirmCountry = async () => {
    if (!selectedCountryName) return
    setError(null)
    try {
      await runVerify(extracted, selectedCountryName)
    } catch {
      setError('驗證地點失敗，請稍後再試。')
      setPhase('idle')
    }
  }

  if (phase === 'analyzing') {
    return <p className="text-gray-500 text-sm py-6 text-center">分析行程中...</p>
  }

  if (phase === 'verifying') {
    return (
      <div className="py-6 text-center space-y-2">
        {detectedCountry && (
          <span className="inline-block bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full">
            偵測到：{detectedCountry}
          </span>
        )}
        <p className="text-gray-500 text-sm">
          驗證地點中... {verifyProgress.done} / {verifyProgress.total}
        </p>
      </div>
    )
  }

  if (phase === 'confirm-country') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">無法自動判斷國家，請選擇行程所在地：</p>
        <select
          value={selectedCountryName}
          onChange={(e) => setSelectedCountryName(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 w-full"
        >
          <option value="">請選擇國家</option>
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>{c.label}</option>
          ))}
        </select>
        <button
          onClick={handleConfirmCountry}
          disabled={!selectedCountryName}
          className="w-full bg-clay text-white py-2 rounded-lg font-medium hover:bg-clay-deep disabled:opacity-40 disabled:cursor-not-allowed"
        >
          繼續分析
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="貼上旅遊部落格、筆記或任何行程文字，自動分析所有景點與餐廳..."
        rows={6}
        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      <button
        onClick={handleAnalyze}
        disabled={!text.trim()}
        className="w-full bg-clay text-white py-2 rounded-lg font-medium hover:bg-clay-deep disabled:opacity-40 disabled:cursor-not-allowed"
      >
        分析行程
      </button>
    </div>
  )
}
