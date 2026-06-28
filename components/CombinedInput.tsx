'use client'
import { useState } from 'react'
import { extractItinerary } from '@/app/actions/ai'
import { searchPlace } from '@/app/actions/places'
import { scrapeText } from '@/app/actions/scrape'
import type { Place, PlaceType } from '@/lib/types'
import { inferType, validateType, TYPE_META } from '@/lib/placeType'

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

type DetectedMode = 'search' | 'article' | 'url'
type Phase = 'idle' | 'loading' | 'confirm-country' | 'verifying' | 'result'

interface ExtractedPlace {
  name: string
  type: PlaceType
}

function detectMode(text: string): DetectedMode | null {
  const t = text.trim()
  if (!t) return null
  if (/^https?:\/\//.test(t)) return 'url'
  if (t.length > 150 || text.includes('\n')) return 'article'
  return 'search'
}

const MODE_BADGE: Record<DetectedMode, string> = {
  url: '🔗 分析網址',
  article: '📄 分析文章',
  search: '🔍 搜尋地點',
}

interface Props {
  onAdd: (place: Place) => void
  onAddPlaces: (places: Place[]) => void
}

export function CombinedInput({ onAdd, onAddPlaces }: Props) {
  const [text, setText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [singleResult, setSingleResult] = useState<Place | null>(null)
  const [extracted, setExtracted] = useState<ExtractedPlace[]>([])
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null)
  const [selectedCountryName, setSelectedCountryName] = useState('')
  const [verifyProgress, setVerifyProgress] = useState({ done: 0, total: 0 })

  const detectedMode = detectMode(text)

  const reset = () => {
    setPhase('idle')
    setText('')
    setSearchQuery('')
    setSingleResult(null)
    setExtracted([])
    setDetectedCountry(null)
    setSelectedCountryName('')
  }

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
    onAddPlaces(valid)
    reset()
  }

  const runExtract = async (raw: string) => {
    const result = await extractItinerary(raw)
    setExtracted(result.places)
    if (result.country && result.places.length > 0) {
      setDetectedCountry(result.country)
      await runVerify(result.places, result.country)
    } else if (result.places.length > 0) {
      setPhase('confirm-country')
    } else {
      reset()
    }
  }

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const mode = detectMode(trimmed)
    setPhase('loading')
    try {
      if (mode === 'url') {
        const scraped = await scrapeText(trimmed)
        if (!scraped) { setPhase('idle'); return }
        await runExtract(scraped)
      } else if (mode === 'article') {
        await runExtract(trimmed)
      } else {
        const found = await searchPlace(trimmed)
        setSingleResult(found)
        setSearchQuery(trimmed)
        if (found) setText('')
        setPhase('result')
      }
    } catch {
      setPhase('idle')
    }
  }

  const handleConfirmCountry = async () => {
    if (!selectedCountryName) return
    try {
      await runVerify(extracted, selectedCountryName)
    } catch {
      setPhase('idle')
    }
  }

  const handleAddSingle = (place: Place) => {
    onAdd({ ...place, type: inferType(searchQuery) })
    reset()
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
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          繼續分析
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={phase === 'loading'}
        placeholder="搜尋地點、貼上行程文字，或貼上網址..."
        rows={3}
        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60"
      />
      {detectedMode && phase !== 'loading' && (
        <p className="text-xs text-gray-500">{MODE_BADGE[detectedMode]}</p>
      )}
      {phase === 'result' && singleResult === null && (
        <p className="text-sm text-red-500">找不到此地點</p>
      )}
      {phase === 'result' && singleResult && (
        <button
          type="button"
          onClick={() => handleAddSingle(singleResult)}
          className="w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 text-sm">{singleResult.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_META[inferType(searchQuery)].badge}`}>
              {TYPE_META[inferType(searchQuery)].label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{singleResult.address}</p>
        </button>
      )}
      <button
        onClick={handleSubmit}
        disabled={!text.trim() || phase === 'loading'}
        className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {phase === 'loading' ? '分析中...' : '送出'}
      </button>
    </div>
  )
}
