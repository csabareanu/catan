import { expect, test } from '@playwright/test'

const SESSION_TOKEN_KEY = 'catan.api-token'

test('gates private game paths when no browser session exists', async ({ page }) => {
  await page.goto('/games')

  await expect(
    page.getByRole('heading', { name: 'Sign in to access your games.' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login',
  )
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
    'href',
    '/register',
  )
})

test('restores a stored bearer token through the current-user endpoint', async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem('catan.api-token', token)
  }, 'test-token')
  await page.route('**/api/v1/auth/me', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          user: {
            id: 7,
            name: 'Ada Player',
            email: 'ada@example.test',
            created_at: '2026-10-15T09:00:00.000000Z',
          },
        },
      }),
    })
  })
  await page.route('**/api/v1/games', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], links: {}, meta: {} }),
    })
  })

  await page.goto('/games')

  await expect(page.getByRole('heading', { name: 'Your games.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Signed in as Ada Player' })).toBeVisible()
  await expect(page.getByText('Session restored')).toBeVisible()
})

test('clears an expired bearer token and returns to the authentication entry', async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem('catan.api-token', token)
  }, 'expired-token')
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'unauthenticated',
          message: 'Authentication is required.',
        },
      }),
    })
  })

  await page.goto('/games')

  await expect(
    page.getByRole('heading', { name: 'Sign in to access your games.' }),
  ).toBeVisible()
  await expect(page.evaluate((key) => window.sessionStorage.getItem(key), SESSION_TOKEN_KEY)).resolves.toBeNull()
})
