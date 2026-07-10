jest.mock('dns/promises', () => ({ lookup: jest.fn() }))

function loadScrape() {
  return require('@/app/actions/scrape') as typeof import('@/app/actions/scrape')
}

describe('scrapeText URL safety', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<html><body>safe article</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('rejects localhost and private literal IP URLs before fetch', async () => {
    const { scrapeText } = loadScrape()

    await expect(scrapeText('https://127.0.0.1/admin')).resolves.toBeNull()
    await expect(scrapeText('https://10.0.0.5/admin')).resolves.toBeNull()
    await expect(scrapeText('https://192.168.1.20/admin')).resolves.toBeNull()
    await expect(scrapeText('https://localhost/admin')).resolves.toBeNull()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rejects metadata service URLs before fetch', async () => {
    const { scrapeText } = loadScrape()

    await expect(scrapeText('https://169.254.169.254/latest/meta-data')).resolves.toBeNull()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rejects hosts that resolve to private IPs', async () => {
    const { lookup } = require('dns/promises') as { lookup: jest.Mock }
    lookup.mockResolvedValue([{ address: '172.16.0.10', family: 4 }])
    const { scrapeText } = loadScrape()

    await expect(scrapeText('https://article.example/post')).resolves.toBeNull()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rejects redirects to private IPs', async () => {
    const { lookup } = require('dns/promises') as { lookup: jest.Mock }
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://127.0.0.1/admin' },
      }),
    )
    const { scrapeText } = loadScrape()

    await expect(scrapeText('https://article.example/post')).resolves.toBeNull()

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
