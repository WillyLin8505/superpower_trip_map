/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Source } from '@/lib/types'

const deleteSourceMock = jest.fn()
const editSourceMock = jest.fn()
jest.mock('@/app/actions/sources', () => ({
  deleteSource: (...args: unknown[]) => deleteSourceMock(...args),
  editSource: (...args: unknown[]) => editSourceMock(...args),
}))

import { SourceList } from '@/components/admin/SourceList'

const sources: Source[] = [
  { id: 's1', url: 'https://a.com', label: 'A站', lastFetchedAt: null, lastFetchStatus: null },
]

beforeEach(() => jest.clearAllMocks())

it('shows an edit entry per row', () => {
  render(<SourceList sources={sources} />)
  expect(screen.getByRole('button', { name: '編輯' })).toBeInTheDocument()
})

it('clicking edit reveals a form pre-filled with the row url/label', () => {
  render(<SourceList sources={sources} />)
  fireEvent.click(screen.getByRole('button', { name: '編輯' }))
  expect(screen.getByDisplayValue('https://a.com')).toBeInTheDocument()
  expect(screen.getByDisplayValue('A站')).toBeInTheDocument()
})

it('submitting the edit form calls editSource bound to that id', async () => {
  render(<SourceList sources={sources} />)
  fireEvent.click(screen.getByRole('button', { name: '編輯' }))
  const urlInput = screen.getByDisplayValue('https://a.com')
  fireEvent.change(urlInput, { target: { value: 'https://b.com' } })
  fireEvent.click(screen.getByRole('button', { name: '儲存' }))
  await waitFor(() => expect(editSourceMock.mock.calls[0]?.[0]).toBe('s1'))
})
