import { expect, test } from '@playwright/test'

const metadata = {
  '/': {
    title: 'Catan · Welcome',
    description: 'Explore a seeded Catan board, create games, and follow their saved history.',
  },
  '/login': {
    title: 'Catan · Sign in',
    description: 'Sign in to create games, follow their progress, and review saved history.',
  },
  '/register': {
    title: 'Catan · Create account',
    description: 'Create an account to save Catan games and follow their history.',
  },
  '/preview': {
    title: 'Catan · Board preview',
    description: 'Explore a reproducible Catan board generated from a seed.',
  },
  '/games': {
    title: 'Catan · My games',
    description: 'View and manage your saved Catan games and replay history.',
  },
  '/games/new': {
    title: 'Catan · New game',
    description: 'Create a private seeded Catan game to follow and replay.',
  },
  '/games/42/observe': {
    title: 'Catan · Game 42',
    description: 'Observe the saved board and history for Catan game 42.',
  },
}

test('sets route-specific browser metadata and the keep tab mark', async ({ page, request }) => {
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  for (const [path, expected] of Object.entries(metadata)) {
    await page.goto(path)
    await expect(page).toHaveTitle(expected.title)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      expected.description,
    )
  }

  await page.goto('/login')
  await page.evaluate(() => {
    window.history.pushState({}, '', '/games/77/observe')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page).toHaveTitle('Catan · Game 77')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Observe the saved board and history for Catan game 77.',
  )

  await page.goto('/unsupported-path')
  await expect(page).toHaveTitle('Catan · Games and replay')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Create seeded Catan games, follow their progress, and review saved history.',
  )

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/catan-mark.svg')
  const iconResponse = await request.get('/catan-mark.svg')
  expect(iconResponse.ok()).toBe(true)
  const icon = await iconResponse.text()
  expect(icon).toContain('M12 12h6v5h3v-5h6v5h3v-5h6v22H12Z')
  expect(icon).toContain('m5 31 19-10 19 10-19 10Z')
  expect(consoleErrors).toEqual([])
})
