/** @jest-environment jsdom */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { CandidatePanel } from '@/components/CandidatePanel'
import type { Candidate } from '@/lib/types'

function cand(id: string, name: string): Candidate {
  return {
    id,
    addedBy: 'u2',
    addedByName: 'Mina',
    source: {
      kind: 'line_group',
      lineGroupId: 'group-1',
      lineDisplayName: 'Mina',
      messageId: 'msg-1',
      messageText: 'https://line.example.com/discussion/thread-with-a-very-long-url-that-should-wrap-inside-the-card',
      sourceUrl: 'https://maps.example.com/place/very-long-line-itinerary-url-that-should-wrap-inside-the-card',
    },
    place: { id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
  }
}

function renderPanel(candidates: Candidate[]) {
  return {
    onAdd: jest.fn(),
    onArchive: jest.fn(),
    onDelete: jest.fn(),
    ...render(
      <CandidatePanel
        candidates={candidates}
        dateIso="2026-07-01"
        onAdd={jest.fn()}
        onArchive={jest.fn()}
        onDelete={jest.fn()}
      />,
    ),
  }
}

it('empty LINE discussion shows the empty message', () => {
  render(
    <CandidatePanel
      candidates={[]}
      dateIso="2026-07-01"
      onAdd={jest.fn()}
      onArchive={jest.fn()}
      onDelete={jest.fn()}
    />,
  )
  expect(screen.getByText('尚無 LINE Bot 討論中的地點')).toBeInTheDocument()
})

it('renders LINE candidates using recommendation-card style', () => {
  renderPanel([cand('c1', '台北101')])
  expect(screen.getByTestId('line-candidate-card-c1')).toBeInTheDocument()
  expect(screen.getByTestId('rec-c1')).toBeInTheDocument()
  expect(screen.getByText('台北101')).toBeInTheDocument()
  expect(screen.getByText(/LINE 討論：https:\/\/line\.example\.com/)).toBeInTheDocument()
  expect(screen.getByText(/LINE \/ Mina/)).toBeInTheDocument()
})

it('renders LINE itinerary and discussion URLs as clickable wrapped links', () => {
  renderPanel([cand('c1', '台北101')])

  const itineraryLink = screen.getByRole('link', { name: '行程' })
  expect(itineraryLink).toHaveAttribute('href', 'https://maps.example.com/place/very-long-line-itinerary-url-that-should-wrap-inside-the-card')
  expect(itineraryLink).toHaveClass('break-all')

  const discussionLink = screen.getByRole('link', { name: '討論' })
  expect(discussionLink).toHaveAttribute('href', 'https://line.example.com/discussion/thread-with-a-very-long-url-that-should-wrap-inside-the-card')
  expect(discussionLink).toHaveClass('break-all')

  expect(screen.getByText(/LINE 討論：https:\/\/line\.example\.com/)).toHaveClass('[overflow-wrap:anywhere]')
})

it('uses the same add and reserve icons as recommendation cards', () => {
  renderPanel([cand('c1', '台北101')])

  const addButton = screen.getByTestId('line-candidate-add-c1')
  expect(addButton).toHaveTextContent('←')
  expect(addButton).toHaveClass('w-7', 'h-7', 'rounded-full', 'bg-clay')
  expect(addButton).not.toHaveTextContent('加入行程')

  const archiveButton = screen.getByTestId('line-candidate-archive-c1')
  expect(archiveButton).toHaveTextContent('💾')
  expect(archiveButton).toHaveClass('w-8', 'h-8', 'rounded-full', 'bg-clay')
  expect(archiveButton).not.toHaveTextContent('加入備用')
})

it('renders LINE delete as a top-right x inside the card', () => {
  renderPanel([cand('c1', '台北101')])

  const deleteButton = screen.getByTestId('line-candidate-delete-c1')
  expect(deleteButton).toHaveTextContent('×')
  expect(deleteButton).toHaveClass('absolute', 'right-2', 'top-2')
})

it('can add, move to reserve, and delete a LINE candidate', () => {
  const candidate = cand('c1', '台北101')
  const onAdd = jest.fn()
  const onArchive = jest.fn()
  const onDelete = jest.fn()
  render(
    <CandidatePanel
      candidates={[candidate]}
      dateIso="2026-07-01"
      onAdd={onAdd}
      onArchive={onArchive}
      onDelete={onDelete}
    />,
  )

  fireEvent.click(screen.getByTestId('line-candidate-add-c1'))
  expect(onAdd).toHaveBeenCalledWith('c1', candidate.place)

  fireEvent.click(screen.getByTestId('line-candidate-archive-c1'))
  expect(onArchive).toHaveBeenCalledWith(candidate)

  fireEvent.click(screen.getByTestId('line-candidate-delete-c1'))
  expect(onDelete).toHaveBeenCalledWith('c1')
})
