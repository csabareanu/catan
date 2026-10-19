import { expect, test } from '@playwright/test'

const token = process.env.COMPOSE_OBSERVER_TOKEN
const gameID = Number(process.env.COMPOSE_OBSERVER_GAME_ID)

test('observes a real Compose game without API interception', async ({ page }, testInfo) => {
  if (token === undefined || !Number.isSafeInteger(gameID) || gameID < 1) {
    throw new Error('The Compose observer smoke test requires a token and numeric game id.')
  }

  const apiFailures: string[] = []
  const consoleErrors: string[] = []

  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname

    if (pathname.startsWith('/api/') && response.status() >= 400) {
      apiFailures.push(`${response.status()} ${pathname}`)
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
  await expect(page.getByText('Run in progress', { exact: true })).toBeVisible()
  await expect(page.locator('.observer-board .board-svg')).toBeVisible()
  await expect(page.locator('.board-hex')).toHaveCount(19)
  await expect(page.locator('.board-port')).toHaveCount(9)

  const detailsTrigger = page.getByRole('button', { name: 'Overview', exact: true })
  await detailsTrigger.click()

  const detailsDialog = page.getByRole('dialog', { name: 'Game details' })
  await expect(detailsDialog).toBeVisible()
  await expect(detailsDialog.getByRole('heading', { name: 'Players', exact: true })).toBeVisible()
  await expect(detailsDialog.locator('.observer-player')).toHaveCount(3)
  await expect(detailsDialog.getByRole('heading', { name: 'History', exact: true })).toBeVisible()

  await page.screenshot({ path: testInfo.outputPath('compose-observer.png') })
  await expect(apiFailures).toEqual([])
  await expect(consoleErrors).toEqual([])
})
