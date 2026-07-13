/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
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
      messageText: '這家看起來不錯',
    },
    place: { id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
  }
}

it('empty LINE discussion shows the empty message', () => {
  render(<CandidatePanel candidates={[]} dateIso="2026-07-01" />)
  expect(screen.getByText('尚無 LINE Bot 討論中的地點')).toBeInTheDocument()
})

it('renders LINE candidates using recommendation-card style', () => {
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} dateIso="2026-07-01" />)
  expect(screen.getByTestId('line-candidate-card-c1')).toBeInTheDocument()
  expect(screen.getByTestId('rec-c1')).toBeInTheDocument()
  expect(screen.getByText('台北101')).toBeInTheDocument()
  expect(screen.getByText('LINE 討論：這家看起來不錯')).toBeInTheDocument()
  expect(screen.getByText(/LINE \/ Mina/)).toBeInTheDocument()
})

it('is read-only: no add/remove/archive controls are rendered', () => {
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} dateIso="2026-07-01" />)
  expect(screen.queryByTestId('rec-add-c1')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /移除|移到備用|加入/ })).not.toBeInTheDocument()
})
