import { expect, test, type Page } from '@playwright/test'
import { gameListResponse } from './fixtures/gameListResponse'
import type { GameLifecycleStatus, GameResponse, GameSummary } from '../src/features/games/gameApi'

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

test('queues a game once and follows queued, running, and completed status', async ({ page }) => {
  let startCount = 0
  let releaseStart: (() => void) | undefined
  const startGate = new Promise<void>((resolve) => { releaseStart = resolve })
  await page.route('**/api/v1/games/42/run', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    startCount += 1
    await startGate
    await route.fulfill({ status: 202, json: gameResponse('queued') })
  })
  let detailCount = 0
  await page.route('**/api/v1/games/42', (route) => {
    expect(route.request().method()).toBe('GET')
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    detailCount += 1
    return route.fulfill({
      status: 200,
      json: gameResponse(detailCount === 1 ? 'running' : 'completed'),
    })
  })

  await showLibrary(page, 'failed')
  await clickRunAction(page, 'Retry game')
  const startingButton = page.getByRole('button', { name: 'Starting game...', exact: true })
  await expect(startingButton).toBeDisabled()
  await startingButton.evaluate((button: HTMLButtonElement) => button.click())
  await expect.poll(() => startCount).toBe(1)
  releaseStart?.()

  await expect(page.locator('.library-status-queued')).toHaveText('In progress')
  await expect(page.getByRole('button', { name: 'Retry game', exact: true })).toHaveCount(0)
  await page.clock.runFor(2000)
  await expect(page.locator('.library-status-running')).toHaveText('In progress')
  await page.clock.runFor(2000)
  await expect(page.locator('.library-status-completed')).toHaveText('Finished')
  await page.clock.runFor(10000)
  expect(detailCount).toBe(2)
  expect(startCount).toBe(1)
})

test('stops polling a failed run and lets the owner request a retry', async ({ page }) => {
  let detailCount = 0
  await page.route('**/api/v1/games/42', (route) => {
    detailCount += 1
    return route.fulfill({ status: 200, json: gameResponse('failed') })
  })
  await page.route('**/api/v1/games/42/run', (route) =>
    route.fulfill({ status: 202, json: gameResponse('queued') }),
  )

  await showLibrary(page, 'running')
  await page.clock.runFor(2000)
  await expect(page.locator('.library-status-failed')).toHaveText('Needs attention')
  await page.clock.runFor(10000)
  expect(detailCount).toBe(1)
  await clickRunAction(page, 'Retry game')
  await expect(page.locator('.library-status-queued')).toHaveText('In progress')
})

