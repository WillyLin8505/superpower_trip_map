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
    addedBy: 'u1', addedByName: 'User',
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

it('defaults to the recommendation tab', () => {
  render(<SidePanel {...baseProps()} />)
  expect(screen.getByTestId('day-recommendations')).toBeInTheDocument()
})

it('reserve tab contains LINE discussion candidates and archived items', () => {
  render(<SidePanel {...baseProps()} candidates={[candidate('c1', 'LINE A')]} archived={[candidate('a1', 'Archive A')]} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-reserve'))
  expect(screen.getByTestId('reserve-panel')).toBeInTheDocument()
  expect(screen.getByTestId('candidate-card-c1')).toBeInTheDocument()
  expect(screen.getByText('Archive A')).toBeInTheDocument()
})

it('reserve tab shows an empty archived state when nothing is archived', () => {
  render(<SidePanel {...baseProps()} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-reserve'))
  expect(screen.getByTestId('archive-empty')).toHaveTextContent('尚未加入任何備用行程')
})

it('archived item add calls onAddArchivedToDay with id and place', () => {
  const onAddArchivedToDay = jest.fn()
  const archived = candidate('a1', 'Archive A')
  render(<SidePanel {...baseProps()} archived={[archived]} onAddArchivedToDay={onAddArchivedToDay} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-reserve'))
  fireEvent.click(screen.getByTestId('archive-add-a1'))
  expect(onAddArchivedToDay).toHaveBeenCalledWith('a1', archived.place)
})

it('archived item delete calls onDeleteArchived with the candidate id', () => {
  const onDeleteArchived = jest.fn()
  render(<SidePanel {...baseProps()} archived={[candidate('a1', 'Archive A')]} onDeleteArchived={onDeleteArchived} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-reserve'))
  fireEvent.click(screen.getByTestId('archive-delete-a1'))
  expect(onDeleteArchived).toHaveBeenCalledWith('a1')
})
