'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getInviteLink, leaveTrip, removeMember, rotateInvite } from '@/app/actions/members'
import type { TripMember } from '@/lib/types'

interface MembersPanelProps {
  tripId: string
  members: TripMember[]
  isOwner: boolean
}

export function MembersPanel({ tripId, members, isOwner }: MembersPanelProps) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inviteUrl =
    token && typeof window !== 'undefined' ? `${window.location.origin}/join/${token}` : ''

  async function handleGenerate() {
    setBusy(true)
    try {
      const nextInvite = await getInviteLink(tripId)
      setToken(nextInvite.token)
    } finally {
      setBusy(false)
    }
  }

  async function handleRotate() {
    setBusy(true)
    try {
      const nextInvite = await rotateInvite(tripId)
      setToken(nextInvite.token)
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
  }

  async function handleRemove(userId: string) {
    setBusy(true)
    try {
      await removeMember(tripId, userId)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave() {
    setBusy(true)
    try {
      await leaveTrip(tripId)
      router.push('/trips')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-border p-4 bg-surface">
      <div className="flex flex-col gap-3">
        <h2 className="font-medium text-ink">成員</h2>

        {isOwner ? (
          <div className="flex flex-col gap-2">
            {token ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  readOnly
                  value={inviteUrl}
                  className="flex-1 rounded border border-border px-2 py-1 text-sm text-ink"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={busy}
                    className="rounded-md border border-border px-3 py-1 text-sm hover:bg-paper"
                  >
                    複製連結
                  </button>
                  <button
                    type="button"
                    onClick={handleRotate}
                    disabled={busy}
                    className="text-sm text-clay hover:underline"
                  >
                    重新產生連結
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={busy}
                className="self-start rounded-md border border-border px-3 py-1 text-sm hover:bg-paper"
              >
                產生邀請連結
              </button>
            )}
          </div>
        ) : null}

        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 text-sm text-ink">
              <span>
                {member.name}
                {member.role === 'owner' ? '（擁有者）' : ''}
                {member.isSelf ? '（你）' : ''}
              </span>
              {isOwner && !member.isSelf && member.role !== 'owner' ? (
                <button
                  type="button"
                  onClick={() => handleRemove(member.userId)}
                  disabled={busy}
                  className="text-error hover:underline"
                >
                  移除
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {!isOwner ? (
          <button
            type="button"
            onClick={handleLeave}
            disabled={busy}
            className="self-start text-error hover:underline"
          >
            離開行程
          </button>
        ) : null}
      </div>
    </section>
  )
}
