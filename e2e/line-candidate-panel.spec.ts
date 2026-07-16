import { test, expect } from '@playwright/test'

test.describe('LINE candidate panel', () => {
  test('renders LINE candidates as recommendation-style cards with actions', async ({ page }) => {
    await page.goto('/test-drag')

    await page.getByTestId('side-panel-tab-line').first().click()

    await expect(page.getByTestId('line-candidate-panel').first()).toBeVisible()
    await expect(page.getByTestId('line-candidate-card-line-candidate-1').first()).toBeVisible()
    await expect(page.getByTestId('rec-line-place-1').first()).toBeVisible()
    await expect(page.getByTestId('line-candidate-add-line-candidate-1').first()).toBeVisible()
    await expect(page.getByTestId('line-candidate-archive-line-candidate-1').first()).toBeVisible()
    await expect(page.getByTestId('line-candidate-delete-line-candidate-1').first()).toBeVisible()
  })
})
