import { expect, test } from '@playwright/test'

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const

for (const viewport of VIEWPORTS) {
  test(`shows the truthful board preview shell at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/')

    await expect(page).toHaveTitle('Catan · Seeded Board Preview')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const seed = page.getByLabel('Board seed')
    await expect(seed).toHaveValue('894177203164')
    await seed.fill('42')
    await expect(seed).toHaveValue('42')

    await expect(page.getByRole('button', { name: 'Generate preview' })).toBeEnabled()
    await expect(page.getByText('No board data yet', { exact: true })).toBeVisible()
    await expect(page.getByText('base@1.0.0', { exact: true })).toBeVisible()
    await expect(page.getByText('standard@1.0.0', { exact: true })).toBeVisible()

    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(pageWidth).toBeLessThanOrEqual(viewportWidth)
  })
}

test('submits the seed to Laravel and displays canonical board metadata', async ({ page }) => {
  const submittedSeeds: string[] = []

  await page.route('**/api/v1/boards/generate', async (route) => {
    submittedSeeds.push(route.request().postDataJSON().seed)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(boardResponse('42')),
    })
  })

  await page.goto('/')
  await page.getByLabel('Board seed').fill('42')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  await expect(page.getByRole('heading', { name: 'Board ready to render.' })).toBeVisible()
  await expect(page.getByText(/Seed 42 produced a standard map with/)).toBeVisible()
  await expect(page.getByText('Canonical response received')).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Standard Catan board generated from seed 42' }),
  ).toBeVisible()
  await expect(page.locator('.board-hex')).toHaveCount(19)
  await expect(page.locator('.board-port')).toHaveCount(9)

  await page.getByRole('button', { name: 'Generate preview' }).click()
  await expect(page.getByText(/Seed 42 produced a standard map with/)).toBeVisible()
  expect(submittedSeeds).toEqual(['42', '42'])
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

  await page.goto('/')
  await page.getByRole('button', { name: 'Generate preview' }).click()

  await expect(page.locator('.board-svg')).toBeVisible()
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

  await page.goto('/')
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

  await page.goto('/')
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
