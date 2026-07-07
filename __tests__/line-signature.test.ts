import { createHmac } from 'crypto'
import { verifyLineSignature } from '@/lib/line/signature'

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64')
}

it('accepts a valid LINE signature', async () => {
  const body = '{"events":[]}'
  const secret = 'line-secret'
  await expect(verifyLineSignature(body, sign(body, secret), secret)).resolves.toBe(true)
})

it('rejects an invalid LINE signature', async () => {
  await expect(verifyLineSignature('{"events":[]}', 'bad-signature', 'line-secret')).resolves.toBe(false)
})

it('rejects missing signature or secret', async () => {
  await expect(verifyLineSignature('body', null, 'line-secret')).resolves.toBe(false)
  await expect(verifyLineSignature('body', 'signature', '')).resolves.toBe(false)
})
