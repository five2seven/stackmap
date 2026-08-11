import { expect, test } from '@playwright/test'

test('uses bundled session-only data without API or browser persistence', async ({ page }) => {
  const issues: string[] = []
  const requests: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') issues.push(message.text())
  })
  page.on('pageerror', (error) => issues.push(error.message))
  page.on('request', (request) => requests.push(new URL(request.url()).pathname))
  await page.addInitScript(() => {
    const blocked = (name: string) => () => { throw new Error(`${name} must not be used by the demo`) }
    globalThis.fetch = blocked('fetch') as typeof fetch
    Storage.prototype.getItem = blocked('Storage.getItem')
    Storage.prototype.setItem = blocked('Storage.setItem')
    Storage.prototype.removeItem = blocked('Storage.removeItem')
    Storage.prototype.clear = blocked('Storage.clear')
    IDBFactory.prototype.open = blocked('IndexedDB.open') as typeof indexedDB.open
    IDBFactory.prototype.deleteDatabase = blocked('IndexedDB.deleteDatabase') as typeof indexedDB.deleteDatabase
  })

  await page.goto('/')
  await expect(page.getByRole('status', { name: 'Public demo notice' })).toContainText(
    'Edits exist only in this page session and reset when you refresh',
  )
  await expect(page.getByRole('heading', { name: 'Plex', level: 3 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore backup' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download current StackMap server backup' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Edit Paperless-ngx' }).click()
  const editor = page.getByRole('region', { name: 'Edit Paperless-ngx' })
  await editor.getByLabel('Notes').fill('Temporary demo edit')
  await editor.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('button', { name: 'Edit Paperless-ngx' }).click()
  await expect(page.getByRole('region', { name: 'Edit Paperless-ngx' }).getByLabel('Notes')).toHaveValue(
    'Temporary demo edit',
  )

  await page.reload()
  await page.getByRole('button', { name: 'Edit Paperless-ngx' }).click()
  await expect(page.getByRole('region', { name: 'Edit Paperless-ngx' }).getByLabel('Notes')).toHaveValue(
    'Host port and public URL still need planning.',
  )

  expect(requests.filter((path) => path.startsWith('/api/') || path === '/health')).toEqual([])
  expect(issues).toEqual([])
})
