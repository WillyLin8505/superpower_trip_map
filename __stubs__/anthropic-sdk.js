// Stub for @anthropic-ai/sdk — prevents TextEncoder / ESM issues in Jest
'use strict'
class Anthropic {
  messages = {
    create: async () => ({ content: [{ type: 'text', text: '' }] }),
  }
}
module.exports = Anthropic
module.exports.default = Anthropic
