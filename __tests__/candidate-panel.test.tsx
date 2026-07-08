/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { CandidatePanel } from '@/components/CandidatePanel'
import type { Candidate, Place } from '@/lib/types'

jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: ({ onAdd }: { onAdd: (p: Place) => void }) => (
    <button onClick={() => onAdd({ id: 'x', placeId: 'x', name: '新地點', type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null })}>mock-search-add</button>
  ),
}))

function cand(id: string, name: string): Candidate {
  return {
    id, addedBy: 'u2', addedByName: '小明',
    place: { id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
  }
}
const noop = () => {}

it('empty pool shows the empty message', () => {
  render(<CandidatePanel candidates={[]} onAddPlace={noop} onAddPlaces={noop} onRemove={noop} />)
  expect(screen.getByText('還沒有候選，搜尋想去的地方加進來吧')).toBeInTheDocument()
})

it('lists candidates with name and adder', () => {
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} onAddPlace={noop} onAddPlaces={noop} onRemove={noop} />)
  expect(screen.getByText('台北101')).toBeInTheDocument()
  expect(screen.getByText(/小明/)).toBeInTheDocument()
})


it('shows LINE source text when candidate came from LINE', () => {
  render(
    <CandidatePanel
      candidates={[{
        ...cand('c1', '???101'),
        source: {
          kind: 'line_group',
          lineGroupId: 'Cg123',
          lineDisplayName: '小明',
          messageId: 'm1',
        },
      }]}
      onAddPlace={noop}
      onAddPlaces={noop}
      onRemove={noop}
    />,
  )

  expect(screen.getByText('LINE 群組 / 小明 加入')).toBeInTheDocument()
})

it('search add calls onAddPlace', () => {
  const onAddPlace = jest.fn()
  render(<CandidatePanel candidates={[]} onAddPlace={onAddPlace} onAddPlaces={noop} onRemove={noop} />)
  fireEvent.click(screen.getByText('mock-search-add'))
  expect(onAddPlace).toHaveBeenCalledWith(expect.objectContaining({ name: '新地點' }))
})

it('remove calls onRemove with candidate id', () => {
  const onRemove = jest.fn()
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} onAddPlace={noop} onAddPlaces={noop} onRemove={onRemove} />)
  fireEvent.click(screen.getByRole('button', { name: '移除' }))
  expect(onRemove).toHaveBeenCalledWith('c1')
})

it('no longer renders the day-picker promote control (superseded by per-day ← arrows)', () => {
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} onAddPlace={noop} onAddPlaces={noop} onRemove={noop} />)
  expect(screen.queryByRole('button', { name: '放進' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/放進第幾天/)).not.toBeInTheDocument()
})
