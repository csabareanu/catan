import { devices, expect, test } from '@playwright/test'
import { isBoardData } from '../src/features/board/boardApi'
import type { ReplayEvent, ReplayResponse } from '../src/features/replay/replayApi'
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

for (const seatCount of [3, 4]) {
  test(`renders the persisted ${seatCount}-seat setup state`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const gameID = 60 + seatCount
    const response = setupReplayResponse(seatCount, 1)

    await page.route(`**/api/v1/games/${gameID}/replay`, (route) =>
      route.fulfill({ status: 200, json: response }),
    )

    await page.goto(`/games/${gameID}/observe`)

    const statusPanel = page.locator('.observer-status-panel')
    await expect(statusPanel).toContainText('Initial Placement')
    await expect(statusPanel).toContainText('Setup round')
    await expect(statusPanel).toContainText('Setup order')
    await expect(statusPanel).toContainText('AI 2')

    const seatOrder = [seatCount, ...Array.from({ length: seatCount - 1 }, (_, index) => index + 1)]
      .map((seatNumber) => seatNumber === 1 ? 'Ada Player' : `AI ${seatNumber}`)
      .join(' → ')
    await expect(statusPanel).toContainText(seatOrder)

    for (let index = 0; index < seatCount; index += 1) {
      const seatNumber = index + 1
      const settlementID = boardData().vertices[index]?.id
      const roadID = boardData().edges[index]?.id

      if (!settlementID || !roadID) {
        throw new Error('The standard board fixture must provide setup structure positions.')
      }

      await expect(page.locator(`[data-board-settlement-id="${settlementID}"]`))
        .toHaveAttribute('data-seat-number', String(seatNumber))
      await expect(page.locator(`[data-board-road-edge-id="${roadID}"]`))
        .toHaveAttribute('data-seat-number', String(seatNumber))
      const color = ['human', 'sable', 'moss', 'clay'][seatNumber - 1]
      await expect(page.locator(`[data-board-settlement-id="${settlementID}"]`))
        .toHaveClass(new RegExp(`board-piece-${color}`))
      await expect(page.locator(`[data-board-road-edge-id="${roadID}"]`))
        .toHaveClass(new RegExp(`board-piece-${color}`))
    }

    const resources = page.locator('.observer-setup-resources')
    await expect(resources).toBeVisible()
    await expect(resources.locator('[data-resource-count]')).toHaveCount(5)
    await expect(resources.locator('[data-resource="lumber"]')).toContainText('4')
    await expect(resources.locator('[data-resource="wool"]')).toContainText('3')
    await expect(resources.locator('[data-resource="grain"]')).toContainText('2')
    await expect(resources.locator('[data-resource="brick"]')).toContainText('1')
    await expect(resources.locator('[data-resource="ore"]')).toContainText('0')
    await expect(resources).not.toContainText('701')
    await expect(page.getByRole('button', { name: 'Play setup', exact: true })).toBeVisible()
    await expect(page.locator('[data-setup-playback-status]'))
      .toContainText('Showing the latest saved setup state.')
    await expect(page.locator('.observer-history-event[aria-current="step"]')).toHaveCount(0)
  })
}

