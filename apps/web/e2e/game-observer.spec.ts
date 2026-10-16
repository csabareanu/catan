import { expect, test } from '@playwright/test'
import type { ReplayResponse } from '../src/features/replay/replayApi'

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

test('renders the safe replay context, board, and public frame', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/games/42/replay', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    await route.fulfill({ status: 200, json: replayResponse('completed', true) })
  })

  await page.goto('/games/42/observe')

  await expect(page.getByRole('heading', { name: 'Game 42 observer.' })).toBeVisible()
  await expect(page.locator('.observer-board .board-svg')).toBeVisible()
  await expect(page.locator('.observer-header-actions').getByText('Completed', { exact: true })).toBeVisible()
  await expect(page.getByText('Playing', { exact: true })).toBeVisible()
  await expect(page.locator('.observer-seat').first().getByText('Ada Player', { exact: true })).toBeVisible()
  await expect(page.getByText('Public frame available', { exact: true })).toBeVisible()
  await expect(page.getByText('Roads', { exact: true })).toBeVisible()
  await expect(page.getByText('1 recorded', { exact: true })).toBeVisible()
  await expect(page.getByText('current_state', { exact: true })).toHaveCount(0)

  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  expect(pageWidth).toBeLessThanOrEqual(viewportWidth)
})

test('explains a replay without a persisted frame', async ({ page }) => {
  await page.route('**/api/v1/games/43/replay', (route) =>
    route.fulfill({ status: 200, json: replayResponse('created', false) }),
  )

  await page.goto('/games/43/observe')

  await expect(page.getByRole('heading', { name: 'Game 43 observer.' })).toBeVisible()
  await expect(page.locator('.observer-board .board-svg')).toBeVisible()
  await expect(page.getByText('No persisted public frame yet.', { exact: true })).toBeVisible()
  await expect(page.getByText('The replay has context, but no checkpoint is available to display yet.', { exact: true })).toBeVisible()
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
  await expect(page.locator('.observer-header-actions').getByText('Queued', { exact: true })).toBeVisible()
  expect(replayRequestCount).toBeGreaterThan(0)

  await page.clock.runFor(4000)

  await expect(page.locator('.observer-header-actions').getByText('Completed', { exact: true })).toBeVisible()
  await expect(page.getByText('Public frame available', { exact: true })).toBeVisible()
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
        seed: '42',
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
            roads: { 'edge-1': { owner_seat_number: 1 } },
            public_scores: { '1': 2 },
          },
          viewer_state: null,
        }
      : null,
  }
}

function boardData() {
  const vertices = [
    { id: 'v0', x: 0, y: -2 },
    { id: 'v1', x: 1, y: -1 },
    { id: 'v2', x: 1, y: 1 },
    { id: 'v3', x: 0, y: 2 },
    { id: 'v4', x: -1, y: 1 },
    { id: 'v5', x: -1, y: -1 },
  ]

  return {
    board_schema_version: '1',
    seed: '42',
    ruleset: { key: 'base', version: '1.0.0' },
    map: { key: 'standard', version: '1.0.0', orientation: 'pointy_top' },
    hexes: [{
      id: 'hex:0:0',
      q: 0,
      r: 0,
      terrain: 'forest' as const,
      number_token: 6,
      vertex_ids: vertices.map(({ id }) => id),
    }],
    vertices,
    edges: [],
    ports: [],
  }
}
