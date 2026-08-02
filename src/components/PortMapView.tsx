import { derivePortMap, UNASSIGNED_HOST_FILTER } from '../domain/portMap'
import type { Host, Service } from '../domain/types'

interface PortMapViewProps {
  services: Service[]
  hosts: Host[]
  query: string
  hostFilter: string
  onQueryChange: (query: string) => void
  onHostFilterChange: (hostId: string) => void
  onEditService: (service: Service) => void
}

export function PortMapView({
  services,
  hosts,
  query,
  hostFilter,
  onQueryChange,
  onHostFilterChange,
  onEditService,
}: PortMapViewProps) {
  const groups = derivePortMap(services, hosts, { query, hostFilter })
  const portCount = services.reduce((count, service) => count + service.ports.length, 0)
  const assignmentCount = groups.reduce((count, group) => count + group.assignments.length, 0)
  const conflictCount = groups.reduce(
    (count, group) => count + group.assignments.filter((assignment) => assignment.conflict).length,
    0,
  )

  let emptyTitle = 'No port assignments match'
  let emptyMessage = 'Clear the search or choose another host.'
  if (services.length === 0) {
    emptyTitle = 'No services yet'
    emptyMessage = 'Add a service before mapping ports.'
  } else if (portCount === 0) {
    emptyTitle = 'No port mappings yet'
    emptyMessage = 'Edit a service to record its first port mapping.'
  } else if (!query.trim() && hostFilter !== 'all') {
    emptyTitle = 'No ports for this host'
    emptyMessage = 'Choose another host or edit a service assignment.'
  }

  return (
    <section className="workspace port-map" aria-labelledby="port-map-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Assignment overview</p>
          <h2 id="port-map-title">Port Map</h2>
        </div>
        <p className={conflictCount ? 'port-map-count has-conflicts' : 'port-map-count'}>
          {assignmentCount} visible assignments · {conflictCount} conflicting assignments
        </p>
      </div>

      <div className="port-map-controls">
        <label className="search-field">
          <span>Search Port Map</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search services, hosts, ports, protocols…"
          />
        </label>
        <label>
          <span>Filter Port Map by host</span>
          <select value={hostFilter} onChange={(event) => onHostFilterChange(event.target.value)}>
            <option value="all">All hosts</option>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>{host.name}</option>
            ))}
            <option value={UNASSIGNED_HOST_FILTER}>Unassigned host</option>
          </select>
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state compact">
          <h3>{emptyTitle}</h3>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="port-host-groups">
          {groups.map((group) => (
            <section className="port-host-group" key={group.id} aria-labelledby={`port-host-${group.id}`}>
              <div className="port-host-heading">
                <h3 id={`port-host-${group.id}`}>{group.name}</h3>
                <span>{group.assignments.length} {group.assignments.length === 1 ? 'assignment' : 'assignments'}</span>
              </div>
              <div className="port-table" role="table" aria-label={`${group.name} port assignments`}>
                <div className="port-table-header" role="row">
                  <span role="columnheader">Host port</span><span role="columnheader">Container port</span>
                  <span role="columnheader">Protocol</span><span role="columnheader">Service</span>
                  <span role="columnheader">Host</span><span role="columnheader">Status</span><span role="columnheader">Actions</span>
                </div>
                {group.assignments.map((assignment) => (
                  <div
                    className={`port-assignment${assignment.conflict ? ' port-conflict' : ''}${assignment.incomplete ? ' port-incomplete' : ''}`}
                    role="row"
                    aria-label={`${assignment.serviceName}, host port ${assignment.hostPort ?? 'missing'}, container port ${assignment.containerPort ?? 'missing'}, ${assignment.protocol}`}
                    key={assignment.id}
                  >
                    <span role="cell" data-label="Host port">{assignment.hostPort ?? 'Missing'}</span>
                    <span role="cell" data-label="Container port">{assignment.containerPort ?? 'Missing'}</span>
                    <span role="cell" data-label="Protocol">{assignment.protocol}</span>
                    <span role="cell" data-label="Service"><strong>{assignment.serviceName}</strong></span>
                    <span role="cell" data-label="Host">{assignment.hostName}</span>
                    <span role="cell" data-label="Status"><span className={`status-badge status-${assignment.serviceStatus}`}>{assignment.serviceStatus}</span></span>
                    <span role="cell" data-label="Actions">
                      <button className="text-button" type="button" onClick={() => onEditService(services.find((service) => service.id === assignment.serviceId)!)} aria-label={`Edit service ${assignment.serviceName}`}>Edit service</button>
                    </span>
                    {(assignment.conflict || assignment.incomplete) && (
                      <span className="port-assignment-notes" role="cell" data-label="Issues">
                        {assignment.conflict && (
                          <span className="conflict-detail" role="status">
                            Conflict: {assignment.hostPort}/{assignment.protocol} on {assignment.hostName}; also used by {[...new Set(assignment.conflictingServiceNames)].join(', ')}.
                          </span>
                        )}
                        {assignment.hostPort === undefined && <span>Host port is missing.</span>}
                        {assignment.containerPort === undefined && <span>Container port is missing.</span>}
                        {assignment.protocol === 'unknown' && <span>Protocol is unknown.</span>}
                        {!assignment.hostId && <span>Service has no assigned host.</span>}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
