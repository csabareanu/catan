import { expect, test, type Page } from '@playwright/test'
import standardBoard from './fixtures/standard-board.json' with { type: 'json' }

test('applies and remembers board style without regenerating or resetting the board', async ({ page }) => {
  let generationRequests = 0
  await page.route('**/api/v1/boards/generate', (route) => {
    generationRequests += 1
    return route.fulfill({ json: { data: standardBoard } })
  })
  await generatePreview(page)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const board = page.locator('.board-svg')
  const viewBox = await board.getAttribute('viewBox')
  const initialTiles = await page.locator('.board-hex').evaluateAll((tiles) =>
    tiles.map((tile) => tile.getAttribute('points')),
  )

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
  await expect(dialog.getByRole('radio', { name: 'Classic', exact: true })).toBeChecked()
  await dialog.getByRole('radio', { name: 'Illustrated', exact: true }).check()

  await expect(board).toHaveAttribute('data-board-appearance', 'illustrated')
  await expect(board).toHaveAttribute('viewBox', viewBox!)
  expect(await page.locator('.board-hex').evaluateAll((tiles) =>
    tiles.map((tile) => tile.getAttribute('points')),
  )).toEqual(initialTiles)
  expect(generationRequests).toBe(1)
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()

  await page.reload()
  await page.getByRole('button', { name: 'Generate preview' }).click()
  await expect(board).toHaveAttribute('data-board-appearance', 'illustrated')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(dialog.getByRole('radio', { name: 'Illustrated', exact: true })).toBeChecked()
  expect(generationRequests).toBe(2)
})

test('keeps the live preference usable when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage is unavailable.', 'SecurityError')
      },
    })
  })
  await mockBoard(page)
  await generatePreview(page)

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
  await expect(dialog.getByRole('radio', { name: 'Classic', exact: true })).toBeChecked()
  await dialog.getByRole('radio', { name: 'Illustrated', exact: true }).check()
  await expect(page.locator('.board-svg')).toHaveAttribute('data-board-appearance', 'illustrated')
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(dialog.getByRole('radio', { name: 'Illustrated', exact: true })).toBeChecked()
})

test('supports keyboard focus, Escape, backdrop dismissal, and returning to the settings button', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Settings', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
  await trigger.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close settings' })).toBeFocused()
  expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true)

  for (const key of ['Shift+Tab', 'Shift+Tab', 'Tab', 'Tab', 'Tab', 'Tab']) {
    await page.keyboard.press(key)
    expect(await dialog.evaluate((element) =>
      document.activeElement === document.body || element.contains(document.activeElement),
    )).toBe(true)
  }

  await dialog.getByRole('radio', { name: 'Classic', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('radio', { name: 'Illustrated', exact: true })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')

  await trigger.click()
  await dialog.getByText('Choose the look you prefer.').click()
  await expect(dialog).toBeVisible()
  await page.mouse.click(2, 2)
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await trigger.click()
  await dialog.getByRole('button', { name: 'Close settings' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`keeps settings off the map and the dialog within the window at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await mockBoard(page)
    await generatePreview(page)
    const boardViewport = page.getByRole('region', { name: 'Interactive board viewport' })
    await expect(boardViewport.getByRole('button', { name: /style|classic|illustrated/i }))
      .toHaveCount(0)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
    await expect(dialog.getByRole('radio', { name: 'Classic', exact: true })).toBeChecked()
    const bounds = await dialog.boundingBox()

    if (!bounds) {
      throw new Error('The settings dialog must have visible bounds.')
    }

    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)

    if (viewport.width <= 390) {
      expect(Math.abs(viewport.height - (bounds.y + bounds.height))).toBeLessThanOrEqual(1)
    } else {
      expect(Math.abs(bounds.y - (viewport.height - bounds.y - bounds.height))).toBeLessThanOrEqual(1)
    }

    await page.screenshot({ path: testInfo.outputPath('settings.png') })
    await dialog.getByRole('radio', { name: 'Illustrated', exact: true }).check()
    await dialog.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.locator('.board-svg')).toHaveAttribute('data-board-appearance', 'illustrated')
  })
}

async function generatePreview(page: Page): Promise<void> {
  await page.goto('/preview')
  await page.getByRole('button', { name: 'Generate preview' }).click()
  await expect(page.locator('.board-svg')).toBeVisible()
}

async function mockBoard(page: Page): Promise<void> {
  await page.route('**/api/v1/boards/generate', (route) =>
    route.fulfill({ json: { data: standardBoard } }),
  )
}
