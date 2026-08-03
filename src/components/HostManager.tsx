import { useState, type FormEvent } from 'react'
import { HOST_TYPES, type Host, type Service } from '../domain/types'
import { createUuid } from '../utils/uuid'

interface HostManagerProps {
  hosts: Host[]
  services: Service[]
  onSave: (host: Host) => Promise<boolean>
  onDelete: (host: Host) => Promise<void>
  onClose: () => void
}

function blankHost(): Host {
  const timestamp = new Date().toISOString()
  return {
    id: createUuid(),
    name: '',
    type: 'unknown',
    ipAddress: '',
    operatingSystem: '',
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function HostManager({
  hosts,
  services,
  onSave,
  onDelete,
  onClose,
}: HostManagerProps) {
  const [draft, setDraft] = useState<Host>(blankHost)
  const [error, setError] = useState('')
  const editing = hosts.some((host) => host.id === draft.id)

  function selectHost(host?: Host) {
    setDraft(host ? structuredClone(host) : blankHost())
    setError('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Host name is required.')
      return
    }
    const saved = await onSave({
      ...draft,
      name: draft.name.trim(),
      updatedAt: new Date().toISOString(),
    })
    if (saved) selectHost()
  }

  return (
    <section className="editor-card" aria-labelledby="host-manager-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Infrastructure</p>
          <h2 id="host-manager-title">Hosts</h2>
        </div>
        <button className="button ghost" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="host-layout">
        <div className="host-list">
          <button className="button quiet" type="button" onClick={() => selectHost()}>
            Add host
          </button>
          {hosts.length === 0 ? (
            <p className="field-help">No hosts recorded yet.</p>
          ) : (
            hosts.map((host) => {
              const referenceCount = services.filter((service) => service.hostId === host.id).length
              return (
                <div className="host-list-item" key={host.id}>
                  <button
                    type="button"
                    aria-label={`Edit host ${host.name}`}
                    onClick={() => selectHost(host)}
                  >
                    <strong>{host.name}</strong>
                    <span>
                      {host.type} · {referenceCount} service{referenceCount === 1 ? '' : 's'}
                    </span>
                  </button>
                  <button
                    className="text-button danger"
                    type="button"
                    aria-label={`Delete host ${host.name}`}
                    disabled={referenceCount > 0}
                    title={
                      referenceCount > 0
                        ? 'Reassign or remove referenced services before deleting this host.'
                        : undefined
                    }
                    onClick={() => onDelete(host)}
                  >
                    Delete
                  </button>
                  {referenceCount > 0 && (
                    <span className="host-delete-help">
                      Reassign services before deleting.
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        <form className="host-form" onSubmit={handleSubmit}>
          <h3>{editing ? `Edit ${draft.name}` : 'Add host'}</h3>
          <label className="field">
            <span>Host name *</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="e.g. nas-01"
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select
              value={draft.type}
              onChange={(event) =>
                setDraft({ ...draft, type: event.target.value as Host['type'] })
              }
            >
              {HOST_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>IP address</span>
            <input
              value={draft.ipAddress}
              onChange={(event) => setDraft({ ...draft, ipAddress: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Operating system</span>
            <input
              value={draft.operatingSystem}
              onChange={(event) => setDraft({ ...draft, operatingSystem: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              rows={3}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="button primary" type="submit">
            {editing ? 'Save host' : 'Create host'}
          </button>
        </form>
      </div>
    </section>
  )
}
