/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// NOTE: 不 mock @/lib/utils/clientScheduler 也不 mock @/lib/utils/hours，
// 直接用真實排程，驗證「改開始日期 → 全天營業時間警告重算」。

// Next.js navigation (transitive deps)
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// dnd-kit: pass children straight through
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: () => null,
  pointerWithin: jest.fn(() => []),
  rectIntersection: jest.fn(() => []),
  PointerSensor: class {},
  useSensor: jest.fn(() => ({})),
  useSensors: jest.fn((...args: unknown[]) => args),
  useDroppable: jest.fn(() => ({ setNodeRef: jest.fn(), isOver: false })),
}))

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

// Heavy / unrelated sub-components stubbed out
jest.mock('@/components/RecommendPanel', () => ({
  RecommendPanel: () => null,
}))

jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: () => null,
}))

// Utility modules
jest.mock('@/lib/utils/geo', () => ({
  findClosestDay: jest.fn(() => 0),
}))

jest.mock('@/lib/utils/dragContainers', () => ({
  applyDragResult: jest.fn(),
  findContainer: jest.fn(() => -1),
}))

jest.mock('@/lib/utils/mapUrl', () => ({
  buildDayEmbedUrl: jest.fn(() => null),
}))

import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult } from '@/lib/types'

// Monday-first 7 筆：週一公休、週二～週日 9:00 AM – 5:00 PM
const OPENING_HOURS = [
  'Monday: Closed',
  'Tuesday: 9:00 AM – 5:00 PM',
  'Wednesday: 9:00 AM – 5:00 PM',
  'Thursday: 9:00 AM – 5:00 PM',
  'Friday: 9:00 AM – 5:00 PM',
  'Saturday: 9:00 AM – 5:00 PM',
  'Sunday: 9:00 AM – 5:00 PM',
]

function plan(): PlanResult {
  return {
    startDate: '2026-06-30', // 週二（營業）
    transportMode: 'driving',
    days: [
      {
        day: 1,
        aiSummary: null,
        dayStart: '09:00',
        dayEnd: '21:00',
        places: [
          {
            id: 'p1',
            placeId: 'g1',
            name: '某景點',
            type: 'attraction',
            lat: 0,
            lng: 0,
            address: '地址',
            openingHours: OPENING_HOURS,
            rating: null,
            photoUrl: null,
            description: null,
            startTime: '14:00',
            durationMin: 60,
            travelMinToNext: null,
            aiDescription: null,
            outsideHours: false,
            lateExit: false,
            startLocked: false,
            durationLocked: false,
          },
        ],
      },
    ],
  }
}

it('editing the trip start date re-derives opening-hours warnings for all days', () => {
  render(<ItineraryClient initial={plan()} />)

  // 週二營業 → 無警告
  expect(screen.queryByText(/請確認營業時間/)).not.toBeInTheDocument()

  // 改成週一（公休）→ recalc → 出現警告
  fireEvent.change(screen.getByTestId('trip-start-date'), { target: { value: '2026-06-29' } })

  expect(screen.getByText(/請確認營業時間/)).toBeInTheDocument()
})
