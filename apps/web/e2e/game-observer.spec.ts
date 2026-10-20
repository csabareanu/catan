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

  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  const detailsDialog = page.getByRole('dialog', { name: 'Game details' })
  const closeDetails = detailsDialog.getByRole('button', { name: 'Close details', exact: true })

  await expect(detailsDialog).toBeVisible()
  await expect(detailsDialog).toHaveAttribute('aria-modal', 'true')
  await expect(closeDetails).toBeFocused()
  await expect(page.locator('.observer-sidebar-backdrop')).toHaveAttribute('tabindex', '-1')

  await expect(page.locator('.observer-player').first().getByText('Ada Player', { exact: true })).toBeVisible()
  await expect(page.getByText('Human player', { exact: true })).toBeVisible()
  await expect(page.locator('.observer-status-panel')).toContainText('Playing')
  await expect(page.locator('.observer-status-panel')).toContainText('Awaiting Roll')
  await expect(page.locator('.observer-status-panel')).toContainText('Ada Player')
  await expect(page.locator('.observer-status-panel')).toContainText('Longest Road')
  await expect(page.locator('.observer-player').filter({ hasText: 'Ada Player' })).toContainText('2 points')
  await expect(page.locator('.observer-player').filter({ hasText: 'Ada Player' })).toContainText('Turn')
  await expect(page.locator('.observer-player').filter({ hasText: 'AI 2' })).toContainText('1 point')
  await expect(page.locator('.observer-player').filter({ hasText: 'AI 2' })).toContainText('Longest Road')
  await expect(page.getByText('Game initialized', { exact: true })).toBeVisible()
  await expect(page.getByText('The current board view is ready for replay.', { exact: true })).toBeVisible()
  await expect(page.getByText('current_state', { exact: true })).toHaveCount(0)
  await expect(page.getByText('public_scores', { exact: true })).toHaveCount(0)
  await expect(page.getByText('active_seat_number', { exact: true })).toHaveCount(0)
  await expect(page.getByText('public_awards', { exact: true })).toHaveCount(0)

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
  const detailsTrigger = page.getByRole('button', { name: 'Overview', exact: true })
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
  { width: 1440, height: 900, opensOverview: false },
  { width: 390, height: 844, opensOverview: true },
]) {
  test(`navigates saved replay positions at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const requestedPositions: Array<string | null> = []

    await page.route('**/api/v1/games/42/replay**', async (route) => {
      const requestedPosition = new URL(route.request().url()).searchParams.get('at_command_sequence')
      requestedPositions.push(requestedPosition)
      await route.fulfill({
        status: 200,
        json: replayResponseAt(requestedPosition ?? '9'),
      })
    })

    await page.goto('/games/42/observe')

    if (viewport.opensOverview) {
      await page.getByRole('button', { name: 'Overview', exact: true }).click()
    }

    await expect(page.getByRole('heading', { name: 'Replay position', exact: true })).toBeVisible()
    await expect(page.getByText('Latest saved position', { exact: true })).toBeVisible()
    await expect(page.getByText('Command 9 · Event 11', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Latest', exact: true })).toBeDisabled()
    const boardHexIDs = await page.locator('.board-hex').evaluateAll((hexes) =>
      hexes.map((hex) => hex.getAttribute('data-hex-id')),
    )

    await page.getByRole('button', { name: 'Previous', exact: true }).click()

    await expect(page.getByText('Saved position 2 of 3', { exact: true })).toBeVisible()
    await expect(page.getByText('Command 6 · Event 8', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', {
      name: 'Replay position command 6, event 8',
      exact: true,
    })).toHaveAttribute('aria-current', 'step')
    await expect(page.locator('.observer-player').filter({ hasText: 'Ada Player' })).toContainText('3 points')
    await expect(page.locator('.board-hex')).toHaveCount(19)
    await expect(page.locator('.board-port')).toHaveCount(9)
    await expect.poll(() => page.locator('.board-hex').evaluateAll((hexes) =>
      hexes.map((hex) => hex.getAttribute('data-hex-id')),
    )).toEqual(boardHexIDs)

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Saved position 3 of 3', { exact: true })).toBeVisible()
    await expect(page.getByText('Command 9 · Event 11', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Latest', exact: true })).toBeEnabled()

    await page.getByRole('button', { name: 'Latest', exact: true }).click()
    await expect(page.getByText('Latest saved position', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Latest', exact: true })).toBeDisabled()
    await expect.poll(() => requestedPositions.slice(-4)).toEqual([null, '6', '9', null])
  })
}

test('keeps an explicit replay position while a queued game refreshes', async ({ page }) => {
  let requestCount = 0
  const requestedPositions: Array<string | null> = []

  await page.route('**/api/v1/games/46/replay**', async (route) => {
    requestCount += 1
    const requestedPosition = new URL(route.request().url()).searchParams.get('at_command_sequence')
    requestedPositions.push(requestedPosition)
    await route.fulfill({
      status: 200,
      json: replayResponseAt(requestedPosition ?? '9', requestCount > 3 ? 'completed' : 'queued'),
    })
  })

  await page.goto('/games/46/observe')
  await expect(page.locator('.observer-header-actions').getByText('Run queued', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(page.getByText('Command 6 · Event 8', { exact: true })).toBeVisible()

  await page.clock.runFor(4000)

  await expect(page.locator('.observer-header-actions').getByText('Run complete', { exact: true })).toBeVisible()
  await expect(page.getByText('Saved position 2 of 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Command 6 · Event 8', { exact: true })).toBeVisible()
  expect(requestedPositions.filter((position) => position !== null)).toEqual(['6', '6'])
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
    expect(metrics.headerBottom).toBeLessThan(136)
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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`keeps the illustrated observer and guide usable at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(() => localStorage.setItem('catan.board-appearance.v1', 'illustrated'))
    await page.route('**/api/v1/games/42/replay', (route) =>
      route.fulfill({ json: replayResponse('completed', true) }),
    )
    await page.goto('/games/42/observe')
    const board = page.locator('.board-svg')
    await expect(board).toHaveAttribute('data-board-appearance', 'illustrated')
    await board.locator('image').first().evaluate(async (element) => {
      const image = new Image()
      image.src = element.getAttribute('href')!
      await image.decode()
    })
    await expect(page.locator('.board-hex-layer')).toBeInViewport({ ratio: 1 })
    const portsInside = await board.evaluate((svg) => {
      const bounds = svg.getBoundingClientRect()
      return [...svg.querySelectorAll('.board-port-badge')].every((port) => {
        const badge = port.getBoundingClientRect()
        return badge.left >= bounds.left && badge.right <= bounds.right &&
          badge.top >= bounds.top && badge.bottom <= bounds.bottom
      })
    })
    expect(portsInside).toBe(true)
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth &&
      document.documentElement.scrollHeight <= window.innerHeight,
    )).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('illustrated-observer.png') })
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await expect(page.locator('.board-svg-zoom-status')).toContainText('125%')
    await page.screenshot({ path: testInfo.outputPath('illustrated-observer-zoomed.png') })
    await page.getByRole('button', { name: 'Fit board', exact: true }).click()
    if (viewport.width < 1024) {
      await page.getByRole('button', { name: 'Overview', exact: true }).click()
    }
    await page.getByText('Board guide', { exact: true }).click()
    const guide = page.locator('.observer-board-help .board-legend')
    await expect(guide).toBeVisible()
    await expect(guide).toHaveAttribute('data-board-appearance', 'illustrated')
    await expect(guide.locator('.board-legend-item')).toHaveCount(6)
    await expect(guide.locator('.board-legend-swatch-forest')).toHaveCSS('background-size', '300% 200%')
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

