import { devices, expect, test } from '@playwright/test'

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'small mobile', width: 320, height: 568 },
] as const

for (const viewport of VIEWPORTS) {
  test(`welcomes visitors at ${viewport.name} width`, async ({ page }) => {
    const consoleErrors: string[] = []
    const boardRequests: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    page.on('request', (request) => {
      if (request.url().includes('/api/v1/boards/generate')) {
        boardRequests.push(request.url())
      }
    })

    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/')

    await expect(page).toHaveTitle('Catan · Welcome')
    await expect(page.getByRole('heading', { name: 'Welcome to Catan.' })).toBeVisible()
    await expect(
      page.locator('.landing-copy').getByRole('link', { name: 'Create account' }),
    ).toHaveAttribute(
      'href',
      '/register',
    )
    await expect(
      page.locator('.landing-copy').getByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute(
      'href',
      '/login',
    )
    await expect(
      page.getByText('Create an account to create games and follow their history.'),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Take a look at the board' })).toHaveAttribute(
      'href',
      '/preview',
    )
    await expect(
      page.getByRole('img', {
        name: 'A coastal settlement, golden fields, and distant mountains in the evening sun',
      }),
    ).toBeVisible()
    await expect(page.locator('.landing-visual img')).toHaveJSProperty('naturalWidth', 1536)
    await expect(page.locator('.board-hex')).toHaveCount(0)
    await expect(page.getByText('Developer details', { exact: true })).toHaveCount(0)

    if (viewport.width <= 390) {
      const artwork = await page.locator('.landing-visual').boundingBox()
      const heading = await page.getByRole('heading', { level: 1 }).boundingBox()
      const actions = await page.locator('.landing-actions').boundingBox()
      const footer = await page.locator('.landing-footer').boundingBox()

      if (!artwork || !heading || !actions || !footer) {
        throw new Error('The artwork, heading, account actions, and footer must be displayed.')
      }

      expect(artwork.y).toBeLessThanOrEqual(heading.y)
      expect(artwork.y + artwork.height).toBeGreaterThan(heading.y + heading.height)
      expect(actions.y + actions.height).toBeLessThanOrEqual(viewport.height)
      expect(footer.y - (artwork.y + artwork.height)).toBeLessThanOrEqual(24)
    }

    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(pageWidth).toBeLessThanOrEqual(viewportWidth)
    expect(boardRequests).toEqual([])
    expect(consoleErrors).toEqual([])
  })
}

test('renders the board preview at the secondary /preview path', async ({ page }) => {
  await page.goto('/preview')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login',
  )
})

test('submits a manual seed on the preview path and keeps developer metadata available on demand', async ({ page }) => {
  const submittedSeeds: string[] = []

  await page.route('**/api/v1/boards/generate', async (route) => {
    submittedSeeds.push(route.request().postDataJSON().seed)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(boardResponse('42')),
    })
  })

  await page.goto('/preview')
  await page.getByLabel('Board seed').fill('42')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  await expect(page.getByRole('heading', { name: 'Your board is ready.' })).toBeVisible()
  await expect(page.getByText(/Seed 42 created a Catan board with/)).toBeVisible()
  await expect(page.getByText('Board generated', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Standard Catan board generated from seed 42' }),
  ).toBeVisible()
  await expect(page.locator('.board-hex')).toHaveCount(19)
  await expect(page.locator('.board-port')).toHaveCount(9)
  const boardGuide = page.locator('.board-renderer .board-legend')
  await expect(boardGuide).toHaveAttribute('aria-label', 'Terrain and resource guide')
  await expect(boardGuide.locator('.board-legend-item')).toHaveCount(6)
  await expect(boardGuide.locator('.board-legend-swatch-forest')).not.toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
  await expect(boardGuide).toContainText('Lumber')
  await expect(boardGuide).toContainText('No production')
  await expect(page.locator('.board-resource-symbol')).toHaveCount(19)
  const boardShell = page.locator('.board-svg-shell')
  const boardSVG = page.locator('.board-svg')
  const fittedViewBox = await boardSVG.getAttribute('viewBox')

  if (!fittedViewBox) {
    throw new Error('The board must expose a fitted SVG viewBox before zooming.')
  }

  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 125%')
  await expect(boardSVG).not.toHaveAttribute('viewBox', fittedViewBox)
  await page.getByRole('button', { name: 'Fit board' }).click()
  await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 100%')
  await expect(boardSVG).toHaveAttribute('viewBox', fittedViewBox)
  await boardShell.hover({ position: { x: 120, y: 120 } })
  await page.mouse.wheel(0, -120)
  await expect(page.locator('.board-svg-zoom-status')).not.toContainText('Board zoom 100%')
  await expect(boardSVG).not.toHaveAttribute('viewBox', fittedViewBox)
  await page.getByRole('button', { name: 'Fit board' }).click()
  await expect(page.getByText('base@1.0.0', { exact: true })).toBeHidden()

  await page.getByText('Developer details', { exact: true }).click()
  await expect(page.getByText('base@1.0.0', { exact: true })).toBeVisible()
  await expect(page.getByText('standard@1.0.0 · pointy-top', { exact: true })).toBeVisible()

  expect(submittedSeeds).toEqual(['42'])
})

