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

    await expect(page.getByRole('button', { name: 'Generate preview' })).toBeDisabled()
    await expect(page.getByText('No board data yet', { exact: true })).toBeVisible()
    await expect(page.getByText('base@1.0.0', { exact: true })).toBeVisible()
    await expect(page.getByText('standard@1.0.0', { exact: true })).toBeVisible()

    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(pageWidth).toBeLessThanOrEqual(viewportWidth)
  })
}
