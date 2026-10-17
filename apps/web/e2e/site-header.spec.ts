import { expect, test, type Page } from '@playwright/test'
import { gameListResponse } from './fixtures/gameListResponse'
import standardBoard from './fixtures/standard-board.json' with { type: 'json' }

const user = {
  id: 7,
  name: 'Alexandru Ioan Ionescu',
  email: 'alexandru@example.test',
  created_at: '2026-10-15T09:00:00.000000Z',
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`keeps one header frame across public and private screens at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ json: { data: { user } } }),
    )
    await page.route('**/api/v1/games', (route) =>
      route.fulfill({ json: gameListResponse([]) }),
    )
    await page.route('**/api/v1/games/42/replay', (route) =>
      route.fulfill({ json: replayResponse() }),
    )

    await page.goto('/')
    const reference = await headerFrame(page)

    for (const path of ['/', '/login', '/register', '/preview']) {
      await page.goto(path)
      const header = page.locator('.topbar')
      await expect(header.getByRole('link', { name: 'Catan home' })).toHaveAttribute('href', '/')
      await expect(header.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
      await expect(header.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register')
      expect(await headerFrame(page), path).toEqual(reference)
    }

    await page.evaluate(() => sessionStorage.setItem('catan.api-token', 'header-test-token'))

    for (const path of ['/', '/games', '/games/new', '/preview', '/games/42/observe']) {
      await page.goto(path)
      const account = page.locator('.account-trigger')
      await expect(account).toHaveAttribute('aria-label', `Account menu for ${user.name}`)
      expect(await headerFrame(page), path).toEqual(reference)

      const activeLink = page.getByRole('navigation', { name: 'Main navigation' })
        .locator('[aria-current="page"]')

      if (path.startsWith('/games')) {
        await expect(activeLink).toHaveText('My games')
      } else if (path === '/preview') {
        await expect(activeLink).toHaveText('Board demo')
      } else {
        await expect(activeLink).toHaveCount(0)
      }

      await account.click()
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.menu-panel')).toBeHidden()
      await expect(account).toBeFocused()
    }
  })
}

async function headerFrame(page: Page) {
  return page.locator('.topbar').evaluate((header) => {
    const frame = header.querySelector('.topbar-inner')
    const brand = header.querySelector('.brand')
    const shell = header.closest('.app-shell')

    if (!frame || !brand || !shell) {
      throw new Error('The shared header frame, brand, and app shell must be rendered.')
    }

    const bounds = header.getBoundingClientRect()
    const content = frame.getBoundingClientRect()
    const logo = brand.getBoundingClientRect()
    const controls = [...header.querySelectorAll('.nav-link, .account-trigger, .header-actions a')]
      .map((control) => control.getBoundingClientRect())
    const overlaps = (first: DOMRect, second: DOMRect) =>
      first.left < second.right && first.right > second.left &&
      first.top < second.bottom && first.bottom > second.top

    if (controls.some((control, index) =>
      control.left < 0 || control.right > window.innerWidth ||
      overlaps(control, logo) || controls.slice(index + 1).some((other) => overlaps(control, other)),
    )) {
      throw new Error('Header controls must fit without overlapping the logo or each other.')
    }

    if (document.documentElement.scrollWidth > window.innerWidth) {
      throw new Error('The page must fit within the viewport width.')
    }

    return {
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
      frameLeft: content.left,
      frameWidth: content.width,
      brandLeft: logo.left,
      background: getComputedStyle(shell).backgroundColor,
    }
  })
}

function replayResponse() {
  return {
    schema_version: 'replay-v1',
    context: {
      game: {
        id: 42,
        mode: 'human_vs_ai',
        lifecycle_status: 'completed',
        ruleset_key: 'base',
        ruleset_version: '1.0.0',
        state_schema_version: 'state-v1',
        seed: standardBoard.seed,
        seat_count: 3,
        human_seat_number: 1,
        created_at: user.created_at,
        started_at: user.created_at,
        completed_at: user.created_at,
      },
      board: standardBoard,
      seats: [
        { seat_number: 1, controller_type: 'human', label: user.name },
        { seat_number: 2, controller_type: 'ai', label: 'AI 2' },
        { seat_number: 3, controller_type: 'ai', label: 'AI 3' },
      ],
    },
    events: [],
    event_cursor: {
      requested_after_sequence: '0',
      returned_through_sequence: null,
      has_more: false,
      next_after_sequence: null,
    },
    snapshot_index: [],
    frame: null,
  }
}
