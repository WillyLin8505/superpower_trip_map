/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { SidePanel } from '@/components/SidePanel'

jest.mock('@/app/actions/savedPlaces', () => ({ importSavedPlaces: jest.fn() }))

const baseProps = {
  dateIso: '2026-07-18',
  onAddRecommendation: jest.fn(),
  candidates: [],
  archived: [],
  onAddReservePlace: jest.fn(),
  onAddReservePlaces: jest.fn(),
  onAddArchivedToDay: jest.fn(),
  onDeleteArchived: jest.fn(),
  onAddCandidateToDay: jest.fn(),
  onArchiveCandidate: jest.fn(),
  onDeleteCandidate: jest.fn(),
}

it('offers a 4th 地圖收藏 tab', () => {
  render(<SidePanel {...baseProps} onCollectionImported={jest.fn()} />)
  expect(screen.getByTestId('side-panel-tab-collection')).toHaveTextContent('地圖收藏')
})

it('switching to the collection tab shows the import entry point', () => {
  render(<SidePanel {...baseProps} onCollectionImported={jest.fn()} />)
  fireEvent.click(screen.getByTestId('side-panel-tab-collection'))
  expect(screen.getByTestId('collection-import')).toBeInTheDocument()
})
