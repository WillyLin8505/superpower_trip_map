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
  {
    id: 's1',
    url: 'https://tabelog.example/osaka',
    label: 'Tabelog Osaka',
    kind: 'image',
    enabled: true,
    config: { provider: 'tabelog' },
    lastFetchedAt: null,
    lastFetchStatus: null,
  },
]

beforeEach(() => jest.clearAllMocks())

it('shows source kind, provider, and edit action per row', () => {
  render(<SourceList sources={sources} />)
  expect(screen.getByText('圖片來源')).toBeInTheDocument()
  expect(screen.getByText('Tabelog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '編輯' })).toBeInTheDocument()
})

it('clicking edit reveals a form pre-filled with the row url/label', () => {
  render(<SourceList sources={sources} />)
  fireEvent.click(screen.getByRole('button', { name: '編輯' }))
  expect(screen.getByDisplayValue('https://tabelog.example/osaka')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Tabelog Osaka')).toBeInTheDocument()
})

it('submitting the edit form preserves image source metadata', async () => {
  render(<SourceList sources={sources} />)
  fireEvent.click(screen.getByRole('button', { name: '編輯' }))
  const urlInput = screen.getByDisplayValue('https://tabelog.example/osaka')
  fireEvent.change(urlInput, { target: { value: 'https://tabelog.example/tokyo' } })
  fireEvent.click(screen.getByRole('button', { name: '儲存' }))

  await waitFor(() => expect(editSourceMock.mock.calls[0]?.[0]).toBe('s1'))
  const formData = editSourceMock.mock.calls[0]?.[1] as FormData
  expect(formData.get('url')).toBe('https://tabelog.example/tokyo')
  expect(formData.get('kind')).toBe('image')
  expect(formData.get('provider')).toBe('tabelog')
  expect(formData.getAll('enabled')).toEqual(['false', 'true'])
})
