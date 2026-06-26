/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Place } from '@/lib/types'

jest.mock('@/app/actions/ai', () => ({
  extractItinerary: jest.fn(),
}))
jest.mock('@/app/actions/places', () => ({
  searchPlace: jest.fn(),
}))

import { ItineraryPasteInput } from '@/components/ItineraryPasteInput'
import { extractItinerary } from '@/app/actions/ai'
import { searchPlace } from '@/app/actions/places'

const mockExtract = extractItinerary as jest.Mock
const mockSearch = searchPlace as jest.Mock

const MOCK_PLACE: Place = {
  id: 'uuid-1',
  placeId: 'place-abc',
  name: '淺草寺',
  type: 'attraction',
  lat: 35.71,
  lng: 139.79,
  address: '東京',
  openingHours: null,
  rating: null,
  photoUrl: null,
  description: null,
}

describe('ItineraryPasteInput', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls onPlacesFound with verified places when country is detected', async () => {
    mockExtract.mockResolvedValue({
      country: 'Japan',
      countryCode: 'jp',
      places: [{ name: '淺草寺', type: 'attraction' }],
    })
    mockSearch.mockResolvedValue(MOCK_PLACE)

    const onPlacesFound = jest.fn()
    render(<ItineraryPasteInput onPlacesFound={onPlacesFound} />)

    fireEvent.change(screen.getByPlaceholderText(/貼上旅遊/), {
      target: { value: '去東京旅遊' },
    })
    fireEvent.click(screen.getByText('分析行程'))

    await waitFor(() => {
      expect(onPlacesFound).toHaveBeenCalledWith([
        expect.objectContaining({ name: '淺草寺', type: 'attraction' }),
      ])
    })
    expect(mockSearch).toHaveBeenCalledWith('淺草寺', 'Japan')
  })

  it('shows country selector when country cannot be detected', async () => {
    mockExtract.mockResolvedValue({
      country: null,
      countryCode: null,
      places: [{ name: '某地方', type: 'attraction' }],
    })

    render(<ItineraryPasteInput onPlacesFound={jest.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/貼上旅遊/), {
      target: { value: '隨便一段文字' },
    })
    fireEvent.click(screen.getByText('分析行程'))

    await waitFor(() => {
      expect(screen.getByText('無法自動判斷國家，請選擇行程所在地：')).toBeInTheDocument()
    })
  })

  it('filters out places that Google cannot verify', async () => {
    mockExtract.mockResolvedValue({
      country: 'Taiwan',
      countryCode: 'tw',
      places: [
        { name: '九份老街', type: 'attraction' },
        { name: '不存在的地方', type: 'attraction' },
      ],
    })
    mockSearch
      .mockResolvedValueOnce({ ...MOCK_PLACE, name: '九份老街' })
      .mockResolvedValueOnce(null)

    const onPlacesFound = jest.fn()
    render(<ItineraryPasteInput onPlacesFound={onPlacesFound} />)

    fireEvent.change(screen.getByPlaceholderText(/貼上旅遊/), {
      target: { value: '台灣行程文字' },
    })
    fireEvent.click(screen.getByText('分析行程'))

    await waitFor(() => {
      expect(onPlacesFound).toHaveBeenCalledWith([
        expect.objectContaining({ name: '九份老街' }),
      ])
    })
    expect(onPlacesFound.mock.calls[0][0]).toHaveLength(1)
  })
})
