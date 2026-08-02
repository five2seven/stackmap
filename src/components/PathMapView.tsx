import {
  derivePathMap,
  UNASSIGNED_PATH_HOST_FILTER,
  type PathAssignment,
} from '../domain/pathMap'
import type { Host, Service } from '../domain/types'

interface PathMapViewProps {
  services: Service[]
  hosts: Host[]
  query: string
  hostFilter: string
  onQueryChange: (query: string) => void
  onHostFilterChange: (hostId: string) => void
  onEditService: (service: Service) => void
}

function AssignmentIssues({ assignment }: { assignment: PathAssignment }) {
  return (
    <div className="path-map-issues">
      {assignment.sharedHostPath && (
        <span className="shared-path-label">Shared with {assignment.otherServiceNames.join(', ')}</span>
      )}
      {assignment.incomplete && <span>Mapping is incomplete.</span>}
      {!assignment.hostPath.trim() && <span>Host path is missing.</span>}
      {!assignment.containerPath.trim() && <span>Container path is missing.</span>}
      {!assignment.hostId && <span>Service has no assigned host.</span>}
      {assignment.incompletePair && <span>Mapping warning: incomplete host/container pair.</span>}
      {assignment.mixedHostPaths && <span>Service warning: host paths mix absolute and relative styles.</span>}
      {assignment.mixedContainerPaths && <span>Service warning: container paths mix absolute and relative styles.</span>}
      {assignment.missingConfiguration && <span>Service warning: no configuration-purpose mapping recorded.</span>}
    </div>
  )
}

export function PathMapView({
  services,
  hosts,
  query,
  hostFilter,
  onQueryChange,
  onHostFilterChange,
  onEditService,
}: PathMapViewProps) {
  const groups = derivePathMap(services, hosts, { query, hostFilter })
  const pathCount = services.reduce((count, service) => count + service.paths.length, 0)
  const visibleCount = groups.reduce(
    (count, hostGroup) =>
      count + hostGroup.pathGroups.reduce((groupCount, pathGroup) => groupCount + pathGroup.assignments.length, 0),
    0,
  )

  let emptyTitle = 'No path mappings match'
  let emptyMessage = 'Clear the search or choose another host.'
  if (services.length === 0) {
    emptyTitle = 'No services yet'
    emptyMessage = 'Add a service before mapping paths.'
  } else if (pathCount === 0) {
    emptyTitle = 'No path mappings yet'
    emptyMessage = 'Edit a service to record its first path mapping.'
  } else if (!query.trim() && hostFilter !== 'all') {
    emptyTitle = 'No paths for this host'
    emptyMessage = 'Choose another host or edit a service assignment.'
  }

  return (
    <section className="workspace path-map" aria-labelledby="path-map-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Storage overview</p>
          <h2 id="path-map-title">Path Map</h2>
        </div>
        <p className="path-map-count">{visibleCount} visible {visibleCount === 1 ? 'mapping' : 'mappings'}</p>
      </div>

      <div className="path-map-controls">
        <label className="search-field">
          <span>Search Path Map</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search services, hosts, paths, purposes…"
          />
        </label>
        <label>
          <span>Filter Path Map by host</span>
          <select value={hostFilter} onChange={(event) => onHostFilterChange(event.target.value)}>
            <option value="all">All hosts</option>
            {hosts.map((host) => <option key={host.id} value={host.id}>{host.name}</option>)}
            <option value={UNASSIGNED_PATH_HOST_FILTER}>Unassigned host</option>
          </select>
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state compact">
          <h3>{emptyTitle}</h3>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="path-host-groups">
          {groups.map((hostGroup) => (
            <section className="path-host-group" key={hostGroup.id} aria-labelledby={`path-host-${hostGroup.id}`}>
              <div className="path-host-heading">
                <h3 id={`path-host-${hostGroup.id}`}>{hostGroup.name}</h3>
                <span>{hostGroup.pathGroups.length} {hostGroup.pathGroups.length === 1 ? 'host path' : 'host paths'}</span>
              </div>
              <div className="path-groups">
                {hostGroup.pathGroups.map((pathGroup) => (
                  <section className="path-group" key={pathGroup.id} aria-labelledby={`path-group-${hostGroup.id}-${pathGroup.id}`}>
                    <div className="path-group-heading">
                      <h4 id={`path-group-${hostGroup.id}-${pathGroup.id}`}>{pathGroup.name}</h4>
                      <span>{pathGroup.assignments.length} {pathGroup.assignments.length === 1 ? 'mapping' : 'mappings'}</span>
                    </div>
                    <div className="path-map-table" role="table" aria-label={`${hostGroup.name}, ${pathGroup.name} mappings`}>
                      <div className="path-map-header" role="row">
                        <span role="columnheader">Container path</span><span role="columnheader">Service</span>
                        <span role="columnheader">Host</span><span role="columnheader">Purpose</span>
                        <span role="columnheader">Access</span><span role="columnheader">Status</span>
                        <span role="columnheader">Actions</span>
                      </div>
                      {pathGroup.assignments.map((assignment) => (
                        <div
                          className={`path-map-assignment${assignment.incomplete ? ' path-map-incomplete' : ''}${assignment.sharedHostPath ? ' path-map-shared' : ''}`}
                          role="row"
                          aria-label={`${assignment.serviceName}, host path ${assignment.hostPath.trim() || 'missing'}, container path ${assignment.containerPath.trim() || 'missing'}, ${assignment.readOnly ? 'read-only' : 'writable'}`}
                          key={assignment.id}
                        >
                          <span role="cell" data-label="Container path">{assignment.containerPath || 'Missing'}{assignment.containerPathStyle && <small>{assignment.containerPathStyle}</small>}</span>
                          <span role="cell" data-label="Service"><strong>{assignment.serviceName}</strong></span>
                          <span role="cell" data-label="Host">{assignment.hostName}</span>
                          <span role="cell" data-label="Purpose">{assignment.purpose || 'Not specified'}</span>
                          <span role="cell" data-label="Access"><span className={assignment.readOnly ? 'read-only-badge' : 'writable-badge'}>{assignment.readOnly ? 'Read-only' : 'Writable'}</span></span>
                          <span role="cell" data-label="Status"><span className={`status-badge status-${assignment.serviceStatus}`}>{assignment.serviceStatus}</span></span>
                          <span role="cell" data-label="Actions"><button className="text-button" type="button" onClick={() => onEditService(services.find((service) => service.id === assignment.serviceId)!)} aria-label={`Edit service ${assignment.serviceName}`}>Edit service</button></span>
                          <span className="path-map-details" role="cell" data-label="Details">
                            {assignment.hostPathStyle && <span>Host path style: {assignment.hostPathStyle}.</span>}
                            <AssignmentIssues assignment={assignment} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
