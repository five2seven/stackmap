import { useState, type FormEvent } from 'react'
import {
  EXPOSURES,
  PORT_PROTOCOLS,
  SERVICE_STATUSES,
  type Host,
  type Service,
  type ServicePort,
} from '../domain/types'
import { createService } from '../domain/serviceUtils'

interface ServiceFormProps {
  service?: Service
  services: Service[]
  hosts: Host[]
  onSave: (service: Service) => Promise<boolean>
  onCancel: () => void
}

const emptyPort = (): ServicePort => ({
  protocol: 'tcp',
  description: '',
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
      ports: normalizedPorts,
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
            <span>Internal URL or IP</span>
            <input
              value={draft.internalUrl}
              onChange={(event) => update('internalUrl', event.target.value)}
              placeholder="http://192.168.1.20:8096"
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
            <span>Configuration path</span>
            <input
              value={draft.configPath}
              onChange={(event) => update('configPath', event.target.value)}
              placeholder="/opt/app/config"
            />
          </label>

          <label className="field">
            <span>Data path</span>
            <input
              value={draft.dataPath}
              onChange={(event) => update('dataPath', event.target.value)}
              placeholder="/mnt/data/app"
            />
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
