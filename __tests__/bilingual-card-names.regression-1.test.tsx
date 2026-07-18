/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { RecommendationCard } from '@/components/RecommendationCard'
import type { DayRecommendation } from '@/lib/types'
import { resolveLocalizedText } from '@/lib/utils/localizedPlace'

const recommendation: DayRecommendation = {
  id: 'hcm-opera',
  placeId: 'hcm-opera',
  name: 'Ho Chi Minh City Opera House',
  localizedName: {
    zhTw: '胡志明市歌劇院',
    en: 'Ho Chi Minh City Opera House',
    original: 'Nhà hát Thành phố Hồ Chí Minh',
  },
  type: 'attraction',
  lat: 10.7766,
  lng: 106.7032,
  address: 'Ho Chi Minh City',
  openingHours: null,
  rating: 4.6,
  photoUrl: null,
  photoUrls: [],
  description: null,
  reason: 'Fits the day route',
  sourceLabel: 'Google Places',
}

describe('bilingual card names regression', () => {
  it('uses Chinese as primary and the local-language original as secondary before English', () => {
    expect(resolveLocalizedText(recommendation.localizedName, recommendation.name)).toEqual({
      primary: '胡志明市歌劇院',
      secondary: 'Nhà hát Thành phố Hồ Chí Minh',
    })
  })

  it('renders recommendation cards with bilingual names', () => {
    render(<RecommendationCard rec={recommendation} dateIso="2026-07-13" onAdd={() => {}} />)

    expect(screen.getByText('胡志明市歌劇院')).toBeInTheDocument()
    expect(screen.getByText('Nhà hát Thành phố Hồ Chí Minh')).toBeInTheDocument()
    expect(screen.queryByText('Ho Chi Minh City Opera House')).not.toBeInTheDocument()
    expect(screen.getByLabelText('加入 胡志明市歌劇院')).toBeInTheDocument()
  })

  it('renders compact recommendation cards with bilingual names', () => {
    // Regression: compact cards are used by 推薦行程. They must not hide the
    // native-language secondary name.
    render(<RecommendationCard rec={recommendation} dateIso="2026-07-13" onAdd={() => {}} compact />)

    expect(screen.getByText('胡志明市歌劇院')).toBeInTheDocument()
    expect(screen.getByText('Nhà hát Thành phố Hồ Chí Minh')).toBeInTheDocument()
  })
})
