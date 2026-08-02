import { expect, test, type Locator, type Page } from '@playwright/test'

const browserIssues = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const issues: string[] = []
  browserIssues.set(page, issues)
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      issues.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`))
})

test.afterEach(async ({ page }) => {
  expect(browserIssues.get(page)).toEqual([])
})

async function addHost(page: Page, name: string) {
  await page.getByRole('button', { name: 'Manage hosts' }).click()
  await page.getByLabel('Host name *').fill(name)
  await page.getByLabel('Type').selectOption('nas')
  await page.getByLabel('IP address').fill('192.168.1.10')
  await page.getByLabel('Operating system').fill('TrueNAS')
  await page.getByRole('button', { name: 'Create host' }).click()
  await expect(page.getByRole('status')).toContainText(`${name} saved.`)
}

async function addNameOnlyService(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add service' }).click()
  const editor = page.getByRole('region', { name: 'Add service' })
  await editor.getByLabel('Service name *').fill(name)
  await editor.getByRole('button', { name: 'Create service' }).click()
  await expect(page.getByRole('heading', { name, level: 3 })).toBeVisible()
}

function serviceCard(page: Page, name: string): Locator {
  return page.locator('.service-card').filter({
    has: page.getByRole('heading', { name, level: 3 }),
  })
}

test('manages complete service, host, conflicts, search, filters, retirement, and deletion', async ({
  page,
}) => {
  await page.goto('/')
  await addHost(page, 'nas-01')

  await page.getByRole('button', { name: 'Edit host nas-01' }).click()
  await page.getByLabel('Operating system').fill('TrueNAS SCALE')
  await page.getByRole('button', { name: 'Save host' }).click()
  await expect(page.getByRole('status')).toContainText('nas-01 saved.')
  await page.getByRole('button', { name: 'Close' }).click()

  await addNameOnlyService(page, 'Postgres')
  await expect(serviceCard(page, 'Postgres').getByText('Incomplete')).toBeVisible()

  await page.getByRole('button', { name: 'Add service' }).click()
  const editor = page.getByRole('region', { name: 'Add service' })
  await editor.getByLabel('Service name *').fill('Jellyfin')
  await editor.locator('label').filter({ hasText: /^Host/ }).locator('select').selectOption({ label: 'nas-01' })
  await editor.getByLabel('Internal hostname or IP').fill('http://192.168.1.10:8096')
  await editor.getByLabel('External exposure').selectOption('vpn')
  await editor.getByRole('button', { name: 'Add path' }).click()
  await editor.getByLabel('Jellyfin host path 1').fill('/opt/jellyfin/config')
  await editor.getByLabel('Jellyfin container path 1').fill('/config')
  await editor.getByLabel('Jellyfin path purpose 1').fill('Configuration')
  await editor.getByRole('button', { name: 'Add path' }).click()
  await editor.getByLabel('Jellyfin host path 2').fill('/mnt/media')
  await editor.getByLabel('Jellyfin container path 2').fill('/media')
  await editor.getByLabel('Jellyfin path purpose 2').fill('Data')
  await editor.getByLabel('Docker network').fill('media')
  await editor.getByLabel('Postgres').check()
  await editor.getByRole('button', { name: 'Add port' }).click()
  await editor.getByLabel('Host port 1').fill('8096')
  await editor.getByLabel('Container port 1').fill('8096')
  await editor.getByLabel('Port description 1').fill('Web UI')
  await editor.getByRole('button', { name: 'Add port' }).click()
  await editor.getByLabel('Host port 2').fill('7359')
  await editor.getByLabel('Container port 2').fill('7359')
  await editor.getByLabel('Protocol 2').selectOption('udp')
  await editor.getByRole('button', { name: 'Create service' }).click()

  const jellyfin = serviceCard(page, 'Jellyfin')
  await expect(jellyfin.getByText('Incomplete')).toHaveCount(0)
  await expect(jellyfin.getByText('Postgres')).toBeVisible()
  await expect(jellyfin).toContainText('8096:8096/tcp')
  await expect(jellyfin).toContainText('7359:7359/udp')

  await page.getByRole('button', { name: 'Manage hosts' }).click()
  await expect(page.getByRole('button', { name: 'Delete host nas-01' })).toBeDisabled()
  await expect(page.getByText('Reassign services before deleting.')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Add service' }).click()
  const duplicateEditor = page.getByRole('region', { name: 'Add service' })
  await duplicateEditor.getByLabel('Service name *').fill('Plex')
  await duplicateEditor.locator('label').filter({ hasText: /^Host/ }).locator('select').selectOption({ label: 'nas-01' })
  await duplicateEditor.getByRole('button', { name: 'Add port' }).click()
  await duplicateEditor.getByLabel('Host port 1').fill('8096')
  await duplicateEditor.getByLabel('Container port 1').fill('32400')
  await duplicateEditor.getByRole('button', { name: 'Create service' }).click()
  await expect(serviceCard(page, 'Jellyfin').getByText('Host-port conflict')).toBeVisible()
  await expect(serviceCard(page, 'Plex').getByText('Host-port conflict')).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search services' }).fill('Plex')
  await expect(serviceCard(page, 'Plex')).toBeVisible()
  await expect(serviceCard(page, 'Jellyfin')).toHaveCount(0)
  await page.getByLabel('Status').selectOption('active')
  await expect(serviceCard(page, 'Plex')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search services' }).fill('')
  await page.getByLabel('Status').selectOption('all')

  await page.getByRole('button', { name: 'Edit Jellyfin' }).click()
  const editEditor = page.getByRole('region', { name: 'Edit Jellyfin' })
  await editEditor.getByLabel('Notes').fill('Family media server')
  await editEditor.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('button', { name: 'Retire Jellyfin' }).click()
  await expect(page.getByRole('status')).toContainText('Jellyfin retired.')
  await expect(serviceCard(page, 'Jellyfin')).toContainText('retired')

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete Plex' }).click()
  await expect(serviceCard(page, 'Plex')).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Plex permanently deleted.')
})

test('exports data and imports it only after preview confirmation', async ({ page }) => {
  await page.goto('/')
  await addNameOnlyService(page, 'Exported service')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const download = await downloadPromise
  const exported = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'))

  expect(exported).toMatchObject({
    schemaVersion: 3,
    services: [expect.objectContaining({ name: 'Exported service' })],
    hosts: [],
  })
  expect(Date.parse(exported.exportedAt)).not.toBeNaN()

  const importedService = {
    ...exported.services[0],
    id: 'imported-service',
    name: 'Imported service',
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: '2026-07-28T12:00:00.000Z',
    configPath: '/legacy/config',
    dataPath: '',
  }
  delete importedService.paths
  const importPayload = JSON.stringify({
    schemaVersion: 2,
    exportedAt: '2026-07-28T12:00:00.000Z',
    services: [importedService],
    hosts: [],
  })

  await page.getByLabel('Choose JSON backup').setInputFiles({
    name: 'stackmap.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importPayload),
  })
  const preview = page.getByRole('alertdialog', { name: 'Review imported data' })
  await expect(preview).toContainText('1 services')
  await preview.getByRole('button', { name: 'Cancel' }).click()
  await expect(serviceCard(page, 'Exported service')).toBeVisible()

  await page.getByLabel('Choose JSON backup').setInputFiles({
    name: 'stackmap.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importPayload),
  })
  await page.getByRole('button', { name: 'Replace current data' }).click()
  await expect(serviceCard(page, 'Imported service')).toBeVisible()
  await expect(serviceCard(page, 'Exported service')).toHaveCount(0)
  await page.reload()
  await expect(serviceCard(page, 'Imported service')).toBeVisible()
})

test('rejects malformed and incompatible imports without replacing data', async ({ page }) => {
  await page.goto('/')
  await addNameOnlyService(page, 'Keep existing')

  await page.getByLabel('Choose JSON backup').setInputFiles({
    name: 'malformed.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  })
  await expect(page.getByRole('alert')).toContainText('not valid JSON')
  await expect(serviceCard(page, 'Keep existing')).toBeVisible()

  const timestamp = '2026-07-28T12:00:00.000Z'
  await page.getByLabel('Choose JSON backup').setInputFiles({
    name: 'blank-path.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 3,
        exportedAt: timestamp,
        services: [
          {
            id: 'blank-path-service',
            name: 'Blank path service',
            containerName: '',
            dockerImage: '',
            description: '',
            applicationUrl: '',
            status: 'active',
            internalUrl: '',
            ports: [],
            paths: [
              { id: 'blank-path', hostPath: ' ', containerPath: '', purpose: '', readOnly: true },
            ],
            network: '',
            exposure: 'unknown',
            dependencyIds: [],
            notes: '',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        hosts: [],
      }),
    ),
  })
  await expect(page.getByRole('alert')).toContainText('blank path mapping')
  await expect(serviceCard(page, 'Keep existing')).toBeVisible()

  await page.getByLabel('Choose JSON backup').setInputFiles({
    name: 'incompatible.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 99,
        exportedAt: '2026-07-28T12:00:00.000Z',
        services: [],
        hosts: [],
      }),
    ),
  })
  await expect(page.getByRole('alert')).toContainText('Unsupported schema version')
  await expect(serviceCard(page, 'Keep existing')).toBeVisible()
})

test('persists created data after refresh', async ({ page }) => {
  await page.goto('/')
  await addHost(page, 'refresh-host')
  await page.getByRole('button', { name: 'Close' }).click()
  await addNameOnlyService(page, 'Refresh service')
  await page.reload()

  await expect(serviceCard(page, 'Refresh service')).toBeVisible()
  await page.getByRole('button', { name: 'Manage hosts' }).click()
  await expect(page.getByRole('button', { name: 'Edit host refresh-host' })).toBeVisible()
})

test('persists identity fields and flags duplicate container names per host', async ({ page }) => {
  await page.goto('/')
  await addHost(page, 'host-one')
  await page.getByRole('button', { name: 'Close' }).click()

  const addIdentityService = async (name: string, host: string, containerName: string) => {
    await page.getByRole('button', { name: 'Add service' }).click()
    const editor = page.getByRole('region', { name: 'Add service' })
    await editor.getByLabel('Service name *').fill(name)
    await editor.locator('label').filter({ hasText: /^Host/ }).locator('select').selectOption({ label: host })
    await editor.getByLabel('Description').fill(`${name} description`)
    await editor.getByLabel('Container name').fill(containerName)
    await editor.getByLabel('Docker image').fill(`example/${name.toLowerCase()}:1`)
    await editor.getByLabel('Application URL').fill(`https://${name.toLowerCase()}.example.test`)
    await editor.getByRole('button', { name: 'Create service' }).click()
  }

  await addIdentityService('First', 'host-one', ' Jellyfin ')
  await addIdentityService('Second', 'host-one', 'jELLYfin')
  await expect(serviceCard(page, 'First').getByText('Container-name conflict')).toBeVisible()
  await expect(serviceCard(page, 'Second').getByText('Container-name conflict')).toBeVisible()
  const summary = page.getByRole('region', { name: 'Service summary' })
  await expect(summary.getByText('Container conflicts').locator('..').locator('strong')).toHaveText('2')

  await addHost(page, 'host-two')
  await page.getByRole('button', { name: 'Close' }).click()
  await addIdentityService('Third', 'host-two', 'jellyfin')
  await expect(serviceCard(page, 'Third').getByText('Container-name conflict')).toHaveCount(0)
  await expect(summary.getByText('Container conflicts').locator('..').locator('strong')).toHaveText('2')

  await page.reload()
  await expect(serviceCard(page, 'First')).toContainText('example/first:1')
  await expect(serviceCard(page, 'First')).toContainText('First description')
  await expect(serviceCard(page, 'First')).toContainText('https://first.example.test')
})

