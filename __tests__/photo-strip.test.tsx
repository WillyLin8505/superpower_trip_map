/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { PhotoStrip } from '@/components/PhotoStrip'

describe('PhotoStrip', () => {
  it('opens the selected photo in a lightbox and closes with Escape', () => {
    render(
      <PhotoStrip
        placeName="Avoccino"
        photos={['/api/photo?ref=one', '/api/photo?ref=two']}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '檢視 Avoccino 照片 2' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByAltText('Avoccino 照片 2')).toHaveAttribute('src', '/api/photo?ref=two')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('navigates between photos in the lightbox', () => {
    render(
      <PhotoStrip
        placeName="Avoccino"
        photos={['/api/photo?ref=one', '/api/photo?ref=two']}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '檢視 Avoccino 照片 1' }))
    fireEvent.click(screen.getByRole('button', { name: '下一張照片' }))

    expect(screen.getByAltText('Avoccino 照片 2')).toHaveAttribute('src', '/api/photo?ref=two')
  })
})