test('lets the owner choose a legal pair, submit once, and watch the saved continuation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const legalOptions = humanPlacementOptions()
  const submittedCommands: Array<{
    body: unknown
    headers: Record<string, string>
  }> = []
  let placementAccepted = false
  let optionsRequestCount = 0
  let releaseOptions = () => {}
  let releaseSubmission = () => {}
  const optionsGate = new Promise<void>((resolve) => {
    releaseOptions = resolve
  })
  const submissionGate = new Promise<void>((resolve) => {
    releaseSubmission = resolve
  })

  await page.route('**/api/v1/games/74/replay**', async (route) => {
    await route.fulfill({
      status: 200,
      json: placementAccepted
        ? humanPlacementCompletionResponse(74)
        : humanPlacementBoundaryResponse('9', 74),
    })
  })
  await page.route('**/api/v1/games/74/initial-placement/options', async (route) => {
    optionsRequestCount += 1
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    await optionsGate
    await route.fulfill({
      status: 200,
      json: humanPlacementOptionsResponse('9', legalOptions),
    })
  })
  await page.route('**/api/v1/games/74/initial-placement', async (route) => {
    submittedCommands.push({
      body: route.request().postDataJSON(),
      headers: route.request().headers(),
    })
    await submissionGate
    placementAccepted = true
    await route.fulfill({
      status: 200,
      json: humanPlacementCommandResponse('14', '16', 'running'),
    })
  })

  await page.goto('/games/74/observe')
  await expect(page.locator('[data-initial-placement-status]'))
    .toContainText('Play setup to your turn')
  const turnActionPanel = page.locator('#observer-sidebar .observer-turn-action-panel')
  await expect(turnActionPanel).toContainText('Your turn')
  await expect(turnActionPanel).toContainText('Initial placement')
  await expect(turnActionPanel.locator('.observer-placement-panel')).toBeVisible()
  expect(optionsRequestCount).toBe(0)
  await page.getByRole('button', { name: 'Play setup', exact: true }).click()
  for (let eventIndex = 0; eventIndex < 6; eventIndex += 1) {
    await page.clock.runFor(900)
  }

  await expect(page.locator('[data-setup-playback-status]'))
    .toContainText('Waiting for Ada Player to place a settlement and road.')
  await expect.poll(() => optionsRequestCount).toBe(1)
  await expect.poll(() => page.locator('.observer-placement-panel').getAttribute('aria-labelledby'))
    .toBe('observer-placement-title')
  await expect(page.locator('[data-initial-placement-status]'))
    .toContainText('Loading legal choices')
  releaseOptions()
  await expect(page.locator('.observer-placement-steps li[aria-current="step"]'))
    .toContainText('House')
  await expect(page.locator('.observer-secondary-panel').nth(0))
    .toHaveJSProperty('open', false)
  await expect(page.locator('.observer-secondary-panel').nth(1))
    .toHaveJSProperty('open', false)

  const settlementIDs = [...new Set(legalOptions.map((option) => option.settlement_vertex_id))]
  const settlementChoices = page.locator('[data-board-placement-settlement-id]')
  await expect(settlementChoices).toHaveCount(settlementIDs.length)
  expect(await settlementChoices.evaluateAll((choices) =>
    choices.map((choice) => choice.getAttribute('data-board-placement-settlement-id')),
  )).toEqual(settlementIDs)
  await expect(page.locator('[data-board-placement-road-id]')).toHaveCount(0)

  const firstSettlement = page.locator(
    `[data-board-placement-settlement-id="${legalOptions[0]?.settlement_vertex_id}"]`,
  )
  await firstSettlement.focus()
  await page.keyboard.press('Enter')
  await expect(firstSettlement).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.observer-placement-steps li[aria-current="step"]'))
    .toContainText('Road')
  await expect(page.getByRole('button', { name: 'Change house', exact: true }))
    .toBeVisible()
  const connectedRoadChoices = page.locator('[data-board-placement-road-id]')
  const firstSettlementRoads = legalOptions
    .filter((option) => option.settlement_vertex_id === legalOptions[0]?.settlement_vertex_id)
    .map((option) => option.road_edge_id)
  await expect(connectedRoadChoices).toHaveCount(firstSettlementRoads.length)
  expect(await connectedRoadChoices.evaluateAll((choices) =>
    choices.map((choice) => choice.getAttribute('data-board-placement-road-id')),
  )).toEqual(firstSettlementRoads)
  await expect(page.locator('[data-board-placement-settlement-id].board-placement-choice-muted'))
    .toHaveCount(settlementIDs.length - 1)
  await expect(page.getByRole('button', { name: 'Confirm placement', exact: true }))
    .toHaveCount(0)

  const selectedRoad = page.locator(
    `[data-board-placement-road-id="${firstSettlementRoads[0]}"]`,
  )
  await selectedRoad.focus()
  await page.keyboard.press('Space')
  await expect(selectedRoad).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-board-placement-road-id].board-placement-choice-muted'))
    .toHaveCount(firstSettlementRoads.length - 1)
  const placementPreview = page.locator('[data-placement-preview]')
  await expect(placementPreview).toContainText('House selected')
  await expect(placementPreview).toContainText('Road selected')
  await expect(placementPreview).not.toContainText('vertex:')
  await expect(placementPreview).not.toContainText('edge:')

  const confirmPlacement = page.getByRole('button', {
    name: 'Confirm placement',
    exact: true,
  })
  await confirmPlacement.click()
  await expect(page.getByRole('button', {
    name: 'Submitting…',
    exact: true,
  })).toBeDisabled()
  await expect(page.locator('[data-initial-placement-status]'))
    .toContainText('Submitting placement')
  await expect.poll(() => submittedCommands).toHaveLength(1)
  expect(submittedCommands[0]?.body).toEqual({
    expected_command_sequence: '9',
    settlement_vertex_id: legalOptions[0]?.settlement_vertex_id,
    road_edge_id: firstSettlementRoads[0],
  })
  expect(submittedCommands[0]?.headers['idempotency-key']).toBeTruthy()
  releaseSubmission()

  await expect(page.locator('[data-initial-placement-status]'))
    .toContainText('Placement accepted. Setup is continuing on the board.')
  await expect(page.locator('[data-initial-placement-status]')).toBeFocused()
  await expect(page.locator('.observer-history-event[aria-current="step"]'))
    .toHaveAttribute('data-event-sequence', '8')
  for (const sequence of ['9', '10', '11', '12', '13', '14', '15', '16']) {
    await page.clock.runFor(900)
    await expect(page.locator('.observer-history-event[aria-current="step"]'))
      .toHaveAttribute('data-event-sequence', sequence)
  }

  await expect(page.locator('[data-setup-playback-status]'))
    .toContainText('Setup complete. The game is ready for turns.')
  await expect(page.locator('.observer-placement-panel')).toHaveCount(0)
  expect(submittedCommands).toHaveLength(1)
})

test('keeps placement view-only on a historical replay position', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  let optionsRequestCount = 0
  let submitRequestCount = 0

  await page.route('**/api/v1/games/75/replay**', async (route) => {
    const commandSequence = new URL(route.request().url()).searchParams.get('at_command_sequence')
    await route.fulfill({
      status: 200,
      json: commandSequence === '6'
        ? humanPlacementHistoricalResponse(75)
        : humanPlacementBoundaryResponse('9', 75),
    })
  })
  await page.route('**/api/v1/games/75/initial-placement/options', async (route) => {
    optionsRequestCount += 1
    await route.fulfill({
      status: 200,
      json: humanPlacementOptionsResponse('9', humanPlacementOptions()),
    })
  })
  await page.route('**/api/v1/games/75/initial-placement', async () => {
    submitRequestCount += 1
  })

  await page.goto('/games/75/observe')
  await page.getByRole('button', { name: 'Play setup', exact: true }).click()
  for (let eventIndex = 0; eventIndex < 6; eventIndex += 1) {
    await page.clock.runFor(900)
  }
  await expect(page.locator('[data-board-placement-settlement-id]')).toHaveCount(2)
  expect(optionsRequestCount).toBe(1)

  const historyPanel = page.locator('details.observer-secondary-panel').filter({
    has: page.locator('#observer-history-title'),
  })
  await historyPanel.locator('summary').click()
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(page.getByText('Command 6 · Event 5', { exact: true })).toBeVisible()
  await expect(page.locator('[data-initial-placement-status]'))
    .toContainText('Historical position')
  await expect(page.getByRole('button', { name: 'Confirm placement', exact: true }))
    .toHaveCount(0)
  await expect(page.locator('[data-board-placement-settlement-id]')).toHaveCount(0)
  expect(optionsRequestCount).toBe(1)
  expect(submitRequestCount).toBe(0)
})

