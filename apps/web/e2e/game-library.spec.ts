import { expect, test, type Page } from '@playwright/test'
import { gameListResponse } from './fixtures/gameListResponse'

const user = {
  id: 7,
  name: 'Ada Player',
  email: 'ada@example.test',
  created_at: '2026-10-15T09:00:00.000000Z',
}

const gameSummaries = [
  {
    id: 42,
    owner_id: user.id,
    mode: 'human_vs_ai',
    seed: '894177203164',
    ruleset: { key: 'base', version: '1.0.0' },
    map: { key: 'standard', version: '1.0.0', orientation: 'pointy_top' },
    seat_count: 3,
    human_seat_number: 1,
    lifecycle_status: 'created',
    configuration: { ai_count: 2 },
    created_at: '2026-10-15T09:00:00.000000Z',
    updated_at: '2026-10-15T09:00:00.000000Z',
  },
  {
    id: 43,
    owner_id: user.id,
    mode: 'human_vs_ai',
    seed: '42',
    ruleset: { key: 'base', version: '1.0.0' },
    map: { key: 'standard', version: '1.0.0', orientation: 'pointy_top' },
    seat_count: 4,
    human_seat_number: 1,
    lifecycle_status: 'running',
    configuration: { ai_count: 3 },
    created_at: '2026-10-14T09:00:00.000000Z',
    updated_at: '2026-10-15T09:00:00.000000Z',
  },
]

test('renders owner game summaries and player-facing library views', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(gameListResponse(gameSummaries)),
    })
  })

  await page.goto('/games')

  await expect(page.getByRole('heading', { name: 'Your games' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Game 42' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Game 43' })).toBeVisible()
  await expect(page.locator('.library-status-created')).toHaveText('Saved setup')
  await expect(page.locator('.library-status-running')).toHaveText('In progress')
  await expect(page.getByText('You + 2 AI opponents', { exact: true })).toBeVisible()
  await expect(page.getByText('You + 3 AI opponents', { exact: true })).toBeVisible()
  await expect(page.getByText('894177203164', { exact: true })).not.toBeVisible()
  await expect(page.getByText('Standard map', { exact: true })).toHaveCount(2)
  await expect(page.getByText('Created Oct 15, 2026', { exact: true })).toBeVisible()
  const savedGameCard = page.locator('.library-item').filter({ hasText: 'Game 42' })
  await expect(savedGameCard).toHaveClass(/library-item-saved/)
  await expect(savedGameCard.getByRole('link', { name: 'Open setup for Game 42', exact: true })).toHaveAttribute(
    'href',
    '/games/42/setup',
  )
  const activeGameCard = page.locator('.library-item').filter({ hasText: 'Game 43' })
  await expect(activeGameCard).toHaveClass(/library-item-active/)
  await expect(activeGameCard.getByRole('link', { name: 'Open game for Game 43', exact: true })).toHaveAttribute(
    'href',
    '/games/43/observe',
  )
  await expect(
    page.locator('.library-more-trigger[aria-label="More actions for Game 42"]'),
  ).toBeVisible()
  await savedGameCard.locator('.library-more-trigger').click()
  await expect(savedGameCard.getByText('894177203164', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/games$/)
})

