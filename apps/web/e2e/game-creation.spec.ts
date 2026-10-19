import { expect, test, type Page } from '@playwright/test'
import type { BoardData } from '../src/features/board/boardApi'
import type { GameLifecycleStatus, GameResponse } from '../src/features/games/gameApi'

const user = {
  id: 7,
  name: 'Ada Player',
  email: 'ada@example.test',
  created_at: '2026-10-15T09:00:00.000000Z',
}

test('opens with a board preview without creating a game', async ({ page }) => {
  await authenticatePage(page)
  const submittedSeeds: string[] = []
  let gameCreationRequests = 0

  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/games') && request.method() === 'POST') {
      gameCreationRequests += 1
    }
  })

  await page.route('**/api/v1/boards/generate', async (route) => {
    const requestSeed = route.request().postDataJSON().seed as string
    submittedSeeds.push(requestSeed)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(boardResponse(requestSeed)),
    })
  })

  await page.goto('/games/new')
  await expect(page.getByRole('heading', { name: 'Create a game.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your board is ready.' })).toBeVisible()
  await expect(page.locator('.board-hex')).toHaveCount(1)
  await expect(page.getByLabel('AI opponents')).toBeVisible()
  await expect(page.getByText('Base game · Standard map')).toBeVisible()
  await expect(page.getByText('Preview only. No game or history is saved.')).toBeVisible()
  expect(submittedSeeds).toHaveLength(1)
  expect(gameCreationRequests).toBe(0)

  const opponentSelect = page.getByRole('combobox', { name: 'AI opponents' })
  await opponentSelect.selectOption('3')
  await expect(opponentSelect).toHaveValue('3')
  expect(gameCreationRequests).toBe(0)
})

test('regenerates a board and applies a manual seed without saving', async ({ page }) => {
  await authenticatePage(page)
  const submittedSeeds: string[] = []
  await page.route('**/api/v1/boards/generate', async (route) => {
    const requestSeed = route.request().postDataJSON().seed as string
    submittedSeeds.push(requestSeed)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(boardResponse(requestSeed)),
    })
  })

  await page.goto('/games/new')
  await expect(page.locator('.board-hex')).toHaveCount(1)
  const firstSeed = submittedSeeds[0]

  await page.locator('.creation-advanced summary').click()
  const seedInput = page.getByLabel('Reproducible board seed')
  await seedInput.fill('42')
  await expect(page.getByText('The seed changed. Apply it to refresh this board before continuing.')).toBeVisible()
  await page.getByRole('button', { name: 'Apply seed' }).click()
  await expect(page.getByText('Seed 42 created a Catan board with 1 terrain tiles.')).toBeVisible()

  await page.getByRole('button', { name: 'Generate another board' }).click()
  await expect.poll(() => submittedSeeds.length).toBe(3)
  await expect(page.getByText(new RegExp(`Seed ${submittedSeeds[2]} created a Catan board`))).toBeVisible()
  expect(firstSeed).not.toBe('42')
})

test('keeps board generation errors beside the setup controls', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/boards/generate', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'validation_failed',
          message: 'The board generation request is invalid.',
          fields: {
            seed: ['The seed must be a canonical non-negative integer string.'],
          },
        },
      }),
    })
  })

  await page.goto('/games/new')
  await expect(page.locator('.game-creation-board-panel').getByRole('alert')).toContainText(
    'The board generation request is invalid.',
  )
  await page.locator('.creation-advanced summary').click()
  await expect(page.getByLabel('Reproducible board seed')).toHaveAttribute('aria-invalid', 'true')
  await expect(
    page.getByText('The seed must be a canonical non-negative integer string.'),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/games\/new$/)
})