test('keeps the observer usable at the smallest supported phone viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.route('**/api/v1/games/42/replay', (route) =>
    route.fulfill({ status: 200, json: replayResponse('completed', true) }),
  )

  await page.goto('/games/42/observe')

  const board = page.locator('.observer-board')
  const boardSvg = page.locator('.observer-board .board-svg')
  const boardShell = page.locator('.observer-board .board-svg-shell')
  const detailsTrigger = page.getByRole('button', { name: 'Overview', exact: true })
  const expectControlsClearOfPorts = async () => {
    const overlaps = await page.evaluate(() => {
      const controls = [
        ...document.querySelectorAll<HTMLElement>(
          '.observer-board .observer-sidebar-toggle, .observer-board .board-svg-controls',
        ),
      ]
      const shellBounds = document.querySelector('.observer-board .board-svg-shell')
        ?.getBoundingClientRect()
      const ports = [...document.querySelectorAll<SVGGElement>('.board-port')]

      if (!shellBounds) {
        return [{ error: 'Board viewport was not found.' }]
      }

      return controls.flatMap((control, controlIndex) => {
        const controlBounds = control.getBoundingClientRect()

        return ports.flatMap((port, portIndex) => {
          const portBounds = port.getBoundingClientRect()
          const visiblePort = {
            left: Math.max(portBounds.left, shellBounds.left),
            right: Math.min(portBounds.right, shellBounds.right),
            top: Math.max(portBounds.top, shellBounds.top),
            bottom: Math.min(portBounds.bottom, shellBounds.bottom),
          }
          const intersects = visiblePort.left < visiblePort.right
            && visiblePort.top < visiblePort.bottom
            && controlBounds.left < visiblePort.right
            && controlBounds.right > visiblePort.left
            && controlBounds.top < visiblePort.bottom
            && controlBounds.bottom > visiblePort.top

          return intersects ? [{ controlIndex, portIndex }] : []
        })
      })
    })

    expect(overlaps).toEqual([])
  }

  await expect(boardSvg).toBeVisible()
  await expect(page.locator('.observer-back-link')).toBeVisible()
  await expect(page.locator('.observer-back-link')).toBeInViewport()
  await expect(detailsTrigger).toBeVisible()
  await expect(detailsTrigger).toBeInViewport()
  await expect(page.locator('.board-hex')).toHaveCount(19)

  const metrics = await page.evaluate(() => ({
    boardBounds: document.querySelector<HTMLElement>('.observer-board')?.getBoundingClientRect(),
    documentHeight: document.documentElement.scrollHeight,
    documentWidth: document.documentElement.scrollWidth,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  }))

  expect(metrics.boardBounds?.width).toBeGreaterThan(0)
  expect(metrics.boardBounds?.height).toBeGreaterThan(0)
  const fittedBoardBounds = await boardShell.boundingBox()
  expect(fittedBoardBounds?.width).toBeGreaterThanOrEqual(290)
  expect(fittedBoardBounds?.height).toBeGreaterThanOrEqual(275)
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Fit board', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible()
  await expectControlsClearOfPorts()
  expect(metrics.boardBounds?.bottom).toBeLessThanOrEqual(metrics.viewportHeight)
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight)
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)

  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 125%')
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fit board', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 156%')
  await page.getByRole('button', { name: 'Fit board', exact: true }).click()
  await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 100%')
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Fit board', exact: true })).toBeHidden()
  await expectControlsClearOfPorts()

  await detailsTrigger.click()
  const detailsDialog = page.getByRole('dialog', { name: 'Game details' })
  const closeDetails = detailsDialog.getByRole('button', { name: 'Close details', exact: true })

  await expect(detailsDialog).toBeVisible()
  await expect(closeDetails).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(detailsDialog.locator(':focus')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(detailsDialog).toBeHidden()
  await expect(detailsTrigger).toBeFocused()

  await detailsTrigger.click()
  await expect(detailsDialog).toBeVisible()
  await page.locator('.observer-sidebar-backdrop').click({ position: { x: 2, y: 2 } })
  await expect(detailsDialog).toBeHidden()
  await expect(detailsTrigger).toBeFocused()

  await expect(board).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('observer-320.png') })
})

