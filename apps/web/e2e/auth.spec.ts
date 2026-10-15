import { expect, test } from '@playwright/test'

const user = {
  id: 12,
  name: 'New Player',
  email: 'new-player@example.test',
  created_at: '2026-10-15T09:00:00.000000Z',
}

test('registers, restores, signs out, and signs back in', async ({ page }) => {
  await page.route('**/api/v1/auth/register', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toMatchObject({
      name: 'New Player',
      email: 'new-player@example.test',
      password: 'password-123',
      password_confirmation: 'password-123',
      token_name: 'catan-web',
    })

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          user,
          token: 'registered-token',
          token_type: 'Bearer',
        },
      }),
    })
  })

  await page.route('**/api/v1/auth/login', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toMatchObject({
      email: 'new-player@example.test',
      password: 'password-123',
      token_name: 'catan-web',
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          user,
          token: 'login-token',
          token_type: 'Bearer',
        },
      }),
    })
  })

  await page.route('**/api/v1/auth/me', async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { user } }),
    })
  })

  await page.route('**/api/v1/auth/logout', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer registered-token')
    await route.fulfill({ status: 204 })
  })

  await page.goto('/register')
  await page.getByLabel('Name').fill('New Player')
  await page.getByLabel('Email').fill('new-player@example.test')
  await page.getByLabel('Password', { exact: true }).fill('password-123')
  await page.getByLabel('Confirm password').fill('password-123')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/games$/)
  await expect(page.getByRole('heading', { name: 'Private game area ready.' })).toBeVisible()
  await expect(page.getByText('Session restored')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Signed in as New Player' }),
  ).toHaveAttribute('href', '/games')

  await page.reload()
  await expect(page.getByText('Signed in as New Player.')).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in to Catan.' })).toBeVisible()

  await page.getByLabel('Email').fill('new-player@example.test')
  await page.getByLabel('Password').fill('password-123')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/games$/)
  await expect(page.getByText('Session restored')).toBeVisible()

  await page.getByRole('link', { name: 'Return to board preview' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('link', { name: 'Signed in as New Player' }),
  ).toHaveAttribute('href', '/games')
})

test('shows an invalid-credential error without leaving the login form', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'invalid_credentials',
          message: 'The email or password is incorrect.',
        },
      }),
    })
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('wrong@example.test')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toHaveText('The email or password is incorrect.')
  await expect(page).toHaveURL(/\/login$/)
})

test('shows field validation errors on registration', async ({ page }) => {
  await page.route('**/api/v1/auth/register', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'validation_failed',
          message: 'The given data was invalid.',
          fields: {
            email: ['The email has already been taken.'],
            password: ['The password must be at least 8 characters.'],
          },
        },
      }),
    })
  })

  await page.goto('/register')
  await page.getByLabel('Name').fill('Existing Player')
  await page.getByLabel('Email').fill('existing@example.test')
  await page.getByLabel('Password', { exact: true }).fill('short')
  await page.getByLabel('Confirm password').fill('short')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('alert')).toHaveText('The given data was invalid.')
  await expect(page.getByText('The email has already been taken.')).toBeVisible()
  await expect(page.getByText('The password must be at least 8 characters.')).toBeVisible()
  await expect(page).toHaveURL(/\/register$/)
})
