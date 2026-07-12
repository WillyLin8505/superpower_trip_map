/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidePanel } from '@/components/SidePanel'
import type { CategoryBuckets, Candidate } from '@/lib/types'

const emptyRecs: CategoryBuckets = {
  dessert: { shown: [], reserve: [] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}

function candidate(id: string, name: string): Candidate {
  return {
    id,
    place: {
      id: `p-${id}`, placeId: `gp-${id}`, name, type: 'attraction', lat: 25, lng: 121, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null,
    },
    addedBy: 'u1', addedByName: '小明',
  }
}

function baseProps() {
  return {
    dateIso: '2026-07-01',
    recommendations: emptyRecs,
    onAddRecommendation: jest.fn(),
    candidates: [] as Candidate[],
    onAddCandidatePlace: jest.fn(),
    onAddCandidatePlaces: jest.fn(),
    onRemoveCandidate: jest.fn(),
    archived: [] as Candidate[],
    onAddArchivedToDay: jest.fn(),
    onDeleteArchived: jest.fn(),
  }
}

it('defaults to the 推薦行程 tab', () => {
  render(<SidePanel {...baseProps()} />)
  expect(screen.getByTestId('day-recommendations')).toBeInTheDocument()
})

it('switching to LINE 討論 shows the candidate panel content', () => {
  render(<SidePanel {...baseProps()} candidates={[candidate('c1', '候選A')]} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-candidates'))
  expect(screen.getByText('候選A')).toBeInTheDocument()
  expect(screen.queryByTestId('day-recommendations')).not.toBeInTheDocument()
})

it('switching to 封存 shows the archive list', () => {
  render(<SidePanel {...baseProps()} archived={[candidate('a1', '封存A')]} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-archive'))
  expect(screen.getByText('封存A')).toBeInTheDocument()
})

it('封存 tab shows an empty state when nothing is archived', () => {
  render(<SidePanel {...baseProps()} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-archive'))
  expect(screen.getByTestId('archive-empty')).toHaveTextContent('尚未封存任何地點')
})

it('archived item 加入行程 calls onAddArchivedToDay with id and place', () => {
  const onAddArchivedToDay = jest.fn()
  const c = candidate('a1', '封存A')
  render(<SidePanel {...baseProps()} archived={[c]} onAddArchivedToDay={onAddArchivedToDay} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-archive'))
  fireEvent.click(screen.getByRole('button', { name: '加入行程' }))
  expect(onAddArchivedToDay).toHaveBeenCalledWith('a1', c.place)
})

it('archived item 永久刪除 calls onDeleteArchived with the candidate id', () => {
  const onDeleteArchived = jest.fn()
  render(<SidePanel {...baseProps()} archived={[candidate('a1', '封存A')]} onDeleteArchived={onDeleteArchived} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-archive'))
  fireEvent.click(screen.getByRole('button', { name: '永久刪除' }))
  expect(onDeleteArchived).toHaveBeenCalledWith('a1')
})
