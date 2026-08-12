import { expect, test, type Locator, type Page } from '@playwright/test'

const browserIssues = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  await clearServerInventory(page)
  const issues: string[] = []
  browserIssues.set(page, issues)
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      issues.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`))
})

test('previews selected Portainer discovery without an import action or inventory mutation', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/api/v1/portainer/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    requests.push(`${route.request().method()} ${path}`)
    const data = path.endsWith('/status')
      ? { enabled: true }
      : path.endsWith('/sessions')
        ? { sessionToken: 'opaque-session', environments: [{ id: 1, name: 'Docker lab', containerEngine: 'docker', publicUrl: '' }] }
        : path.endsWith('/previews')
          ? {
              previewToken: 'opaque-preview', expectedInventoryRevision: 0, existingHosts: [],
              hosts: [{ environmentId: 1, existingHostMatches: [], id: 'host-candidate', name: 'Docker lab', type: 'container-host', ipAddress: '', operatingSystem: 'Linux · amd64', notes: '', createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' }],
              services: [{ environmentId: 1, containerId: 'container-id', sourceState: 'exited', networkOptions: ['frontend', 'backend'], warnings: [{ code: 'VOLUME_SKIPPED', message: 'Skipped named volume.' }], conflicts: [{ code: 'NETWORK_SELECTION_REQUIRED', message: 'Select one Docker network.', blocking: true }], id: 'service-candidate', name: 'Preview app', containerName: 'Preview app', dockerImage: 'preview:1', description: '', applicationUrl: '', status: 'paused', hostId: 'host-candidate', internalUrl: '', ports: [{ id: 'port', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }], paths: [{ id: 'path', hostPath: '/srv/app', containerPath: '/data', purpose: '', readOnly: true }], network: '', exposure: 'unknown', dependencyIds: [], notes: '', createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' }],
            }
          : null
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import from Portainer' }).click()
  await page.getByLabel('Portainer API token').fill('browser-only-token')
  await page.getByRole('button', { name: 'Discover environments' }).click()
  await page.getByRole('checkbox', { name: 'Docker lab' }).check()
  await page.getByRole('button', { name: 'Build preview' }).click()
  await expect(page.getByText('Phase 1 cannot write inventory. Import confirmation will be added only in Phase 2.')).toBeVisible()
  await expect(page.getByText('Skipped named volume.')).toBeVisible()
  await expect(page.getByRole('button', { name: /confirm|import selected/i })).toHaveCount(0)
  expect(((await (await page.request.get('/api/v1/services')).json()).data as unknown[])).toEqual([])
  expect(requests).toEqual([
    'GET /api/v1/portainer/status',
    'POST /api/v1/portainer/sessions',
    'POST /api/v1/portainer/previews',
  ])
})

async function clearServerInventory(page: Page) {
  for (;;) {
    const response = await page.request.get('/api/v1/services')
    const services = (await response.json()).data as Array<{ id: string; revision: number }>
    if (!services.length) break
    const service = services[0]
    await page.request.delete(`/api/v1/services/${encodeURIComponent(service.id)}`, {
      data: { expectedRevision: service.revision },
    })
  }
  const response = await page.request.get('/api/v1/hosts')
  const hosts = (await response.json()).data as Array<{ id: string; revision: number }>
  for (const host of hosts) {
    await page.request.delete(`/api/v1/hosts/${encodeURIComponent(host.id)}`, {
      data: { expectedRevision: host.revision },
    })
  }
}

test.afterEach(async ({ page }) => {
  expect(browserIssues.get(page)).toEqual([])
})

test('opens record editors when crypto.randomUUID is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    })
  })
  await page.goto('/')

  await page.getByRole('button', { name: 'Add service' }).click()
  const serviceEditor = page.getByRole('region', { name: 'Add service' })
  await expect(serviceEditor).toBeVisible()
  await serviceEditor.getByRole('button', { name: 'Add path' }).click()
  await expect(serviceEditor.getByLabel('new service host path 1')).toBeVisible()
  await serviceEditor.getByRole('button', { name: 'Add port' }).click()
  await expect(serviceEditor.getByLabel('Host port 1')).toBeVisible()
  await serviceEditor.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'Manage hosts' }).click()
  await expect(page.getByRole('heading', { name: 'Add host' })).toBeVisible()
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

test('exports current server-authoritative inventory with an explicit source', async ({ page }) => {
  await page.goto('/')
  await addNameOnlyService(page, 'Exported service')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download current StackMap server backup' }).click()
  const download = await downloadPromise
  const exported = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'))

  expect(exported).toMatchObject({
    schemaVersion: 1,
    services: [expect.objectContaining({ name: 'Exported service' })],
    hosts: [],
    metadata: expect.objectContaining({ sourceInventoryRevision: expect.any(Number) }),
  })
  expect(Date.parse(exported.metadata.exportedAt)).not.toBeNaN()
})

test('previews, confirms, and shares a destructive server restore', async ({ browser, page }) => {
  await page.goto('/')
  const emptyBackup = await (await page.request.get('/api/v1/backup')).json()
  await addNameOnlyService(page, 'Removed by restore')

  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  await secondPage.goto('/')
  await expect(serviceCard(secondPage, 'Removed by restore')).toBeVisible()

  await page.getByRole('button', { name: 'Restore backup' }).click()
  await page.getByLabel('Backup JSON file').setInputFiles({
    name: 'stackmap-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(emptyBackup)),
  })
  await page.getByRole('button', { name: 'Preview restore' }).click()
  await expect(page.getByText('Current server inventory will be fully replaced.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replace server inventory' })).toBeDisabled()
  await page.getByLabel('I understand that the current server inventory will be replaced.').check()
  await page.getByRole('button', { name: 'Replace server inventory' }).click()
  await expect(page.getByRole('status')).toContainText('Restore complete')
  await secondPage.reload()
  await expect(serviceCard(secondPage, 'Removed by restore')).toHaveCount(0)
  await secondContext.close()
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

test('shares server inventory across independent browser contexts and protects stale edits', async ({ browser, page }) => {
  await page.goto('/')
  await addNameOnlyService(page, 'Shared service')

  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  await secondPage.goto('/')
  await expect(serviceCard(secondPage, 'Shared service')).toBeVisible()

  await page.getByRole('button', { name: 'Edit Shared service' }).click()
  await secondPage.getByRole('button', { name: 'Edit Shared service' }).click()
  await page.getByLabel('Notes').fill('Saved in first browser')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status')).toContainText('Shared service saved.')
  await secondPage.getByLabel('Notes').fill('Unsaved second-browser edit')
  const conflictResponse = secondPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes('/api/v1/services/'))
  await secondPage.getByRole('button', { name: 'Save changes' }).click()
  expect(await (await conflictResponse).json()).toMatchObject({ error: { code: 'REVISION_CONFLICT' } })
  await expect(secondPage.getByRole('alert')).toContainText('changed in another browser')
  await expect(secondPage.getByLabel('Notes')).toHaveValue('Unsaved second-browser edit')
  await secondContext.close()
})

test('ignores legacy IndexedDB without mutating it', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('stackmap', 4)
      request.onupgradeneeded = () => {
        const database = request.result
        database.createObjectStore('services', { keyPath: 'id' })
        database.createObjectStore('hosts', { keyPath: 'id' })
        database.createObjectStore('metadata', { keyPath: 'key' })
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction(['services'], 'readwrite')
        transaction.objectStore('services').put({
          id: 'legacy-service', name: 'Legacy service', containerName: '', dockerImage: '',
          description: '', applicationUrl: '', status: 'active', internalUrl: '', ports: [], paths: [],
          network: '', exposure: 'unknown', dependencyIds: [], notes: '',
          createdAt: '2026-08-04T00:00:00.000Z', updatedAt: '2026-08-04T00:00:00.000Z',
        })
        transaction.oncomplete = () => { database.close(); resolve() }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Add service' })).toBeVisible()
  expect((await (await page.request.get('/api/v1/services')).json()).data).toEqual([])
  expect(await page.evaluate(async () => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('stackmap')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const count = database.transaction('services').objectStore('services').count()
      count.onsuccess = () => { database.close(); resolve(count.result) }
      count.onerror = () => reject(count.error)
    }
  }))).toBe(1)
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

test('groups, shares, filters, searches, and edits persisted paths by host', async ({ page }) => {
  await page.goto('/')
  await addHost(page, 'path-host-one')
  await page.getByRole('button', { name: 'Close' }).click()
  await addHost(page, 'path-host-two')
  await page.getByRole('button', { name: 'Close' }).click()

  const addPathService = async (
    name: string,
    host: string,
    paths: Array<{ hostPath: string; containerPath: string; purpose: string; readOnly?: boolean }>,
  ) => {
    await page.getByRole('button', { name: 'Add service' }).click()
    const editor = page.getByRole('region', { name: 'Add service' })
    await editor.getByLabel('Service name *').fill(name)
    await editor.locator('label').filter({ hasText: /^Host/ }).locator('select').selectOption({ label: host })
    for (const [index, mapping] of paths.entries()) {
      await editor.getByRole('button', { name: 'Add path' }).click()
      if (mapping.hostPath) await editor.getByLabel(`${name} host path ${index + 1}`).fill(mapping.hostPath)
      if (mapping.containerPath) await editor.getByLabel(`${name} container path ${index + 1}`).fill(mapping.containerPath)
      if (mapping.purpose) await editor.getByLabel(`${name} path purpose ${index + 1}`).fill(mapping.purpose)
      if (mapping.readOnly) await editor.getByLabel(`${name} path ${index + 1} read-only`).check()
    }
    await editor.getByRole('button', { name: 'Create service' }).click()
  }

  await addPathService('Path Alpha', 'path-host-one', [
    { hostPath: '/srv/shared', containerPath: '/media', purpose: 'Media library', readOnly: true },
    { hostPath: '/srv/config', containerPath: '/config', purpose: 'Configuration' },
    { hostPath: '', containerPath: '/incomplete', purpose: 'Incomplete data' },
  ])
  await addPathService('Path Beta', 'path-host-one', [
    { hostPath: ' /SRV/SHARED ', containerPath: '/library', purpose: 'Library' },
  ])
  await addPathService('Path Gamma', 'path-host-two', [
    { hostPath: '/srv/shared', containerPath: '/different-host', purpose: 'Remote media' },
  ])

  await page.getByRole('button', { name: 'Path Map' }).click()
  const hostOne = page.locator('.path-host-group').filter({ has: page.getByRole('heading', { name: 'path-host-one' }) })
  const hostTwo = page.locator('.path-host-group').filter({ has: page.getByRole('heading', { name: 'path-host-two' }) })
  await expect(hostOne.getByRole('heading', { name: '/srv/shared' })).toBeVisible()
  await expect(hostOne.getByRole('heading', { name: 'Host path missing' })).toBeVisible()
  await expect(hostOne.getByText('Shared with Path Beta')).toBeVisible()
  await expect(hostOne.getByText('Read-only')).toBeVisible()
  await expect(hostOne.getByText('Host path is missing.')).toBeVisible()
  await expect(hostTwo.getByText('Shared with', { exact: false })).toHaveCount(0)

  await page.getByLabel('Filter Path Map by host').selectOption({ label: 'path-host-one' })
  await expect(hostOne).toBeVisible()
  await expect(hostTwo).toHaveCount(0)
  const search = page.getByRole('searchbox', { name: 'Search Path Map' })
  await search.fill('/srv/config')
  await expect(hostOne.getByRole('heading', { name: '/srv/config' })).toBeVisible()
  await search.fill('media library')
  await expect(hostOne.getByRole('heading', { name: '/srv/shared' })).toBeVisible()

  await hostOne.getByRole('button', { name: 'Edit service Path Alpha' }).click()
  const editor = page.getByRole('region', { name: 'Edit Path Alpha' })
  await editor.getByLabel('Path Alpha container path 2').fill('/config-updated')
  await editor.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { name: 'Path Map' })).toBeVisible()
  await expect(page.getByLabel('Filter Path Map by host')).toHaveValue(/.+/)
  await search.fill('/config-updated')
  await expect(hostOne).toContainText('/config-updated')

  await page.reload()
  await page.getByRole('button', { name: 'Path Map' }).click()
  await expect(page.locator('.path-host-group').filter({ has: page.getByRole('heading', { name: 'path-host-one' }) })).toContainText('/config-updated')
  await expect(page.locator('.path-host-group').filter({ has: page.getByRole('heading', { name: 'path-host-two' }) })).toContainText('Path Gamma')
})
