import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import './App.css'
import { parseImport, serializeExport } from './data/backup'
import { repository as defaultRepository, type StackMapRepository } from './data/database'
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
  type StackMapExport,
} from './domain/types'
import { HostManager } from './components/HostManager'
import { ImportReview } from './components/ImportReview'
import { ServiceForm } from './components/ServiceForm'

const DEFAULT_FILTERS: ServiceFilters = {
  query: '',
  status: 'all',
  hostId: 'all',
  network: 'all',
  exposure: 'all',
}

interface AppProps {
  repository?: StackMapRepository
}

function App({ repository = defaultRepository }: AppProps) {
  const [services, setServices] = useState<Service[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [editingService, setEditingService] = useState<Service | null | 'new'>(null)
  const [showHosts, setShowHosts] = useState(false)
  const [importReview, setImportReview] = useState<StackMapExport | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const importInput = useRef<HTMLInputElement>(null)

  async function refresh() {
    const data = await repository.getAll()
    setServices(data.services.sort((left, right) => left.name.localeCompare(right.name)))
    setHosts(data.hosts.sort((left, right) => left.name.localeCompare(right.name)))
  }

  useEffect(() => {
    let active = true
    repository
      .getAll()
      .then((data) => {
        if (!active) return
        setServices(data.services.sort((left, right) => left.name.localeCompare(right.name)))
        setHosts(data.hosts.sort((left, right) => left.name.localeCompare(right.name)))
      })
      .catch(() => {
        if (active) setError('StackMap could not load local data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [repository])

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

  function exportData() {
    try {
      const blob = new Blob([serializeExport({ services, hosts })], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `stackmap-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setError('')
      setMessage('Backup exported.')
    } catch {
      setError('The backup could not be exported.')
    }
  }

  async function readImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setImportReview(parseImport(await file.text()))
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The backup could not be read.')
    }
  }

  async function confirmImport() {
    if (!importReview) return
    try {
      await repository.replaceAll({
        services: importReview.services,
        hosts: importReview.hosts,
      })
      await refresh()
      setImportReview(null)
      setError('')
      setMessage('Backup imported successfully.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The backup could not be imported.')
    }
  }

  if (loading) {
    return <div className="loading-state">Loading StackMap…</div>
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">Local-first homelab inventory</p>
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

      <main>
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

        {importReview && (
          <ImportReview
            data={importReview}
            onConfirm={confirmImport}
            onCancel={() => setImportReview(null)}
          />
        )}

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
            <div className="data-actions">
              <button className="button ghost" type="button" onClick={exportData}>
                Export JSON
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => importInput.current?.click()}
              >
                Import JSON
              </button>
              <input
                ref={importInput}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                onChange={readImport}
                aria-label="Choose JSON backup"
              />
            </div>
          </div>

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
                          {pathWarnings.missingConfiguration && <li>No configuration-purpose mapping recorded.</li>}
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
      </main>

      <footer>
        <span>Data stays in this browser.</span>
        <span>Export a backup before clearing site data or changing browsers.</span>
      </footer>
    </div>
  )
}

export default App
