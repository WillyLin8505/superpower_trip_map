/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import { RecommendationCard } from '@/components/RecommendationCard'
import { CandidatePanel } from '@/components/CandidatePanel'
import type { ScheduledPlace, DayRecommendation, Candidate } from '@/lib/types'

function scheduledPlace(): ScheduledPlace {
  return {
    id: 'sp1', placeId: 'gp1', name: '某景點', type: 'attraction', lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
  }
}

function recommendation(): DayRecommendation {
  return {
    id: 'r1', placeId: 'gp2', name: '推薦景點', type: 'dessert', lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    reason: '好吃', sourceLabel: 'Google 推薦',
  }
}

function candidate(): Candidate {
  return {
    id: 'c1',
    place: {
      id: 'cp1', placeId: 'gp3', name: '候選景點', type: 'attraction', lat: 25, lng: 121, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null,
    },
    addedBy: 'user-1', addedByName: '小美',
  }
}

describe('ItineraryCard archive button', () => {
  it('renders an archive button and calls onArchive with the place when clicked', () => {
    const onArchive = jest.fn()
    render(<ItineraryCard place={scheduledPlace()} index={0} dateIso="2026-07-01" onArchive={onArchive} />)
    fireEvent.click(screen.getByLabelText('移到備用'))
    expect(onArchive).toHaveBeenCalledWith(scheduledPlace())
  })

  it('does not render an archive button when onArchive is not provided', () => {
    render(<ItineraryCard place={scheduledPlace()} index={0} dateIso="2026-07-01" />)
    expect(screen.queryByLabelText('移到備用')).not.toBeInTheDocument()
  })
})

describe('RecommendationCard archive button', () => {
  it('renders an archive button and calls onArchive with the recommendation when clicked', () => {
    const onArchive = jest.fn()
    render(<RecommendationCard rec={recommendation()} dateIso="2026-07-01" onAdd={() => {}} onArchive={onArchive} />)
    fireEvent.click(screen.getByLabelText('移到備用'))
    expect(onArchive).toHaveBeenCalledWith(recommendation())
  })
})

describe('CandidatePanel archive button', () => {
  it('renders an archive entry per candidate and calls onArchive with the candidate id', () => {
    const onArchive = jest.fn()
    render(
      <CandidatePanel
        candidates={[candidate()]}
        onAddPlace={() => {}}
        onAddPlaces={() => {}}
        onRemove={() => {}}
        onArchive={onArchive}
        dateIso="2026-07-01"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '移到備用' }))
    expect(onArchive).toHaveBeenCalledWith('c1')
  })
})
