import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import './App.css'
import type { RestorePreview, ServerBackupClient } from './data/serverBackup'
import type { StackMapRepository } from './data/repository'
import {
  duplicateContainerNameServiceIds,
  duplicatePortServiceIds,
  filterServices,
  getPathWarnings,
  missingServiceFields,
} from './domain/serviceUtils'
import {
  EXPOSURES,
  SERVICE_STATUSES,
  type Host,
  type Service,
  type ServiceFilters,
} from './domain/types'
import { HostManager } from './components/HostManager'
import { PathMapView } from './components/PathMapView'
import { PortMapView } from './components/PortMapView'
import { ServiceForm } from './components/ServiceForm'
import { UNASSIGNED_PATH_HOST_FILTER } from './domain/pathMap'
import { UNASSIGNED_HOST_FILTER } from './domain/portMap'

const DEFAULT_FILTERS: ServiceFilters = {
  query: '',
  status: 'all',
  hostId: 'all',
  network: 'all',
  exposure: 'all',
}

export interface AppProps {
  repository: StackMapRepository
  backupClient?: ServerBackupClient
  mode?: 'production' | 'demo'
  DiscoveryPanel?: ComponentType<{ hosts: Host[]; services: Service[]; onImported: () => Promise<void> }>
}

function App({ repository, backupClient, mode = 'production', DiscoveryPanel }: AppProps) {
  const [services, setServices] = useState<Service[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [editingService, setEditingService] = useState<Service | null | 'new'>(null)
  const [showHosts, setShowHosts] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [activeView, setActiveView] = useState<'services' | 'port-map' | 'path-map'>('services')
  const [portMapHostFilter, setPortMapHostFilter] = useState('all')
  const [pathMapHostFilter, setPathMapHostFilter] = useState('all')
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)
  const [restoreAcknowledged, setRestoreAcknowledged] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [showRestore, setShowRestore] = useState(false)
  const restoreStatus = useRef<HTMLDivElement>(null)
  const portMapViewButton = useRef<HTMLButtonElement>(null)
  const pathMapViewButton = useRef<HTMLButtonElement>(null)
  const returnFocusToMap = useRef<'port-map' | 'path-map' | null>(null)
  const isDemo = mode === 'demo'
  const inventoryLabel = isDemo ? 'demo inventory' : 'server inventory'

  async function refresh() {
    const data = await repository.getAll()
    setServices(data.services.sort((left, right) => left.name.localeCompare(right.name)))
    setHosts(data.hosts.sort((left, right) => left.name.localeCompare(right.name)))
  }

  async function loadServerInventory() {
    setLoading(true)
    setLoadFailed(false)
    try {
      const data = await repository.getAll()
      setServices(data.services.sort((left, right) => left.name.localeCompare(right.name)))
      setHosts(data.hosts.sort((left, right) => left.name.localeCompare(right.name)))
      setError('')
    } catch {
      setError(`StackMap could not load the ${inventoryLabel}. No browser fallback was used.`)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    repository.getAll().then((data) => {
      if (!active) return
      setServices(data.services.sort((left, right) => left.name.localeCompare(right.name)))
      setHosts(data.hosts.sort((left, right) => left.name.localeCompare(right.name)))
    }).catch(() => {
      if (!active) return
      setError(`StackMap could not load the ${inventoryLabel}. No browser fallback was used.`)
      setLoadFailed(true)
    }).finally(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
    }
  }, [inventoryLabel, repository])

  useEffect(() => {
    if (!editingService && returnFocusToMap.current) {
      const target = returnFocusToMap.current
      returnFocusToMap.current = null
      if (target === 'port-map') portMapViewButton.current?.focus()
      if (target === 'path-map') pathMapViewButton.current?.focus()
    }
  }, [editingService])

  const visibleServices = useMemo(
    () => filterServices(services, hosts, filters),
    [services, hosts, filters],
  )
  const conflictIds = useMemo(() => duplicatePortServiceIds(services), [services])
  const containerConflictIds = useMemo(
    () => duplicateContainerNameServiceIds(services),
    [services],
  )
  const networks = useMemo(
    () => [...new Set(services.map((service) => service.network).filter(Boolean))].sort(),
    [services],
  )
  const hostNames = useMemo(() => new Map(hosts.map((host) => [host.id, host.name])), [hosts])
  const dependencyNames = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services],
  )
  const effectivePortMapHostFilter =
    portMapHostFilter === 'all' ||
    portMapHostFilter === UNASSIGNED_HOST_FILTER ||
    hosts.some((host) => host.id === portMapHostFilter)
      ? portMapHostFilter
      : 'all'
  const effectivePathMapHostFilter =
    pathMapHostFilter === 'all' ||
    pathMapHostFilter === UNASSIGNED_PATH_HOST_FILTER ||
    hosts.some((host) => host.id === pathMapHostFilter)
      ? pathMapHostFilter
      : 'all'

  async function saveService(service: Service): Promise<boolean> {
    try {
      await repository.putService(service)
      await refresh()
      setEditingService(null)
      setError('')
      setMessage(`${service.name} saved.`)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The service could not be saved.')
      return false
    }
  }

  function editServiceFromPortMap(service: Service) {
    returnFocusToMap.current = 'port-map'
    setEditingService(service)
  }

  function editServiceFromPathMap(service: Service) {
    returnFocusToMap.current = 'path-map'
    setEditingService(service)
  }

  async function retireService(service: Service) {
    try {
      await repository.putService({
        ...service,
        status: 'retired',
        updatedAt: new Date().toISOString(),
      })
      await refresh()
      setError('')
      setMessage(`${service.name} retired.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The service could not be retired.')
    }
  }

  async function deleteService(service: Service) {
    if (!window.confirm(`Permanently delete ${service.name}? This cannot be undone.`)) return
    try {
      await repository.deleteService(service.id)
      await refresh()
      setError('')
      setMessage(`${service.name} permanently deleted.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The service could not be deleted.')
    }
  }

  async function saveHost(host: Host): Promise<boolean> {
    try {
      await repository.putHost(host)
      await refresh()
      setError('')
      setMessage(`${host.name} saved.`)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The host could not be saved.')
      return false
    }
  }

  async function deleteHost(host: Host) {
    if (!window.confirm(`Permanently delete host ${host.name}?`)) return
    try {
      await repository.deleteHost(host.id)
      await refresh()
      setMessage(`${host.name} deleted.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The host could not be deleted.')
    }
  }

  async function exportServerInventory() {
    if (!backupClient) return
    try {
      const blob = await backupClient.download()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `stackmap-server-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setError('')
      setMessage('Current server-authoritative backup downloaded.')
    } catch {
      setError('The current server inventory could not be exported. Retry when the server is available.')
    }
  }

  async function previewRestore() {
    if (!backupClient || !restoreFile || restoreBusy) return
    setRestoreBusy(true)
    setError('')
    setMessage('Validating backup on the server…')
    try {
      const parsed: unknown = JSON.parse(await restoreFile.text())
      setRestorePreview(await backupClient.preview(parsed))
      setRestoreAcknowledged(false)
      setMessage('Backup validated. Review the summary before restoring.')
    } catch (caught) {
      setRestorePreview(null)
      setError(caught instanceof SyntaxError ? 'The selected file is not valid JSON.' : caught instanceof Error ? caught.message : 'The backup could not be previewed.')
      setMessage('')
    } finally {
      setRestoreBusy(false)
      window.setTimeout(() => restoreStatus.current?.focus(), 0)
    }
  }

  async function confirmRestore() {
    if (!backupClient || !restorePreview || !restoreAcknowledged || restoreBusy) return
    setRestoreBusy(true)
    setError('')
    setMessage('Replacing the current server inventory…')
    try {
      const result = await backupClient.confirm(restorePreview.previewToken, restorePreview.expectedInventoryRevision)
      await refresh()
      setRestorePreview(null)
      setRestoreFile(null)
      setRestoreAcknowledged(false)
      setMessage(`Restore complete: ${result.summary.hostCount} hosts and ${result.summary.serviceCount} services. Inventory revision ${result.inventoryRevision}.`)
    } catch (caught) {
      const requiresPreview = caught instanceof Error && 'code' in caught &&
        ['RESTORE_PREVIEW_STALE', 'RESTORE_PREVIEW_INVALID'].includes(String(caught.code))
      if (requiresPreview) setRestorePreview(null)
      setError(caught instanceof Error ? caught.message : 'The restore could not be completed.')
      setMessage('')
    } finally {
      setRestoreBusy(false)
      window.setTimeout(() => restoreStatus.current?.focus(), 0)
    }
  }

  function cancelRestore() {
    setRestorePreview(null)
    setRestoreAcknowledged(false)
    setMessage('Restore cancelled. Server inventory was not changed.')
    window.setTimeout(() => restoreStatus.current?.focus(), 0)
  }

  if (loading) {
    return <div className="loading-state" role="status">Loading StackMap {inventoryLabel}…</div>
  }

  if (loadFailed) {
    return (
      <main className="blocking-state" role="alert" aria-labelledby="load-error-title">
        <h1 id="load-error-title">Server inventory unavailable</h1>
        <p>{error}</p>
        <button className="button primary" type="button" onClick={loadServerInventory}>Retry loading server inventory</button>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">{isDemo ? 'Public demo · session-only inventory' : 'Self-hosted homelab inventory'}</p>
          <h1>StackMap</h1>
        </div>
        <div className="header-actions">
          <button className="button ghost" type="button" onClick={() => setShowHosts(true)}>
            Manage hosts
          </button>
          <button className="button primary" type="button" onClick={() => setEditingService('new')}>
            Add service
          </button>
        </div>
      </header>

      {isDemo && (
        <section className="demo-banner" role="status" aria-label="Public demo notice">
          <strong>Public demo</strong>
          <span>Explore freely. Edits exist only in this page session and reset when you refresh. No data is saved.</span>
        </section>
      )}

      <main>
        <nav className="view-switcher" aria-label="Primary views">
          <button
            className="view-switch"
            type="button"
            aria-pressed={activeView === 'services'}
            onClick={() => setActiveView('services')}
          >
            Services
          </button>
          <button
            ref={portMapViewButton}
            className="view-switch"
            type="button"
            aria-pressed={activeView === 'port-map'}
            onClick={() => setActiveView('port-map')}
          >
            Port Map
          </button>
          <button
            ref={pathMapViewButton}
            className="view-switch"
            type="button"
            aria-pressed={activeView === 'path-map'}
            onClick={() => setActiveView('path-map')}
          >
            Path Map
          </button>
        </nav>
        {message && (
          <div className="notice success" role="status">
            {message}
            <button aria-label="Dismiss message" type="button" onClick={() => setMessage('')}>
              ×
            </button>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button aria-label="Dismiss error" type="button" onClick={() => setError('')}>
              ×
            </button>
          </div>
        )}

        {editingService && (
          <ServiceForm
            service={editingService === 'new' ? undefined : editingService}
            services={services}
            hosts={hosts}
            onSave={saveService}
            onCancel={() => setEditingService(null)}
          />
        )}

        {showHosts && (
          <HostManager
            hosts={hosts}
            services={services}
            onSave={saveHost}
            onDelete={deleteHost}
            onClose={() => setShowHosts(false)}
          />
        )}

        {DiscoveryPanel && <DiscoveryPanel hosts={hosts} services={services} onImported={refresh} />}

        {activeView === 'services' ? (
          <>
        <section className="summary-strip" aria-label="Service summary">
          <div>
            <strong>{services.length}</strong>
            <span>Total services</span>
          </div>
          <div>
            <strong>{services.filter((service) => service.status === 'active').length}</strong>
            <span>Active</span>
          </div>
          <div>
            <strong>{services.filter((service) => missingServiceFields(service).length).length}</strong>
            <span>Incomplete</span>
          </div>
          <div className={conflictIds.size ? 'summary-warning' : ''}>
            <strong>{conflictIds.size}</strong>
            <span>Port conflicts</span>
          </div>
          <div className={containerConflictIds.size ? 'summary-warning' : ''}>
            <strong>{containerConflictIds.size}</strong>
            <span>Container conflicts</span>
          </div>
        </section>

        <section className="workspace" aria-labelledby="services-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Environment map</p>
              <h2 id="services-title">Services</h2>
            </div>
            {backupClient && <div className="data-actions">
              <button className="button ghost" type="button" onClick={exportServerInventory} aria-label="Download current StackMap server backup">
                Download server backup
              </button>
              <button className="button ghost" type="button" onClick={() => setShowRestore((shown) => !shown)} aria-expanded={showRestore} aria-controls="restore-panel">
                {showRestore ? 'Close restore' : 'Restore backup'}
              </button>
            </div>}
          </div>

          {backupClient && showRestore && <section id="restore-panel" className="restore-panel" aria-labelledby="restore-title" aria-busy={restoreBusy}>
            <h3 id="restore-title">Restore server backup</h3>
            <p>Upload a StackMap server backup to validate it. Previewing does not change inventory.</p>
            <label className="field">
              <span>Backup JSON file</span>
              <input type="file" accept="application/json,.json" disabled={restoreBusy} onChange={(event) => {
                setRestoreFile(event.target.files?.[0] ?? null)
                setRestorePreview(null)
                setRestoreAcknowledged(false)
              }} />
            </label>
            <button className="button ghost" type="button" disabled={!restoreFile || restoreBusy} onClick={previewRestore}>
              {restoreBusy && !restorePreview ? 'Validating…' : 'Preview restore'}
            </button>
            {restorePreview && (
              <div className="restore-confirmation" role="group" aria-labelledby="restore-warning-title">
                <h3 id="restore-warning-title" className="danger">Destructive restore</h3>
                <p><strong>Current server inventory will be fully replaced.</strong> This is not a merge. Legacy browser data remains untouched.</p>
                <dl className="restore-summary">
                  <div><dt>Hosts</dt><dd>{restorePreview.summary.hostCount}</dd></div>
                  <div><dt>Services</dt><dd>{restorePreview.summary.serviceCount}</dd></div>
                  <div><dt>Ports</dt><dd>{restorePreview.summary.portCount}</dd></div>
                  <div><dt>Paths</dt><dd>{restorePreview.summary.pathCount}</dd></div>
                  <div><dt>Dependencies</dt><dd>{restorePreview.summary.dependencyCount}</dd></div>
                </dl>
                <p className="field-help">Backup version {restorePreview.summary.backupVersion}; exported {restorePreview.summary.exportedAt}; source installation {restorePreview.summary.sourceInstallationId}.</p>
                <label className="restore-acknowledgement">
                  <input type="checkbox" checked={restoreAcknowledged} disabled={restoreBusy} onChange={(event) => setRestoreAcknowledged(event.target.checked)} />
                  I understand that the current server inventory will be replaced.
                </label>
                <div className="form-actions">
                  <button className="button danger-fill" type="button" disabled={!restoreAcknowledged || restoreBusy} onClick={confirmRestore}>{restoreBusy ? 'Restoring…' : 'Replace server inventory'}</button>
                  <button className="button ghost" type="button" disabled={restoreBusy} onClick={cancelRestore}>Cancel restore</button>
                </div>
              </div>
            )}
            <div ref={restoreStatus} tabIndex={-1} className="visually-hidden" aria-live="polite">{restoreBusy ? message : error || message}</div>
          </section>}

          <div className="filters">
            <label className="search-field">
              <span className="visually-hidden">Search services</span>
              <input
                type="search"
                placeholder="Search services, hosts, ports, paths, networks, notes…"
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    status: event.target.value as ServiceFilters['status'],
                  })
                }
              >
                <option value="all">All statuses</option>
                {SERVICE_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Host</span>
              <select
                value={filters.hostId}
                onChange={(event) => setFilters({ ...filters, hostId: event.target.value })}
              >
                <option value="all">All hosts</option>
                {hosts.map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Network</span>
              <select
                value={filters.network}
                onChange={(event) => setFilters({ ...filters, network: event.target.value })}
              >
                <option value="all">All networks</option>
                {networks.map((network) => (
                  <option key={network}>{network}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Exposure</span>
              <select
                value={filters.exposure}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    exposure: event.target.value as ServiceFilters['exposure'],
                  })
                }
              >
                <option value="all">All exposure</option>
                {EXPOSURES.map((exposure) => (
                  <option key={exposure}>{exposure}</option>
                ))}
              </select>
            </label>
          </div>

          {services.length === 0 ? (
            <div className="empty-state">
              <span aria-hidden="true">◎</span>
              <h3>Map your first service</h3>
              <p>Start with a name. Add the details you know now and fill in the rest later.</p>
              <button
                className="button primary"
                type="button"
                onClick={() => setEditingService('new')}
              >
                Add your first service
              </button>
            </div>
          ) : visibleServices.length === 0 ? (
            <div className="empty-state compact">
              <h3>No services match</h3>
              <p>Clear or adjust the current search and filters.</p>
              <button className="button ghost" type="button" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="service-list">
              {visibleServices.map((service) => {
                const missing = missingServiceFields(service)
                const pathWarnings = getPathWarnings(service.paths)
                return (
                  <article className="service-card" key={service.id}>
                    <div className="service-main">
                      <div className="service-title-row">
                        <h3>{service.name}</h3>
                        <span className={`status-badge status-${service.status}`}>
                          {service.status}
                        </span>
                        {missing.length > 0 && (
                          <span className="issue-badge">
                            Incomplete
                          </span>
                        )}
                        {conflictIds.has(service.id) && (
                          <span className="conflict-badge">Host-port conflict</span>
                        )}
                        {containerConflictIds.has(service.id) && (
                          <span className="conflict-badge">Container-name conflict</span>
                        )}
                      </div>
                      {service.description && (
                        <p className="service-description">{service.description}</p>
                      )}
                      <dl className="service-facts">
                        <div>
                          <dt>Host</dt>
                          <dd>{service.hostId ? hostNames.get(service.hostId) : 'Unassigned'}</dd>
                        </div>
                        <div>
                          <dt>Ports</dt>
                          <dd>
                            {service.ports.length
                              ? service.ports
                                  .map(
                                    (port) =>
                                      `${port.hostPort ?? '—'}:${port.containerPort ?? '—'}/${port.protocol}`,
                                  )
                                  .join(', ')
                              : 'Not recorded'}
                          </dd>
                        </div>
                        <div>
                          <dt>Network</dt>
                          <dd>{service.network || 'Not recorded'}</dd>
                        </div>
                        <div>
                          <dt>Exposure</dt>
                          <dd>{service.exposure}</dd>
                        </div>
                        {service.containerName && (
                          <div>
                            <dt>Container</dt>
                            <dd>{service.containerName}</dd>
                          </div>
                        )}
                        {service.dockerImage && (
                          <div>
                            <dt>Image</dt>
                            <dd>{service.dockerImage}</dd>
                          </div>
                        )}
                      </dl>
                      {(service.paths.length > 0 || service.internalUrl || service.applicationUrl) && (
                        <div className="service-details">
                          {service.applicationUrl && <span>{service.applicationUrl}</span>}
                          {service.internalUrl && <span>{service.internalUrl}</span>}
                        </div>
                      )}
                      {service.paths.length > 0 && (
                        <div className="path-list" aria-label={`${service.name} path mappings`}>
                          {service.paths.map((path, index) => (
                            <div className="path-summary" key={path.id}>
                              <strong>{path.purpose || `Path ${index + 1}`}</strong>
                              <span>{path.hostPath || '—'} → {path.containerPath || '—'}</span>
                              {path.readOnly && <span className="read-only-badge">Read-only</span>}
                              {pathWarnings.incompleteMappingIds.includes(path.id) && (
                                <span className="path-warning">Mapping {index + 1} is incomplete</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {(pathWarnings.mixedHostPaths || pathWarnings.mixedContainerPaths || pathWarnings.missingConfiguration) && (
                        <ul className="path-warnings" aria-label={`${service.name} path warnings`}>
                          {pathWarnings.mixedHostPaths && <li>Host paths mix absolute and relative styles.</li>}
                          {pathWarnings.mixedContainerPaths && <li>Container paths mix absolute and relative styles.</li>}
                          {pathWarnings.missingConfiguration && <li>No path is marked for configuration.</li>}
                        </ul>
                      )}
                      {service.dependencyIds.length > 0 && (
                        <div className="service-dependencies">
                          <strong>Depends on</strong>
                          <span>
                            {service.dependencyIds
                              .map((dependencyId) => dependencyNames.get(dependencyId) ?? 'Unknown service')
                              .join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="service-actions">
                      <button
                        className="text-button"
                        type="button"
                        aria-label={`Edit ${service.name}`}
                        onClick={() => setEditingService(service)}
                      >
                        Edit
                      </button>
                      {service.status !== 'retired' && (
                        <button
                          className="text-button"
                          type="button"
                          aria-label={`Retire ${service.name}`}
                          onClick={() => retireService(service)}
                        >
                          Retire
                        </button>
                      )}
                      <button
                        className="text-button danger"
                        type="button"
                        aria-label={`Delete ${service.name}`}
                        onClick={() => deleteService(service)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
          </>
        ) : activeView === 'port-map' ? (
          <PortMapView
            services={services}
            hosts={hosts}
            query={filters.query}
            hostFilter={effectivePortMapHostFilter}
            onQueryChange={(query) => setFilters({ ...filters, query })}
            onHostFilterChange={setPortMapHostFilter}
            onEditService={editServiceFromPortMap}
          />
        ) : (
          <PathMapView
            services={services}
            hosts={hosts}
            query={filters.query}
            hostFilter={effectivePathMapHostFilter}
            onQueryChange={(query) => setFilters({ ...filters, query })}
            onHostFilterChange={setPathMapHostFilter}
            onEditService={editServiceFromPathMap}
          />
        )}
      </main>

      <footer>
        <span>Inventory is stored in server SQLite and shared by connected browsers.</span>
        <span>Keep the persistent /config mount; legacy browser data remains separate until migration.</span>
      </footer>
    </div>
  )
}

export default App
