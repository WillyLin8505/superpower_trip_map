interface Props {
  place: import('@/lib/types').ScheduledPlace
  index: number
}

export function ItineraryCard({ place, index }: Props) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{place.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              place.type === 'attraction' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
            }`}>
              {place.type === 'attraction' ? '景點' : '餐廳'}
            </span>
            {place.outsideHours && (
              <span className="text-xs text-orange-600 font-medium">⚠ 請確認營業時間</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {place.startTime} · 停留 {place.durationMin} 分鐘
          </p>
          {place.rating && (
            <p className="text-sm text-gray-500">評分：{place.rating} ★</p>
          )}
          {place.ticketPrice && (
            <p className="text-sm text-gray-500">票價：{place.ticketPrice}</p>
          )}
          {place.aiDescription && (
            <p className="text-sm text-gray-600 mt-2 italic">{place.aiDescription}</p>
          )}
        </div>
      </div>
      {place.travelMinToNext !== null && (
        <p className="text-xs text-gray-400 mt-3 pl-10">→ 前往下一站約 {place.travelMinToNext} 分鐘</p>
      )}
    </div>
  )
}