test('keeps the seed validation error visible when advanced options are collapsed', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/boards/generate', async (route) => {
    const requestSeed = route.request().postDataJSON().seed as string

    if (requestSeed === '01') {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'validation_failed',
            message: 'The board generation request is invalid.',
            fields: {
              seed: ['The seed must be a canonical non-negative integer string.'],
            },
          },
        }),
      })

      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(boardResponse(requestSeed)),
    })
  })

  await page.goto('/games/new')
  await expect(page.getByRole('heading', { name: 'Your board is ready.' })).toBeVisible()
  await page.locator('.creation-advanced summary').click()

  const seedInput = page.getByLabel('Reproducible board seed')
  await seedInput.fill('01')
  await page.getByRole('button', { name: 'Apply seed' }).click()
  await expect(seedInput).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#game-board-seed-error')).toBeVisible()

  await page.locator('.creation-advanced summary').click()
  await expect(seedInput).toBeHidden()
  const generationNote = page.locator('.game-creation-generation-note')
  await expect(page.locator('.creation-advanced summary')).toContainText('Seed needs attention')
  await expect(generationNote).toContainText('Seed needs attention · Advanced options')
  await expect(generationNote).toContainText('The seed must be a canonical non-negative integer string.')
  await expect(generationNote).toHaveClass(/game-creation-generation-note-error/)
  await expect(generationNote).toHaveAttribute('role', 'alert')
  await expect(generationNote).toHaveCSS('color', 'rgb(201, 109, 98)')
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeDisabled()

  await page.locator('.creation-advanced summary').click()
  await expect(seedInput).toHaveValue('01')
  await expect(seedInput).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#game-board-seed-error')).toBeVisible()

  await seedInput.fill('42')
  await page.getByRole('button', { name: 'Apply seed' }).click()
  await expect(page.getByText('Seed 42 created a Catan board with 1 terrain tiles.')).toBeVisible()
  await expect(page.locator('.creation-advanced summary')).not.toContainText('Seed needs attention')
  await expect(generationNote).not.toHaveClass(/game-creation-generation-note-error/)
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeEnabled()
})

test('shows a recoverable service error during preview generation', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/boards/generate', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'game_engine_unavailable',
          message: 'The board generation service is unavailable.',
        },
      }),
    })
  })

  await page.goto('/games/new')

  await expect(page.getByRole('alert')).toContainText(
    'The board generation service is unavailable.',
  )
  await expect(page).toHaveURL(/\/games\/new$/)
})

