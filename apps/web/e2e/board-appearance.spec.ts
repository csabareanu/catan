import { devices, expect, test, type Page } from '@playwright/test'
import standardBoard from './fixtures/standard-board.json' with { type: 'json' }

test('renders all six approved terrains and restores the original Classic board', async ({ page }, testInfo) => {
  let generationRequests = 0
  const terrainRequests: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('request', (request) => {
    if (request.url().includes('terrain-atlas')) terrainRequests.push(request.url())
  })
  await page.route('**/api/v1/boards/generate', (route) => {
    generationRequests += 1
    return route.fulfill({ json: { data: standardBoard } })
  })
  await generatePreview(page)
  const board = page.locator('.board-svg')
  const classic = await board.screenshot({ animations: 'disabled' })
  const classicTiles = await board.locator('.board-hex').evaluateAll((tiles) =>
    tiles.map((tile) => ({ fill: getComputedStyle(tile).fill, points: tile.getAttribute('points') })),
  )
  await expect(board.locator('image')).toHaveCount(0)

  await changeStyle(page, 'Illustrated')
  await waitForArtwork(page)
  const expectedCells = {
    forest: '0 0 100 100', pasture: '100 0 100 100', fields: '200 0 100 100',
    hills: '0 100 100 100', mountains: '100 100 100 100', desert: '200 100 100 100',
  }
  for (const [terrain, cell] of Object.entries(expectedCells)) {
    const fill = await board.locator(`.board-hex-${terrain}`).first().evaluate(
      (tile) => getComputedStyle(tile).fill,
    )
    expect(fill).toContain(`-${terrain}`)
    await expect(board.locator(`pattern[id$="-terrain-${terrain}"] svg`))
      .toHaveAttribute('viewBox', cell)
  }
  await expect(board.locator('.board-hex')).toHaveCount(19)
  await expect(board.locator('.number-token-value')).toHaveCount(18)
  await expect(board.locator('.number-token-pip')).toHaveCount(4)
  await expect(board.locator('.board-resource-symbol')).toHaveCount(19)
  await expect(board.locator('.board-hex-label')).toHaveCount(19)
  await expect(board.locator('.board-port')).toHaveCount(9)
  await expect(page.locator('.board-legend-swatch-forest')).toHaveCSS('background-size', '300% 200%')
  const terrainPaths = new Set(terrainRequests.map((url) => new URL(url).pathname))
  expect(terrainPaths.size).toBe(1)
  expect([...terrainPaths][0]).toContain('terrain-atlas.webp')
  expect(terrainRequests.every((url) => !url.includes('terrain-atlas.png'))).toBe(true)
  const illustrated = await board.screenshot({ path: testInfo.outputPath('illustrated-board.png') })
  expect(illustrated.equals(classic)).toBe(false)

  await changeStyle(page, 'Classic')
  await expect(board.locator('image')).toHaveCount(0)
  expect(await board.locator('.board-hex').evaluateAll((tiles) =>
    tiles.map((tile) => ({ fill: getComputedStyle(tile).fill, points: tile.getAttribute('points') })),
  )).toEqual(classicTiles)
  await board.screenshot({ path: testInfo.outputPath('classic-restored.png') })
  expect(generationRequests).toBe(1)
  expect(errors).toEqual([])
})

test('preserves wheel zoom, pointer panning, and fitted reset with illustrated terrain', async ({ page }) => {
  await useIllustratedPreview(page)
  const board = page.locator('.board-svg')
  const shell = page.locator('.board-svg-shell')
  const fittedViewBox = await board.getAttribute('viewBox')
  await shell.hover({ position: { x: 160, y: 180 } })
  await page.mouse.wheel(0, -240)
  await expect(board).not.toHaveAttribute('viewBox', fittedViewBox!)
  const zoomedViewBox = await board.getAttribute('viewBox')
  const bounds = await shell.boundingBox()
  if (!bounds) throw new Error('The illustrated board must be visible before panning.')

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2 - 60, bounds.y + bounds.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(board).not.toHaveAttribute('viewBox', zoomedViewBox!)
  await page.getByRole('button', { name: 'Fit board', exact: true }).click()
  await expect(board).toHaveAttribute('viewBox', fittedViewBox!)
})

test.describe('illustrated touch board', () => {
  const device = devices['iPhone 13']
  test.use({
    viewport: device.viewport,
    screen: device.screen,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  })

  test('zooms with a real two-finger pinch and returns to the full island', async ({ page }, testInfo) => {
    await useIllustratedPreview(page)
    const shell = page.locator('.board-svg-shell')
    await shell.scrollIntoViewIfNeeded()
    const bounds = await shell.boundingBox()
    if (!bounds) throw new Error('The illustrated board must be visible before pinching.')
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    const session = await page.context().newCDPSession(page)
    const fingers = (spread: number) => [
      { x: centerX - spread, y: centerY, id: 1 },
      { x: centerX + spread, y: centerY, id: 2 },
    ]
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(25) })
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(45) })
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(65) })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.locator('.board-svg-zoom-status')).not.toContainText('100%')
    await shell.screenshot({ path: testInfo.outputPath('illustrated-pinch.png') })
    await page.getByRole('button', { name: 'Fit board', exact: true }).tap()
    await expect(page.locator('.board-svg-zoom-status')).toContainText('100%')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await session.detach()
  })
})

async function useIllustratedPreview(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('catan.board-appearance.v1', 'illustrated'))
  await page.route('**/api/v1/boards/generate', (route) => route.fulfill({ json: { data: standardBoard } }))
  await generatePreview(page)
  await waitForArtwork(page)
}

async function generatePreview(page: Page): Promise<void> {
  await page.goto('/preview')
  await page.getByRole('button', { name: 'Generate preview' }).click()
  await expect(page.locator('.board-svg')).toBeVisible()
}

async function changeStyle(page: Page, name: 'Classic' | 'Illustrated'): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
  await dialog.getByRole('radio', { name, exact: true }).check()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
}

async function waitForArtwork(page: Page): Promise<void> {
  await page.locator('.board-svg image').first().evaluate(async (element) => {
    const source = element.getAttribute('href')
    if (!source) throw new Error('The illustrated board needs an artwork source.')
    const image = new Image()
    image.src = source
    await image.decode()
  })
}