test('keeps the board guide available in the mobile details drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/games/42/replay', (route) =>
    route.fulfill({ status: 200, json: replayResponse('completed', true) }),
  )

  await page.goto('/games/42/observe')
  await page.getByRole('button', { name: 'Overview', exact: true }).click()

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
  await expect(page.getByText('No saved replay positions are available yet.', { exact: true })).toBeVisible()
})

test('handles a frame without public status fields', async ({ page }) => {
  await page.route('**/api/v1/games/45/replay', (route) =>
    route.fulfill({ status: 200, json: replayResponse('completed', true, false) }),
  )

  await page.goto('/games/45/observe')

  await expect(page.locator('.observer-status-panel')).toBeVisible()
  await expect(page.locator('.observer-status-panel')).toContainText('Public status is not available yet.')
  await expect(page.locator('.observer-player').first()).toBeVisible()
})

test('loads visible history pages in order without duplicates on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const requestedCursors: Array<string | null> = []

  await page.route('**/api/v1/games/47/replay**', async (route) => {
    const url = new URL(route.request().url())
    const afterEventSequence = url.searchParams.get('after_event_sequence')
    requestedCursors.push(afterEventSequence)

    await route.fulfill({
      status: 200,
      json: afterEventSequence === '5'
        ? replayResponsePage(
            [
              { sequence: '5', eventType: 'turn_started.v1' },
              { sequence: '8', eventType: 'roll_resolved.v1' },
              { sequence: '10', eventType: 'construction.v1' },
            ],
            '10',
            false,
            null,
          )
        : replayResponsePage(
            [
              { sequence: '3', eventType: 'game_initialized.v1' },
              { sequence: '5', eventType: 'turn_started.v1' },
            ],
            '5',
            true,
            '5',
          ),
    })
  })

  await page.goto('/games/47/observe')
  await page.getByRole('button', { name: 'Overview', exact: true }).click()

  const detailsDialog = page.getByRole('dialog', { name: 'Game details' })
  const loadMore = detailsDialog.getByRole('button', { name: 'Load more history', exact: true })
  await expect(loadMore).toBeVisible()

  await loadMore.focus()
  await page.keyboard.press('Enter')

  await expect(detailsDialog.getByText('Construction', { exact: true })).toBeVisible()
  await expect(detailsDialog.getByRole('button', { name: 'Load more history', exact: true })).toBeHidden()
  await expect(detailsDialog.locator('.observer-history-event strong')).toHaveText([
    'Game initialized',
    'Turn Started',
    'Roll Resolved',
    'Construction',
  ])
  expect(requestedCursors.slice(-2)).toEqual([null, '5'])
  expect(requestedCursors.filter((cursor) => cursor === '5')).toHaveLength(1)
  await expect(detailsDialog.getByText('Private resource change', { exact: true })).toHaveCount(0)
})

