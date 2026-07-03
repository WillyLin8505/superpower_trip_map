/** @jest-environment jsdom */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TripMember } from '@/lib/types'

const getInviteLink = jest.fn()
const rotateInvite = jest.fn()
const removeMember = jest.fn()
const leaveTrip = jest.fn()
const refresh = jest.fn()
const push = jest.fn()
const writeText = jest.fn()

jest.mock('@/app/actions/members', () => ({
  getInviteLink: (...args: unknown[]) => getInviteLink(...args),
  rotateInvite: (...args: unknown[]) => rotateInvite(...args),
  removeMember: (...args: unknown[]) => removeMember(...args),
  leaveTrip: (...args: unknown[]) => leaveTrip(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
}))

import { MembersPanel } from '@/components/MembersPanel'

const members: TripMember[] = [
  { userId: 'owner-1', name: 'Owner', avatarUrl: null, role: 'owner', isSelf: true },
  { userId: 'editor-1', name: 'Editor', avatarUrl: null, role: 'editor', isSelf: false },
]

describe('MembersPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getInviteLink.mockResolvedValue({ token: 'invite-123' })
    rotateInvite.mockResolvedValue({ token: 'invite-456' })
    removeMember.mockResolvedValue(undefined)
    leaveTrip.mockResolvedValue(undefined)
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })

  it('owner can generate an invite link and sees a /join/<token> URL', async () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner />)

    fireEvent.click(screen.getByRole('button', { name: '產生邀請連結' }))

    await waitFor(() => expect(getInviteLink).toHaveBeenCalledWith('trip-1'))
    expect(screen.getByDisplayValue('http://localhost/join/invite-123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '複製連結' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新產生連結' })).toBeInTheDocument()
  })

  it('owner sees the member list and a single 蝘駁 button for non-self editor members', () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner />)

    expect(screen.getByRole('heading', { name: '成員' })).toBeInTheDocument()
    expect(screen.getByText('Owner（擁有者）（你）')).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '移除' })).toHaveLength(1)
  })

  it('複製連結 copies the generated invite URL to the clipboard', async () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner />)

    fireEvent.click(screen.getByRole('button', { name: '產生邀請連結' }))
    await screen.findByDisplayValue('http://localhost/join/invite-123')

    fireEvent.click(screen.getByRole('button', { name: '複製連結' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost/join/invite-123'))
  })

  it('重新產生連結 rotates the invite token and updates the visible URL', async () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner />)

    fireEvent.click(screen.getByRole('button', { name: '產生邀請連結' }))
    await screen.findByDisplayValue('http://localhost/join/invite-123')

    fireEvent.click(screen.getByRole('button', { name: '重新產生連結' }))

    await waitFor(() => expect(rotateInvite).toHaveBeenCalledWith('trip-1'))
    expect(screen.getByDisplayValue('http://localhost/join/invite-456')).toBeInTheDocument()
  })

  it('non-owner member sees 離開行程 and no invite controls', () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner={false} />)

    expect(screen.getByRole('button', { name: '離開行程' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '產生邀請連結' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '複製連結' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新產生連結' })).not.toBeInTheDocument()
  })

  it('移除 calls removeMember(tripId, userId) and router.refresh()', async () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner />)

    fireEvent.click(screen.getByRole('button', { name: '移除' }))

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('trip-1', 'editor-1'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('離開行程 calls leaveTrip(tripId) and router.push(/trips)', async () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner={false} />)

    fireEvent.click(screen.getByRole('button', { name: '離開行程' }))

    await waitFor(() => expect(leaveTrip).toHaveBeenCalledWith('trip-1'))
    expect(push).toHaveBeenCalledWith('/trips')
  })
})
