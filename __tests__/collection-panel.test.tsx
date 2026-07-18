/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CollectionPanel } from '@/components/CollectionPanel'

const importSavedPlaces = jest.fn(async () => ({ added: 1, existing: 0, unresolved: 0 }))
jest.mock('@/app/actions/savedPlaces', () => ({ importSavedPlaces: (...a: unknown[]) => importSavedPlaces(...a) }))

function csvFile() {
  const content = 'Title,Note,URL\n"度小月","",""'
  const file = new File([content], '台南.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: async () => content })
  return file
}

it('shows an import entry point even with no collection', () => {
  render(<CollectionPanel dateIso="2026-07-18" buckets={undefined} onAdd={jest.fn()} onArchive={jest.fn()} onDelete={jest.fn()} onImported={jest.fn()} />)
  expect(screen.getByTestId('collection-import')).toBeInTheDocument()
})

it('parses an uploaded CSV, previews entries, and imports the selected ones', async () => {
  const onImported = jest.fn()
  render(<CollectionPanel dateIso="2026-07-18" buckets={undefined} onAdd={jest.fn()} onArchive={jest.fn()} onDelete={jest.fn()} onImported={onImported} />)
  fireEvent.change(screen.getByTestId('collection-file'), { target: { files: [csvFile()] } })
  expect(await screen.findByText('度小月')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('collection-do-import'))
  await waitFor(() => expect(importSavedPlaces).toHaveBeenCalledWith([
    expect.objectContaining({ listName: '台南', title: '度小月', source: 'takeout_list' }),
  ]))
  await waitFor(() => expect(onImported).toHaveBeenCalled())
})
