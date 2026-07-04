import { test, expect } from '@playwright/test'

test.describe('Lane C 持久化', () => {
  // DEFERRED: Persistence and RLS tests require:
  // 1. A running Supabase-backed dev server (npm run dev)
  // 2. Authenticated session injection via storageState or session cookies
  //
  // To enable these tests:
  // - Set up a test account in Supabase (or use service-role admin to generate a test session)
  // - Configure Playwright to inject the session via storageState (docs: https://playwright.dev/docs/auth)
  // - Run: npm run e2e -- laneC-persistence
  //
  // Example setup in playwright.config.ts:
  // projects: [
  //   {
  //     name: 'authenticated',
  //     use: { storageState: 'auth.json' }, // Pre-authenticated session
  //   }
  // ]
  //
  // To generate auth.json:
  // - Create a small auth setup script that logs in with test credentials
  // - Or manually extract Supabase session cookies from a logged-in browser

  test.skip('儲存後重整,行程仍在', async ({ page }) => {
    // Prerequisites (must be enabled when auth injection is set up):
    // - Authenticated session (logged-in user with Supabase token)
    // - Dev server running at http://localhost:3000

    // 1. From home page, create an itinerary with ≥2 locations
    await page.goto('/')

    // Add first location
    await page.getByPlaceholder(/輸入地點|Enter location/i).fill('台北101')
    await page.getByRole('button', { name: /新增|Add/i }).click()
    await expect(page.getByText('台北101')).toBeVisible()

    // Add second location
    await page.getByPlaceholder(/輸入地點|Enter location/i).fill('九份老街')
    await page.getByRole('button', { name: /新增|Add/i }).click()
    await expect(page.getByText('九份老街')).toBeVisible()

    // 2. Click "Save itinerary" → should redirect to /itinerary/<id>
    await page.getByRole('button', { name: /儲存行程|Save itinerary/i }).click()
    await expect(page).toHaveURL(/\/itinerary\/[a-f0-9\-]{36}/)

    // Verify saved state indicator appears
    await expect(page.getByText(/已儲存|Saved/i)).toBeVisible()

    // 3. Reload page → itinerary should persist
    const currentUrl = page.url()
    await page.reload()

    // Verify both locations still appear
    await expect(page.getByText('台北101')).toBeVisible()
    await expect(page.getByText('九份老街')).toBeVisible()

    // Verify save status is still "saved"
    await expect(page.getByText(/已儲存|Saved/i)).toBeVisible()

    // Verify URL hasn't changed
    expect(page.url()).toBe(currentUrl)
  })

  test.skip('他人的 tripId 回 not found', async ({ page }) => {
    // Prerequisites:
    // - Dev server running at http://localhost:3000
    // - Supabase RLS policies properly enforced
    //
    // This test verifies Row-Level Security (RLS) by accessing an itinerary
    // with a random UUID that belongs to another user (or doesn't exist).
    // Supabase RLS should return a 404 or redirect to not-found page.

    // Attempt to access a non-existent (or non-owned) itinerary UUID
    await page.goto('/itinerary/00000000-0000-0000-0000-000000000000')

    // Should see 404 or not-found message
    await expect(
      page.getByText(/404|找不到|not found|not available/i)
    ).toBeVisible({ timeout: 5000 })
  })
})
