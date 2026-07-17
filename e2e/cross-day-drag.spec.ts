import { test, expect } from '@playwright/test'

// Simulates @dnd-kit PointerSensor drag: pointerdown → pointermove (slow) → pointerup
async function dragTo(
  page: import('@playwright/test').Page,
  sourceSelector: string,
  targetSelector: string,
  targetPosition: { x: number; y: number } = { x: 20, y: 20 }
) {
  await page.locator(sourceSelector).dragTo(page.locator(targetSelector), {
    force: true,
    sourcePosition: { x: 5, y: 5 },
    targetPosition,
  })
}

test.describe('cross-day drag', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-drag')
    // Wait for cards to be rendered
    await expect(page.locator('[data-testid="card-p1"]')).toBeVisible()
    await expect(page.locator('[data-testid="card-p3"]')).toBeVisible()
  })

  test('drags p1 from Day 1 into Day 2', async ({ page }) => {
    // Verify initial state
    await expect(page.locator('[data-testid="day-0"]')).toContainText('九份老街')
    await expect(page.locator('[data-testid="day-1"]')).not.toContainText('九份老街')

    // Drag the handle of p1 onto Day 2's droppable area
    await dragTo(
      page,
      '[data-testid="card-p1"] [data-testid="drag-handle"]',
      '[data-testid="day-1"] [data-testid="card-p3"]'
    )

    // p1 should now appear in Day 2
    await expect(page.locator('[data-testid="day-1"]')).toContainText('九份老街')
    // p1 should no longer be in Day 1
    await expect(page.locator('[data-testid="day-0"]')).not.toContainText('九份老街')
  })

  test('drags p3 from Day 2 into Day 1', async ({ page }) => {
    await expect(page.locator('[data-testid="day-0"]')).not.toContainText('太魯閣國家公園')
    await expect(page.locator('[data-testid="day-1"]')).toContainText('太魯閣國家公園')

    await dragTo(
      page,
      '[data-testid="card-p3"] [data-testid="drag-handle"]',
      '[data-testid="day-0"] [data-testid="card-p1"]'
    )

    await expect(page.locator('[data-testid="day-0"]')).toContainText('太魯閣國家公園')
    await expect(page.locator('[data-testid="day-1"]')).not.toContainText('太魯閣國家公園')
  })

  // Playwright's synthetic pointer sequence does not currently trigger dnd-kit same-container sorting reliably.
  // Same-day reorder behavior remains covered at the dragContainers unit-test layer.
  test.fixme('within-day drag reorders cards in same day', async ({ page }) => {
    // p1 is first, p2 is second in Day 1
    const day0 = page.locator('[data-testid="day-0"]')

    await dragTo(
      page,
      '[data-testid="card-p1"] [data-testid="drag-handle"]',
      '[data-testid="card-p2"] [data-testid="drag-handle"]'
    )

    // Both cards should still be in Day 1
    await expect(day0).toContainText('九份老街')
    await expect(day0).toContainText('基隆廟口夜市')
    // Order should have changed (p2 now before p1)
    const cardTexts = await day0.locator('[data-testid^="card-"]').allTextContents()
    const p2Idx = cardTexts.findIndex(t => t.includes('基隆廟口夜市'))
    const p1Idx = cardTexts.findIndex(t => t.includes('九份老街'))
    expect(p2Idx).toBeLessThan(p1Idx)
  })
})