test('refreshes stale placement state before showing choices again', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const requestedOptionSequences: string[] = []
  let replayRequestCount = 0
  let releaseReplayRefresh = () => {}
  let replayRefreshStarted = () => {}
  let stalePlacementSubmitted = false
  const replayRefreshGate = new Promise<void>((resolve) => {
    releaseReplayRefresh = resolve
  })
  const replayRefreshSignal = new Promise<void>((resolve) => {
    replayRefreshStarted = resolve
  })

  await page.route('**/api/v1/games/76/replay**', async (route) => {
    if (stalePlacementSubmitted) {
      replayRequestCount += 1
      replayRefreshStarted()
      await replayRefreshGate
    }

    await route.fulfill({
      status: 200,
      json: stalePlacementSubmitted
        ? humanPlacementBoundaryResponse('10', 76)
        : humanPlacementBoundaryResponse('9', 76),
    })
  })
  await page.route('**/api/v1/games/76/initial-placement/options', async (route) => {
    const commandSequence = requestedOptionSequences.length === 0 ? '9' : '10'
    requestedOptionSequences.push(commandSequence)
    await route.fulfill({
      status: 200,
      json: humanPlacementOptionsResponse(commandSequence, humanPlacementOptions()),
    })
  })
  await page.route('**/api/v1/games/76/initial-placement', async (route) => {
    stalePlacementSubmitted = true
    await route.fulfill({
      status: 409,
      json: {
        error: {
          code: 'stale_initial_placement',
          message: 'The game has advanced since these placement options were loaded.',
        },
      },
    })
  })

  await page.goto('/games/76/observe')
  await page.getByRole('button', { name: 'Play setup', exact: true }).click()
  for (let eventIndex = 0; eventIndex < 6; eventIndex += 1) {
    await page.clock.runFor(900)
  }
  await expect(page.locator('[data-board-placement-settlement-id]')).toHaveCount(2)
  await page.locator('[data-board-placement-settlement-id]').first().click()
  await page.locator('[data-board-placement-road-id]').first().click()
  await page.getByRole('button', {
    name: 'Confirm placement',
    exact: true,
  }).click()

  await replayRefreshSignal
  await expect(page.locator('[data-initial-placement-status]'))
    .toContainText('The saved game changed')
  releaseReplayRefresh()
  await expect.poll(() => replayRequestCount).toBe(1)
  await expect(page.locator('[data-initial-placement-status]'))
    .toContainText('Play setup to your turn')

  await page.getByRole('button', { name: 'Play setup', exact: true }).click()
  for (let eventIndex = 0; eventIndex < 6; eventIndex += 1) {
    await page.clock.runFor(900)
  }
  await expect(page.locator('[data-board-placement-settlement-id]')).toHaveCount(2)
  expect(requestedOptionSequences).toEqual(['9', '10'])
})

test('retries a failed placement with the same idempotency key', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const placementRequests: Array<{
    body: unknown
    idempotencyKey: string | undefined
  }> = []

  let placementAccepted = false

  await page.route('**/api/v1/games/77/replay**', async (route) => {
    await route.fulfill({
      status: 200,
      json: placementAccepted
        ? humanPlacementCompletionResponse(77)
        : humanPlacementBoundaryResponse('9', 77),
    })
  })
  await page.route('**/api/v1/games/77/initial-placement/options', async (route) => {
    await route.fulfill({
      status: 200,
      json: humanPlacementOptionsResponse('9', humanPlacementOptions()),
    })
  })
  await page.route('**/api/v1/games/77/initial-placement', async (route) => {
    placementRequests.push({
      body: route.request().postDataJSON(),
      idempotencyKey: route.request().headers()['idempotency-key'],
    })

    if (placementRequests.length === 1) {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'game_engine_unavailable',
            message: 'The game engine is unavailable.',
          },
        },
      })
      return
    }

    placementAccepted = true
    await route.fulfill({
      status: 200,
      json: humanPlacementCommandResponse('14', '16', 'running'),
    })
  })

  await page.goto('/games/77/observe')
  await page.getByRole('button', { name: 'Play setup', exact: true }).click()
  for (let eventIndex = 0; eventIndex < 6; eventIndex += 1) {
    await page.clock.runFor(900)
  }
  await expect(page.locator('[data-board-placement-settlement-id]')).toHaveCount(2)
  await page.locator('[data-board-placement-settlement-id]').first().click()
  await page.locator('[data-board-placement-road-id]').first().click()
  await page.getByRole('button', {
    name: 'Confirm placement',
    exact: true,
  }).click()

  await expect(page.locator('[data-initial-placement-status]'))
    .toContainText('The game engine is unavailable')
  const retryPlacement = page.getByRole('button', {
    name: 'Retry placement safely',
    exact: true,
  })
  await expect(retryPlacement).toBeEnabled()
  await retryPlacement.click()
  await expect.poll(() => placementRequests).toHaveLength(2)
  expect(placementRequests[1]?.body).toEqual(placementRequests[0]?.body)
  expect(placementRequests[1]?.idempotencyKey).toBe(placementRequests[0]?.idempotencyKey)
})

test('keeps setup playback understandable with reduced motion enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/v1/games/78/replay', (route) =>
    route.fulfill({ status: 200, json: setupPlaybackResponse(1) }),
  )

  await page.goto('/games/78/observe')
  await page.getByRole('button', { name: 'Play setup', exact: true }).click()
  await page.clock.runFor(900)
  await expect(page.locator('.observer-history-event[aria-current="step"]'))
    .toHaveAttribute('data-event-sequence', '2')
  await page.clock.runFor(900)
  await expect(page.locator('.observer-history-event[aria-current="step"]'))
    .toHaveAttribute('data-event-sequence', '3')
  await expect(page.locator('.board-setup-piece-reveal').first())
    .toHaveCSS('animation-name', 'none')
})

