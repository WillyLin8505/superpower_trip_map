jest.mock('@anthropic-ai/sdk')

import { callClaude } from '@/lib/claude'
import Anthropic from '@anthropic-ai/sdk'

const mockedAnthropicConstructor = Anthropic as jest.MockedClass<typeof Anthropic>

describe('callClaude', () => {
  let mockCreate: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'mock response' }],
    })
    mockedAnthropicConstructor.mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    }) as any)
  })

  it('returns text content from the API response', async () => {
    const result = await callClaude('hello')
    expect(result).toBe('mock response')
  })

  it('calls the API with the correct model', async () => {
    await callClaude('test prompt')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    )
  })

  it('passes the prompt as a user message', async () => {
    await callClaude('my prompt')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'my prompt' }],
      })
    )
  })

  it('throws if the API returns a non-text content block', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'x', name: 'x', input: {} }],
    })
    await expect(callClaude('x')).rejects.toThrow('unexpected content type')
  })
})