for (const width of [1440, 768, 610, 390, 320]) {
  test(`keeps mixed-status cards and their menus usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await authenticatePage(page)
    const mixedGames = [
      gameSummaries[0],
      gameSummaries[1],
      { ...gameSummaries[0], id: 44, lifecycle_status: 'completed' },
      { ...gameSummaries[0], id: 45, lifecycle_status: 'failed' },
      { ...gameSummaries[0], id: 46, lifecycle_status: 'awaiting human input' },
    ]
    await page.route('**/api/v1/games', (route) => route.fulfill({
      json: gameListResponse(mixedGames),
    }))
    await page.goto('/games')
    await expect(page.locator('.library-item')).toHaveCount(5)
    const tabsFit = await page.getByRole('tablist').evaluate((tablist) => {
      const bounds = tablist.getBoundingClientRect()
      return [...tablist.querySelectorAll('[role="tab"]')].every((tab) => {
        const tabBounds = tab.getBoundingClientRect()
        return tabBounds.left >= bounds.left && tabBounds.right <= bounds.right
      })
    })
    expect(tabsFit).toBe(true)

    for (const [id, label, destination] of [
      [42, 'Saved setup', 'setup'],
      [43, 'In progress', 'observe'],
      [44, 'Finished', 'observe'],
      [45, 'Needs attention', 'setup'],
      [46, 'In progress', 'observe'],
    ] as const) {
      const card = page.locator('.library-item').filter({
        has: page.getByRole('heading', { name: `Game ${id}`, exact: true }),
      })
      await expect(card.locator('.library-status')).toHaveText(label)
      await expect(card.locator('.library-item-link')).toHaveAttribute('href', `/games/${id}/${destination}`)
      await expect(card.locator('a')).toHaveCount(1)
      const cardBounds = await card.boundingBox()
      const linkBounds = await card.locator('.library-item-link').boundingBox()
      expect(cardBounds).not.toBeNull()
      expect(linkBounds).not.toBeNull()
      expect(Math.abs(cardBounds!.width - linkBounds!.width)).toBeLessThanOrEqual(3)
      expect(Math.abs(cardBounds!.height - linkBounds!.height)).toBeLessThanOrEqual(3)
    }

    await page.screenshot({ path: testInfo.outputPath(`library-${width}.png`), fullPage: true })
    const failedCard = page.locator('.library-item').filter({ hasText: 'Game 45' })
    await expect(failedCard.getByRole('button', { name: 'Retry game' })).not.toBeVisible()
    await failedCard.locator('.library-more-trigger').click()
    await expect(failedCard.getByRole('button', { name: 'Retry game' })).toBeVisible()
    await expect(failedCard.getByRole('button', { name: 'Delete game 45' })).toBeVisible()
    const menuBounds = await failedCard.locator('.library-game-menu-panel').boundingBox()
    expect(menuBounds).not.toBeNull()
    expect(menuBounds!.x).toBeGreaterThanOrEqual(0)
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(width)
    await expect(page).toHaveURL(/\/games$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}

test('opens the saved setup from the card without starting the game', async ({ page }) => {
  await authenticatePage(page)
  const savedGame = gameSummaries[0]
  let runRequests = 0
  await page.route('**/api/v1/games', (route) => route.fulfill({ json: gameListResponse([savedGame]) }))
  await page.route('**/api/v1/games/42', (route) => route.fulfill({
    json: {
      data: {
        ...savedGame,
        board: {
          board_schema_version: '1', seed: savedGame.seed,
          ruleset: savedGame.ruleset, map: savedGame.map,
          hexes: [], vertices: [], edges: [], ports: [],
        },
        seats: [],
      },
    },
  }))
  await page.route('**/api/v1/games/42/run', (route) => {
    runRequests += 1
    return route.abort()
  })

  await page.goto('/games')
  const card = page.getByRole('link', { name: 'Open setup for Game 42', exact: true })
  await card.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/games\/42\/setup$/)
  await expect(page.getByRole('heading', { name: 'Review your game.', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start saved game', exact: true })).toBeEnabled()
  expect(runRequests).toBe(0)
})

test('switches views through the server filter and preserves complete counts', async ({ page }) => {
  await authenticatePage(page)
  const counts = { all: 2, saved_setups: 1, in_progress: 1, history: 0 }
  const requests: string[] = []
  await page.route(/\/api\/v1\/games(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    const view = url.searchParams.get('view') ?? 'all'
    requests.push(view)

    if (view === 'saved_setups') {
      await route.fulfill({
        json: gameListResponse([gameSummaries[0]], {
          view: 'saved_setups',
          counts,
        }),
      })
      return
    }

    if (view === 'in_progress') {
      await route.fulfill({
        json: gameListResponse([gameSummaries[1]], {
          view: 'in_progress',
          counts,
        }),
      })
      return
    }

    await route.fulfill({ json: gameListResponse(gameSummaries, { counts }) })
  })

  await page.goto('/games')

  await expect(page.getByRole('tab', { name: /All games/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: /Saved setups/ })).toContainText('1')
  await expect(page.getByRole('tab', { name: /In progress/ })).toContainText('1')
  await expect(page.getByRole('tab', { name: /History/ })).toContainText('0')

  await page.getByRole('tab', { name: /Saved setups/ }).click()
  await expect(page.getByRole('tab', { name: /Saved setups/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: '1 saved setup', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Game 42' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Game 43' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open setup for Game 42', exact: true })).toBeVisible()

  await page.getByRole('tab', { name: /In progress/ }).click()
  await expect(page.getByRole('heading', { name: '1 game in progress', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Game 43' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Game 42' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open game for Game 43', exact: true })).toBeVisible()
  expect(requests.filter((view) => view === 'saved_setups')).toHaveLength(1)
  expect(requests.filter((view) => view === 'in_progress')).toHaveLength(1)
})

test('keeps category navigation visible and keyboard focus stable while loading', async ({ page }) => {
  await authenticatePage(page)
  let releaseSavedSetups: () => void = () => {}
  const savedSetupsReady = new Promise<void>((resolve) => { releaseSavedSetups = resolve })
  const counts = { all: 2, saved_setups: 1, in_progress: 1, history: 0 }
  await page.route(/\/api\/v1\/games(?:\?.*)?$/, async (route) => {
    const view = new URL(route.request().url()).searchParams.get('view') ?? 'all'
    if (view === 'saved_setups') {
      await savedSetupsReady
      await route.fulfill({ json: gameListResponse([gameSummaries[0]], { view, counts }) })
    } else if (view === 'history') {
      await route.fulfill({ json: gameListResponse([], { view, counts }) })
    } else {
      await route.fulfill({ json: gameListResponse(gameSummaries, { counts }) })
    }
  })
  await page.goto('/games')
  await expect(page.locator('.library-item')).toHaveCount(2)
  await page.getByRole('tab', { name: /All games/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: /Saved setups/ })).toBeFocused()
  await expect(page.getByRole('tab', { name: /Saved setups/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tablist')).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(4)
  await expect(page.getByRole('status')).toHaveText('Loading your games')
  releaseSavedSetups()
  await expect(page.locator('.library-item')).toHaveCount(1)
  await expect(page.getByRole('tab', { name: /Saved setups/ })).toBeFocused()

  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: /History/ })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'No finished games yet' })).toBeVisible()
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: /All games/ })).toBeFocused()
  await expect(page.locator('.library-item')).toHaveCount(2)
})

test('keeps the mobile library inside the frame and preserves delete styling while busy', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(gameListResponse(gameSummaries)),
    })
  })

  let releaseDelete: (() => void) | null = null
  const deleteResponse = new Promise<void>((resolve) => {
    releaseDelete = resolve
  })
  await page.route('**/api/v1/games/42', async (route) => {
    await deleteResponse
    await route.fulfill({ status: 204 })
  })

  await page.goto('/games')

  const gameCard = page.locator('.library-item').filter({ hasText: 'Game 42' })
  const gameMenu = gameCard.locator('.library-game-menu')
  await gameMenu.locator('.library-more-trigger').click()
  const deleteAction = gameMenu.getByRole('button', { name: 'Delete game 42', exact: true })
  await expect(deleteAction).toHaveCSS('color', 'rgb(201, 109, 98)')

  await deleteAction.click()
  const deleteModal = page.getByRole('dialog', { name: 'Delete Game 42?' })
  await expect(deleteModal).toBeVisible()
  await deleteModal.getByRole('button', { name: 'Delete game', exact: true }).click()

  const pendingDeleteAction = deleteModal.getByRole('button', {
    name: 'Deleting game',
    exact: true,
  })
  await expect(pendingDeleteAction).toBeDisabled()
  await expect(pendingDeleteAction).toHaveCSS('background-color', 'rgb(201, 109, 98)')
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  expect(pageWidth).toBeLessThanOrEqual(viewportWidth)

  releaseDelete?.()
  await expect(gameCard).toHaveCount(0)
})

test('dismisses the game menu and keeps modal focus contained', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(gameListResponse(gameSummaries)),
    })
  })

  await page.goto('/games')

  const gameCard = page.locator('.library-item').filter({ hasText: 'Game 42' })
  const gameMenu = gameCard.locator('.library-game-menu')
  const moreTrigger = gameMenu.locator('.library-more-trigger')

  await moreTrigger.click()
  await expect(gameMenu).toHaveAttribute('open', '')
  await page.mouse.click(5, 5)
  await expect(gameMenu).not.toHaveAttribute('open', '')

  await moreTrigger.click()
  await page.keyboard.press('Escape')
  await expect(gameMenu).not.toHaveAttribute('open', '')
  await expect(moreTrigger).toBeFocused()

  await clickDeleteAction(page, 42)

  const deleteModal = page.getByRole('dialog', { name: 'Delete Game 42?' })
  const cancelButton = deleteModal.getByRole('button', { name: 'Cancel', exact: true })
  const confirmButton = deleteModal.getByRole('button', { name: 'Delete game', exact: true })
  await expect(cancelButton).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(confirmButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancelButton).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(deleteModal).toHaveCount(0)
  await expect(gameMenu).not.toHaveAttribute('open', '')
  await expect(moreTrigger).toBeFocused()

  await clickDeleteAction(page, 42)
  await page.locator('.delete-modal-backdrop').click({ position: { x: 5, y: 5 } })
  await expect(deleteModal).toHaveCount(0)
  await expect(gameMenu).not.toHaveAttribute('open', '')
  await expect(moreTrigger).toBeFocused()
})

test('loads the last saved game without replacing the first page', async ({ page }) => {
  await authenticatePage(page)
  const games = savedGames(21)
  const requests: number[] = []
  let releasePage: () => void = () => {}
  const nextPageReady = new Promise<void>((resolve) => {
    releasePage = resolve
  })
  await page.route(/\/api\/v1\/games(?:\?.*)?$/, async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    const currentPage = Number(new URL(route.request().url()).searchParams.get('page') ?? 1)
    requests.push(currentPage)
    if (currentPage === 2) {
      await nextPageReady
    }
    await route.fulfill({
      json: gameListResponse(games.slice((currentPage - 1) * 20, currentPage * 20), {
        currentPage,
        total: games.length,
      }),
    })
  })

  await page.goto('/games')
  await expect(page.getByRole('heading', { name: '21 games', exact: true })).toBeVisible()
  await expect(page.locator('.library-item')).toHaveCount(20)
  await expect(page.getByRole('heading', { name: 'Game 80', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  const pendingAction = page.getByRole('button', { name: 'Loading more games...', exact: true })
  await expect(pendingAction).toBeDisabled()
  await pendingAction.evaluate((button: HTMLButtonElement) => button.click())
  releasePage()

  await expect(page.locator('.library-item')).toHaveCount(21)
  await expect(page.getByRole('heading', { name: 'Game 100', exact: true })).toBeVisible()
  const olderGame = page.locator('.library-item').filter({
    has: page.getByRole('heading', { name: 'Game 80', exact: true }),
  })
  await expect(olderGame.getByRole('link', { name: 'View history for Game 80', exact: true })).toHaveAttribute(
    'href', '/games/80/observe',
  )
  await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0)
  expect(requests.filter((number) => number === 2)).toHaveLength(1)
})

test('keeps loaded games after a page failure and retries the same page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await authenticatePage(page)
  const games = savedGames(21)
  let nextPageRequests = 0
  await page.route(/\/api\/v1\/games(?:\?.*)?$/, async (route) => {
    const currentPage = Number(new URL(route.request().url()).searchParams.get('page') ?? 1)
    if (currentPage === 2 && ++nextPageRequests === 1) {
      await route.fulfill({
        status: 503,
        json: { error: { code: 'unavailable', message: 'Try again later.' } },
      })
      return
    }
    await route.fulfill({
      json: gameListResponse(games.slice((currentPage - 1) * 20, currentPage * 20), {
        currentPage, total: 21,
      }),
    })
  })

  await page.goto('/games')
  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The game service is unavailable right now.')
  await expect(page.locator('.library-item')).toHaveCount(20)
  await expect(page.getByRole('heading', { name: '21 games', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Try again', exact: true }).click()

  await expect(page.locator('.library-item')).toHaveCount(21)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(nextPageRequests).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

for (const count of [21, 41]) {
  test(`does not skip an older game after deleting from a partially loaded library of ${count}`, async ({ page }) => {
    await authenticatePage(page)
    let games = savedGames(count)
    let failRefresh = count === 41
    await page.route(/\/api\/v1\/games(?:\?.*)?$/, async (route) => {
      const currentPage = Number(new URL(route.request().url()).searchParams.get('page') ?? 1)
      if (games.length < count && currentPage === 2 && failRefresh) {
        failRefresh = false
        await route.fulfill({
          status: 503,
          json: { error: { code: 'unavailable', message: 'Try again later.' } },
        })
        return
      }
      await route.fulfill({
        json: gameListResponse(games.slice((currentPage - 1) * 20, currentPage * 20), {
          currentPage, total: games.length,
        }),
      })
    })
    await page.route('**/api/v1/games/100', async (route) => {
      expect(route.request().method()).toBe('DELETE')
      games = games.filter(({ id }) => id !== 100)
      await route.fulfill({ status: 204 })
    })

    await page.goto('/games')
    await expect(page.getByRole('heading', { name: `${count} games`, exact: true })).toBeVisible()
    if (count === 41) {
      await page.getByRole('button', { name: 'Load more', exact: true }).click()
      await expect(page.locator('.library-item')).toHaveCount(40)
    }
    await clickDeleteAction(page, 100)
    await confirmDelete(page, 100)
    await expect(page.locator('.library-item')).toHaveCount(count - 2)
    await expect(page.getByRole('heading', { name: `${count - 1} games`, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Load more', exact: true }).click()

    if (count === 41) {
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(page.locator('.library-item')).toHaveCount(39)
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
    }

    await expect(page.locator('.library-item')).toHaveCount(count - 1)
    await expect(page.getByRole('heading', { name: `Game ${101 - count}`, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Game 100', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0)
  })
}

test('clears an expired session when loading an older page', async ({ page }) => {
  await authenticatePage(page)
  await page.route(/\/api\/v1\/games(?:\?.*)?$/, async (route) => {
    if (new URL(route.request().url()).searchParams.has('page')) {
      await route.fulfill({
        status: 401,
        json: { error: { code: 'unauthenticated', message: 'Authentication is required.' } },
      })
      return
    }
    await route.fulfill({ json: gameListResponse(savedGames(20), { total: 21 }) })
  })

  await page.goto('/games')
  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.evaluate(() => sessionStorage.getItem('catan.api-token'))).resolves.toBeNull()
})

test('renders an empty library without a blank screen', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(gameListResponse([])),
    })
  })

  await page.goto('/games')

  await expect(page.getByRole('heading', { name: 'All games', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your library is empty', exact: true })).toBeVisible()
  await expect(
    page.getByText('Create a game to see your saved boards and matches here.'),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create a game' })).toBeVisible()
})

test('keeps a game until confirmed deletion succeeds', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(gameListResponse(gameSummaries)),
    })
  })

  let deleteRequestCount = 0
  await page.route('**/api/v1/games/42', async (route) => {
    expect(route.request().method()).toBe('DELETE')
    expect(route.request().headers().authorization).toBe('Bearer test-token')
    deleteRequestCount += 1
    await route.fulfill({ status: 204 })
  })

  await page.goto('/games')

  const gameCard = page.locator('.library-item').filter({ hasText: 'Game 42' })
  const gameMenu = gameCard.locator('.library-game-menu')
  const moreTrigger = gameMenu.locator('.library-more-trigger')
  await expect(gameCard).toBeVisible()

  await clickDeleteAction(page, 42)
  const deleteModal = page.getByRole('dialog', { name: 'Delete Game 42?' })
  await expect(deleteModal.getByText('This will permanently delete the saved game and its history. You cannot undo this action.')).toBeVisible()
  await deleteModal.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(gameCard).toBeVisible()
  await expect(gameMenu).not.toHaveAttribute('open', '')
  await expect(moreTrigger).toBeFocused()
  expect(deleteRequestCount).toBe(0)

  await clickDeleteAction(page, 42)
  await confirmDelete(page, 42)

  await expect(gameCard).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '1 game', exact: true })).toBeVisible()
  await expect(page.getByText('Game 43', { exact: true })).toBeVisible()
  expect(deleteRequestCount).toBe(1)
  await expect(page.locator('.account-trigger')).toHaveAttribute(
    'aria-label',
    'Account menu for Ada Player',
  )
})

for (const response of [
  {
    name: 'not-found',
    status: 404,
    message: 'This game could not be found. Refresh the library and try again.',
  },
  {
    name: 'validation',
    status: 422,
    message: 'The game cannot be deleted in its current state.',
  },
  {
    name: 'service-unavailable',
    status: 503,
    message: 'The game service is unavailable right now. Please try again.',
  },
]) {
  test(`keeps the game visible after a ${response.name} delete response`, async ({ page }) => {
    await authenticatePage(page)
    await page.route('**/api/v1/games', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(gameListResponse(gameSummaries)),
      })
    })
    await page.route('**/api/v1/games/42', async (route) => {
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: response.name,
            message: response.message,
          },
        }),
      })
    })

    await page.goto('/games')
    await clickDeleteAction(page, 42)
    await confirmDelete(page, 42)

    await expect(page.getByRole('dialog', { name: 'Delete Game 42?' }).getByRole('alert')).toHaveText(response.message)
    await expect(page.getByRole('heading', { name: '2 games', exact: true })).toBeVisible()
    await expect(page.getByText('Game 42', { exact: true })).toBeVisible()
    await expect(page.locator('.account-trigger')).toHaveAttribute(
      'aria-label',
      'Account menu for Ada Player',
    )
  })
}

test('keeps the game visible after a network delete failure', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(gameListResponse(gameSummaries)),
    })
  })
  await page.route('**/api/v1/games/42', async (route) => {
    await route.abort('failed')
  })

  await page.goto('/games')
  await clickDeleteAction(page, 42)
  await confirmDelete(page, 42)

  await expect(page.getByRole('dialog', { name: 'Delete Game 42?' }).getByRole('alert')).toHaveText(
    'The game could not be deleted. Check the connection and try again.',
  )
  await expect(page.getByText('Game 42', { exact: true })).toBeVisible()
  await expect(page.locator('.account-trigger')).toHaveAttribute(
    'aria-label',
    'Account menu for Ada Player',
  )
})

for (const response of [
  {
    name: 'not-found',
    status: 404,
    message: 'The game library could not be found. Please try again.',
  },
  {
    name: 'validation',
    status: 422,
    message: 'The game library request is invalid.',
  },
  {
    name: 'service-unavailable',
    status: 503,
    message: 'The game service is unavailable right now. Please try again.',
  },
]) {
  test(`shows a recoverable ${response.name} library response`, async ({ page }) => {
    await authenticatePage(page)
    await page.route('**/api/v1/games', async (route) => {
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: response.name,
            message: response.message,
          },
        }),
      })
    })

    await page.goto('/games')

    await expect(page.locator('.library-state-error p')).toHaveText(response.message)
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.locator('.account-trigger')).toHaveAttribute(
      'aria-label',
      'Account menu for Ada Player',
    )
  })
}

test('shows a recoverable network error for the library', async ({ page }) => {
  await authenticatePage(page)
  await page.route('**/api/v1/games', async (route) => {
    await route.abort('failed')
  })

  await page.goto('/games')

  await expect(page.locator('.library-state-error p')).toHaveText(
    'The game library could not be reached. Check the connection and try again.',
  )
  await expect(page.locator('.account-trigger')).toHaveAttribute(
    'aria-label',
    'Account menu for Ada Player',
  )
})

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
  await page.route('**/api/v1/games/43', (route) => route.fulfill({
    status: 200,
    json: {
      data: {
        ...gameSummaries[1],
        board: {
          board_schema_version: '1',
          seed: gameSummaries[1].seed,
          ruleset: gameSummaries[1].ruleset,
          map: gameSummaries[1].map,
          hexes: [], vertices: [], edges: [], ports: [],
        },
        seats: [],
      },
    },
  }))
}

function savedGames(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...gameSummaries[0],
    id: 100 - index,
    lifecycle_status: 'completed',
  }))
}

async function clickDeleteAction(page: Page, gameID: number) {
  const gameCard = page.locator('.library-item').filter({ hasText: `Game ${gameID}` })
  const gameMenu = gameCard.locator('.library-game-menu')

  if ((await gameMenu.getAttribute('open')) === null) {
    await gameMenu.locator('.library-more-trigger').click()
  }

  await gameMenu.getByRole('button', { name: `Delete game ${gameID}`, exact: true }).click()
}

async function confirmDelete(page: Page, gameID: number) {
  const deleteModal = page.getByRole('dialog', { name: `Delete Game ${gameID}?` })
  await deleteModal.getByRole('button', { name: 'Delete game', exact: true }).click()
}