test('plays setup events in order across pages and stops at the human input boundary', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const requestedCursors: Array<string | null> = []

  await page.route('**/api/v1/games/68/replay**', async (route) => {
    const afterEventSequence = new URL(route.request().url()).searchParams.get('after_event_sequence')
    requestedCursors.push(afterEventSequence)
    await route.fulfill({ status: 200, json: setupPlaybackResponse(1, afterEventSequence) })
  })

  await page.goto('/games/68/observe')
  await page.getByRole('button', { name: 'Play setup', exact: true }).click()
  for (const sequence of ['2', '3', '4', '5', '6', '7']) {
    await page.clock.runFor(900)
    await expect(page.locator('.observer-history-event[aria-current="step"]'))
      .toHaveAttribute('data-event-sequence', sequence)

    if (sequence === '4') {
      await expect(page.locator('[data-event-sequence="7"]')).toBeVisible()
    }
  }

  const playbackStatus = page.locator('[data-setup-playback-status]')
  await expect(playbackStatus).toContainText('Waiting for Ada Player to place a settlement and road.')
  await expect(page.locator('.observer-history-event strong')).toHaveText([
    'Initial placement started',
    'Initial settlement placed',
    'Initial road placed',
    'Starting resources granted',
    'Initial settlement placed',
    'Initial road placed',
  ])
  await expect(page.locator('[data-event-sequence="5"] p')).toHaveText(
    'AI 2 receives starting resources: 1 lumber, 1 wool.',
  )

  for (const seatNumber of [2, 3]) {
    const vertexID = boardData().vertices[seatNumber - 1]?.id
    const edgeID = boardData().edges[seatNumber - 1]?.id

    if (!vertexID || !edgeID) {
      throw new Error('The standard board fixture must provide setup structure positions.')
    }

    await expect(page.locator(`[data-board-settlement-id="${vertexID}"]`))
      .toHaveAttribute('data-seat-number', String(seatNumber))
    await expect(page.locator(`[data-board-road-edge-id="${edgeID}"]`))
      .toHaveAttribute('data-seat-number', String(seatNumber))
  }

  await expect(page.locator('.board-setup-settlement-owner')).toHaveCount(2)
  await expect(page.locator('.board-setup-road-owner')).toHaveCount(2)
  await expect(page.locator('.observer-history-event[aria-current="step"]'))
    .toHaveAttribute('data-event-sequence', '7')
  await expect(page.locator('.observer-setup-resources')).toContainText('4')
  expect(requestedCursors.filter((cursor) => cursor !== null)).toEqual(['4'])
  await page.screenshot({ path: testInfo.outputPath('setup-playback.png') })
})

test('pauses and resumes setup playback, and stepping advances one event', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/v1/games/69/replay', (route) =>
    route.fulfill({ status: 200, json: setupPlaybackResponse(1) }),
  )

  await page.goto('/games/69/observe')
  await page.getByRole('button', { name: 'Play setup', exact: true }).click()
  await page.clock.runFor(900)
  await expect(page.locator('.observer-history-event[aria-current="step"]'))
    .toHaveAttribute('data-event-sequence', '2')

  await page.getByRole('button', { name: 'Pause setup', exact: true }).click()
  await page.clock.runFor(3000)
  await expect(page.locator('.observer-history-event[aria-current="step"]'))
    .toHaveAttribute('data-event-sequence', '2')

  await page.getByRole('button', { name: 'Resume setup', exact: true }).click()
  await page.clock.runFor(900)
  await expect(page.locator('.observer-history-event[aria-current="step"]'))
    .toHaveAttribute('data-event-sequence', '3')

  const settlementID = boardData().vertices[1]?.id
  const roadID = boardData().edges[1]?.id

  if (!settlementID || !roadID) {
    throw new Error('The standard board fixture must provide setup structure positions.')
  }

  await expect(page.locator(`[data-board-settlement-id="${settlementID}"]`)).toBeVisible()
  await expect(page.locator('.board-setup-road-owner')).toHaveCount(0)

  await page.getByRole('button', { name: 'Pause setup', exact: true }).click()
  await page.getByRole('button', { name: 'Next event', exact: true }).click()
  await expect(page.locator('.observer-history-event[aria-current="step"]'))
    .toHaveAttribute('data-event-sequence', '4')
  await expect(page.locator(`[data-board-road-edge-id="${roadID}"]`))
    .toHaveAttribute('data-seat-number', '2')
  await page.clock.runFor(3000)
  await expect(page.locator('.observer-history-event[aria-current="step"]'))
    .toHaveAttribute('data-event-sequence', '4')
})

test('restores the selected snapshot board after moving backward and returning to latest', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const requestedPositions: Array<string | null> = []

  await page.route('**/api/v1/games/72/replay**', async (route) => {
    const position = new URL(route.request().url()).searchParams.get('at_command_sequence')
    requestedPositions.push(position)
    await route.fulfill({ status: 200, json: setupReplayResponseAt(position ?? '9') })
  })

  await page.goto('/games/72/observe')
  await expect(page.locator('.board-setup-settlement-owner')).toHaveCount(2)
  await page.getByRole('button', { name: 'Next event', exact: true }).click()
  await page.getByRole('button', { name: 'Next event', exact: true }).click()
  await expect(page.locator('.board-setup-settlement-owner')).toHaveCount(1)

  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(page.getByText('Saved position 2 of 3', { exact: true })).toBeVisible()
  await expect(page.locator('.board-setup-settlement-owner')).toHaveCount(1)
  await expect(page.locator('.board-setup-road-owner')).toHaveCount(1)

  await page.getByRole('button', { name: 'Latest', exact: true }).click()
  await expect(page.getByText('Latest saved position', { exact: true })).toBeVisible()
  await expect(page.locator('.board-setup-settlement-owner')).toHaveCount(2)
  await expect(page.locator('.board-setup-road-owner')).toHaveCount(2)
  expect(requestedPositions.slice(-3)).toEqual([null, '6', null])
})

