import { createHmac, timingSafeEqual } from 'crypto'

export async function verifyLineSignature(
  body: string,
  signature: string | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!signature || !secret) return false

  const expected = createHmac('sha256', secret).update(body).digest('base64')
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}
