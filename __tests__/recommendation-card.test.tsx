/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecommendationCard } from '@/components/RecommendationCard'
import type { DayRecommendation } from '@/lib/types'

const realFetch = global.fetch

afterEach(() => {
  global.fetch = realFetch
  jest.restoreAllMocks()
})

const rec: DayRecommendation = {
  id: 'p1',
  placeId: 'p1',
  name: 'Museum Cafe',
  type: 'attraction',
  lat: 25,
  lng: 121,
  address: 'Taipei',
  openingHours: [
    'Monday: 9:00 AM – 6:00 PM',
    'Tuesday: 9:00 AM – 6:00 PM',
    'Wednesday: 9:00 AM – 6:00 PM',
    'Thursday: 9:00 AM – 6:00 PM',
    'Friday: 9:00 AM – 6:00 PM',
    'Saturday: 9:00 AM – 6:00 PM',
    'Sunday: 9:00 AM – 6:00 PM',
  ],
  rating: 4.7,
  photoUrl: '/api/photo?ref=one',
  photoUrls: ['/api/photo?ref=one', '/api/photo?ref=two'],
  description: 'A scenic museum cafe.',
  reason: 'Good stop nearby.',
  sourceLabel: 'Google',
}

it('renders the full card when not compact', () => {
  render(<RecommendationCard rec={rec} dateIso="2026-07-01" onAdd={() => {}} />)

  expect(screen.getByText('Museum Cafe')).toBeInTheDocument()
  expect(screen.queryByText(/評分/)).not.toBeInTheDocument()
  expect(screen.queryByText(/4.7/)).not.toBeInTheDocument()
  expect(screen.getByText('A scenic museum cafe.')).toBeInTheDocument()
  expect(screen.getByText('Good stop nearby.')).toBeInTheDocument()
  expect(screen.getByText(/Google/)).toBeInTheDocument()
})

it('renders name, category, available thumbnails, and a short explanation in compact mode', () => {
  render(<RecommendationCard rec={rec} dateIso="2026-07-01" onAdd={() => {}} compact />)

  expect(screen.getByText('Museum Cafe')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '載入照片' }))
  expect(screen.getByTestId('photo-thumb-0')).toBeInTheDocument()
  expect(screen.queryByTestId('photo-thumb-1')).not.toBeInTheDocument()
  expect(screen.queryByText(/4.7/)).not.toBeInTheDocument()
  expect(screen.getByText('A scenic museum cafe.')).toBeInTheDocument()
  expect(screen.queryByText('Good stop nearby.')).not.toBeInTheDocument()
  expect(screen.queryByText(/Google/)).not.toBeInTheDocument()
})

it('fetches a free cover photo for Open POI recommendations without stored photos', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ photoUrls: ['https://images.example/museum-cafe.jpg'] }),
  }) as unknown as typeof fetch

  render(
    <RecommendationCard
      rec={{
        ...rec,
        placeId: 'osm:node/1308439468',
        name: 'MVTTS 咖啡',
        localizedName: { zhTw: 'MVTTS 咖啡', original: 'Cà Phê MVTTS' },
        type: 'dessert',
        photoUrl: null,
        photoUrls: [],
        sourceLabel: 'Open POI',
      }}
      dateIso="2026-07-01"
      onAdd={() => {}}
      compact
    />
  )

  expect(await screen.findByTestId('photo-thumb-0')).toBeInTheDocument()
  const [requestUrl] = (global.fetch as jest.Mock).mock.calls[0]
  const params = new URL(String(requestUrl), 'http://localhost').searchParams
  expect(params.get('placeId')).toBe('osm:node/1308439468')
  expect(params.get('placeName')).toBe('MVTTS 咖啡')
  expect(params.get('placeType')).toBe('dessert')
  expect(params.getAll('alias')).toContain('Cà Phê MVTTS')
  expect(params.get('limit')).toBe('1')
})

it('renders a visual cover fallback when compact recommendation data has no fetchable photo source', () => {
  render(
    <RecommendationCard
      rec={{ ...rec, placeId: 'local-1', photoUrl: null, photoUrls: [], sourceLabel: 'Open POI' }}
      dateIso="2026-07-01"
      onAdd={() => {}}
      compact
    />
  )

  expect(screen.getByTestId('rec-photo-fallback')).toHaveAccessibleName('Museum Cafe 封面')
  expect(screen.getByTestId('rec-photo-fallback')).toHaveTextContent('暫無照片')
})

it('calls onAdd when the arrow button is clicked', () => {
  const onAdd = jest.fn()
  render(<RecommendationCard rec={rec} dateIso="2026-07-01" onAdd={onAdd} />)
  fireEvent.click(screen.getByTestId('rec-add-p1'))
  expect(onAdd).toHaveBeenCalledTimes(1)
})

it('allows reused recommendation cards to keep the same action icons with contextual test ids', () => {
  const onAdd = jest.fn()
  const onArchive = jest.fn()
  render(
    <RecommendationCard
      rec={rec}
      dateIso="2026-07-01"
      onAdd={onAdd}
      onArchive={onArchive}
      actionTestIds={{ add: 'line-candidate-add-c1', archive: 'line-candidate-archive-c1' }}
    />
  )

  expect(screen.getByTestId('line-candidate-add-c1')).toHaveTextContent('←')
  expect(screen.getByTestId('line-candidate-add-c1')).toHaveClass('w-7', 'h-7', 'rounded-full', 'bg-clay')
  expect(screen.getByTestId('line-candidate-archive-c1')).toHaveTextContent('💾')
  expect(screen.getByTestId('line-candidate-archive-c1')).toHaveClass('w-8', 'h-8', 'rounded-full', 'bg-clay')
})

it('renders a top-right delete x when a recommendation card can be deleted', () => {
  const onDelete = jest.fn()
  render(
    <RecommendationCard
      rec={rec}
      dateIso="2026-07-01"
      onAdd={() => {}}
      onDelete={onDelete}
      actionTestIds={{ delete: 'rec-delete-p1' }}
    />
  )

  const deleteButton = screen.getByTestId('rec-delete-p1')
  expect(deleteButton).toHaveTextContent('×')
  expect(deleteButton).toHaveClass('absolute', 'right-2', 'top-2')
  fireEvent.click(deleteButton)
  expect(onDelete).toHaveBeenCalledTimes(1)
})

it('renders long place names as clickable links that can wrap inside the card', () => {
  const longName = 'ThisIsAnExtremelyLongPlaceNameWithoutSpacesThatShouldNeverOverflowTheRecommendationCardFrame'
  render(<RecommendationCard rec={{ ...rec, name: longName }} dateIso="2026-07-01" onAdd={() => {}} />)

  const link = screen.getByRole('link', { name: longName })
  expect(link).toHaveAttribute('href', expect.stringContaining('https://www.google.com/maps/search/'))
  expect(link).toHaveAttribute('target', '_blank')
  expect(link.className).toContain('[overflow-wrap:anywhere]')
  expect(link).toHaveClass('break-words')
  expect(link.closest('h4')).toHaveClass('min-w-0')
})
