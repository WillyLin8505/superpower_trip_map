import Anthropic from '@anthropic-ai/sdk'

export async function callClaude(prompt: string): Promise<string> {
  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('unexpected content type')
  return block.text
}
