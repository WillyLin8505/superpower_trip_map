import 'server-only'
import crypto from 'crypto'

export function verifyLineSignature(
  body: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) {
    return false
  }

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64')
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  )
}
