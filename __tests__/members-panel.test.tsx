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
    getInviteLink.mockResolvedValue({ token: 'invite-123', code: '123456' })
    rotateInvite.mockResolvedValue({ token: 'invite-456', code: '654321' })
    removeMember.mockResolvedValue(undefined)
    leaveTrip.mockResolvedValue(undefined)
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })

  it('owner can generate an invite link and sees a six-digit LINE share code', async () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner />)

    fireEvent.click(screen.getByRole('button', { name: '產生 LINE 分享碼' }))

    await waitFor(() => expect(getInviteLink).toHaveBeenCalledWith('trip-1'))
    expect(screen.getByText('123456')).toBeInTheDocument()
    expect(screen.getByText('LINE 群組輸入：/綁定 123456')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://localhost/join/invite-123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '複製分享碼' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '複製 LINE 綁定指令' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '複製邀請連結' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新產生分享碼' })).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: '產生 LINE 分享碼' }))
    await screen.findByDisplayValue('http://localhost/join/invite-123')

    fireEvent.click(screen.getByRole('button', { name: '複製邀請連結' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost/join/invite-123'))
  })

  it('複製分享碼 copies only the six-digit code', async () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner />)

    fireEvent.click(screen.getByRole('button', { name: '產生 LINE 分享碼' }))
    await screen.findByText('123456')

    fireEvent.click(screen.getByRole('button', { name: '複製分享碼' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('123456'))
  })

  it('複製 LINE 綁定指令 copies the bind command', async () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner />)

    fireEvent.click(screen.getByRole('button', { name: '產生 LINE 分享碼' }))
    await screen.findByText('123456')

    fireEvent.click(screen.getByRole('button', { name: '複製 LINE 綁定指令' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('/綁定 123456'))
  })

  it('重新產生分享碼 rotates the invite token and code', async () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner />)

    fireEvent.click(screen.getByRole('button', { name: '產生 LINE 分享碼' }))
    await screen.findByDisplayValue('http://localhost/join/invite-123')

    fireEvent.click(screen.getByRole('button', { name: '重新產生分享碼' }))

    await waitFor(() => expect(rotateInvite).toHaveBeenCalledWith('trip-1'))
    expect(screen.getByText('654321')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://localhost/join/invite-456')).toBeInTheDocument()
  })

  it('non-owner member sees 離開行程 and no invite controls', () => {
    render(<MembersPanel tripId="trip-1" members={members} isOwner={false} />)

    expect(screen.getByRole('button', { name: '離開行程' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '產生 LINE 分享碼' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '複製分享碼' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新產生分享碼' })).not.toBeInTheDocument()
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
