import { useEffect, useMemo, useRef, useState } from 'react'
import { SERVICE_STATUSES, type Host, type Service } from '../domain/types'
import { PortainerImportError, portainerImportClient, type PortainerEnvironment, type PortainerPreview } from '../data/portainerImport'
import { recomputePreviewConflicts } from '../data/portainerPreview'
import './PortainerImportPanel.css'

interface Props { hosts: Host[]; services: Service[]; onImported: () => Promise<void> }

export function PortainerImportPanel({ hosts, services, onImported }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [sessionToken, setSessionToken] = useState('')
  const [environments, setEnvironments] = useState<PortainerEnvironment[]>([])
  const [selectedEnvironments, setSelectedEnvironments] = useState<number[]>([])
  const [preview, setPreview] = useState<PortainerPreview | null>(null)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [bulkHostId, setBulkHostId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => { let active = true; portainerImportClient.status().then((value) => { if (active) setEnabled(value.enabled) }).catch(() => {}).finally(() => { if (active) setLoaded(true) }); return () => { active = false } }, [])
  const importableServiceIds = useMemo(() => preview?.services.filter(({ alreadyBound }) => !alreadyBound).map(({ id }) => id) ?? [], [preview])
  const allServicesSelected = importableServiceIds.length > 0 && importableServiceIds.every((id) => selectedServices.includes(id))
  const someServicesSelected = importableServiceIds.some((id) => selectedServices.includes(id)) && !allServicesSelected
  const selectAllRef = useRef<HTMLInputElement>(null)
  const existingTargetHosts = useMemo(
    () => preview?.existingHosts.map(({ id, name }) => ({ id, label: `Existing: ${name}` })) ?? [],
    [preview],
  )
  const proposedHostByEnvironment = useMemo(
    () => new Map(preview?.hosts.map(({ environmentId, id, name }) => [environmentId, { id, label: `New: ${name}` }]) ?? []),
    [preview],
  )
  const targetHostsForService = (service: PortainerPreview['services'][number]) => {
    const proposedHost = proposedHostByEnvironment.get(service.environmentId)
    return proposedHost ? [proposedHost, ...existingTargetHosts] : existingTargetHosts
  }
  const bulkTargetHosts = useMemo(() => {
    const selected = preview?.services.filter(({ id }) => selectedServices.includes(id)) ?? []
    if (!selected.length) return []
    const proposedHostIds = selected.map(({ environmentId }) => proposedHostByEnvironment.get(environmentId)?.id)
    const sharedProposedHost = proposedHostIds[0] && proposedHostIds.every((id) => id === proposedHostIds[0])
      ? proposedHostByEnvironment.get(selected[0].environmentId)
      : undefined
    return sharedProposedHost ? [sharedProposedHost, ...existingTargetHosts] : existingTargetHosts
  }, [existingTargetHosts, preview, proposedHostByEnvironment, selectedServices])
  const displayedPreview = useMemo(
    () => preview && recomputePreviewConflicts(preview, services, selectedServices),
    [preview, selectedServices, services],
  )

  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someServicesSelected }, [someServicesSelected])

  if (!loaded || !enabled) return null

  async function connect() {
    if (!token.trim()) return
    setBusy(true); setError('')
    try {
      const result = await portainerImportClient.connect(token)
      setToken('')
      setSessionToken(result.sessionToken)
      setEnvironments(result.environments)
      setSelectedEnvironments([])
    } catch (caught) { setToken(''); setError(caught instanceof Error ? caught.message : 'Portainer connection failed.') }
    finally { setBusy(false) }
  }

  async function discover() {
    setBusy(true); setError('')
    try {
      const result = await portainerImportClient.preview(sessionToken, selectedEnvironments)
      setPreview(result)
      setSelectedServices([])
      setBulkHostId('')
      setAcknowledged(false)
    } catch (caught) {
      if (caught instanceof PortainerImportError && caught.code === 'PORTAINER_SESSION_INVALID') {
        setSessionToken(''); setEnvironments([]); setSelectedEnvironments([])
      }
      setError(caught instanceof Error ? caught.message : 'Portainer preview failed.')
    }
    finally { setBusy(false) }
  }

  async function cancel() {
    const previewToken = preview?.previewToken
    const activeSession = sessionToken
    setToken(''); setSessionToken(''); setEnvironments([]); setSelectedEnvironments([]); setPreview(null); setSelectedServices([]); setBulkHostId(''); setAcknowledged(false); setResult(''); setError(''); setOpen(false)
    try { if (previewToken) await portainerImportClient.cancelPreview(previewToken); else if (activeSession) await portainerImportClient.cancelSession(activeSession) } catch { /* local cancellation is immediate */ }
  }

  function patchService(id: string, patch: Partial<PortainerPreview['services'][number]>) {
    setPreview((current) => current && ({ ...current, services: current.services.map((service) => service.id === id ? { ...service, ...patch } : service) }))
  }

  function applyBulkHost() {
    if (!bulkHostId || !selectedServices.length || busy || !bulkTargetHosts.some(({ id }) => id === bulkHostId)) return
    const selected = new Set(selectedServices)
    setPreview((current) => current && ({
      ...current,
      services: current.services.map((service) => selected.has(service.id) ? { ...service, hostId: bulkHostId } : service),
    }))
  }

  async function confirmImport() {
    if (!displayedPreview || !selectedServices.length || !acknowledged || busy) return
    setBusy(true); setError(''); setResult('Importing selected containers…')
    try {
      const selected = displayedPreview.services.filter(({ id }) => selectedServices.includes(id))
      const imported = await portainerImportClient.confirm(displayedPreview.previewToken, displayedPreview.expectedInventoryRevision, selected)
      setResult(`Imported ${imported.serviceIds.length} services and ${imported.hostIds.length} hosts. Inventory revision ${imported.inventoryRevision}.`)
      setPreview(null); setSessionToken(''); setEnvironments([]); setSelectedEnvironments([]); setSelectedServices([]); setBulkHostId(''); setAcknowledged(false)
      try {
        await onImported()
      } catch {
        setError('The import succeeded, but StackMap could not refresh the inventory. Reload the page to see the imported records.')
      }
    } catch (caught) {
      const terminal = caught instanceof PortainerImportError && ['PORTAINER_PREVIEW_INVALID', 'PORTAINER_PREVIEW_STALE', 'PORTAINER_ALREADY_BOUND'].includes(caught.code)
      if (terminal) { setPreview(null); setSessionToken(''); setEnvironments([]); setSelectedEnvironments([]); setSelectedServices([]); setBulkHostId(''); setAcknowledged(false) }
      setResult('')
      setError(caught instanceof Error ? caught.message : 'The selected containers could not be imported.')
    } finally { setBusy(false) }
  }

  return <section className="portainer-import" aria-labelledby="portainer-import-title">
    <button className="button ghost" type="button" onClick={() => { if (open) void cancel(); else setOpen(true) }} aria-expanded={open} aria-controls="portainer-import-panel">{open ? 'Close Portainer preview' : 'Import from Portainer'}</button>
    {open && <div id="portainer-import-panel" className="portainer-import-panel">
      <div><p className="eyebrow">Read-only discovery</p><h3 id="portainer-import-title">Preview Portainer containers</h3><p>StackMap reads the configured Portainer server and imports only the containers you explicitly select and confirm.</p></div>
      {!sessionToken && <div className="portainer-token-row">
        <label className="field"><span>Portainer API token</span><input type="password" value={token} autoComplete="off" disabled={busy} onChange={(event) => setToken(event.target.value)} /></label>
        <button className="button primary" type="button" disabled={!token.trim() || busy} onClick={connect}>{busy ? 'Connecting…' : 'Discover environments'}</button>
      </div>}
      {sessionToken && !preview && <fieldset className="checkbox-list"><legend>Choose environments</legend>
        {environments.map((environment) => <label key={environment.id}><input type="checkbox" checked={selectedEnvironments.includes(environment.id)} onChange={(event) => setSelectedEnvironments((current) => event.target.checked ? [...current, environment.id] : current.filter((id) => id !== environment.id))} />{environment.name}</label>)}
        {!environments.length && <p>No accessible Docker environments were found.</p>}
      </fieldset>}
      {sessionToken && !preview && <div className="form-actions"><button className="button primary" type="button" disabled={!selectedEnvironments.length || busy} onClick={discover}>{busy ? 'Discovering…' : 'Build preview'}</button><button className="button ghost" type="button" onClick={cancel}>Cancel</button></div>}
      {displayedPreview && <div className="portainer-preview">
        <p><strong>{displayedPreview.hosts.length} proposed hosts</strong> and <strong>{displayedPreview.services.length} discovered containers</strong>. Inventory revision {displayedPreview.expectedInventoryRevision}. No changes have been made.</p>
        {displayedPreview.hosts.map((host) => <article className="portainer-host" key={host.id}><h4>{host.name}</h4><p>{host.operatingSystem || 'Operating system unavailable'} · IP {host.ipAddress || 'not inferred'}</p>{host.existingHostMatches.length > 0 && <p className="path-warning">Possible existing host match: {host.existingHostMatches.map((id) => hosts.find((item) => item.id === id)?.name ?? id).join(', ')}</p>}</article>)}
        <div className="portainer-bulk-actions">
          <label className="portainer-service-select"><input ref={selectAllRef} type="checkbox" checked={allServicesSelected} disabled={!importableServiceIds.length || busy} onChange={(event) => { setSelectedServices(event.target.checked ? importableServiceIds : []); setBulkHostId('') }} />Select all services</label>
          <label className="field"><span>Set host for selected services</span><select value={bulkHostId} disabled={!selectedServices.length || busy} onChange={(event) => setBulkHostId(event.target.value)}><option value="">Choose a target host</option>{bulkTargetHosts.map((host) => <option value={host.id} key={host.id}>{host.label}</option>)}</select></label>
          <button className="button ghost" type="button" disabled={!selectedServices.length || !bulkHostId || busy} onClick={applyBulkHost}>Apply host</button>
        </div>
        <div className="portainer-services">{displayedPreview.services.map((service) => {
          const checked = selectedServices.includes(service.id)
          return <article className="portainer-service" key={service.id}>
            <label className="portainer-service-select"><input type="checkbox" checked={checked} disabled={service.alreadyBound || busy} onChange={(event) => { setSelectedServices((current) => event.target.checked ? [...current, service.id] : current.filter((id) => id !== service.id)); setBulkHostId('') }} /><strong>{service.name}</strong> <span>{service.sourceState}</span></label>
            <div className="form-grid">
              <label className="field"><span>Status</span><select value={service.status} onChange={(event) => patchService(service.id, { status: event.target.value as Service['status'] })}>{SERVICE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label className="field"><span>Target host</span><select value={service.hostId} onChange={(event) => patchService(service.id, { hostId: event.target.value })}>{targetHostsForService(service).map((host) => <option value={host.id} key={host.id}>{host.label}</option>)}</select></label>
              <label className="field"><span>Network</span><select value={service.network} onChange={(event) => patchService(service.id, { network: event.target.value })}><option value="">{service.networkOptions.length > 1 ? 'Select one network' : 'No network'}</option>{service.networkOptions.map((network) => <option key={network}>{network}</option>)}</select></label>
            </div>
            <p>{service.dockerImage} · exposure {service.exposure}</p>
            <div><strong>Ports:</strong> {service.ports.length ? service.ports.map((port) => <label key={port.id}><input type="checkbox" checked onChange={() => patchService(service.id, { ports: service.ports.filter(({ id }) => id !== port.id) })} /> {port.hostPort ?? 'unpublished'} → {port.containerPort}/{port.protocol}</label>) : 'none'}</div>
            <div><strong>Bind mounts:</strong> {service.paths.length ? <div className="portainer-bind-mounts">{service.paths.map((path) => <div className="portainer-bind-mount" key={path.id}>
              <label><input type="checkbox" checked onChange={() => patchService(service.id, { paths: service.paths.filter(({ id }) => id !== path.id) })} /> {path.hostPath} → {path.containerPath}{path.readOnly ? ' (read-only)' : ''}</label>
              <label className="field"><span>Purpose for {path.containerPath}</span><input aria-label={`${service.name} bind mount ${path.containerPath} purpose`} value={path.purpose} maxLength={4096} disabled={busy} onChange={(event) => patchService(service.id, { paths: service.paths.map((item) => item.id === path.id ? { ...item, purpose: event.target.value } : item) })} /></label>
            </div>)}</div> : 'none'}</div>
            {[...service.warnings, ...service.conflicts].map((item, index) => <p className="path-warning" key={`${item.code}-${index}`}>{item.message}</p>)}
          </article>
        })}</div>
        <div className="portainer-phase-boundary" role="group" aria-labelledby="portainer-confirm-title"><strong id="portainer-confirm-title">Confirm import</strong><span>Only the selected new records will be created. Existing services are never updated.</span>
          <label><input type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} /> I reviewed this selection and understand it will be added to StackMap.</label>
        </div>
        <div className="form-actions"><button className="button primary" type="button" disabled={!selectedServices.length || !acknowledged || busy || displayedPreview.services.some((service) => selectedServices.includes(service.id) && service.conflicts.some(({ blocking }) => blocking))} onClick={confirmImport}>{busy ? 'Importing…' : 'Import selected'}</button><button className="button ghost" type="button" disabled={busy} onClick={cancel}>Cancel preview</button></div>
      </div>}
      {result && <p className="notice success" role="status">{result}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>}
  </section>
}
