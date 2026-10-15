import { expect, test, type Page } from '@playwright/test'

const user = {
  id: 7,
  name: 'Ada Player',
  email: 'ada@example.test',
  created_at: '2026-10-15T09:00:00.000000Z',
}

const createdGameSummary = {
  id: 44,
  owner_id: user.id,
  mode: 'human_vs_ai',
  seed: '42',
  ruleset: { key: 'base', version: '1.0.0' },
  map: { key: 'standard', version: '1.0.0', orientation: 'pointy_top' },
  seat_count: 4,
  human_seat_number: 1,
  lifecycle_status: 'created',
  configuration: { ai_count: 3 },
  created_at: '2026-10-15T09:00:00.000000Z',
  updated_at: '2026-10-15T09:00:00.000000Z',
}

const createdGameResponse = {
  data: {
    ...createdGameSummary,
    board: {
      board_schema_version: '1.0.0',
      seed: '42',
      ruleset: { key: 'base', version: '1.0.0' },
      map: { key: 'standard', version: '1.0.0', orientation: 'pointy_top' },
      hexes: [],
      vertices: [],
      edges: [],
      ports: [],
    },
    seats: [
      { seat_number: 1, controller_type: 'human', user_id: user.id, label: 'Ada Player' },
      { seat_number: 2, controller_type: 'ai', user_id: null, label: 'AI 2' },
      { seat_number: 3, controller_type: 'ai', user_id: null, label: 'AI 3' },
      { seat_number: 4, controller_type: 'ai', user_id: null, label: 'AI 4' },
    ],
  },
}

test('creates a game with the existing API contract and shows it in the library', async ({
  page,
}) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({
        seed: '42',
        ruleset_key: 'base',
        map_key: 'standard',
        ai_count: 3,
      })
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(createdGameResponse),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [createdGameSummary], links: {}, meta: {} }),
    })
  })

  await page.goto('/games')
  await page.getByRole('link', { name: 'New game' }).click()
  await expect(page).toHaveURL(/\/games\/new$/)
  await expect(page.getByRole('heading', { name: 'Create a game.' })).toBeVisible()

  await page.getByLabel('Game seed').fill('42')
  await page.getByLabel('AI opponents').selectOption('3')
  await page.getByRole('button', { name: 'Create game' }).click()

  await expect(page).toHaveURL(/\/games$/)
  await expect(page.getByRole('heading', { name: 'Your games.' })).toBeVisible()
  await expect(page.getByText('Game 44', { exact: true })).toBeVisible()
  await expect(page.locator('.library-status-created')).toHaveText('Created')
})

test('shows creation validation errors without leaving the form', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'validation_failed',
          message: 'The game configuration is invalid.',
          fields: {
            seed: ['The seed must be a canonical non-negative integer string.'],
            ai_count: ['The AI count must be 2 or 3.'],
          },
        },
      }),
    })
  })

  await page.goto('/games/new')
  await page.getByLabel('Game seed').fill('01')
  await page.getByLabel('AI opponents').selectOption('3')
  await page.getByRole('button', { name: 'Create game' }).click()

  await expect(page.getByRole('alert')).toHaveText('The game configuration is invalid.')
  await expect(
    page.getByText('The seed must be a canonical non-negative integer string.'),
  ).toBeVisible()
  await expect(page.getByText('The AI count must be 2 or 3.')).toBeVisible()
  await expect(page).toHaveURL(/\/games\/new$/)
})

test('shows a recoverable service error during creation', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'queue_dispatch_failed',
          message: 'The game could not be queued.',
        },
      }),
    })
  })

  await page.goto('/games/new')
  await page.getByRole('button', { name: 'Create game' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'The game service is unavailable right now. Please try again.',
  )
  await expect(page).toHaveURL(/\/games\/new$/)
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
