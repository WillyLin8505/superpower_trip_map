/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Place } from '@/lib/types'

jest.mock('@/app/actions/ai', () => ({ extractItinerary: jest.fn() }))
jest.mock('@/app/actions/places', () => ({ searchPlace: jest.fn() }))
jest.mock('@/app/actions/scrape', () => ({ scrapeText: jest.fn() }))

import { CombinedInput } from '@/components/CombinedInput'
import { extractItinerary } from '@/app/actions/ai'
import { searchPlace } from '@/app/actions/places'
import { scrapeText } from '@/app/actions/scrape'

const mockExtract = extractItinerary as jest.Mock
const mockSearch = searchPlace as jest.Mock
const mockScrape = scrapeText as jest.Mock

const MOCK_PLACE: Place = {
  id: 'uuid-1', placeId: 'place-abc', name: '淺草寺', type: 'attraction',
  lat: 35.71, lng: 139.79, address: '東京', openingHours: null,
  rating: null, photoUrl: null, description: null,
}

const PLACEHOLDER = /搜尋地點/

describe('CombinedInput', () => {
  beforeEach(() => jest.clearAllMocks())

  it('short text searches and shows a result card', async () => {
    mockSearch.mockResolvedValue(MOCK_PLACE)
    render(<CombinedInput onAdd={jest.fn()} onAddPlaces={jest.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: '淺草寺' } })
    fireEvent.click(screen.getByText('送出'))
    await waitFor(() => expect(screen.getByText('淺草寺')).toBeInTheDocument())
    expect(mockSearch).toHaveBeenCalledWith('淺草寺')
  })

  it('shows 找不到此地點 when search returns null', async () => {
    mockSearch.mockResolvedValue(null)
    render(<CombinedInput onAdd={jest.fn()} onAddPlaces={jest.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: '不存在' } })
    fireEvent.click(screen.getByText('送出'))
    await waitFor(() => expect(screen.getByText('找不到此地點')).toBeInTheDocument())
  })

  it('result card click calls onAdd and clears the input', async () => {
    mockSearch.mockResolvedValue(MOCK_PLACE)
    const onAdd = jest.fn()
    render(<CombinedInput onAdd={onAdd} onAddPlaces={jest.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: '淺草寺' } })
    fireEvent.click(screen.getByText('送出'))
    await waitFor(() => expect(screen.getByText('淺草寺')).toBeInTheDocument())
    fireEvent.click(screen.getByText('淺草寺'))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: '淺草寺' })))
    expect((screen.getByPlaceholderText(PLACEHOLDER) as HTMLTextAreaElement).value).toBe('')
  })

  it('updates the mode badge as text changes', () => {
    render(<CombinedInput onAdd={jest.fn()} onAddPlaces={jest.fn()} />)
    const ta = screen.getByPlaceholderText(PLACEHOLDER)
    fireEvent.change(ta, { target: { value: '淺草寺' } })
    expect(screen.getByText('🔍 搜尋地點')).toBeInTheDocument()
    fireEvent.change(ta, { target: { value: 'https://example.com/blog' } })
    expect(screen.getByText('🔗 分析網址')).toBeInTheDocument()
    fireEvent.change(ta, { target: { value: 'line one\nline two' } })
    expect(screen.getByText('📄 分析文章')).toBeInTheDocument()
  })

  it('long text extracts then calls onAddPlaces with verified places', async () => {
    mockExtract.mockResolvedValue({
      country: 'Japan', countryCode: 'jp',
      places: [{ name: '淺草寺', type: 'attraction' }],
    })
    mockSearch.mockResolvedValue(MOCK_PLACE)
    const onAddPlaces = jest.fn()
    const longText = '我去日本玩，' + '行程文字'.repeat(50)
    render(<CombinedInput onAdd={jest.fn()} onAddPlaces={onAddPlaces} />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: longText } })
    fireEvent.click(screen.getByText('送出'))
    await waitFor(() =>
      expect(onAddPlaces).toHaveBeenCalledWith([expect.objectContaining({ name: '淺草寺' })])
    )
    expect(mockExtract).toHaveBeenCalledWith(longText)
    expect(mockSearch).toHaveBeenCalledWith('淺草寺', 'Japan')
  })

  it('url text scrapes then extracts then calls onAddPlaces', async () => {
    mockScrape.mockResolvedValue('scraped blog body about Japan')
    mockExtract.mockResolvedValue({
      country: 'Japan', countryCode: 'jp',
      places: [{ name: '淺草寺', type: 'attraction' }],
    })
    mockSearch.mockResolvedValue(MOCK_PLACE)
    const onAddPlaces = jest.fn()
    render(<CombinedInput onAdd={jest.fn()} onAddPlaces={onAddPlaces} />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: 'https://blog.example.com/japan' } })
    fireEvent.click(screen.getByText('送出'))
    await waitFor(() => expect(onAddPlaces).toHaveBeenCalled())
    expect(mockScrape).toHaveBeenCalledWith('https://blog.example.com/japan')
    expect(mockExtract).toHaveBeenCalledWith('scraped blog body about Japan')
  })
})
