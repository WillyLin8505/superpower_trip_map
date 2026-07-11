import { LINE_BIND_COMMAND, LINE_UNBIND_COMMAND } from './messages'

export type LineCommand =
  | { kind: 'bind'; tripLinkOrToken: string }
  | { kind: 'unbind' }
  | { kind: 'invalid_bind' }
  | { kind: 'none' }

export function parseLineCommand(text: string): LineCommand {
  const trimmed = text.trim()

  if (trimmed === LINE_UNBIND_COMMAND) {
    return { kind: 'unbind' }
  }

  if (trimmed === LINE_BIND_COMMAND) {
    return { kind: 'invalid_bind' }
  }

  if (trimmed.startsWith(`${LINE_BIND_COMMAND} `)) {
    const tripLinkOrToken = trimmed.slice(LINE_BIND_COMMAND.length).trim()
    return tripLinkOrToken ? { kind: 'bind', tripLinkOrToken } : { kind: 'invalid_bind' }
  }

  return { kind: 'none' }
}
