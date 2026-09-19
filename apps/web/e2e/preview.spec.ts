import { expect, test } from '@playwright/test'

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const

for (const viewport of VIEWPORTS) {
  test(`shows the truthful board preview shell at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/')

    await expect(page).toHaveTitle('Catan · Seeded Board Preview')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const seed = page.getByLabel('Board seed')
    await expect(seed).toHaveValue('894177203164')
    await seed.fill('42')
    await expect(seed).toHaveValue('42')

    await expect(page.getByRole('button', { name: 'Generate preview' })).toBeEnabled()
    await expect(page.getByText('No board data yet', { exact: true })).toBeVisible()
    await expect(page.getByText('base@1.0.0', { exact: true })).toBeVisible()
    await expect(page.getByText('standard@1.0.0', { exact: true })).toBeVisible()

    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(pageWidth).toBeLessThanOrEqual(viewportWidth)
  })
}

test('submits the seed to Laravel and displays canonical board metadata', async ({ page }) => {
  const submittedSeeds: string[] = []

  await page.route('**/api/v1/boards/generate', async (route) => {
    submittedSeeds.push(route.request().postDataJSON().seed)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(boardResponse('42')),
    })
  })

  await page.goto('/')
  await page.getByLabel('Board seed').fill('42')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  await expect(page.getByRole('heading', { name: 'Board ready to render.' })).toBeVisible()
  await expect(page.getByText(/Seed 42 produced a standard map with/)).toBeVisible()
  await expect(page.getByText('Canonical response received')).toBeVisible()

  await page.getByRole('button', { name: 'Generate preview' }).click()
  await expect(page.getByText(/Seed 42 produced a standard map with/)).toBeVisible()
  expect(submittedSeeds).toEqual(['42', '42'])
})

test('shows a rejected Laravel response without a blank screen', async ({ page }) => {
  await page.route('**/api/v1/boards/generate', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'validation_failed',
          message: 'The board generation request is invalid.',
          fields: { seed: ['The seed must be a canonical non-negative integer string.'] },
        },
      }),
    })
  })

  await page.goto('/')
  await page.getByLabel('Board seed').fill('01')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  await expect(page.getByRole('alert')).toContainText(
    'The board generation request is invalid.',
  )
  await expect(page.getByRole('heading', { name: 'Check your seed.' })).toBeVisible()
  await expect(page.getByText('Update the seed and try again', { exact: true })).toBeVisible()
})

test('shows an unavailable Laravel response with a recovery message', async ({ page }) => {
  await page.route('**/api/v1/boards/generate', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'game_engine_unavailable',
          message: 'The board generation service is unavailable.',
        },
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  await expect(page.getByRole('alert')).toContainText(
    'The board generation service is unavailable.',
  )
  await expect(page.getByText('Try the request again', { exact: true })).toBeVisible()
})

function boardResponse(seed: string) {
  return {
    data: {
      board_schema_version: '1',
      seed,
      ruleset: { key: 'base', version: '1.0.0' },
      map: { key: 'standard', version: '1.0.0', orientation: 'pointy' },
      hexes: [],
      vertices: [],
      edges: [],
      ports: [],
    },
  }
}
