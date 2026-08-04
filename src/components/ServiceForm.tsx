import { useState, type FormEvent } from 'react'
import {
  EXPOSURES,
  PORT_PROTOCOLS,
  SERVICE_STATUSES,
  type Host,
  type PathMapping,
  type Service,
  type ServicePort,
} from '../domain/types'
import { createService } from '../domain/serviceUtils'
import { normalizePaths } from '../domain/pathMappings'
import { createUuid } from '../utils/uuid'

interface ServiceFormProps {
  service?: Service
  services: Service[]
  hosts: Host[]
  onSave: (service: Service) => Promise<boolean>
  onCancel: () => void
}

const emptyPort = (): ServicePort => ({
  id: createUuid(),
  protocol: 'tcp',
  description: '',
})

const emptyPath = (): PathMapping => ({
  id: createUuid(),
  hostPath: '',
  containerPath: '',
  purpose: '',
  readOnly: false,
})

export function ServiceForm({
  service,
  services,
  hosts,
  onSave,
  onCancel,
}: ServiceFormProps) {
  const [draft, setDraft] = useState<Service>(() =>
    service ? structuredClone(service) : createService(''),
  )
  const [error, setError] = useState('')
  const isEditing = Boolean(service)

  function update<K extends keyof Service>(key: K, value: Service[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function updatePort(index: number, updateValue: Partial<ServicePort>) {
    update(
      'ports',
      draft.ports.map((port, portIndex) =>
        portIndex === index ? { ...port, ...updateValue } : port,
      ),
    )
  }

  function updatePath(id: string, updateValue: Partial<PathMapping>) {
    update(
      'paths',
      draft.paths.map((path) => (path.id === id ? { ...path, ...updateValue } : path)),
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Service name is required.')
      return
    }
    const normalizedPorts = draft.ports
      .filter((port) => port.hostPort !== undefined || port.containerPort !== undefined)
      .map((port) => ({ ...port, description: port.description.trim() }))

    await onSave({
      ...draft,
      name: draft.name.trim(),
      containerName: draft.containerName.trim(),
      dockerImage: draft.dockerImage.trim(),
      description: draft.description.trim(),
      applicationUrl: draft.applicationUrl.trim(),
      ports: normalizedPorts,
      paths: normalizePaths(draft.paths),
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <section className="editor-card" aria-labelledby="service-form-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{isEditing ? 'Update record' : 'New record'}</p>
          <h2 id="service-form-title">{isEditing ? `Edit ${service?.name}` : 'Add service'}</h2>
        </div>
        <button className="button ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field field-wide">
            <span>Service name *</span>
            <input
              autoFocus
              value={draft.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="e.g. Jellyfin"
            />
          </label>

          <label className="field field-wide">
            <span>Description</span>
            <textarea
              value={draft.description}
              onChange={(event) => update('description', event.target.value)}
              rows={2}
              placeholder="What this service does"
            />
          </label>

          <label className="field">
            <span>Container name</span>
            <input
              value={draft.containerName}
              onChange={(event) => update('containerName', event.target.value)}
              placeholder="jellyfin"
            />
          </label>

          <label className="field">
            <span>Docker image</span>
            <input
              value={draft.dockerImage}
              onChange={(event) => update('dockerImage', event.target.value)}
              placeholder="jellyfin/jellyfin:latest"
            />
          </label>

          <label className="field">
            <span>Status</span>
            <select
              value={draft.status}
              onChange={(event) => update('status', event.target.value as Service['status'])}
            >
              {SERVICE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Host</span>
            <select
              value={draft.hostId ?? ''}
              onChange={(event) => update('hostId', event.target.value || undefined)}
            >
              <option value="">Unassigned</option>
              {hosts.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Internal hostname or IP</span>
            <input
              value={draft.internalUrl}
              onChange={(event) => update('internalUrl', event.target.value)}
              placeholder="http://192.168.1.20:8096"
            />
          </label>

          <label className="field">
            <span>Application URL</span>
            <input
              type="url"
              value={draft.applicationUrl}
              onChange={(event) => update('applicationUrl', event.target.value)}
              placeholder="https://media.example.com"
            />
          </label>

          <label className="field">
            <span>External exposure</span>
            <select
              value={draft.exposure}
              onChange={(event) => update('exposure', event.target.value as Service['exposure'])}
            >
              {EXPOSURES.map((exposure) => (
                <option key={exposure} value={exposure}>
                  {exposure}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Docker network</span>
            <input
              value={draft.network}
              onChange={(event) => update('network', event.target.value)}
              placeholder="media"
            />
          </label>

          <fieldset className="field dependency-field">
            <legend>Dependencies</legend>
            <div className="checkbox-list">
              {services.filter((item) => item.id !== draft.id).length ? (
                services
                  .filter((item) => item.id !== draft.id)
                  .map((item) => (
                    <label key={item.id}>
                      <input
                        type="checkbox"
                        checked={draft.dependencyIds.includes(item.id)}
                        onChange={(event) =>
                          update(
                            'dependencyIds',
                            event.target.checked
                              ? [...draft.dependencyIds, item.id]
                              : draft.dependencyIds.filter((id) => id !== item.id),
                          )
                        }
                      />
                      {item.name}
                    </label>
                  ))
              ) : (
                <span className="field-help">No other services available.</span>
              )}
            </div>
          </fieldset>

          <label className="field field-wide">
            <span>Notes</span>
            <textarea
              value={draft.notes}
              onChange={(event) => update('notes', event.target.value)}
              rows={3}
              placeholder="Anything worth remembering later"
            />
          </label>
        </div>

        <fieldset className="paths-editor">
          <legend>Path mappings</legend>
          <div className="fieldset-heading">
            <button
              className="button quiet"
              type="button"
              onClick={() => update('paths', [...draft.paths, emptyPath()])}
            >
              Add path
            </button>
          </div>
          {draft.paths.length === 0 ? (
            <p className="field-help">No path mappings recorded.</p>
          ) : (
            draft.paths.map((path, index) => {
              const serviceLabel = draft.name.trim() || 'new service'
              return (
                <div className="path-row" key={path.id}>
                  <label className="field">
                    <span>Host path</span>
                    <input
                      aria-label={`${serviceLabel} host path ${index + 1}`}
                      value={path.hostPath}
                      onChange={(event) => updatePath(path.id, { hostPath: event.target.value })}
                      placeholder="/srv/app/config"
                    />
                  </label>
                  <label className="field">
                    <span>Container path</span>
                    <input
                      aria-label={`${serviceLabel} container path ${index + 1}`}
                      value={path.containerPath}
                      onChange={(event) => updatePath(path.id, { containerPath: event.target.value })}
                      placeholder="/config"
                    />
                  </label>
                  <label className="field">
                    <span>Purpose</span>
                    <input
                      aria-label={`${serviceLabel} path purpose ${index + 1}`}
                      value={path.purpose}
                      onChange={(event) => updatePath(path.id, { purpose: event.target.value })}
                      placeholder="Configuration"
                    />
                  </label>
                  <label className="path-read-only">
                    <input
                      aria-label={`${serviceLabel} path ${index + 1} read-only`}
                      type="checkbox"
                      checked={path.readOnly}
                      onChange={(event) => updatePath(path.id, { readOnly: event.target.checked })}
                    />
                    Read-only
                  </label>
                  <button
                    className="icon-button danger"
                    type="button"
                    aria-label={`Remove ${serviceLabel} path ${index + 1}`}
                    onClick={() => update('paths', draft.paths.filter((item) => item.id !== path.id))}
                  >
                    Remove
                  </button>
                </div>
              )
            })
          )}
        </fieldset>

        <fieldset className="ports-editor">
          <div className="fieldset-heading">
            <legend>Ports</legend>
            <button
              className="button quiet"
              type="button"
              onClick={() => update('ports', [...draft.ports, emptyPort()])}
            >
              Add port
            </button>
          </div>
          {draft.ports.length === 0 ? (
            <p className="field-help">No ports recorded.</p>
          ) : (
            draft.ports.map((port, index) => (
              <div className="port-row" key={`${index}-${port.protocol}`}>
                <label className="field">
                  <span>Host port</span>
                  <input
                    aria-label={`Host port ${index + 1}`}
                    type="number"
                    min="1"
                    max="65535"
                    value={port.hostPort ?? ''}
                    onChange={(event) =>
                      updatePort(index, {
                        hostPort: event.target.value ? Number(event.target.value) : undefined,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Container port</span>
                  <input
                    aria-label={`Container port ${index + 1}`}
                    type="number"
                    min="1"
                    max="65535"
                    value={port.containerPort ?? ''}
                    onChange={(event) =>
                      updatePort(index, {
                        containerPort: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Protocol</span>
                  <select
                    aria-label={`Protocol ${index + 1}`}
                    value={port.protocol}
                    onChange={(event) =>
                      updatePort(index, {
                        protocol: event.target.value as ServicePort['protocol'],
                      })
                    }
                  >
                    {PORT_PROTOCOLS.map((protocol) => (
                      <option key={protocol}>{protocol}</option>
                    ))}
                  </select>
                </label>
                <label className="field port-description">
                  <span>Description</span>
                  <input
                    aria-label={`Port description ${index + 1}`}
                    value={port.description}
                    onChange={(event) => updatePort(index, { description: event.target.value })}
                  />
                </label>
                <button
                  className="icon-button danger"
                  type="button"
                  aria-label={`Remove port ${index + 1}`}
                  onClick={() =>
                    update(
                      'ports',
                      draft.ports.filter((_, portIndex) => portIndex !== index),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </fieldset>

        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button className="button primary" type="submit">
            {isEditing ? 'Save changes' : 'Create service'}
          </button>
          <span className="field-help">Only the service name is required.</span>
        </div>
      </form>
    </section>
  )
}
