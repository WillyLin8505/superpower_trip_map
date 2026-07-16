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
      messageText: '想去這裡吃晚餐',
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
  expect(screen.getByText('LINE 討論：想去這裡吃晚餐')).toBeInTheDocument()
  expect(screen.getByText(/LINE \/ Mina/)).toBeInTheDocument()
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