test('keeps the first history page and retries a failed next page', async ({ page }) => {
  let nextPageAttempts = 0

  await page.route('**/api/v1/games/48/replay**', async (route) => {
    const afterEventSequence = new URL(route.request().url()).searchParams.get('after_event_sequence')

    if (afterEventSequence === '5') {
      nextPageAttempts += 1

      if (nextPageAttempts === 1) {
        await route.abort('failed')
        return
      }

      await route.fulfill({
        status: 200,
        json: replayResponsePage(
          [{ sequence: '8', eventType: 'roll_resolved.v1' }],
          '8',
          false,
          null,
        ),
      })
      return
    }

    await route.fulfill({
      status: 200,
      json: replayResponsePage(
        [
          { sequence: '3', eventType: 'game_initialized.v1' },
          { sequence: '5', eventType: 'turn_started.v1' },
        ],
        '5',
        true,
        '5',
      ),
    })
  })

  await page.goto('/games/48/observe')
  const loadMore = page.getByRole('button', { name: 'Load more history', exact: true })
  await loadMore.click()

  const historyError = page.getByRole('alert')
  await expect(historyError).toContainText('The replay could not be reached. Check the connection and try again.')
  await expect(historyError.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await expect(page.getByText('Game initialized', { exact: true })).toBeVisible()
  await expect(page.getByText('Turn Started', { exact: true })).toBeVisible()

  await historyError.getByRole('button', { name: 'Try again', exact: true }).click()

  await expect(page.getByText('Roll Resolved', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load more history', exact: true })).toBeHidden()
  expect(nextPageAttempts).toBe(2)
})

test('shows a recoverable error for a malformed replay response', async ({ page }) => {
  await page.route('**/api/v1/games/49/replay**', (route) =>
    route.fulfill({ status: 200, json: { schema_version: 'replay-v1' } }),
  )

  await page.goto('/games/49/observe')

  await expect(page.getByRole('alert')).toContainText(
    'The replay service returned an invalid response. Please try again.',
  )
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
})

test('shows a recoverable error when the replay request cannot reach the server', async ({ page }) => {
  await page.route('**/api/v1/games/50/replay**', (route) => route.abort('failed'))

  await page.goto('/games/50/observe')

  await expect(page.getByRole('alert')).toContainText(
    'The replay could not be reached. Check the connection and try again.',
  )
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
})

test('serves the local multi-event fixture for manual observer review', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.resume()
  await page.goto('/games/999/observe?mock=multi-events')

  await expect(page.getByRole('heading', { name: 'Game 999', exact: true })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByText('Command 12 · Event 12', { exact: true })).toBeVisible()
  await expect(page.locator('.observer-history-event')).toHaveCount(4)

  const loadMore = page.getByRole('button', { name: 'Load more history', exact: true })
  await loadMore.click()
  await page.waitForTimeout(500)
  await expect(page.locator('.observer-history-event')).toHaveCount(8)

  await page.getByRole('button', { name: 'Replay position command 8, event 8', exact: true }).click()
  await page.waitForTimeout(500)

  await expect(page.getByText('Command 8 · Event 8', { exact: true })).toBeVisible()
  await expect(page.locator('.observer-history-event')).toHaveCount(4)
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
  includePublicStatus = true,
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
            ...(includePublicStatus ? {
              phase: 'playing',
              turn_phase: 'awaiting_roll',
              public_awards: { longest_road: 2 },
              public_scores: { '1': 2, '2': 1 },
              active_seat_number: 1,
            } : {}),
            roads: { [standardBoard.edges[0].id]: { owner_seat_number: 1 } },
          },
          viewer_state: null,
        }
      : null,
  }
}

