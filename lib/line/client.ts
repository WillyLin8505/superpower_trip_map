import 'server-only'

const LINE_API = 'https://api.line.me/v2/bot'

export async function replyLineMessage(replyToken: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN_MISSING')

  const res = await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })

  if (!res.ok) throw new Error('LINE_REPLY_FAILED')
}

export async function getLineProfile(
  groupId: string,
  userId: string,
): Promise<{ displayName: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return null

  const res = await fetch(`${LINE_API}/group/${groupId}/member/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null

  const data = await res.json() as { displayName?: string }
  return data.displayName ? { displayName: data.displayName } : null
}
