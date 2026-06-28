/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { PlaceList } from '@/components/PlaceList'
import type { Place } from '@/lib/types'

const PLACE: Place = {
  id: 'p1', placeId: 'g1', name: '東橫飯店', type: 'attraction',
  lat: 0, lng: 0, address: '地址', openingHours: null, rating: null,
  photoUrl: null, description: null,
}

it('lets the user change a place to accommodation via the four-option picker', () => {
  const onTypeChange = jest.fn()
  render(<PlaceList places={[PLACE]} onTypeChange={onTypeChange} onRemove={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /景點/ }))
  fireEvent.click(screen.getByText('🏨 住宿'))
  expect(onTypeChange).toHaveBeenCalledWith('p1', 'accommodation')
})
