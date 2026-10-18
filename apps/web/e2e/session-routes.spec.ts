import { expect, test } from '@playwright/test'
import { gameListResponse } from './fixtures/gameListResponse'

const SESSION_TOKEN_KEY = 'catan.api-token'

test('gates private game paths when no browser session exists', async ({ page }) => {
  for (const path of ['/games', '/games/42/setup']) {
    await page.goto(path)

    await expect(
      page.getByRole('heading', { name: 'Sign in to access your games.' }),
    ).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    )
    await expect(page.getByRole('main').getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register',
    )
  }
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
      body: JSON.stringify(gameListResponse([])),
    })
  })

  await page.goto('/games')

  await expect(page.getByRole('heading', { name: 'Your games' })).toBeVisible()
  await expect(page.locator('.account-trigger')).toHaveAttribute(
    'aria-label',
    'Account menu for Ada Player',
  )
  await expect(page.getByRole('link', { name: 'Board demo' })).toHaveAttribute(
    'href',
    '/preview',
  )
  await expect(page.getByRole('link', { name: 'My games' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('link', { name: 'Board demo' })).not.toHaveAttribute(
    'aria-current',
  )
  await expect(page.getByRole('link', { name: 'Catan, your games' })).toHaveAttribute(
    'href',
    '/games',
  )
})

test('keeps authenticated navigation separated at intermediate widths', async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem('catan.api-token', token)
  }, 'test-token')
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          user: {
            id: 7,
            name: 'Alexandru Ioan Ionescu',
            email: 'alexandru@example.test',
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
      body: JSON.stringify(gameListResponse([])),
    })
  })

  await page.goto('/games')
  await expect(page.getByRole('heading', { name: 'Your games' })).toBeVisible()

  for (const width of [610, 620, 640, 660, 680]) {
    await page.setViewportSize({ width, height: 800 })
    const metrics = await page.evaluate(() => {
      const toRect = (element: Element | null) => {
        if (!element) {
          return null
        }

        const { bottom, left, right, top } = element.getBoundingClientRect()
        return { bottom, left, right, top }
      }
      const navLinks = Array.from(
        document.querySelectorAll('.authenticated-topbar .primary-nav .nav-link'),
      ).map((link) => toRect(link))
      const account = toRect(
        document.querySelector('.authenticated-topbar .account-trigger'),
      )
      const hasOverlap = (first: NonNullable<typeof account>, second: NonNullable<typeof account>) =>
        first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top

      return {
        account,
        hasNavigationOverlap: account !== null && navLinks.some((link) =>
          link !== null && hasOverlap(link, account)),
        navLinks,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }
    })

    expect(metrics.account, `account trigger at ${width}px`).not.toBeNull()
    expect(metrics.navLinks.every((link) => link !== null), `navigation bounds at ${width}px`).toBe(true)
    expect(metrics.hasNavigationOverlap, `navigation overlap at ${width}px`).toBe(false)
    expect(metrics.documentWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
      metrics.viewportWidth,
    )

    for (const link of metrics.navLinks) {
      expect(link?.left, `navigation left bound at ${width}px`).toBeGreaterThanOrEqual(0)
      expect(link?.right, `navigation right bound at ${width}px`).toBeLessThanOrEqual(width)
    }

    expect(metrics.account?.left, `account left bound at ${width}px`).toBeGreaterThanOrEqual(0)
    expect(metrics.account?.right, `account right bound at ${width}px`).toBeLessThanOrEqual(width)

    expect(
      metrics.navLinks.every((link) => link !== null &&
        link.top <= (metrics.account?.top ?? -1) &&
        link.bottom >= (metrics.account?.bottom ?? Number.POSITIVE_INFINITY)),
      `navigation and account share one row at ${width}px`,
    ).toBe(true)
  }
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

test('shows restoration progress while a public session request is pending', async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem('catan.api-token', token)
  }, 'pending-token')

  let releaseRequest: (() => void) | undefined
  const requestReleased = new Promise<void>((resolve) => {
    releaseRequest = resolve
  })

  await page.route('**/api/v1/auth/me', async (route) => {
    await requestReleased
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

  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('.header-session-status')).toBeVisible()
  releaseRequest?.()
  await expect(page.getByRole('link', { name: 'Catan, your games' })).toBeVisible()
})

test('shows public recovery actions after a temporary session failure', async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem('catan.api-token', token)
  }, 'temporary-token')
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'service_unavailable',
          message: 'Service temporarily unavailable.',
        },
      }),
    })
  })

  for (const path of ['/', '/preview']) {
    await page.goto(path)

    const header = page.locator('.topbar')
    await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(header.getByRole('link', { name: 'Create account' })).toBeVisible()
    await expect(page.locator('.header-session-status')).toHaveCount(0)
    await expect(page.getByRole('alert')).toContainText(
      'Your session could not be restored. Please sign in again.',
    )
    await expect(
      page.evaluate((key) => window.sessionStorage.getItem(key), SESSION_TOKEN_KEY),
    ).resolves.toBe('temporary-token')
  }
})

test('shows public recovery actions after a network session failure', async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem('catan.api-token', token)
  }, 'network-token')
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.abort('failed')
  })

  for (const path of ['/', '/preview']) {
    await page.goto(path)

    const header = page.locator('.topbar')
    await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(header.getByRole('link', { name: 'Create account' })).toBeVisible()
    await expect(page.locator('.header-session-status')).toHaveCount(0)
    await expect(page.getByRole('alert')).toContainText(
      'Your session could not be restored. Please sign in again.',
    )
    await expect(
      page.evaluate((key) => window.sessionStorage.getItem(key), SESSION_TOKEN_KEY),
    ).resolves.toBe('network-token')
  }
})

test('clears an expired public session and keeps the account actions available', async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem('catan.api-token', token)
  }, 'expired-public-token')
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

  for (const path of ['/', '/preview']) {
    await page.goto(path)

    const header = page.locator('.topbar')
    await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(header.getByRole('link', { name: 'Create account' })).toBeVisible()
    await expect(
      page.evaluate((key) => window.sessionStorage.getItem(key), SESSION_TOKEN_KEY),
    ).resolves.toBeNull()
  }
})
