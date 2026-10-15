import { expect, test, type Page } from '@playwright/test'

const user = {
  id: 7,
  name: 'Ada Player',
  email: 'ada@example.test',
  created_at: '2026-10-15T09:00:00.000000Z',
}

const gameSummaries = [
  {
    id: 42,
    owner_id: user.id,
    mode: 'human_vs_ai',
    seed: '894177203164',
    ruleset: { key: 'base', version: '1.0.0' },
    map: { key: 'standard', version: '1.0.0', orientation: 'pointy_top' },
    seat_count: 3,
    human_seat_number: 1,
    lifecycle_status: 'created',
    configuration: { ai_count: 2 },
    created_at: '2026-10-15T09:00:00.000000Z',
    updated_at: '2026-10-15T09:00:00.000000Z',
  },
  {
    id: 43,
    owner_id: user.id,
    mode: 'human_vs_ai',
    seed: '42',
    ruleset: { key: 'base', version: '1.0.0' },
    map: { key: 'standard', version: '1.0.0', orientation: 'pointy_top' },
    seat_count: 4,
    human_seat_number: 1,
    lifecycle_status: 'running',
    configuration: { ai_count: 3 },
    created_at: '2026-10-14T09:00:00.000000Z',
    updated_at: '2026-10-15T09:00:00.000000Z',
  },
]

test('renders owner game summaries and lifecycle statuses', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: gameSummaries, links: {}, meta: {} }),
    })
  })

  await page.goto('/games')

  await expect(page.getByRole('heading', { name: 'Your games.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Human vs AI' })).toHaveCount(2)
  await expect(page.getByText('Game 42')).toBeVisible()
  await expect(page.getByText('Game 43')).toBeVisible()
  await expect(page.locator('.library-status-created')).toHaveText('Created')
  await expect(page.locator('.library-status-running')).toHaveText('Running')
  await expect(page.getByText('894177203164')).toBeVisible()
  await expect(page.getByText('base@1.0.0', { exact: true })).toHaveCount(2)
  await expect(page.getByText('standard@1.0.0', { exact: true })).toHaveCount(2)
})

test('renders an empty library without a blank screen', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], links: {}, meta: {} }),
    })
  })

  await page.goto('/games')

  await expect(page.getByRole('heading', { name: 'No games yet.' })).toBeVisible()
  await expect(page.getByText('Your created games will appear here.')).toBeVisible()
})

for (const response of [
  {
    name: 'not-found',
    status: 404,
    message: 'The game library could not be found. Please try again.',
  },
  {
    name: 'validation',
    status: 422,
    message: 'The game library request is invalid.',
  },
  {
    name: 'service-unavailable',
    status: 503,
    message: 'The game service is unavailable right now. Please try again.',
  },
]) {
  test(`shows a recoverable ${response.name} library response`, async ({ page }) => {
    await authenticatePage(page)
    await page.route('**/api/v1/games', async (route) => {
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: response.name,
            message: response.message,
          },
        }),
      })
    })

    await page.goto('/games')

    await expect(page.locator('.library-state-error p')).toHaveText(response.message)
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Signed in as Ada Player' })).toBeVisible()
  })
}

test('shows a recoverable network error for the library', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    await route.abort('failed')
  })

  await page.goto('/games')

  await expect(page.locator('.library-state-error p')).toHaveText(
    'The game library could not be reached. Check the connection and try again.',
  )
  await expect(page.getByRole('link', { name: 'Signed in as Ada Player' })).toBeVisible()
})

async function authenticatePage(page: Page) {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem('catan.api-token', token)
  }, 'test-token')
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { user } }),
    })
  })
}