test('handles board wheel zoom without a passive-listener warning', async ({ page }) => {
  const consoleMessages: string[] = []
  page.on('console', (message) => consoleMessages.push(message.text()))
  await page.route('**/api/v1/boards/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(boardResponse('42')),
    })
  })

  await page.goto('/preview')
  await page.getByRole('button', { name: 'Generate preview' }).click()
  await expect(page.locator('.board-svg')).toBeVisible()

  await page.locator('.board-svg-shell').hover({ position: { x: 120, y: 120 } })
  await page.mouse.wheel(0, -120)

  await expect(page.locator('.board-svg-zoom-status')).not.toContainText('Board zoom 100%')
  expect(consoleMessages.filter((message) => message.includes('Unable to preventDefault inside passive event listener invocation'))).toEqual([])
})

test('pans the board viewport with a primary pointer drag', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  await page.route('**/api/v1/boards/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(boardResponse('42')),
    })
  })

  await page.goto('/preview')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  const boardShell = page.locator('.board-svg-shell')
  const boardSVG = page.locator('.board-svg')
  await expect(boardSVG).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in' }).click()

  const zoomedViewBox = await boardSVG.getAttribute('viewBox')
  const shellBox = await boardShell.boundingBox()

  if (!zoomedViewBox || !shellBox) {
    throw new Error('The board viewport must be measurable before dragging.')
  }

  const startX = shellBox.x + shellBox.width / 2
  const startY = shellBox.y + shellBox.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX - 80, startY, { steps: 4 })
  await page.mouse.up()

  await expect(boardSVG).not.toHaveAttribute('viewBox', zoomedViewBox)
  const metrics = await boardShell.evaluate((shell) => ({
    clientWidth: shell.clientWidth,
    scrollWidth: shell.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(consoleErrors).toEqual([])
})

test.describe('touch board viewport inspection', () => {
  const touchDevice = devices['iPhone 13']

  test.use({
    viewport: touchDevice.viewport,
    screen: touchDevice.screen,
    userAgent: touchDevice.userAgent,
    deviceScaleFactor: touchDevice.deviceScaleFactor,
    isMobile: touchDevice.isMobile,
    hasTouch: touchDevice.hasTouch,
  })

  test('zooms the board with a touch double tap', async ({ page }) => {
    await page.route('**/api/v1/boards/generate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(boardResponse('42')),
      })
    })

    await page.goto('/preview')
    await page.getByRole('button', { name: 'Generate preview' }).click()

    const boardShell = page.locator('.board-svg-shell')
    await expect(boardShell).toBeVisible()
    await boardShell.tap({ position: { x: 180, y: 230 } })
    await boardShell.tap({ position: { x: 180, y: 230 } })

    await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 125%')
    const metrics = await boardShell.evaluate((shell) => ({
      clientWidth: shell.clientWidth,
      scrollWidth: shell.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }))
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)

    await page.getByRole('button', { name: 'Fit board' }).tap()
    await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 100%')
  })
})

test('uses player-facing copy while the board is being generated', async ({ page }) => {
  await page.route('**/api/v1/boards/generate', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await route.abort()
  })

  await page.goto('/preview')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  const boardFeedback = page.locator('.board-feedback')
  await expect(boardFeedback).toContainText('Preparing your board')
  await expect(boardFeedback).toContainText(
    'The same seed will always create the same board.',
  )
  await expect(boardFeedback).not.toContainText(/canonical|service|response/i)
})

