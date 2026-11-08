import { expect, test } from '@playwright/test'

const token = process.env.COMPOSE_OBSERVER_TOKEN
const gameID = Number(process.env.COMPOSE_OBSERVER_GAME_ID)
const expectedSeed = process.env.COMPOSE_OBSERVER_EXPECTED_SEED

test('completes setup and persists a human normal-turn roll against the real Compose stack', async ({ page }, testInfo) => {
  test.setTimeout(90_000)

  if (token === undefined || expectedSeed === undefined || !Number.isSafeInteger(gameID) || gameID < 1) {
    test.skip(true, 'This Compose smoke requires its script-provided token, game id, and seed.')
    return
  }

  const apiFailures: string[] = []
  const consoleErrors: string[] = []
  const placementRequests: string[] = []
  const turnCommandRequests: string[] = []

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

    if (
      url.pathname === `/api/v1/games/${gameID}/turn-commands` &&
      request.method() === 'POST'
    ) {
      turnCommandRequests.push(request.url())
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
    context: { game: { lifecycle_status: 'running', seed: expectedSeed, human_seat_number: 1 } },
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
  expect(finalReplay.frame.public_state.seat_order[0])
    .toBe(finalReplay.context.game.human_seat_number)
  expect(placementRequests).toHaveLength(2)
  await page.screenshot({ path: testInfo.outputPath('compose-observer-setup-complete.png') })

  const rollCommandResponse = await page.evaluate(async ({ gameID, commandSequence }) => {
    const sessionToken = sessionStorage.getItem('catan.api-token')

    if (sessionToken === null) {
      throw new Error('The real Compose observer needs its session bearer token to roll.')
    }

    const response = await fetch(`/api/v1/games/${gameID}/turn-commands`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `compose-observer-roll-${gameID}`,
      },
      body: JSON.stringify({
        expected_command_sequence: commandSequence,
        command_type: 'roll_dice.v1',
        payload: {},
      }),
    })

    return {
      status: response.status,
      body: await response.json() as {
        schema_version?: string
        data?: {
          replayed?: boolean
          last_command_sequence?: string
          last_event_sequence?: string
          lifecycle_status?: string
        }
        error?: { code?: string }
      },
    }
  }, { gameID, commandSequence: finalReplay.frame.command_sequence })

  expect(rollCommandResponse.status, JSON.stringify(rollCommandResponse.body)).toBe(200)
  expect(rollCommandResponse.body).toMatchObject({
    schema_version: 'turn-command-v1',
    data: {
      replayed: false,
      last_command_sequence: '9',
      lifecycle_status: 'awaiting human input',
    },
  })
  expect(rollCommandResponse.body.data?.last_event_sequence).toMatch(/^2[0-9]+$/)
  expect(turnCommandRequests).toHaveLength(1)

  const latestTurnReplayPromise = page.waitForResponse(async (response) => {
    const url = new URL(response.url())

    if (
      url.pathname !== `/api/v1/games/${gameID}/replay` ||
      response.request().method() !== 'GET' ||
      url.searchParams.has('at_command_sequence') ||
      url.searchParams.has('after_event_sequence') ||
      response.status() !== 200
    ) {
      return false
    }

    const replay = await response.json()

    return replay.frame?.command_sequence === rollCommandResponse.body.data?.last_command_sequence
  })
  await page.reload()
  const latestTurnReplayResponse = await latestTurnReplayPromise
  const latestTurnReplay = await latestTurnReplayResponse.json()
  const turnEvents = latestTurnReplay.events.filter((event: { sequence: string }) =>
    BigInt(event.sequence) > BigInt(finalReplay.frame.event_sequence),
  )
  const productionEvents = turnEvents.filter((event: { event_type: string }) =>
    event.event_type === 'resources_produced.v1',
  )

  expect(latestTurnReplay).toMatchObject({
    schema_version: 'replay-v1',
    frame: {
      command_sequence: '9',
      state_schema_version: 'state-v3',
      public_projection_schema_version: 'replay-public-v3',
      viewer_projection_schema_version: 'replay-viewer-v1',
      public_state: {
        phase: 'normal_turn',
        round: 1,
        turn_number: 1,
        active_seat_number: 1,
        turn_phase: 'action',
        last_roll: { die_one: 5, die_two: 5, total: 10 },
      },
      viewer_state: { seat_number: 1 },
    },
  })
  expect(latestTurnReplay.frame.event_sequence)
    .toBe(rollCommandResponse.body.data?.last_event_sequence)
  expect(latestTurnReplay.snapshot_index.at(-1)).toMatchObject({
    command_sequence: '9',
    event_sequence: rollCommandResponse.body.data?.last_event_sequence,
    state_schema_version: 'state-v3',
  })
  expect(turnEvents.slice(0, 2).map((event: { event_type: string }) => event.event_type))
    .toEqual(['turn_started.v1', 'dice_rolled.v1'])
  expect(turnEvents.every((event: { event_type: string }) =>
    ['turn_started.v1', 'dice_rolled.v1', 'resources_produced.v1'].includes(event.event_type),
  )).toBe(true)
  expect(productionEvents.length).toBeGreaterThan(0)
  expect(productionEvents.every((event: { payload: { seat_number: number } }) =>
    event.payload.seat_number === latestTurnReplay.frame.viewer_state.seat_number,
  )).toBe(true)
  expect(latestTurnReplay.frame.public_state.players.every((player: Record<string, unknown>) =>
    !Object.prototype.hasOwnProperty.call(player, 'resources'),
  )).toBe(true)

  const resourceCounts = latestTurnReplay.frame.viewer_state.resources as Record<string, number>
  for (const [resource, count] of Object.entries(resourceCounts)) {
    await expect(page.locator(`.observer-resource-grid [data-resource="${resource}"] dd`))
      .toHaveText(String(count))
  }
  await expect(page.locator('.observer-status-panel')).toContainText('Normal Turn')
  await expect(page.locator('.observer-status-panel')).toContainText('Action')
  await expect(page.locator('.observer-status-panel')).toContainText('Round')
  await expect(page.locator('.observer-status-panel')).toContainText('Turn number')
  await expect(page.locator('.observer-status-panel')).toContainText('5 + 5 = 10')
  await expect(page.locator('.observer-history-event strong').filter({ hasText: 'Turn Started' }))
    .toHaveCount(1)
  await expect(page.locator('.observer-history-event strong').filter({ hasText: 'Dice Rolled' }))
    .toHaveCount(1)
  await expect(page.locator('.observer-history-event p').filter({ hasText: '5 + 5 = 10' }))
    .toHaveCount(1)

  await page.screenshot({ path: testInfo.outputPath('compose-observer-normal-turn.png') })
  await expect(apiFailures).toEqual([])
  await expect(consoleErrors).toEqual([])
})
