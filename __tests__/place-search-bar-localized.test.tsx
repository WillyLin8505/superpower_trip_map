/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Place } from '@/lib/types'

jest.mock('@/app/actions/places', () => ({ searchPlace: jest.fn() }))

import { searchPlace } from '@/app/actions/places'
import { PlaceSearchBar } from '@/components/PlaceSearchBar'

const mockSearch = searchPlace as jest.Mock

const LOCALIZED_PLACE: Place = {
  id: 'uuid-1',
  placeId: 'place-1',
  name: 'National Palace Museum',
  localizedName: {
    zhTw: '國立故宮博物院',
    en: 'National Palace Museum',
    original: 'National Palace Museum',
  },
  type: 'attraction',
  lat: 25.102,
  lng: 121.548,
  address: 'No. 221, Sec. 2, Zhishan Rd.',
  localizedAddress: {
    zhTw: '台北市士林區至善路二段221號',
    en: 'No. 221, Sec. 2, Zhishan Rd.',
    original: 'No. 221, Sec. 2, Zhishan Rd.',
  },
  openingHours: null,
  rating: null,
  photoUrl: null,
  description: null,
}

test('PlaceSearchBar shows localized result name and address', async () => {
  mockSearch.mockResolvedValue(LOCALIZED_PLACE)

  render(<PlaceSearchBar onAdd={jest.fn()} />)
  fireEvent.change(screen.getByPlaceholderText(/搜尋景點/), { target: { value: '故宮' } })
  fireEvent.click(screen.getByText(/搜尋/))

  await waitFor(() => expect(screen.getByText('國立故宮博物院')).toBeInTheDocument())
  expect(screen.getByText('National Palace Museum')).toBeInTheDocument()
  expect(screen.getByText('台北市士林區至善路二段221號')).toBeInTheDocument()
})
