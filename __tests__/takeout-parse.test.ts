import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTakeoutFile } from '@/lib/takeout/parse'

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8')

it('parses starred GeoJSON into entries, keeping missing coords as null', () => {
  const entries = parseTakeoutFile('Saved Places.json', fixture('takeout-saved-places.json'))
  expect(entries).toHaveLength(2)
  expect(entries[0]).toEqual({
    listName: '已加星號', source: 'takeout_starred',
    title: '度小月', note: null, lat: 22.99, lng: 120.2,
  })
  expect(entries[1]).toMatchObject({ title: '無座標景點', lat: null, lng: null })
})

it('parses a list CSV, deriving list name from filename and handling quoted commas', () => {
  const entries = parseTakeoutFile('花園美食.csv', fixture('takeout-list.csv'))
  expect(entries).toHaveLength(2)
  expect(entries[0]).toEqual({
    listName: '花園美食', source: 'takeout_list',
    title: '花園夜市', note: '週四、六、日', lat: null, lng: null,
  })
  expect(entries[1].title).toBe('永樂,燒肉')
})

it('classifies a "Labeled places" CSV as takeout_labeled', () => {
  const entries = parseTakeoutFile('Labeled places.csv', 'Title,Note,URL\n"家","","https://x"')
  expect(entries[0].source).toBe('takeout_labeled')
})

it('throws a clear error on unrecognized content', () => {
  expect(() => parseTakeoutFile('junk.txt', 'not json not csv header')).toThrow(/無法辨識/)
})
