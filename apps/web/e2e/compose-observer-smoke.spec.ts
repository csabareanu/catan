import { expect, test } from '@playwright/test'

const token = process.env.COMPOSE_OBSERVER_TOKEN
const gameID = Number(process.env.COMPOSE_OBSERVER_GAME_ID)

test('completes both human setup placements against the real Compose stack', async ({ page }, testInfo) => {
  test.setTimeout(90_000)

  if (token === undefined || !Number.isSafeInteger(gameID) || gameID < 1) {
    test.skip(true, 'This Compose smoke requires its script-provided token and game id.')
    return
  }

  const apiFailures: string[] = []
  const consoleErrors: string[] = []
  const placementRequests: string[] = []

  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname

    if (pathname.startsWith('/api/') && response.status() >= 400) {
      apiFailures.push(`${response.status()} ${pathname}`)
    }
  })
  page.on('request', (request) => {
    const url = new URL(request.url())

    if (
      url.pathname === `/api/v1/games/${gameID}/initial-placement` &&
      request.method() === 'POST'
    ) {
      placementRequests.push(request.url())
    }
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript((sessionToken) => {
    sessionStorage.setItem('catan.api-token', sessionToken)
  }, token)
  await page.goto(`/games/${gameID}/observe`)

  await expect(page.getByRole('heading', { name: `Game ${gameID}`, exact: true })).toBeVisible()
  await expect(page.getByText('Awaiting human input', { exact: true })).toBeVisible()
  await expect(page.locator('.observer-board .board-svg')).toBeVisible()
  await expect(page.locator('.board-hex')).toHaveCount(19)
  await expect(page.locator('.board-port')).toHaveCount(9)

  const detailsTrigger = page.getByRole('button', { name: /^(Turn actions|Overview)$/ })
  await detailsTrigger.click()

  const detailsDialog = page.getByRole('dialog', { name: 'Game details' })
  await expect(detailsDialog).toBeVisible()
  await expect(detailsDialog.getByRole('heading', { name: 'Players', exact: true })).toBeVisible()
  await expect(detailsDialog.locator('.observer-player')).toHaveCount(3)
  await expect(detailsDialog.getByRole('heading', { name: 'History', exact: true })).toBeVisible()

  await expect(page.getByRole('button', { name: 'Play setup', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Play setup', exact: true }).click()
  await expect(page.locator('[data-setup-playback-status]'))
    .toContainText('Waiting for Compose Smoke to place a settlement and road.', { timeout: 15_000 })

  await page.screenshot({ path: testInfo.outputPath('compose-observer-first-human-boundary.png') })

  await detailsDialog.getByRole('button', { name: 'Close details', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 900 })

  const submitLegalPair = async () => {
    const settlement = page.locator('[data-board-placement-settlement-id]:visible').first()
    await expect(settlement).toBeVisible({ timeout: 45_000 })
    await settlement.click()

    const road = page.locator('[data-board-placement-road-id]:visible').first()
    await expect(road).toBeVisible()
    await road.click()

    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())

      return url.pathname === `/api/v1/games/${gameID}/initial-placement` &&
        response.request().method() === 'POST'
    })
    await page.getByRole('button', { name: 'Confirm placement', exact: true }).click()

    const response = await responsePromise
    expect(response.status()).toBe(200)

    return response.json()
  }

  const firstPlacement = await submitLegalPair()
  expect(firstPlacement).toMatchObject({
    schema_version: 'initial-placement-command-v1',
    data: { lifecycle_status: 'awaiting human input', replayed: false },
  })
  await expect(page.locator('[data-board-placement-settlement-id]').first())
    .toBeVisible({ timeout: 45_000 })

  const finalReplayResponsePromise = page.waitForResponse(async (response) => {
    const url = new URL(response.url())

    const isLatestReplayResponse = url.pathname === `/api/v1/games/${gameID}/replay` &&
      response.request().method() === 'GET' &&
      !url.searchParams.has('at_command_sequence') &&
      !url.searchParams.has('after_event_sequence') &&
      response.status() === 200

    if (!isLatestReplayResponse) {
      return false
    }

    const replay = await response.json()

    return replay.frame?.command_sequence === '8'
  })
  const secondPlacement = await submitLegalPair()
  expect(secondPlacement).toMatchObject({
    schema_version: 'initial-placement-command-v1',
    data: {
      lifecycle_status: 'running',
      last_command_sequence: '8',
      last_event_sequence: '18',
      replayed: false,
    },
  })
  await expect(page.locator('[data-setup-playback-status]'))
    .toContainText('Setup complete. The game is ready for turns.', { timeout: 45_000 })

  const finalReplayResponse = await finalReplayResponsePromise
  expect(finalReplayResponse.status()).toBe(200)
  const finalReplay = await finalReplayResponse.json()
  expect(finalReplay).toMatchObject({
    schema_version: 'replay-v1',
    context: { game: { lifecycle_status: 'running' } },
    frame: {
      command_sequence: '8',
      event_sequence: '18',
      public_state: { phase: 'turn_ready' },
    },
  })
  expect(finalReplay.snapshot_index).toHaveLength(8)
  expect(finalReplay.snapshot_index.at(-1)).toMatchObject({
    command_sequence: '8',
    event_sequence: '18',
    state_schema_version: 'state-v2',
  })
  expect(finalReplay.events.map((event: { event_type: string }) => event.event_type))
    .toContain('initial_placement_completed.v1')
  expect(placementRequests).toHaveLength(2)

  await page.screenshot({ path: testInfo.outputPath('compose-observer-setup-complete.png') })
  await expect(apiFailures).toEqual([])
  await expect(consoleErrors).toEqual([])
})