test('reduces the setup-piece reveal animation when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/v1/games/70/replay', (route) =>
    route.fulfill({ status: 200, json: setupPlaybackResponse(1) }),
  )

  await page.goto('/games/70/observe')
  await page.getByRole('button', { name: 'Next event', exact: true }).click()
  await page.getByRole('button', { name: 'Next event', exact: true }).click()

  const settlement = page.locator('.board-setup-settlement-owner').first()
  await expect(settlement).toHaveClass(/board-setup-piece-reveal/)
  await expect(settlement).toHaveCSS('animation-name', 'none')
})

test('stops AI-only setup playback at the completion event', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const requestedCursors: Array<string | null> = []

  await page.route('**/api/v1/games/71/replay**', async (route) => {
    const afterEventSequence = new URL(route.request().url()).searchParams.get('after_event_sequence')
    requestedCursors.push(afterEventSequence)
    await route.fulfill({ status: 200, json: setupPlaybackResponse(null, afterEventSequence) })
  })

  await page.goto('/games/71/observe')
  await page.getByRole('button', { name: 'Play setup', exact: true }).click()
  for (const sequence of ['2', '3', '4', '5', '6', '7', '8']) {
    await page.clock.runFor(900)
    await expect(page.locator('.observer-history-event[aria-current="step"]'))
      .toHaveAttribute('data-event-sequence', sequence)

    if (sequence === '4' || sequence === '7') {
      await expect(page.locator(`[data-event-sequence="${sequence === '4' ? '7' : '8'}"]`))
        .toBeVisible()
    }
  }

  await expect(page.locator('[data-setup-playback-status]'))
    .toHaveText('Setup complete. The game is ready for turns.')
  await expect(page.locator('.observer-history-event[aria-current="step"]'))
    .toHaveAttribute('data-event-sequence', '8')
  await expect(page.getByRole('button', { name: 'Replay setup', exact: true })).toBeVisible()
  expect(requestedCursors.filter((cursor) => cursor !== null)).toEqual(['4', '7'])
})

test('adapts setup-piece contrast and detail to each board appearance', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/v1/games/67/replay', (route) =>
    route.fulfill({ status: 200, json: setupReplayResponse(3, 1) }),
  )

  await page.goto('/games/67/observe')

  const board = page.locator('.board-svg')
  const road = page.locator('.board-setup-road-owner').first()
  const settlement = page.locator('.board-setup-settlement-owner').first()
  const settlementArtwork = settlement.locator('.board-setup-settlement-artwork')
  await expect(board).toHaveAttribute('data-board-appearance', 'classic')
  await expect(road.locator('.board-setup-road-shadow')).toHaveCSS('stroke-width', '10px')
  await expect(road.locator('.board-setup-road-grain')).toHaveCSS('display', 'none')
  await expect(settlement.locator('.board-setup-settlement-window')).toHaveCSS('opacity', '0')
  await expect(settlementArtwork).toHaveAttribute('transform', 'scale(1.2)')
  const classicSettlementBounds = await settlementArtwork.boundingBox()

  if (classicSettlementBounds === null) {
    throw new Error('The setup settlement must be visible in Classic appearance.')
  }

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.getByRole('radio', { name: 'Illustrated', exact: true }).check()
  await settings.getByRole('button', { name: 'Done', exact: true }).click()

  await expect(board).toHaveAttribute('data-board-appearance', 'illustrated')
  await expect(road.locator('.board-setup-road-shadow')).toHaveCSS('stroke-width', '14.5px')
  await expect(road.locator('.board-setup-road-outline')).toHaveCSS('stroke-width', '10px')
  await expect(road.locator('.board-setup-road')).toHaveCSS('stroke-width', '6.4px')
  await expect(road.locator('.board-setup-road-grain')).toHaveCSS('display', 'block')
  await expect(settlementArtwork).toHaveAttribute('transform', 'scale(1.2)')
  const illustratedSettlementBounds = await settlementArtwork.boundingBox()

  if (illustratedSettlementBounds === null) {
    throw new Error('The setup settlement must be visible in Illustrated appearance.')
  }

  expect(Math.abs(illustratedSettlementBounds.width - classicSettlementBounds.width)).toBeLessThanOrEqual(2.5)
  expect(Math.abs(illustratedSettlementBounds.height - classicSettlementBounds.height)).toBeLessThanOrEqual(2.5)
  await expect(settlement.locator('.board-setup-settlement-shadow')).toHaveCSS('stroke-width', '7px')
  await expect(settlement.locator('.board-setup-settlement-outline')).toHaveCSS('stroke-width', '5.1px')
  await expect(settlement.locator('.board-setup-settlement-window')).toHaveCSS('opacity', '1')
  await expect(settlement.locator('.board-setup-settlement-roof-detail')).toHaveCSS('opacity', '1')
})

test('does not render private inventories for an AI-only setup frame', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/v1/games/65/replay', (route) =>
    route.fulfill({ status: 200, json: setupReplayResponse(3, null) }),
  )

  await page.goto('/games/65/observe')

  await expect(page.locator('.observer-setup-resources')).toHaveCount(0)
  await expect(page.getByText('701', { exact: true })).toHaveCount(0)
})

