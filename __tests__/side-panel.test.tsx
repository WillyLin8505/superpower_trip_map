/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidePanel } from '@/components/SidePanel'
import type { CategoryBuckets, Candidate, Place } from '@/lib/types'

jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: ({ onAdd }: { onAdd: (place: Place) => void }) => (
    <button onClick={() => onAdd(place('manual', '手動搜尋'))}>mock-reserve-search</button>
  ),
}))

const emptyRecs: CategoryBuckets = {
  dessert: { shown: [], reserve: [] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}

function place(id: string, name: string): Place {
  return {
    id,
    placeId: id,
    name,
    type: 'attraction',
    lat: 25,
    lng: 121,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    description: null,
  }
}

function candidate(id: string, name: string, source: Candidate['source'] = null): Candidate {
  return {
    id,
    place: place(`p-${id}`, name),
    addedBy: 'u1',
    addedByName: 'User',
    source,
  }
}

function baseProps() {
  return {
    dateIso: '2026-07-01',
    recommendations: emptyRecs,
    onAddRecommendation: jest.fn(),
    candidates: [] as Candidate[],
    archived: [] as Candidate[],
    onAddReservePlace: jest.fn(),
    onAddReservePlaces: jest.fn(),
    onAddArchivedToDay: jest.fn(),
    onDeleteArchived: jest.fn(),
    onAddCandidateToDay: jest.fn(),
    onArchiveCandidate: jest.fn(),
    onDeleteCandidate: jest.fn(),
  }
}

it('defaults to the recommendation tab', () => {
  render(<SidePanel {...baseProps()} />)
  expect(screen.getByTestId('day-recommendations')).toBeInTheDocument()
})

it('has separate recommendation, LINE discussion, and reserve tabs', () => {
  render(<SidePanel {...baseProps()} />)
  expect(screen.getByTestId('side-panel-tab-recommend')).toHaveTextContent('推薦行程')
  expect(screen.getByTestId('side-panel-tab-line')).toHaveTextContent('LINE 討論')
  expect(screen.getByTestId('side-panel-tab-reserve')).toHaveTextContent('備用行程')
})

it('LINE tab renders actionable recommendation-style LINE candidate cards', () => {
  const lineCandidate = candidate('c1', 'LINE A', { kind: 'line_group', lineGroupId: 'g', messageId: 'm' })
  const onAddCandidateToDay = jest.fn()
  const onArchiveCandidate = jest.fn()
  const onDeleteCandidate = jest.fn()
  render(
    <SidePanel
      {...baseProps()}
      candidates={[lineCandidate]}
      onAddCandidateToDay={onAddCandidateToDay}
      onArchiveCandidate={onArchiveCandidate}
      onDeleteCandidate={onDeleteCandidate}
    />,
  )
  fireEvent.click(screen.getByTestId('side-panel-tab-line'))
  expect(screen.getByTestId('line-candidate-card-c1')).toBeInTheDocument()
  expect(screen.queryByText('mock-reserve-search')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('line-candidate-add-c1'))
  expect(onAddCandidateToDay).toHaveBeenCalledWith('c1', lineCandidate.place)
  fireEvent.click(screen.getByTestId('line-candidate-archive-c1'))
  expect(onArchiveCandidate).toHaveBeenCalledWith(lineCandidate)
  fireEvent.click(screen.getByTestId('line-candidate-delete-c1'))
  expect(onDeleteCandidate).toHaveBeenCalledWith('c1')
})

it('reserve tab has a search input and renders searched/archived items as recommendation cards', () => {
  const onAddReservePlace = jest.fn()
  render(<SidePanel {...baseProps()} archived={[candidate('a1', 'Reserve A')]} onAddReservePlace={onAddReservePlace} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-reserve'))
  fireEvent.click(screen.getByText('mock-reserve-search'))
  expect(onAddReservePlace).toHaveBeenCalledWith(expect.objectContaining({ name: '手動搜尋' }))
  expect(screen.getByTestId('reserve-card-a1')).toBeInTheDocument()
  expect(screen.getByTestId('rec-p-a1')).toBeInTheDocument()
})

it('reserve item add/delete calls the correct handlers', () => {
  const onAddArchivedToDay = jest.fn()
  const onDeleteArchived = jest.fn()
  const archived = candidate('a1', 'Reserve A')
  render(
    <SidePanel
      {...baseProps()}
      archived={[archived]}
      onAddArchivedToDay={onAddArchivedToDay}
      onDeleteArchived={onDeleteArchived}
    />,
  )
  fireEvent.click(screen.getByTestId('side-panel-tab-reserve'))
  fireEvent.click(screen.getByTestId('rec-add-p-a1'))
  expect(onAddArchivedToDay).toHaveBeenCalledWith('a1', archived.place)
  fireEvent.click(screen.getByTestId('archive-delete-a1'))
  expect(onDeleteArchived).toHaveBeenCalledWith('a1')
})