test('persists, edits, warns, and searches generalized path mappings', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add service' }).click()
  const editor = page.getByRole('region', { name: 'Add service' })
  await editor.getByLabel('Service name *').fill('Path service')
  await editor.getByRole('button', { name: 'Add path' }).click()
  await editor.getByLabel('Path service host path 1').fill('/srv/config')
  await editor.getByLabel('Path service container path 1').fill('/config')
  await editor.getByLabel('Path service path purpose 1').fill('Configuration')
  await editor.getByLabel('Path service path 1 read-only').check()
  await editor.getByRole('button', { name: 'Add path' }).click()
  await editor.getByLabel('Path service host path 2').fill('/srv/media')
  await editor.getByLabel('Path service container path 2').fill('/media')
  await editor.getByLabel('Path service path purpose 2').fill('Media')
  await editor.getByRole('button', { name: 'Create service' }).click()
  await expect(serviceCard(page, 'Path service')).toBeVisible()

  await page.reload()
  const card = serviceCard(page, 'Path service')
  await expect(card).toContainText('/srv/config → /config')
  await expect(card.getByText('Read-only')).toBeVisible()

  await page.getByRole('button', { name: 'Edit Path service' }).click()
  const edit = page.getByRole('region', { name: 'Edit Path service' })
  await edit.getByLabel('Path service host path 2').fill('media/relative')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(card.getByText('Host paths mix absolute and relative styles.')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search services' }).fill('media/relative')
  await expect(card).toBeVisible()
})

