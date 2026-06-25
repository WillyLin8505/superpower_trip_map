'use client'
import { addSource } from '@/app/actions/sources'

export function SourceForm() {
  return (
    <form action={addSource} className="flex gap-3 flex-wrap">
      <input
        name="url"
        type="url"
        placeholder="https://example.com/travel-guide"
        required
        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-0"
      />
      <input
        name="label"
        type="text"
        placeholder="網站標籤（如：台北美食部落格）"
        required
        className="w-56 border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
      >
        新增網站
      </button>
    </form>
  )
}
