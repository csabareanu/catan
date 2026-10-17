import { devices, expect, test } from '@playwright/test'
import { isBoardData } from '../src/features/board/boardApi'
import type { ReplayResponse } from '../src/features/replay/replayApi'
import standardBoard from './fixtures/standard-board.json' with { type: 'json' }

const user = {
  id: 7,
  name: 'Ada Player',
  email: 'ada@example.test',
  created_at: '2026-10-15T09:00:00.000000Z',
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T10:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-15T10:00:01Z'))
  await page.addInitScript(() => {
    sessionStorage.setItem('catan.api-token', 'test-token')
  })
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, json: { data: { user } } }),
  )
})

test('renders the board, players, and visible history', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/games/42/replay', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    await route.fulfill({ status: 200, json: replayResponse('completed', true) })
  })

  await page.goto('/games/42/observe')

  await expect(page.getByRole('heading', { name: 'Game 42', exact: true })).toBeVisible()
  await expect(page.locator('.observer-board .board-svg')).toBeVisible()
  await expect(page.locator('.observer-header-actions').getByText('Run complete', { exact: true })).toBeVisible()

  const backLinkBox = await page.locator('.observer-back-link').boundingBox()
  const headingBox = await page.locator('.observer-heading').boundingBox()
  const boardBox = await page.locator('.observer-board').boundingBox()

  if (!backLinkBox || !headingBox || !boardBox) {
    throw new Error('The observer header and board must be rendered before measuring spacing.')
  }

  const gameHeadingBox = await page.getByRole('heading', { name: 'Game 42', exact: true }).boundingBox()

  if (!gameHeadingBox) {
    throw new Error('The observer game heading must be rendered before measuring its height.')
  }

  expect(Math.abs(backLinkBox.y + backLinkBox.height / 2 - (headingBox.y + headingBox.height / 2))).toBeLessThanOrEqual(4)
  expect(gameHeadingBox.height).toBeLessThan(30)
  expect(boardBox.y - (headingBox.y + headingBox.height)).toBeGreaterThanOrEqual(8)

  await page.getByRole('button', { name: 'Game details', exact: true }).click()
  const detailsDialog = page.getByRole('dialog', { name: 'Game details' })
  const closeDetails = detailsDialog.getByRole('button', { name: 'Close details', exact: true })

  await expect(detailsDialog).toBeVisible()
  await expect(detailsDialog).toHaveAttribute('aria-modal', 'true')
  await expect(closeDetails).toBeFocused()
  await expect(page.locator('.observer-sidebar-backdrop')).toHaveAttribute('tabindex', '-1')

  await expect(page.locator('.observer-player').first().getByText('Ada Player', { exact: true })).toBeVisible()
  await expect(page.getByText('Human player', { exact: true })).toBeVisible()
  await expect(page.getByText('Game initialized', { exact: true })).toBeVisible()
  await expect(page.getByText('The current board view is ready for replay.', { exact: true })).toBeVisible()
  await expect(page.getByText('current_state', { exact: true })).toHaveCount(0)

  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  expect(pageWidth).toBeLessThanOrEqual(viewportWidth)

  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  const viewportHeight = await page.evaluate(() => window.innerHeight)
  expect(pageHeight).toBeLessThanOrEqual(viewportHeight)

  for (let tabPress = 0; tabPress < 4; tabPress += 1) {
    await page.keyboard.press('Tab')
    await expect(detailsDialog.locator(':focus')).toBeVisible()
  }

  await page.keyboard.press('Shift+Tab')
  await expect(detailsDialog.locator(':focus')).toBeVisible()

  await page.keyboard.press('Escape')
  const detailsTrigger = page.getByRole('button', { name: 'Game details', exact: true })
  await expect(detailsDialog).toBeHidden()
  await expect(detailsTrigger).toBeFocused()

  await detailsTrigger.click()
  await expect(page.getByRole('dialog', { name: 'Game details' })).toBeVisible()
  await page.locator('.observer-sidebar-backdrop').click({ position: { x: 2, y: 2 } })
  await expect(detailsDialog).toBeHidden()
  await expect(detailsTrigger).toBeFocused()

  await detailsTrigger.click()
  await closeDetails.click()
  await expect(detailsDialog).toBeHidden()
  await expect(detailsTrigger).toBeFocused()
})

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1366, height: 680 },
  { width: 1366, height: 768 },
  { width: 1920, height: 912 },
]) {
  test(`maximizes the visible map at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.route('**/api/v1/games/42/replay', (route) =>
      route.fulfill({ status: 200, json: replayResponse('completed', true) }),
    )

    await page.goto('/games/42/observe')

    await expect(page.locator('.observer-board .board-svg')).toBeVisible()
    await expect(page.locator('.observer-sidebar')).toBeVisible()
    await expect(page.locator('.board-hex')).toHaveCount(19)
    await expect(page.locator('.board-port')).toHaveCount(9)

    const metrics = await page.evaluate(() => {
      const board = document.querySelector<HTMLElement>('.observer-board')
      const card = document.querySelector<HTMLElement>('.observer-card')
      const sidebar = document.querySelector<HTMLElement>('.observer-sidebar')
      const map = document.querySelector<SVGGElement>('.board-hex-layer')
      const ocean = document.querySelector<SVGRectElement>('.board-svg-background')
      const forest = document.querySelector<SVGPolygonElement>('.board-hex-forest')
      const token = document.querySelector<SVGCircleElement>('.number-token-disc')
      const svgBounds = document.querySelector<SVGSVGElement>('.board-svg')?.getBoundingClientRect()
      const headerBounds = document.querySelector<HTMLElement>('.observer-header')?.getBoundingClientRect()
      const boardBounds = board?.getBoundingClientRect()
      const cardBounds = card?.getBoundingClientRect()
      const portBounds = [...document.querySelectorAll<SVGRectElement>('.board-port-badge')]
        .map((port) => port.getBoundingClientRect())

      return {
        documentHeight: document.documentElement.scrollHeight,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        headerBottom: headerBounds?.bottom ?? Number.POSITIVE_INFINITY,
        boardBottom: boardBounds?.bottom ?? Number.POSITIVE_INFINITY,
        cardBottom: cardBounds?.bottom ?? Number.POSITIVE_INFINITY,
        sidebarOverflow: sidebar ? getComputedStyle(sidebar).overflowY : null,
        mapHeight: map?.getBoundingClientRect().height ?? 0,
        oceanWidth: ocean?.getBoundingClientRect().width ?? 0,
        oceanHeight: ocean?.getBoundingClientRect().height ?? 0,
        tokenWidth: token?.getBoundingClientRect().width ?? 0,
        tokenHeight: token?.getBoundingClientRect().height ?? 0,
        seaFill: ocean ? getComputedStyle(ocean).fill : null,
        forestFill: forest ? getComputedStyle(forest).fill : null,
        portsInsideCanvas: svgBounds !== undefined && portBounds.every((port) =>
          port.left >= svgBounds.left && port.right <= svgBounds.right &&
          port.top >= svgBounds.top && port.bottom <= svgBounds.bottom),
      }
    })

    expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight)
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.headerBottom).toBeLessThan(120)
    expect(metrics.boardBottom).toBeLessThanOrEqual(metrics.viewportHeight)
    expect(metrics.cardBottom).toBeLessThanOrEqual(metrics.viewportHeight)
    expect(metrics.sidebarOverflow).toBe('auto')
    expect(metrics.mapHeight).toBeGreaterThan(metrics.viewportHeight * 0.55)
    expect(metrics.oceanWidth / metrics.oceanHeight).toBeLessThan(1.2)
    expect(metrics.tokenWidth).toBeCloseTo(metrics.tokenHeight, 1)
    expect(metrics.seaFill).not.toBe(metrics.forestFill)
    expect(metrics.portsInsideCanvas).toBe(true)

    await page.screenshot({ path: testInfo.outputPath('observer-desktop.png') })
    await page.getByText('Board guide', { exact: true }).click()
    await expect(page.locator('.observer-board-help').getByLabel('Terrain and resource guide')).toBeVisible()
    await expect(page.locator('.observer-board-help .board-legend-item')).toHaveCount(6)
    await expect(page.locator('.observer-board-help .board-legend-swatch-forest')).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    )
    await expect(page.locator('.observer-board-help .board-legend')).toContainText('Lumber')
    await expect(page.locator('.observer-sidebar')).toHaveCSS('overflow-y', 'auto')
    await expect(page.locator('.board-hex-layer')).toBeInViewport({ ratio: 1 })
  })
}

test('keeps the observer usable in a landscape phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.route('**/api/v1/games/42/replay', (route) =>
    route.fulfill({ status: 200, json: replayResponse('completed', true) }),
  )

  await page.goto('/games/42/observe')

  await expect(page.locator('.observer-board .board-svg')).toBeVisible()

  const metrics = await page.evaluate(() => ({
    boardBottom: document.querySelector<HTMLElement>('.observer-board')?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))

  expect(metrics.boardBottom).toBeLessThanOrEqual(metrics.viewportHeight)
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight)
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
})

test('keeps observer navigation clear on a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await page.route('**/api/v1/games/42/replay', (route) =>
    route.fulfill({ status: 200, json: replayResponse('completed', true) }),
  )

  await page.goto('/games/42/observe')

  const metrics = await page.evaluate(() => {
    const toRect = (element: Element | null) => {
      if (!element) {
        return null
      }

      const { bottom, left, right, top } = element.getBoundingClientRect()
      return { bottom, left, right, top }
    }
    const navLinks = Array.from(
      document.querySelectorAll('.observer-shell .primary-nav .nav-link'),
    ).map((link) => toRect(link))
    const account = toRect(document.querySelector('.observer-shell .account-trigger'))
    const hasOverlap = (first: NonNullable<typeof account>, second: NonNullable<typeof account>) =>
      first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top

    return {
      account,
      documentWidth: document.documentElement.scrollWidth,
      hasNavigationOverlap: account !== null && navLinks.some((link) =>
        link !== null && hasOverlap(link, account)),
      navLinks,
      viewportWidth: window.innerWidth,
    }
  })

  expect(metrics.hasNavigationOverlap).toBe(false)
  expect(metrics.navLinks.every((link) => link !== null)).toBe(true)
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  await expect(page.locator('.observer-shell .account-name')).toBeHidden()
})

test('keeps the board guide available in the mobile details drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/games/42/replay', (route) =>
    route.fulfill({ status: 200, json: replayResponse('completed', true) }),
  )

  await page.goto('/games/42/observe')
  await page.getByRole('button', { name: 'Game details', exact: true }).click()

  const detailsDialog = page.getByRole('dialog', { name: 'Game details' })
  await expect(detailsDialog).toBeVisible()
  await detailsDialog.getByText('Board guide', { exact: true }).click()
  await expect(detailsDialog.getByLabel('Terrain and resource guide')).toBeVisible()
  await expect(detailsDialog.locator('.board-legend-item')).toHaveCount(6)
  await expect(detailsDialog.locator('.board-legend-copy strong').first()).toHaveCSS(
    'color',
    'rgb(245, 240, 229)',
  )
})

test.describe('touch board inspection', () => {
  const touchDevice = devices['iPhone 13']

  test.use({
    viewport: touchDevice.viewport,
    screen: touchDevice.screen,
    userAgent: touchDevice.userAgent,
    deviceScaleFactor: touchDevice.deviceScaleFactor,
    isMobile: touchDevice.isMobile,
    hasTouch: touchDevice.hasTouch,
  })

  test('supports double-tap zoom inside the board viewport', async ({ page }) => {
    await page.route('**/api/v1/games/42/replay', (route) =>
      route.fulfill({ status: 200, json: replayResponse('completed', true) }),
    )

    await page.goto('/games/42/observe')

    const boardShell = page.locator('.observer-board .board-svg-shell')
    await boardShell.tap({ position: { x: 180, y: 230 } })
    await boardShell.tap({ position: { x: 180, y: 230 } })

    await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 125%')
    const metrics = await boardShell.evaluate((shell) => ({
      clientWidth: shell.clientWidth,
      scrollWidth: shell.scrollWidth,
    }))
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)

    await page.getByRole('button', { name: 'Fit board' }).tap()
    await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 100%')
  })
})

test('explains a replay without a persisted frame', async ({ page }) => {
  await page.route('**/api/v1/games/43/replay', (route) =>
    route.fulfill({ status: 200, json: replayResponse('created', false) }),
  )

  await page.goto('/games/43/observe')

  await expect(page.getByRole('heading', { name: 'Game 43', exact: true })).toBeVisible()
  await expect(page.locator('.observer-board .board-svg')).toBeVisible()
  await expect(page.getByText('No visible history is available yet.', { exact: true })).toBeVisible()
})

test('refreshes a queued replay until it reaches a stable status', async ({ page }) => {
  let replayRequestCount = 0
  await page.route('**/api/v1/games/44/replay', (route) => {
    replayRequestCount += 1
    return route.fulfill({
      status: 200,
      json: replayResponse(replayRequestCount > 2 ? 'completed' : 'queued', replayRequestCount > 2),
    })
  })

  await page.goto('/games/44/observe')
  await expect(page.locator('.observer-header-actions').getByText('Run queued', { exact: true })).toBeVisible()
  expect(replayRequestCount).toBeGreaterThan(0)

  await page.clock.runFor(4000)

  await expect(page.locator('.observer-header-actions').getByText('Run complete', { exact: true })).toBeVisible()
  expect(replayRequestCount).toBe(3)

  await page.clock.runFor(10000)
  expect(replayRequestCount).toBe(3)
})

test('shows a missing-game recovery path without losing the session', async ({ page }) => {
  await page.route('**/api/v1/games/404/replay', (route) =>
    route.fulfill({
      status: 404,
      json: {
        error: {
          code: 'game_not_found',
          message: 'The requested game was not found.',
        },
      },
    }),
  )

  await page.goto('/games/404/observe')

  await expect(page.getByRole('alert')).toContainText('The requested game was not found.')
  await expect(page.getByRole('alert').getByRole('link', { name: 'Return to your games', exact: true })).toHaveAttribute(
    'href',
    '/games',
  )
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await expect(page.evaluate(() => sessionStorage.getItem('catan.api-token'))).resolves.toBe('test-token')
})

test('clears an expired session when the replay request returns 401', async ({ page }) => {
  await page.route('**/api/v1/games/42/replay', (route) =>
    route.fulfill({
      status: 401,
      json: {
        error: {
          code: 'unauthenticated',
          message: 'Authentication is required.',
        },
      },
    }),
  )

  await page.goto('/games/42/observe')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in to Catan.' })).toBeVisible()
  await expect(page.evaluate(() => sessionStorage.getItem('catan.api-token'))).resolves.toBeNull()
})

function replayResponse(
  lifecycleStatus: ReplayResponse['context']['game']['lifecycle_status'],
  includeFrame: boolean,
): ReplayResponse {
  return {
    schema_version: 'replay-v1',
    context: {
      game: {
        id: 42,
        mode: 'human_vs_ai',
        lifecycle_status: lifecycleStatus,
        ruleset_key: 'base',
        ruleset_version: '1.0.0',
        state_schema_version: 'state-v1',
        seed: standardBoard.seed,
        seat_count: 3,
        human_seat_number: 1,
        started_at: '2026-10-15T09:01:00.000000Z',
        completed_at: lifecycleStatus === 'completed' ? '2026-10-15T09:03:00.000000Z' : null,
        created_at: user.created_at,
      },
      board: boardData(),
      seats: [
        { seat_number: 1, controller_type: 'human', label: 'Ada Player' },
        { seat_number: 2, controller_type: 'ai', label: 'AI 2' },
        { seat_number: 3, controller_type: 'ai', label: 'AI 3' },
      ],
    },
    events: includeFrame
      ? [{ sequence: '3', event_type: 'game_initialized.v1', payload: {}, occurred_at: user.created_at }]
      : [],
    event_cursor: {
      requested_after_sequence: '0',
      returned_through_sequence: includeFrame ? '3' : null,
      has_more: false,
      next_after_sequence: null,
    },
    snapshot_index: includeFrame
      ? [{
          command_sequence: '3',
          event_sequence: '5',
          state_schema_version: 'state-v1',
          created_at: user.created_at,
        }]
      : [],
    frame: includeFrame
      ? {
          command_sequence: '3',
          event_sequence: '5',
          state_schema_version: 'state-v1',
          public_projection_schema_version: 'replay-public-v1',
          public_state: {
            phase: 'playing',
            active_seat_number: 1,
            roads: { [standardBoard.edges[0].id]: { owner_seat_number: 1 } },
            public_scores: { '1': 2 },
          },
          viewer_state: null,
        }
      : null,
  }
}

function boardData() {
  if (!isBoardData(standardBoard)) {
    throw new Error('The standard board fixture must match the board API contract.')
  }

  return standardBoard
}
