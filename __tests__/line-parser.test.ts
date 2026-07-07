import { parseLineText } from '@/lib/line/parser'

it('parses bind command with a trip link', () => {
  expect(parseLineText('/蝬? https://example.com/join/token-1')).toEqual({
    kind: 'bind',
    tripLinkOrToken: 'https://example.com/join/token-1',
  })
})

it('parses unbind command', () => {
  expect(parseLineText('/閫?蝬?')).toEqual({ kind: 'unbind' })
})

it('classifies Google Maps URLs', () => {
  expect(parseLineText('??雿?https://maps.app.goo.gl/abc')).toEqual({
    kind: 'google_maps_url',
    url: 'https://maps.app.goo.gl/abc',
  })

  expect(parseLineText('https://maps.google.com/?q=Taipei%20101')).toEqual({
    kind: 'google_maps_url',
    url: 'https://maps.google.com/?q=Taipei%20101',
  })
})

it('classifies general article URLs', () => {
  expect(parseLineText('https://travel.example.com/taipei')).toEqual({
    kind: 'article_url',
    url: 'https://travel.example.com/taipei',
  })
})

it('classifies place text and ignores very short text', () => {
  expect(parseLineText('銋遢??')).toEqual({ kind: 'place_text', query: '銋遢??' })
  expect(parseLineText('ok')).toEqual({ kind: 'ignored' })
})

it('returns malformed bind when command has no target', () => {
  expect(parseLineText('/蝬?')).toEqual({ kind: 'malformed_bind' })
})