test('does not render viewer resources when the projection names another seat', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const response = setupReplayResponse(3, 1)

  if (response.frame === null) {
    throw new Error('The setup fixture must contain a persisted frame.')
  }

  response.frame.viewer_state = {
    seat_number: 2,
    resources: { lumber: 7, wool: 6, grain: 5, brick: 4, ore: 3 },
  }
  await page.route('**/api/v1/games/66/replay', (route) =>
    route.fulfill({ status: 200, json: response }),
  )

  await page.goto('/games/66/observe')

  await expect(page.locator('.observer-setup-resources')).toHaveCount(0)
  await expect(page.getByText('7', { exact: true })).toHaveCount(0)
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

test('keeps the board fixed while a saved replay position refreshes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  let releaseNavigationResponse = () => {}
  let isNavigationResponseWaiting = false
  const navigationResponseGate = new Promise<void>((resolve) => {
    releaseNavigationResponse = resolve
  })

  await page.route('**/api/v1/games/73/replay**', async (route) => {
    const position = new URL(route.request().url()).searchParams.get('at_command_sequence')

    if (position === '6') {
      isNavigationResponseWaiting = true
      await navigationResponseGate
    }

    await route.fulfill({
      status: 200,
      json: replayResponseAt(position ?? '9'),
    })
  })

  await page.goto('/games/73/observe')
  const board = page.locator('.observer-board')
  const beforeRefresh = await board.boundingBox()

  if (beforeRefresh === null) {
    throw new Error('The observer board must be visible before navigating replay positions.')
  }

  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect.poll(() => isNavigationResponseWaiting).toBe(true)
  await expect(page.getByRole('status', { name: 'Refreshing the persisted replay' })).toBeVisible()
  const duringRefresh = await board.boundingBox()

  if (duringRefresh === null) {
    throw new Error('The observer board must remain visible while a replay position loads.')
  }

  releaseNavigationResponse()
  await expect(page.getByText('Command 6 · Event 8', { exact: true })).toBeVisible()
  const afterRefresh = await board.boundingBox()

  if (afterRefresh === null) {
    throw new Error('The observer board must be visible after replay navigation completes.')
  }

  expect(Math.abs(duringRefresh.y - beforeRefresh.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(afterRefresh.y - beforeRefresh.y)).toBeLessThanOrEqual(1)
})

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

function setupReplayResponse(
  seatCount: number,
  humanSeatNumber: number | null,
): ReplayResponse {
  const response = replayResponse(humanSeatNumber === null ? 'completed' : 'running', true)
  const seats = Array.from({ length: seatCount }, (_, index) => {
    const seatNumber = index + 1

    return {
      seat_number: seatNumber,
      controller_type: seatNumber === humanSeatNumber ? 'human' : 'ai',
      label: seatNumber === 1 ? 'Ada Player' : `AI ${seatNumber}`,
    }
  })
  const seatOrder = [seatCount, ...Array.from({ length: seatCount - 1 }, (_, index) => index + 1)]
  const players = seats.map((seat, index) => {
    const settlementID = boardData().vertices[index]?.id
    const roadID = boardData().edges[index]?.id

    if (!settlementID || !roadID) {
      throw new Error('The standard board fixture must provide setup structure positions.')
    }

    return {
      seat_number: seat.seat_number,
      settlements: [settlementID],
      roads: [roadID],
      resources: {
        lumber: 700 + seat.seat_number,
        wool: 700 + seat.seat_number,
        grain: 700 + seat.seat_number,
        brick: 700 + seat.seat_number,
        ore: 700 + seat.seat_number,
      },
    }
  })

  response.context.game.mode = humanSeatNumber === null ? 'ai_only' : 'human_vs_ai'
  response.context.game.seat_count = seatCount
  response.context.game.human_seat_number = humanSeatNumber
  response.context.game.state_schema_version = 'state-v2'
  response.context.seats = seats
  response.snapshot_index[0]!.state_schema_version = 'state-v2'

  if (response.frame === null) {
    throw new Error('The setup fixture must contain a persisted frame.')
  }

  response.frame.state_schema_version = 'state-v2'
  response.frame.public_projection_schema_version = 'replay-public-v2'
  response.frame.public_state = {
    phase: 'initial_placement',
    active_seat_number: 2,
    seat_order: seatOrder,
    round: 2,
    step: 'place_initial_settlement_and_road',
    players,
  }
  response.frame.viewer_state = humanSeatNumber === null
    ? null
    : {
        seat_number: humanSeatNumber,
        resources: { lumber: 4, wool: 3, grain: 2, brick: 1, ore: 0 },
      }

  if (humanSeatNumber === null) {
    delete response.frame.viewer_projection_schema_version
  } else {
    response.frame.viewer_projection_schema_version = 'replay-viewer-v1'
  }

  return response
}

function humanPlacementBoundaryResponse(
  commandSequence = '9',
  gameID = 42,
): ReplayResponse {
  const response = setupReplayResponse(3, 1)
  const events = setupPlaybackEvents(1)
  const state = response.frame?.public_state

  if (!response.frame || !state) {
    throw new Error('The human placement fixture must contain a public state frame.')
  }

  response.context.game.lifecycle_status = 'awaiting human input'
  response.context.game.id = gameID
  response.events = events
  response.event_cursor = {
    requested_after_sequence: '0',
    returned_through_sequence: '7',
    has_more: false,
    next_after_sequence: null,
  }
  response.snapshot_index = [
    {
      command_sequence: '6',
      event_sequence: '5',
      state_schema_version: 'state-v2',
      created_at: user.created_at,
    },
    {
      command_sequence: commandSequence,
      event_sequence: '7',
      state_schema_version: 'state-v2',
      created_at: user.created_at,
    },
  ]
  response.frame.command_sequence = commandSequence
  response.frame.event_sequence = '7'
  response.frame.public_state = {
    ...state,
    phase: 'initial_placement',
    active_seat_number: 1,
    seat_order: [2, 3, 1],
    round: 1,
    step: 'place_initial_settlement_and_road',
  }

  return response
}

function humanPlacementHistoricalResponse(gameID = 42): ReplayResponse {
  const response = humanPlacementBoundaryResponse('9', gameID)
  const frame = response.frame

  if (!frame) {
    throw new Error('The human placement history fixture must contain a frame.')
  }

  response.events = setupPlaybackEvents(1).filter((event) => event.sequence <= '5')
  response.event_cursor = {
    requested_after_sequence: '0',
    returned_through_sequence: '5',
    has_more: false,
    next_after_sequence: null,
  }
  frame.command_sequence = '6'
  frame.event_sequence = '5'

  return response
}

function humanPlacementCompletionResponse(gameID = 42): ReplayResponse {
  const response = humanPlacementBoundaryResponse('9', gameID)
  const frame = response.frame
  const vertices = boardData().vertices
  const edges = boardData().edges

  if (!frame) {
    throw new Error('The human placement completion fixture must contain a frame.')
  }

  const humanSettlementID = vertices[6]?.id
  const humanRoadID = edges[6]?.id
  const thirdSeatSettlementID = vertices[7]?.id
  const thirdSeatRoadID = edges[7]?.id
  const secondSeatSettlementID = vertices[8]?.id
  const secondSeatRoadID = edges[8]?.id

  if (
    !humanSettlementID ||
    !humanRoadID ||
    !thirdSeatSettlementID ||
    !thirdSeatRoadID ||
    !secondSeatSettlementID ||
    !secondSeatRoadID
  ) {
    throw new Error('The standard board fixture must provide continuation structures.')
  }

  const makeEvent = (
    sequence: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): ReplayEvent => ({
    sequence,
    event_type: eventType,
    payload,
    occurred_at: user.created_at,
  })
  const continuationEvents = [
    makeEvent('8', 'initial_settlement_placed.v1', {
      seat_number: 1,
      settlement_vertex_id: humanSettlementID,
    }),
    makeEvent('9', 'initial_road_placed.v1', {
      seat_number: 1,
      settlement_vertex_id: humanSettlementID,
      road_edge_id: humanRoadID,
    }),
    makeEvent('10', 'initial_settlement_placed.v1', {
      seat_number: 3,
      settlement_vertex_id: thirdSeatSettlementID,
    }),
    makeEvent('11', 'initial_road_placed.v1', {
      seat_number: 3,
      settlement_vertex_id: thirdSeatSettlementID,
      road_edge_id: thirdSeatRoadID,
    }),
    makeEvent('12', 'initial_resources_granted.v1', {
      seat_number: 3,
      resources: { lumber: 1, wool: 1, grain: 0, brick: 0, ore: 0 },
    }),
    makeEvent('13', 'initial_settlement_placed.v1', {
      seat_number: 2,
      settlement_vertex_id: secondSeatSettlementID,
    }),
    makeEvent('14', 'initial_road_placed.v1', {
      seat_number: 2,
      settlement_vertex_id: secondSeatSettlementID,
      road_edge_id: secondSeatRoadID,
    }),
    makeEvent('15', 'initial_resources_granted.v1', {
      seat_number: 2,
      resources: { lumber: 1, wool: 1, grain: 0, brick: 0, ore: 0 },
    }),
    makeEvent('16', 'initial_placement_completed.v1', {
      seat_order: [1, 3, 2],
      next_phase: 'turn_ready',
    }),
  ]

  response.context.game.lifecycle_status = 'running'
  response.events = [...response.events, ...continuationEvents]
  response.event_cursor = {
    requested_after_sequence: '0',
    returned_through_sequence: '16',
    has_more: false,
    next_after_sequence: null,
  }
  response.snapshot_index.push({
    command_sequence: '14',
    event_sequence: '16',
    state_schema_version: 'state-v2',
    created_at: user.created_at,
  })
  frame.command_sequence = '14'
  frame.event_sequence = '16'
  frame.public_state = {
    ...frame.public_state,
    phase: 'turn_ready',
    active_seat_number: 1,
    seat_order: [1, 3, 2],
    round: 2,
    step: 'complete',
  }

  return response
}

function humanPlacementOptions(): Array<{
  settlement_vertex_id: string
  road_edge_id: string
}> {
  const vertices = boardData().vertices
  const edges = boardData().edges
  const firstSettlement = vertices[0]?.id
  const secondSettlement = vertices[1]?.id
  const firstRoad = edges[0]?.id
  const secondRoad = edges[1]?.id
  const thirdRoad = edges[2]?.id

  if (!firstSettlement || !secondSettlement || !firstRoad || !secondRoad || !thirdRoad) {
    throw new Error('The standard board fixture must provide placement choices.')
  }

  return [
    { settlement_vertex_id: firstSettlement, road_edge_id: firstRoad },
    { settlement_vertex_id: firstSettlement, road_edge_id: secondRoad },
    { settlement_vertex_id: secondSettlement, road_edge_id: thirdRoad },
  ]
}

function humanPlacementOptionsResponse(
  commandSequence: string,
  options: Array<{ settlement_vertex_id: string; road_edge_id: string }>,
) {
  return {
    schema_version: 'initial-placement-options-v1',
    data: {
      command_sequence: commandSequence,
      active_seat_number: 1,
      round: 1,
      options,
    },
  }
}

function humanPlacementCommandResponse(
  lastCommandSequence: string,
  lastEventSequence: string,
  lifecycleStatus: string,
) {
  return {
    schema_version: 'initial-placement-command-v1',
    data: {
      replayed: false,
      lifecycle_status: lifecycleStatus,
      last_command_sequence: lastCommandSequence,
      last_event_sequence: lastEventSequence,
    },
  }
}

function setupPlaybackResponse(
  humanSeatNumber: number | null,
  afterEventSequence: string | null = null,
): ReplayResponse {
  const events = setupPlaybackEvents(humanSeatNumber)
  const pageSize = 3
  const afterIndex = afterEventSequence === null
    ? -1
    : events.findIndex((event) => event.sequence === afterEventSequence)
  const startIndex = afterEventSequence === null ? 0 : afterIndex + 1
  const pageEvents = events.slice(startIndex, startIndex + pageSize)
  const returnedThroughSequence = pageEvents.at(-1)?.sequence ?? null
  const hasMore = startIndex + pageEvents.length < events.length
  const response = setupReplayResponse(3, humanSeatNumber)

  response.events = pageEvents
  response.event_cursor = {
    requested_after_sequence: afterEventSequence ?? '0',
    returned_through_sequence: returnedThroughSequence,
    has_more: hasMore,
    next_after_sequence: hasMore ? returnedThroughSequence : null,
  }

  if (response.frame === null) {
    throw new Error('The setup fixture must contain a persisted frame.')
  }

  response.frame.public_state = {
    ...response.frame.public_state,
    phase: humanSeatNumber === null ? 'turn_ready' : 'initial_placement',
    active_seat_number: humanSeatNumber ?? 0,
    seat_order: humanSeatNumber === null ? [1, 3, 2] : [2, 3, humanSeatNumber],
  }
  response.frame.event_sequence = events.at(-1)?.sequence ?? response.frame.event_sequence

  return response
}

function setupReplayResponseAt(commandSequence: string): ReplayResponse {
  const positions = [
    { command_sequence: '3', event_sequence: '4' },
    { command_sequence: '6', event_sequence: '5' },
    { command_sequence: '9', event_sequence: '7' },
  ].map((position) => ({
    ...position,
    state_schema_version: 'state-v2',
    created_at: user.created_at,
  }))
  const selectedPosition = positions.find((position) =>
    position.command_sequence === commandSequence)

  if (!selectedPosition) {
    throw new Error(`No setup replay fixture exists for command ${commandSequence}.`)
  }

  const response = setupPlaybackResponse(1)
  const eventSequence = selectedPosition.event_sequence
  const isLatest = commandSequence === '9'
  const hasSecondAIPlacement = isLatest
  const board = boardData()
  const seatTwoSettlement = board.vertices[1]?.id
  const seatTwoRoad = board.edges[1]?.id
  const seatThreeSettlement = board.vertices[2]?.id
  const seatThreeRoad = board.edges[2]?.id

  if (!seatTwoSettlement || !seatTwoRoad || !seatThreeSettlement || !seatThreeRoad) {
    throw new Error('The standard board fixture must provide setup structure positions.')
  }

  response.snapshot_index = positions
  response.events = setupPlaybackEvents(1).filter((event) =>
    event.sequence.length < eventSequence.length || event.sequence <= eventSequence)
  response.event_cursor = {
    requested_after_sequence: '0',
    returned_through_sequence: eventSequence,
    has_more: false,
    next_after_sequence: null,
  }
  response.context.game.state_schema_version = 'state-v2'
  response.context.game.lifecycle_status = 'running'

  if (response.frame === null) {
    throw new Error('The setup fixture must contain a persisted frame.')
  }

  response.frame.command_sequence = commandSequence
  response.frame.event_sequence = eventSequence
  response.frame.public_state = {
    ...response.frame.public_state,
    phase: 'initial_placement',
    active_seat_number: isLatest ? 1 : 2,
    seat_order: [2, 3, 1],
    round: 1,
    step: 'place_initial_settlement_and_road',
    players: response.context.seats.map((seat) => ({
      seat_number: seat.seat_number,
      settlements: seat.seat_number === 2
        ? [seatTwoSettlement]
        : seat.seat_number === 3 && hasSecondAIPlacement
          ? [seatThreeSettlement]
          : [],
      roads: seat.seat_number === 2
        ? [seatTwoRoad]
        : seat.seat_number === 3 && hasSecondAIPlacement
          ? [seatThreeRoad]
          : [],
    })),
  }

  return response
}

function setupPlaybackEvents(humanSeatNumber: number | null): ReplayEvent[] {
  const vertices = boardData().vertices
  const edges = boardData().edges
  const seatTwoSettlement = vertices[1]?.id
  const seatTwoRoad = edges[1]?.id
  const seatThreeSettlement = vertices[2]?.id
  const seatThreeRoad = edges[2]?.id

  if (!seatTwoSettlement || !seatTwoRoad || !seatThreeSettlement || !seatThreeRoad) {
    throw new Error('The standard board fixture must provide setup structure positions.')
  }

  const makeEvent = (
    sequence: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): ReplayEvent => ({
    sequence,
    event_type: eventType,
    payload,
    occurred_at: user.created_at,
  })

  const events = [
    makeEvent('2', 'initial_placement_started.v1', {
      seat_order: humanSeatNumber === null ? [1, 3, 2] : [2, 3, humanSeatNumber],
      round: 1,
      active_seat_number: humanSeatNumber === null ? 1 : 2,
    }),
    makeEvent('3', 'initial_settlement_placed.v1', {
      seat_number: 2,
      settlement_vertex_id: seatTwoSettlement,
    }),
    makeEvent('4', 'initial_road_placed.v1', {
      seat_number: 2,
      settlement_vertex_id: seatTwoSettlement,
      road_edge_id: seatTwoRoad,
    }),
    makeEvent('5', 'initial_resources_granted.v1', {
      seat_number: 2,
      resources: { lumber: 1, wool: 1, grain: 0, brick: 0, ore: 0 },
    }),
    makeEvent('6', 'initial_settlement_placed.v1', {
      seat_number: 3,
      settlement_vertex_id: seatThreeSettlement,
    }),
    makeEvent('7', 'initial_road_placed.v1', {
      seat_number: 3,
      settlement_vertex_id: seatThreeSettlement,
      road_edge_id: seatThreeRoad,
    }),
  ]

  if (humanSeatNumber === null) {
    events.push(makeEvent('8', 'initial_placement_completed.v1', {
      seat_order: [1, 3, 2],
      next_phase: 'turn_ready',
    }))
  }

  return events
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
