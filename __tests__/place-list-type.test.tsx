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

it('shows localized primary and secondary names', () => {
  render(
    <PlaceList
      places={[{
        ...PLACE,
        name: 'National Palace Museum',
        localizedName: {
          zhTw: '國立故宮博物院',
          en: 'National Palace Museum',
          original: 'National Palace Museum',
        },
      }]}
      onTypeChange={jest.fn()}
      onRemove={jest.fn()}
    />
  )

  expect(screen.getByText('國立故宮博物院')).toBeInTheDocument()
  expect(screen.getByText('National Palace Museum')).toBeInTheDocument()
})