test('maps, filters, conflicts, and edits persisted ports by host', async ({ page }) => {
  await page.goto('/')
  await addHost(page, 'host-one')
  await page.getByRole('button', { name: 'Close' }).click()
  await addHost(page, 'host-two')
  await page.getByRole('button', { name: 'Close' }).click()

  const addPortService = async (
    name: string,
    host: string,
    ports: Array<{ host: string; container: string; protocol: 'tcp' | 'udp' | 'both' }>,
  ) => {
    await page.getByRole('button', { name: 'Add service' }).click()
    const editor = page.getByRole('region', { name: 'Add service' })
    await editor.getByLabel('Service name *').fill(name)
    await editor.locator('label').filter({ hasText: /^Host/ }).locator('select').selectOption({ label: host })
    for (const [index, port] of ports.entries()) {
      await editor.getByRole('button', { name: 'Add port' }).click()
      await editor.getByLabel(`Host port ${index + 1}`).fill(port.host)
      await editor.getByLabel(`Container port ${index + 1}`).fill(port.container)
      await editor.getByLabel(`Protocol ${index + 1}`).selectOption(port.protocol)
    }
    await editor.getByRole('button', { name: 'Create service' }).click()
  }

  await addPortService('Alpha', 'host-one', [
    { host: '9000', container: '90', protocol: 'tcp' },
    { host: '8000', container: '80', protocol: 'tcp' },
  ])
  await addPortService('Beta', 'host-one', [
    { host: '8000', container: '8080', protocol: 'both' },
  ])
  await addPortService('Gamma', 'host-two', [
    { host: '8000', container: '3000', protocol: 'tcp' },
  ])

  await page.getByRole('button', { name: 'Port Map' }).click()
  const hostOne = page.locator('.port-host-group').filter({ has: page.getByRole('heading', { name: 'host-one' }) })
  const hostTwo = page.locator('.port-host-group').filter({ has: page.getByRole('heading', { name: 'host-two' }) })
  await expect(hostOne).toBeVisible()
  await expect(hostTwo).toBeVisible()
  await expect(hostOne.locator('.port-assignment').nth(0)).toContainText('8000')
  await expect(hostOne.locator('.port-assignment').nth(1)).toContainText('8000')
  await expect(hostOne.locator('.port-assignment').nth(2)).toContainText('9000')
  await expect(hostOne.getByText(/also used by Beta/)).toBeVisible()
  await expect(hostTwo.getByText('Conflict:', { exact: false })).toHaveCount(0)

  await page.getByLabel('Filter Port Map by host').selectOption({ label: 'host-one' })
  await expect(hostOne).toBeVisible()
  await expect(hostTwo).toHaveCount(0)
  await hostOne.getByRole('button', { name: 'Edit service Alpha' }).first().click()
  const editor = page.getByRole('region', { name: 'Edit Alpha' })
  await editor.getByLabel('Container port 1').fill('900')
  await editor.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { name: 'Port Map' })).toBeVisible()
  await expect(page.getByLabel('Filter Port Map by host')).toHaveValue(/.+/)
  await expect(hostOne).toContainText('900')

  await page.reload()
  await page.getByRole('button', { name: 'Port Map' }).click()
  await expect(page.locator('.port-host-group').filter({ has: page.getByRole('heading', { name: 'host-one' }) })).toContainText('900')
  await expect(page.locator('.port-host-group').filter({ has: page.getByRole('heading', { name: 'host-two' }) })).toContainText('Gamma')
})