test('keeps the generated SVG board within a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/boards/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(boardResponse('42')),
    })
  })

  await page.goto('/preview')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  await expect(page.locator('.board-svg')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 125%')
  const zoomedMetrics = await page.locator('.board-svg-shell').evaluate((shell) => ({
    clientWidth: shell.clientWidth,
    scrollWidth: shell.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect(zoomedMetrics.scrollWidth).toBeLessThanOrEqual(zoomedMetrics.clientWidth + 1)
  expect(zoomedMetrics.documentWidth).toBeLessThanOrEqual(zoomedMetrics.viewportWidth)
  await page.getByRole('button', { name: 'Fit board' }).click()
  await expect(page.locator('.board-svg-zoom-status')).toContainText('Board zoom 100%')
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  expect(pageWidth).toBeLessThanOrEqual(viewportWidth)
})

test('shows a rejected Laravel response without a blank screen', async ({ page }) => {
  await page.route('**/api/v1/boards/generate', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'validation_failed',
          message: 'The board generation request is invalid.',
          fields: { seed: ['The seed must be a canonical non-negative integer string.'] },
        },
      }),
    })
  })

  await page.goto('/preview')
  await page.getByLabel('Board seed').fill('01')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  await expect(page.getByRole('alert')).toContainText(
    'The board generation request is invalid.',
  )
  await expect(page.getByRole('heading', { name: 'Check your seed.' })).toBeVisible()
  await expect(page.getByText('Update the seed and try again', { exact: true })).toBeVisible()
})

test('shows an unavailable Laravel response with a recovery message', async ({ page }) => {
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

  await page.goto('/preview')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  await expect(page.getByRole('alert')).toContainText(
    'The board generation service is unavailable.',
  )
  await expect(page.getByText('Try the request again', { exact: true })).toBeVisible()
})

function boardResponse(seed: string) {
  const verticesByID = new Map<string, { id: string; x: number; y: number }>()
  const edgesByID = new Map<string, { id: string; vertex_ids: [string, string] }>()
  const edgeUseCounts = new Map<string, number>()
  const hexes = STANDARD_COORDINATES.map(({ q, r }, index) => {
    const center = { x: 2 * q + r, y: 3 * r }
    const vertexIDs = VERTEX_OFFSETS.map(({ x, y }) => {
      const vertexID = `vertex:${center.x + x}:${center.y + y}`
      if (!verticesByID.has(vertexID)) {
        verticesByID.set(vertexID, {
          id: vertexID,
          x: center.x + x,
          y: center.y + y,
        })
      }
      return vertexID
    })

    for (let vertexIndex = 0; vertexIndex < vertexIDs.length; vertexIndex += 1) {
      const first = vertexIDs[vertexIndex]
      const second = vertexIDs[(vertexIndex + 1) % vertexIDs.length]
      const endpoints = [first, second].sort() as [string, string]
      const edgeID = `edge:${endpoints[0]}|${endpoints[1]}`
      if (!edgesByID.has(edgeID)) {
        edgesByID.set(edgeID, { id: edgeID, vertex_ids: endpoints })
      }
      edgeUseCounts.set(edgeID, (edgeUseCounts.get(edgeID) ?? 0) + 1)
    }

    return {
      id: `hex:${q}:${r}`,
      q,
      r,
      terrain: TERRAIN_BY_INDEX[index],
      number_token: TOKENS_BY_INDEX[index],
      vertex_ids: vertexIDs,
    }
  })
  const edges = [...edgesByID.values()]
  const perimeterEdges = edges.filter((edge) => edgeUseCounts.get(edge.id) === 1)
  const ports = PORT_RESOURCES.map((resourceType, index) => {
    const edge = perimeterEdges[index]
    return {
      id: `port:${edge.id}`,
      edge_id: edge.id,
      resource_type: resourceType,
      trade_ratio: resourceType ? 2 : 3,
    }
  })

  return {
    data: {
      board_schema_version: '1',
      seed,
      ruleset: { key: 'base', version: '1.0.0' },
      map: { key: 'standard', version: '1.0.0', orientation: 'pointy' },
      hexes,
      vertices: [...verticesByID.values()],
      edges,
      ports,
    },
  }
}

const STANDARD_COORDINATES = [
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: -2, r: 1 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  { q: -2, r: 2 },
  { q: -1, r: 2 },
  { q: 0, r: 2 },
] as const

const VERTEX_OFFSETS = [
  { x: 0, y: -2 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: 0, y: 2 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
] as const

const TERRAIN_BY_INDEX = [
  'desert',
  'fields',
  'mountains',
  'fields',
  'mountains',
  'pasture',
  'pasture',
  'fields',
  'hills',
  'pasture',
  'fields',
  'forest',
  'hills',
  'forest',
  'forest',
  'mountains',
  'pasture',
  'hills',
  'forest',
] as const

const TOKENS_BY_INDEX = [
  null,
  6,
  9,
  11,
  5,
  5,
  11,
  8,
  2,
  10,
  4,
  8,
  3,
  4,
  6,
  9,
  10,
  3,
  12,
] as const

const PORT_RESOURCES = [
  'ore',
  null,
  'brick',
  null,
  'wool',
  'lumber',
  'grain',
  null,
  null,
] as const