function replayResponseAt(
  commandSequence: string,
  lifecycleStatus: ReplayResponse['context']['game']['lifecycle_status'] = 'completed',
): ReplayResponse {
  const response = replayResponse(lifecycleStatus, true)
  const snapshotIndex = [
    { command_sequence: '3', event_sequence: '5' },
    { command_sequence: '6', event_sequence: '8' },
    { command_sequence: '9', event_sequence: '11' },
  ].map((position) => ({
    ...position,
    state_schema_version: 'state-v1',
    created_at: user.created_at,
  }))
  const selectedPosition = snapshotIndex.find((position) => position.command_sequence === commandSequence)
    ?? snapshotIndex[snapshotIndex.length - 1]

  if (!selectedPosition || response.frame === null) {
    throw new Error('The replay fixture must contain the selected frame and snapshot position.')
  }

  response.snapshot_index = snapshotIndex
  response.events = [{
    sequence: selectedPosition.event_sequence,
    event_type: 'game_initialized.v1',
    payload: {},
    occurred_at: user.created_at,
  }]
  response.event_cursor = {
    requested_after_sequence: '0',
    returned_through_sequence: selectedPosition.event_sequence,
    has_more: false,
    next_after_sequence: null,
  }
  response.frame = {
    ...response.frame,
    command_sequence: selectedPosition.command_sequence,
    event_sequence: selectedPosition.event_sequence,
    public_state: {
      ...response.frame.public_state,
      public_scores: {
        '1': selectedPosition.command_sequence === '6' ? 3 : 2,
        '2': 1,
      },
    },
  }

  return response
}

function replayResponsePage(
  eventDefinitions: Array<{ sequence: string; eventType: string }>,
  returnedThroughSequence: string | null,
  hasMore: boolean,
  nextAfterSequence: string | null,
): ReplayResponse {
  const response = replayResponse('completed', true)

  response.events = eventDefinitions.map(({ sequence, eventType }) => ({
    sequence,
    event_type: eventType,
    payload: {},
    occurred_at: user.created_at,
  }))
  response.event_cursor = {
    requested_after_sequence: '0',
    returned_through_sequence: returnedThroughSequence,
    has_more: hasMore,
    next_after_sequence: nextAfterSequence,
  }

  return response
}

function boardData() {
  if (!isBoardData(standardBoard)) {
    throw new Error('The standard board fixture must match the board API contract.')
  }

  return standardBoard
}
