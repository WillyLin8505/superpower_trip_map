'use client'
import { useState } from 'react'
import type { PlanResult } from '@/lib/types'
import { rearrangeItinerary } from '@/app/actions/rearrange'
import { applyChanges, type Change } from '@/lib/utils/rearrangeChanges'
import { isRemoveDuplicatesInstruction, findDuplicateRemovals } from '@/lib/utils/dedupePlaces'

interface Props {
  plan: PlanResult
  onApply: (newPlan: PlanResult) => void
}

function changeLabel(c: Change): string {
  if (c.kind === 'move') return `${c.placeName} 移到第 ${c.toDay} 天`
  if (c.kind === 'duration') return `${c.placeName} 停留 ${c.from} → ${c.to} 分`
  if (c.kind === 'remove') return `移除重複:${c.placeName}（保留第 ${c.keptDay} 天）`
  return `活動${c.field === 'dayStart' ? '開始' : '結束'} ${c.from} → ${c.to}`
}

export function AiRearrangeInput({ plan, onApply }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [changes, setChanges] = useState<Change[] | null>(null)
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit() {
    const instruction = text.trim()
    if (!instruction) return
    setError(null); setNotice(null); setChanges(null); setRejected(new Set())

    // 「刪掉重複的」等指令走本地去重，不呼叫 AI:偵測是純函式、即時、免費且可靠。
    if (isRemoveDuplicatesInstruction(instruction)) {
      const removals = findDuplicateRemovals(plan)
      if (removals.length === 0) { setNotice('沒有找到重複的地點'); return }
      setChanges(removals)
      return
    }

    setLoading(true)
    const res = await rearrangeItinerary(plan, instruction)
    setLoading(false)
    if (!res.ok) { setError(res.error); return }
    setChanges(res.changes)
  }

  function reject(id: string) {
    setRejected((prev) => new Set(prev).add(id))
  }

  function applyAll() {
    if (!changes) return
    const accepted = changes.filter((c) => !rejected.has(c.id))
    onApply(applyChanges(plan, accepted))
    setChanges(null); setText(''); setRejected(new Set()); setNotice(null)
  }

  function cancel() {
    setChanges(null); setRejected(new Set()); setNotice(null)
  }

  const days = changes
    ? Array.from(new Set(changes.filter((c) => !rejected.has(c.id)).map((c) => c.day))).sort((a, b) => a - b)
    : []

  return (
    <div className="border border-gray-200 rounded-xl p-4 mb-6 bg-gray-50">
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例：第二天太滿，分一些到第三天"
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          rows={2}
        />
        <button type="button" onClick={submit} disabled={loading || !text.trim()}
          className="px-3 py-1 rounded-full border border-clay/40 text-clay-deep hover:bg-clay-tint disabled:opacity-40 self-start">
          {loading ? 'AI 重排中…' : '重排'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-2" role="alert">{error}</p>}
      {notice && <p className="text-sm text-gray-500 mt-2">{notice}</p>}

      {changes && (
        <div className="mt-3">
          {days.length === 0 ? (
            <p className="text-sm text-gray-500">沒有需要調整的地方</p>
          ) : (
            days.map((day) => (
              <div key={day} className="mb-2">
                <p className="text-xs font-semibold text-gray-700">第 {day} 天</p>
                {changes.filter((c) => c.day === day && !rejected.has(c.id)).map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm py-0.5">
                    <span>• {changeLabel(c)}</span>
                    <button type="button" onClick={() => reject(c.id)}
                      aria-label={`移除 ${changeLabel(c)}`}
                      className="text-gray-400 hover:text-red-500 px-1">&#x2717;</button>
                  </div>
                ))}
              </div>
            ))
          )}
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={applyAll}
              className="px-3 py-1 rounded-full bg-clay text-white text-sm hover:bg-clay-deep">一鍵同意全部</button>
            <button type="button" onClick={cancel}
              className="px-3 py-1 rounded-full border border-gray-300 text-gray-600 text-sm hover:bg-gray-100">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
