/** @jest-environment jsdom */
import { render, waitFor } from '@testing-library/react'
import { PlaceSearch } from '@/components/PlaceSearch'

describe('PlaceSearch localized fields', () => {
  it('adds localized fields from the selected Google Autocomplete place', async () => {
    const onAdd = jest.fn()
    let placeChanged: (() => void) | undefined
    const mockPlace = {
      place_id: 'google-place-1',
      name: '國立故宮博物院',
      formatted_address: '台北市士林區至善路二段221號',
      geometry: {
        location: {
          lat: () => 25.102,
          lng: () => 121.548,
        },
      },
    }

    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: () => 'uuid-1' },
      configurable: true,
    })
    Object.defineProperty(window, 'google', {
      value: {
        maps: {
          places: {
            Autocomplete: jest.fn().mockImplementation(() => ({
              addListener: (_event: string, callback: () => void) => {
                placeChanged = callback
              },
              getPlace: () => mockPlace,
            })),
          },
        },
      },
      configurable: true,
    })

    render(<PlaceSearch onAdd={onAdd} />)
    await waitFor(() => expect(placeChanged).not.toBeNull())

    const triggerPlaceChanged = placeChanged as () => void
    triggerPlaceChanged()

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      name: '國立故宮博物院',
      localizedName: { zhTw: '國立故宮博物院', original: '國立故宮博物院' },
      address: '台北市士林區至善路二段221號',
      localizedAddress: {
        zhTw: '台北市士林區至善路二段221號',
        original: '台北市士林區至善路二段221號',
      },
    }))
  })
})
