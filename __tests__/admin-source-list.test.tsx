/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Source } from '@/lib/types'

const deleteSourceMock = jest.fn()
const editSourceMock = jest.fn()
const reorderImageSourcesMock = jest.fn()
jest.mock('@/app/actions/sources', () => ({
  deleteSource: (...args: unknown[]) => deleteSourceMock(...args),
  editSource: (...args: unknown[]) => editSourceMock(...args),
  reorderImageSources: (...args: unknown[]) => reorderImageSourcesMock(...args),
}))

import { SourceList } from '@/components/admin/SourceList'

const sources: Source[] = [
  {
    id: 's1',
    url: 'https://www.gotokyo.org/en/index.html',
    label: '東京官方旅遊 GO TOKYO',
    kind: 'image',
    enabled: true,
    config: {
      provider: 'official_website',
      scope: 'regional_official',
      country: 'JP',
      region: 'Tokyo',
      condition: 'country=JP AND region=Tokyo',
      priority: 10,
    },
    lastFetchedAt: null,
    lastFetchStatus: null,
  },
  {
    id: 's2',
    url: 'https://www.japan.travel/en/',
    label: '日本官方旅遊局 JNTO',
    kind: 'image',
    enabled: true,
    config: {
      provider: 'official_website',
      scope: 'national_official',
      country: 'JP',
      condition: 'country=JP',
      priority: 20,
    },
    lastFetchedAt: null,
    lastFetchStatus: null,
  },
  {
    id: 's3',
    url: 'https://www.japan.travel/en/',
    label: 'JNTO Recommendation',
    kind: 'recommendation',
    enabled: true,
    config: {},
    lastFetchedAt: null,
    lastFetchStatus: null,
  },
]

beforeEach(() => jest.clearAllMocks())

it('shows image source conditions and provider per row', () => {
  render(<SourceList sources={sources} />)
  expect(screen.getByText('圖片來源規則')).toBeInTheDocument()
  expect(screen.getByText('東京官方旅遊 GO TOKYO')).toBeInTheDocument()
  expect(screen.getAllByText('官方網站').length).toBeGreaterThan(0)
  expect(screen.getByText('區域官方優先')).toBeInTheDocument()
  expect(screen.getByText('country=JP AND region=Tokyo')).toBeInTheDocument()
})

it('clicking edit reveals a form pre-filled with the row url/label and condition', () => {
  render(<SourceList sources={sources} />)
  fireEvent.click(screen.getAllByRole('button', { name: '編輯' })[0])
  expect(screen.getByDisplayValue('https://www.gotokyo.org/en/index.html')).toBeInTheDocument()
  expect(screen.getByDisplayValue('東京官方旅遊 GO TOKYO')).toBeInTheDocument()
  expect(screen.getByDisplayValue('country=JP AND region=Tokyo')).toBeInTheDocument()
})

it('submitting the edit form preserves image source rule metadata', async () => {
  render(<SourceList sources={sources} />)
  fireEvent.click(screen.getAllByRole('button', { name: '編輯' })[0])
  const urlInput = screen.getByDisplayValue('https://www.gotokyo.org/en/index.html')
  fireEvent.change(urlInput, { target: { value: 'https://www.gotokyo.org/tc/index.html' } })
  fireEvent.click(screen.getByRole('button', { name: '儲存' }))

  await waitFor(() => expect(editSourceMock.mock.calls[0]?.[0]).toBe('s1'))
  const formData = editSourceMock.mock.calls[0]?.[1] as FormData
  expect(formData.get('url')).toBe('https://www.gotokyo.org/tc/index.html')
  expect(formData.get('kind')).toBe('image')
  expect(formData.get('provider')).toBe('official_website')
  expect(formData.get('scope')).toBe('regional_official')
  expect(formData.get('country')).toBe('JP')
  expect(formData.get('region')).toBe('Tokyo')
  expect(formData.get('condition')).toBe('country=JP AND region=Tokyo')
  expect(formData.getAll('enabled')).toEqual(['false', 'true'])
})

it('dragging an image rule stores the new priority order', async () => {
  render(<SourceList sources={sources} />)
  const tokyoRow = screen.getByText('東京官方旅遊 GO TOKYO').closest('tr')
  const nationalRow = screen.getByText('日本官方旅遊局 JNTO').closest('tr')
  expect(tokyoRow).not.toBeNull()
  expect(nationalRow).not.toBeNull()

  fireEvent.dragStart(nationalRow!)
  fireEvent.dragOver(tokyoRow!)
  fireEvent.drop(tokyoRow!)

  await waitFor(() => expect(reorderImageSourcesMock).toHaveBeenCalledWith(['s2', 's1']))
})