for (const state of ['completed', 'awaiting_human_input'] as const) {
  test(`accepts an HTTP 200 start response with persisted ${state} state`, async ({ page }) => {
    let detailCount = 0
    await page.route('**/api/v1/games/42/run', (route) =>
      route.fulfill({ status: 200, json: gameResponse(state) }),
    )
    await page.route('**/api/v1/games/42', (route) => {
      detailCount += 1
      return route.fulfill({ status: 200, json: gameResponse(state) })
    })

    await showLibrary(page, 'failed')
    await clickRunAction(page, 'Retry game')
    await expect(page.locator(`.library-status-${state}`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry game', exact: true })).toHaveCount(0)
    await page.clock.runFor(10000)
    expect(detailCount).toBe(0)
  })
}

for (const failure of [
  { status: 409, code: 'game_run_not_startable', nextStatus: 'running', message: 'The game cannot be started in its current state.' },
  { status: 503, code: 'queue_dispatch_failed', nextStatus: 'failed', message: 'The game could not be queued for execution.' },
] as const) {
  test(`recovers from ${failure.code} by refreshing authoritative status`, async ({ page }) => {
    let startCount = 0
    await page.route('**/api/v1/games/42/run', (route) => {
      startCount += 1
      return route.fulfill({
        status: failure.status,
        json: { error: { code: failure.code, message: failure.message } },
      })
    })
    await page.route('**/api/v1/games/42', (route) =>
      route.fulfill({ status: 200, json: gameResponse(failure.nextStatus) }),
    )

    await showLibrary(page, 'failed')
    await clickRunAction(page, 'Retry game')
    await expect(page.getByRole('alert')).toContainText(failure.message)
    await expect(page.locator('.library-status-failed')).toHaveText('Needs attention')
    await expect(page.getByRole('button', { name: 'Retry game', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click()
    await expect(page.locator(`.library-status-${failure.nextStatus}`)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(startCount).toBe(1)
    await expect(page.locator('.account-trigger')).toHaveAttribute(
      'aria-label',
      'Account menu for Ada Player',
    )
  })
}

test('checks status after a network start failure without sending another start', async ({ page }) => {
  let startCount = 0
  await page.route('**/api/v1/games/42/run', (route) => {
    startCount += 1
    return route.abort('failed')
  })
  await page.route('**/api/v1/games/42', (route) =>
    route.fulfill({ status: 200, json: gameResponse('queued') }),
  )

  await showLibrary(page, 'failed')
  await clickRunAction(page, 'Retry game')
  await expect(page.getByRole('alert')).toContainText('Check the connection and refresh the status before trying again.')
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click()
  await expect(page.locator('.library-status-queued')).toHaveText('In progress')
  expect(startCount).toBe(1)
})

test('pauses polling after a network failure and resumes through a status refresh', async ({ page }) => {
  let detailCount = 0
  await page.route('**/api/v1/games/42', (route) => {
    detailCount += 1
    return detailCount === 1
      ? route.abort('failed')
      : route.fulfill({ status: 200, json: gameResponse('completed') })
  })

  await showLibrary(page, 'running')
  await openGameMenu(page)
  await page.clock.runFor(2000)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.library-status-running')).toHaveText('In progress')
  await page.clock.runFor(10000)
  expect(detailCount).toBe(1)
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click()
  await expect(page.locator('.library-status-completed')).toHaveText('Finished')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('shows a missing-game recovery path without losing the session', async ({ page }) => {
  await page.route('**/api/v1/games/42', (route) =>
    route.fulfill({ status: 404, json: { error: { code: 'game_not_found', message: 'The requested game was not found.' } } }),
  )

  await showLibrary(page, 'running')
  await openGameMenu(page)
  await page.clock.runFor(2000)
  await expect(page.getByRole('alert')).toContainText('The requested game was not found.')
  await expect(page.getByRole('link', { name: 'Reload library', exact: true })).toHaveAttribute('href', '/games')
  expect(await page.evaluate(() => sessionStorage.getItem('catan.api-token'))).toBe('test-token')
})

test('clears an expired session when a lifecycle refresh returns 401', async ({ page }) => {
  await page.route('**/api/v1/games/42', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'unauthenticated', message: 'Authentication is required.' } } }),
  )

  await showLibrary(page, 'running')
  await openGameMenu(page)
  await page.clock.runFor(2000)
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => sessionStorage.getItem('catan.api-token'))).toBeNull()
})

test('keeps one poll in flight and aborts it when the view unmounts', async ({ page }) => {
  let detailCount = 0
  await page.route('**/api/v1/games/42', () => { detailCount += 1 })
  await showLibrary(page, 'running')
  await page.clock.runFor(2000)
  await expect.poll(() => detailCount).toBe(1)
  await page.clock.runFor(10000)
  expect(detailCount).toBe(1)

  const aborted = page.waitForEvent('requestfailed', {
    predicate: (request) => request.url().endsWith('/api/v1/games/42'),
  })
  await page.evaluate(() => {
    history.pushState({}, '', '/games/new')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Create a game.' })).toBeVisible()
  expect((await aborted).failure()?.errorText).toContain('ERR_ABORTED')
  await page.clock.runFor(10000)
  expect(detailCount).toBe(1)
})

async function showLibrary(page: Page, lifecycleStatus: GameLifecycleStatus) {
  await page.route('**/api/v1/games', (route) =>
    route.fulfill({ status: 200, json: gameListResponse([gameSummary(lifecycleStatus)]) }),
  )
  await page.goto('/games')
  await expect(page.locator(`.library-status-${lifecycleStatus}`)).toBeVisible()
}

async function openGameMenu(page: Page) {
  const gameCard = page.locator('.library-item').filter({ hasText: 'Game 42' })
  const gameMenu = gameCard.locator('.library-game-menu')

  if ((await gameMenu.getAttribute('open')) === null) {
    await gameMenu.locator('.library-more-trigger').click()
  }
}

async function clickRunAction(page: Page, action: 'Retry game') {
  await openGameMenu(page)
  await page.getByRole('button', { name: action, exact: true }).click()
}

function gameSummary(lifecycleStatus: GameLifecycleStatus): GameSummary {
  return {
    id: 42,
    owner_id: user.id,
    mode: 'human_vs_ai',
    seed: '42',
    ruleset: { key: 'base', version: '1.0.0' },
    map: { key: 'standard', version: '1.0.0', orientation: 'pointy_top' },
    seat_count: 3,
    human_seat_number: 1,
    lifecycle_status: lifecycleStatus,
    configuration: { ai_count: 2 },
    created_at: user.created_at,
    updated_at: user.created_at,
  }
}

function gameResponse(lifecycleStatus: GameLifecycleStatus): GameResponse {
  return {
    data: {
      ...gameSummary(lifecycleStatus),
      board: {
        board_schema_version: '1',
        seed: '42',
        ruleset: { key: 'base', version: '1.0.0' },
        map: { key: 'standard', version: '1.0.0', orientation: 'pointy_top' },
        hexes: [], vertices: [], edges: [], ports: [],
      },
      seats: [
        { seat_number: 1, controller_type: 'human', user_id: user.id, label: user.name },
        { seat_number: 2, controller_type: 'ai', user_id: null, label: 'AI 2' },
        { seat_number: 3, controller_type: 'ai', user_id: null, label: 'AI 3' },
      ],
    },
  }
}
