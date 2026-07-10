import 'server-only'

const LINE_API = 'https://api.line.me/v2/bot'

function lineHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

export async function replyLineMessage(replyToken: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: lineHeaders(),
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })

  if (!res.ok) {
    throw new Error('LINE_REPLY_FAILED')
  }
}

export async function getLineProfile(
  groupId: string,
  userId: string,
): Promise<{ displayName: string } | null> {
  const res = await fetch(`${LINE_API}/group/${groupId}/member/${userId}`, {
    headers: lineHeaders(),
  })

  if (!res.ok) {
    return null
  }

  const data = (await res.json()) as { displayName?: string }
  return data.displayName ? { displayName: data.displayName } : null
}