test('starts the reviewed board once and opens its observer directly', async ({ page }) => {
  await authenticatePage(page)
  let reviewedBoard: BoardData | null = null
  let createCount = 0
  let runCount = 0
  let createPayload: Record<string, unknown> | null = null
  let releaseCreate: (() => void) | undefined
  const createGate = new Promise<void>((resolve) => { releaseCreate = resolve })

  await page.route('**/api/v1/boards/generate', async (route) => {
    const requestSeed = route.request().postDataJSON().seed as string
    reviewedBoard = boardResponse(requestSeed).data
    await route.fulfill({ status: 200, json: { data: reviewedBoard } })
  })
  await page.route('**/api/v1/games', async (route) => {
    createCount += 1
    createPayload = route.request().postDataJSON() as Record<string, unknown>
    await createGate
    await route.fulfill({
      status: 201,
      json: gameResponse('created', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/run', async (route) => {
    runCount += 1
    await route.fulfill({
      status: 202,
      json: gameResponse('queued', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/replay', async (route) => {
    await route.fulfill({
      status: 200,
      json: replayResponse('queued', reviewedBoard as BoardData),
    })
  })

  await page.goto('/games/new')
  await expect(page.getByRole('heading', { name: 'Your board is ready.' })).toBeVisible()
  const startButton = page.getByRole('button', { name: 'Start game', exact: true })
  await startButton.click()
  await expect(page.getByRole('button', { name: 'Saving game...', exact: true })).toBeDisabled()
  await page.locator('.game-start-button').evaluate((button: HTMLButtonElement) => button.click())
  expect(createCount).toBe(1)
  releaseCreate?.()

  await expect(page).toHaveURL(/\/games\/42\/observe$/)
  await expect(page.getByRole('heading', { name: 'Game 42' })).toBeVisible()
  expect(runCount).toBe(1)
  expect(createPayload?.creation_key).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  expect(createPayload?.seed).toBe(reviewedBoard?.seed)
})

test('retries a lost creation response with the same key and board', async ({ page }) => {
  await authenticatePage(page)
  let reviewedBoard: BoardData | null = null
  const createPayloads: Array<Record<string, unknown>> = []
  let runCount = 0

  await page.route('**/api/v1/boards/generate', async (route) => {
    const requestSeed = route.request().postDataJSON().seed as string
    reviewedBoard = boardResponse(requestSeed).data
    await route.fulfill({ status: 200, json: { data: reviewedBoard } })
  })
  await page.route('**/api/v1/games', async (route) => {
    createPayloads.push(route.request().postDataJSON() as Record<string, unknown>)

    if (createPayloads.length === 1) {
      await route.abort('failed')
      return
    }

    await route.fulfill({
      status: 200,
      json: gameResponse('created', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/run', async (route) => {
    runCount += 1
    await route.fulfill({
      status: 202,
      json: gameResponse('queued', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/replay', async (route) => {
    await route.fulfill({
      status: 200,
      json: replayResponse('queued', reviewedBoard as BoardData),
    })
  })

  await page.goto('/games/new')
  await expect(page.getByRole('heading', { name: 'Your board is ready.' })).toBeVisible()
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The save may have succeeded.')
  await expect(page.locator('.board-svg')).toBeVisible()
  await page.getByRole('button', { name: 'Retry start safely', exact: true }).click()

  await expect(page).toHaveURL(/\/games\/42\/observe$/)
  expect(createPayloads).toHaveLength(2)
  expect(createPayloads[0].creation_key).toBe(createPayloads[1].creation_key)
  expect(createPayloads[0].seed).toBe(createPayloads[1].seed)
  expect(runCount).toBe(1)
})

test('refreshes authoritative status before retrying a failed queue dispatch', async ({ page }) => {
  await authenticatePage(page)
  let reviewedBoard: BoardData | null = null
  let runCount = 0
  let statusRefreshCount = 0

  await page.route('**/api/v1/boards/generate', async (route) => {
    const requestSeed = route.request().postDataJSON().seed as string
    reviewedBoard = boardResponse(requestSeed).data
    await route.fulfill({ status: 200, json: { data: reviewedBoard } })
  })
  await page.route('**/api/v1/games', async (route) => {
    await route.fulfill({
      status: 201,
      json: gameResponse('created', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/run', async (route) => {
    runCount += 1

    if (runCount === 1) {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'queue_dispatch_failed',
            message: 'The game could not be queued for execution.',
          },
        },
      })
      return
    }

    await route.fulfill({
      status: 202,
      json: gameResponse('queued', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42', async (route) => {
    statusRefreshCount += 1
    await route.fulfill({
      status: 200,
      json: gameResponse('failed', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/replay', async (route) => {
    await route.fulfill({
      status: 200,
      json: replayResponse('queued', reviewedBoard as BoardData),
    })
  })

  await page.goto('/games/new')
  await expect(page.getByRole('heading', { name: 'Your board is ready.' })).toBeVisible()
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The game could not be queued for execution.')
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start saved game', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Start saved game', exact: true }).click()

  await expect(page).toHaveURL(/\/games\/42\/observe$/)
  expect(statusRefreshCount).toBeGreaterThanOrEqual(1)
  expect(runCount).toBe(2)
})

test('requires review before starting when the persisted board differs', async ({ page }) => {
  await authenticatePage(page)
  let reviewedBoard: BoardData | null = null
  let runCount = 0
  let authoritativeBoard: BoardData | null = null

  await page.route('**/api/v1/boards/generate', async (route) => {
    const requestSeed = route.request().postDataJSON().seed as string
    reviewedBoard = boardResponse(requestSeed).data
    await route.fulfill({ status: 200, json: { data: reviewedBoard } })
  })
  await page.route('**/api/v1/games', async (route) => {
    authoritativeBoard = boardResponse('999').data
    await route.fulfill({
      status: 201,
      json: gameResponse('created', authoritativeBoard),
    })
  })
  await page.route('**/api/v1/games/42/run', async (route) => {
    runCount += 1
    await route.fulfill({
      status: 202,
      json: gameResponse('queued', authoritativeBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/replay', async (route) => {
    await route.fulfill({
      status: 200,
      json: replayResponse('queued', authoritativeBoard as BoardData),
    })
  })

  await page.goto('/games/new')
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The saved board differs from the preview.')
  await expect(page.getByText('Seed 999 created a Catan board with 1 terrain tiles.')).toBeVisible()
  expect(runCount).toBe(0)
  await page.getByRole('button', { name: 'Use saved board and continue', exact: true }).click()

  await expect(page).toHaveURL(/\/games\/42\/observe$/)
  expect(runCount).toBe(1)
})

test('resumes a persisted pending start after refresh without creating or running again', async ({ page }) => {
  await authenticatePage(page)
  let reviewedBoard: BoardData | null = null
  let createCount = 0
  let runCount = 0

  await page.route('**/api/v1/boards/generate', async (route) => {
    const requestSeed = route.request().postDataJSON().seed as string
    reviewedBoard = boardResponse(requestSeed).data
    await route.fulfill({ status: 200, json: { data: reviewedBoard } })
  })
  await page.route('**/api/v1/games', async (route) => {
    createCount += 1
    await route.fulfill({
      status: 201,
      json: gameResponse('created', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/run', async (route) => {
    runCount += 1
    await route.fulfill({
      status: 202,
      json: gameResponse('queued', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42', async (route) => {
    await route.fulfill({
      status: 200,
      json: gameResponse('completed', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/replay', async (route) => {
    await route.fulfill({
      status: 200,
      json: replayResponse('completed', reviewedBoard as BoardData),
    })
  })

  await page.goto('/games/new')
  await expect(page.getByRole('heading', { name: 'Your board is ready.' })).toBeVisible()
  await page.evaluate((seed) => {
    sessionStorage.setItem('catan.game-start-intent', JSON.stringify({
      ownerId: 7,
      creationKey: 'd3423053-d195-4d96-a3b5-98025e5a3c4d',
      seed,
      aiCount: 2,
      gameId: 42,
    }))
  }, reviewedBoard?.seed)
  await page.reload()

  await expect(page).toHaveURL(/\/games\/42\/observe$/)
  expect(createCount).toBe(0)
  expect(runCount).toBe(0)
})

test('saves the reviewed board without running it and opens the saved setup', async ({ page }) => {
  await authenticatePage(page)
  let reviewedBoard: BoardData | null = null
  let createCount = 0
  let runCount = 0

  await page.route('**/api/v1/boards/generate', async (route) => {
    const requestSeed = route.request().postDataJSON().seed as string
    reviewedBoard = boardResponse(requestSeed).data
    await route.fulfill({ status: 200, json: { data: reviewedBoard } })
  })
  await page.route('**/api/v1/games', async (route) => {
    createCount += 1
    await route.fulfill({
      status: 201,
      json: gameResponse('created', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42', async (route) => {
    await route.fulfill({
      status: 200,
      json: gameResponse('created', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/run', async (route) => {
    runCount += 1
    await route.fulfill({
      status: 202,
      json: gameResponse('queued', reviewedBoard as BoardData),
    })
  })

  await page.goto('/games/new')
  await expect(page.getByRole('heading', { name: 'Your board is ready.' })).toBeVisible()
  await page.getByRole('button', { name: 'Save setup', exact: true }).click()

  await expect(page).toHaveURL(/\/games\/42\/setup\?saved=1$/)
  await expect(page.getByRole('heading', { name: 'Review your game.' })).toBeVisible()
  await expect(page.locator('.game-setup-saved-notice')).toContainText('Setup saved.')
  await expect(page.getByText(`Seed ${reviewedBoard?.seed} created a Catan board`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start saved game', exact: true })).toBeVisible()
  expect(createCount).toBe(1)
  expect(runCount).toBe(0)
})

test('retries an uncertain setup save with the same key without running it', async ({ page }) => {
  await authenticatePage(page)
  let reviewedBoard: BoardData | null = null
  const createPayloads: Array<Record<string, unknown>> = []
  let runCount = 0

  await page.route('**/api/v1/boards/generate', async (route) => {
    const requestSeed = route.request().postDataJSON().seed as string
    reviewedBoard = boardResponse(requestSeed).data
    await route.fulfill({ status: 200, json: { data: reviewedBoard } })
  })
  await page.route('**/api/v1/games', async (route) => {
    createPayloads.push(route.request().postDataJSON() as Record<string, unknown>)

    if (createPayloads.length === 1) {
      await route.abort('failed')
      return
    }

    await route.fulfill({
      status: 200,
      json: gameResponse('created', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42', async (route) => {
    await route.fulfill({
      status: 200,
      json: gameResponse('created', reviewedBoard as BoardData),
    })
  })
  await page.route('**/api/v1/games/42/run', async (route) => {
    runCount += 1
    await route.fulfill({
      status: 202,
      json: gameResponse('queued', reviewedBoard as BoardData),
    })
  })

  await page.goto('/games/new')
  await expect(page.getByRole('heading', { name: 'Your board is ready.' })).toBeVisible()
  await page.getByRole('button', { name: 'Save setup', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The setup may have been saved.')
  await page.getByRole('button', { name: 'Retry save safely', exact: true }).click()

  await expect(page).toHaveURL(/\/games\/42\/setup\?saved=1$/)
  expect(createPayloads).toHaveLength(2)
  expect(createPayloads[0].creation_key).toBe(createPayloads[1].creation_key)
  expect(createPayloads[0].seed).toBe(createPayloads[1].seed)
  expect(runCount).toBe(0)
})

test('reopens a saved setup after refresh and starts the same game ID', async ({ page }) => {
  await authenticatePage(page)
  const savedBoard = boardResponse('42').data
  let detailCount = 0
  let runCount = 0

  await page.route('**/api/v1/games/42', async (route) => {
    detailCount += 1
    await route.fulfill({
      status: 200,
      json: gameResponse('created', savedBoard),
    })
  })
  await page.route('**/api/v1/games/42/run', async (route) => {
    runCount += 1
    await route.fulfill({
      status: 202,
      json: gameResponse('queued', savedBoard),
    })
  })
  await page.route('**/api/v1/games/42/replay', async (route) => {
    await route.fulfill({
      status: 200,
      json: replayResponse('queued', savedBoard),
    })
  })

  await page.goto('/games/42/setup')
  await expect(page.getByRole('heading', { name: 'Review your game.' })).toBeVisible()
  await expect(page.getByText('Saved setup. Start this board when you are ready.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate another board', exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'AI opponents' })).toBeDisabled()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Review your game.' })).toBeVisible()
  await page.getByRole('button', { name: 'Start saved game', exact: true }).click()

  await expect(page).toHaveURL(/\/games\/42\/observe$/)
  expect(detailCount).toBeGreaterThanOrEqual(2)
  expect(runCount).toBe(1)
})

test('redirects an already started setup to its observer', async ({ page }) => {
  await authenticatePage(page)
  const savedBoard = boardResponse('42').data

  await page.route('**/api/v1/games/42', async (route) => {
    await route.fulfill({
      status: 200,
      json: gameResponse('running', savedBoard),
    })
  })
  await page.route('**/api/v1/games/42/replay', async (route) => {
    await route.fulfill({
      status: 200,
      json: replayResponse('running', savedBoard),
    })
  })

  await page.goto('/games/42/setup')

  await expect(page).toHaveURL(/\/games\/42\/observe$/)
  await expect(page.getByRole('heading', { name: 'Game 42' })).toBeVisible()
})

test('shows recovery without exposing data for a missing saved setup', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games/404', async (route) => {
    await route.fulfill({
      status: 404,
      json: {
        error: {
          code: 'game_not_found',
          message: 'The requested game was not found.',
        },
      },
    })
  })

  await page.goto('/games/404/setup')

  await expect(page.getByRole('alert')).toContainText('This game could not be found.')
  await expect(page.locator('.game-setup-error-actions').getByRole('link', { name: 'Return to your games', exact: true })).toHaveAttribute(
    'href',
    '/games',
  )
  await expect(page.locator('.board-svg')).toHaveCount(0)
})

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'phone', width: 390, height: 844 },
] as const) {
  test(`keeps the setup preview usable at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await authenticatePage(page)
    await page.route('**/api/v1/boards/generate', async (route) => {
      const requestSeed = route.request().postDataJSON().seed as string
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(boardResponse(requestSeed)),
      })
    })

    await page.goto('/games/new')
    await expect(page.locator('.board-svg')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate another board' })).toBeVisible()

    const metrics = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }))

    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  })
}

async function authenticatePage(page: Page) {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem('catan.api-token', token)
  }, 'test-token')
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { user } }),
    })
  })
}

function boardResponse(seed: string): { data: BoardData } {
  const vertexIDs = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']
  const vertices = [
    { id: 'v1', x: 0, y: -2 },
    { id: 'v2', x: 1, y: -1 },
    { id: 'v3', x: 1, y: 1 },
    { id: 'v4', x: 0, y: 2 },
    { id: 'v5', x: -1, y: 1 },
    { id: 'v6', x: -1, y: -1 },
  ]

  return {
    data: {
      board_schema_version: '1',
      seed,
      ruleset: { key: 'base', version: '1.0.0' },
      map: { key: 'standard', version: '1.0.0', orientation: 'pointy' },
      hexes: [
        {
          id: 'hex:0:0',
          q: 0,
          r: 0,
          terrain: 'fields',
          number_token: 6,
          vertex_ids: vertexIDs,
        },
      ],
      vertices,
      edges: vertexIDs.map((first, index) => ({
        id: `edge:${first}`,
        vertex_ids: [first, vertexIDs[(index + 1) % vertexIDs.length]],
      })),
      ports: [],
    },
  }
}

function gameResponse(lifecycleStatus: GameLifecycleStatus, board: BoardData): GameResponse {
  return {
    data: {
      id: 42,
      owner_id: user.id,
      mode: 'human_vs_ai',
      seed: board.seed,
      ruleset: { key: 'base', version: '1.0.0' },
      map: { key: 'standard', version: '1.0.0', orientation: 'pointy' },
      seat_count: 3,
      human_seat_number: 1,
      lifecycle_status: lifecycleStatus,
      configuration: { ai_count: 2 },
      board,
      seats: [
        { seat_number: 1, controller_type: 'human', user_id: user.id, label: user.name },
        { seat_number: 2, controller_type: 'ai', user_id: null, label: 'AI 1' },
        { seat_number: 3, controller_type: 'ai', user_id: null, label: 'AI 2' },
      ],
      created_at: user.created_at,
    },
  }
}

function replayResponse(lifecycleStatus: GameLifecycleStatus, board: BoardData) {
  const game = gameResponse(lifecycleStatus, board).data

  return {
    schema_version: 'replay-v1',
    context: {
      game: {
        id: game.id,
        mode: game.mode,
        lifecycle_status: game.lifecycle_status,
        ruleset_key: game.ruleset.key,
        ruleset_version: game.ruleset.version,
        state_schema_version: null,
        seed: game.seed,
        seat_count: game.seat_count,
        human_seat_number: game.human_seat_number,
        started_at: null,
        completed_at: null,
        created_at: game.created_at,
      },
      board: game.board,
      seats: game.seats.map(({ seat_number, controller_type, label }) => ({
        seat_number,
        controller_type,
        label,
      })),
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
