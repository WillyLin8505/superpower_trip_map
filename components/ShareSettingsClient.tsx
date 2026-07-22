'use client'

import { useEffect, useMemo, useState } from 'react'
import type { TripLinkAccess } from '@/lib/types'
import {
  addTripEmailPermission,
  removeTripEmailPermission,
  rotateShareLink,
  setTripLinkAccess,
  updateTripEmailPermission,
  type TripShareSettings,
} from '@/app/actions/share'

type EmailRole = 'viewer' | 'editor'

const LINK_OPTIONS: { value: TripLinkAccess; label: string; description: string }[] = [
  { value: 'restricted', label: '限制存取', description: '只有成員與指定信箱登入後可以開啟。' },
  { value: 'view', label: '知道連結的人可觀看', description: '任何拿到分享連結的人都能唯讀查看。' },
  { value: 'edit', label: '知道連結的人可編輯', description: '任何拿到分享連結的人都能修改行程本體。' },
]

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '設定更新失敗，請稍後再試'
}

export function ShareSettingsClient({ initialSettings }: { initialSettings: TripShareSettings }) {
  const [settings, setSettings] = useState(initialSettings)
  const [origin, setOrigin] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<EmailRole>('viewer')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const privateUrl = useMemo(
    () => origin ? `${origin}/itinerary/${settings.tripId}` : `/itinerary/${settings.tripId}`,
    [origin, settings.tripId],
  )
  const shareUrl = useMemo(
    () => origin ? `${origin}/share/${settings.shareToken}` : `/share/${settings.shareToken}`,
    [origin, settings.shareToken],
  )

  async function run(action: () => Promise<TripShareSettings>, message: string) {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const next = await action()
      setSettings(next)
      setStatus(message)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function copy(value: string, message: string) {
    await navigator.clipboard.writeText(value)
    setStatus(message)
  }

  async function addEmailPermission() {
    const target = email.trim()
    if (!target) return
    await run(() => addTripEmailPermission(settings.tripId, target, role), '已更新指定信箱權限')
    setEmail('')
    setRole('viewer')
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ink">分享設定</h1>
        <p className="text-sm text-muted">設定「{settings.title}」目前網址的觀看與編輯權限。</p>
      </div>

      {status && <p className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{status}</p>}
      {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mt-5 grid gap-4">
        <div className="rounded-lg border border-border p-3">
          <h2 className="font-medium text-ink">連結權限</h2>
          <div className="mt-3 grid gap-2">
            {LINK_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-paper">
                <input
                  type="radio"
                  name="linkAccess"
                  value={option.value}
                  checked={settings.linkAccess === option.value}
                  disabled={busy}
                  onChange={() => {
                    void run(() => setTripLinkAccess(settings.tripId, option.value), '已更新連結權限')
                  }}
                  className="mt-1"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-ink">{option.label}</span>
                  <span className="text-xs text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-medium text-ink">公開分享連結</h2>
              <p className="text-xs text-muted">只有在連結權限是「可觀看」或「可編輯」時有效。</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => rotateShareLink(settings.tripId), '已重新產生分享連結')}
              className="rounded-md border border-border px-3 py-1 text-sm hover:bg-paper disabled:opacity-50"
            >
              重新產生
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm" />
            <button
              type="button"
              onClick={() => void copy(shareUrl, '已複製公開分享連結')}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-paper"
            >
              複製連結
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <h2 className="font-medium text-ink">指定信箱</h2>
          <p className="mt-1 text-xs text-muted">指定信箱需登入後使用目前行程網址開啟。</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as EmailRole)}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="viewer">只可觀看</option>
              <option value="editor">可編輯</option>
            </select>
            <button
              type="button"
              disabled={busy || !email.trim()}
              onClick={() => void addEmailPermission()}
              className="rounded-md border border-clay px-3 py-2 text-sm text-clay-deep hover:bg-clay-tint disabled:opacity-50"
            >
              加入
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={privateUrl} className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm" />
            <button
              type="button"
              onClick={() => void copy(privateUrl, '已複製指定信箱使用的網址')}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-paper"
            >
              複製目前網址
            </button>
          </div>

          {settings.emailPermissions.length === 0 ? (
            <p className="mt-4 text-sm text-muted">尚未指定任何信箱。</p>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
              {settings.emailPermissions.map((permission) => (
                <li key={permission.email} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="break-all text-sm text-ink">{permission.email}</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={permission.role}
                      disabled={busy}
                      onChange={(event) => {
                        void run(
                          () => updateTripEmailPermission(settings.tripId, permission.email, event.target.value as EmailRole),
                          '已更新指定信箱權限',
                        )
                      }}
                      className="rounded-md border border-border px-2 py-1 text-sm"
                    >
                      <option value="viewer">只可觀看</option>
                      <option value="editor">可編輯</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void run(() => removeTripEmailPermission(settings.tripId, permission.email), '已移除指定信箱')
                      }}
                      className="text-sm text-red-600 hover:underline disabled:opacity-50"
                    >
                      移除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
