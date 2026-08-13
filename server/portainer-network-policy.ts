import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { isIP, type LookupFunction } from 'node:net'
import { Readable } from 'node:stream'

export interface ResolvedAddress {
  address: string
  family: number
}

export type PortainerResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>
export type NetworkPolicyFetcher = (input: string, init: RequestInit) => Promise<Response>
export type ValidatedHttpRequester = (
  target: URL,
  init: RequestInit,
  addresses: readonly ResolvedAddress[],
) => Promise<Response>

const systemResolver: PortainerResolver = async (hostname) => dnsLookup(hostname, { all: true, verbatim: true })
const STARTUP_RESOLUTION_TIMEOUT_MS = 10_000

export class PortainerNetworkPolicyError extends Error {
  constructor(message = 'STACKMAP_PORTAINER_URL HTTP destination must resolve exclusively to RFC1918 IPv4 addresses') {
    super(message)
  }
}

export function isRfc1918Ipv4(address: string): boolean {
  if (isIP(address) !== 4) return false
  const [first, second] = address.split('.').map(Number)
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
}

export async function resolvePrivateHttpAddresses(
  value: string | URL,
  resolver: PortainerResolver = systemResolver,
  signal?: AbortSignal,
): Promise<readonly ResolvedAddress[]> {
  const url = typeof value === 'string' ? new URL(value) : value
  if (url.protocol !== 'http:') return []
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  let addresses: readonly ResolvedAddress[]
  if (isIP(hostname)) {
    addresses = [{ address: hostname, family: isIP(hostname) }]
  } else {
    try {
      addresses = await abortableResolution(resolver(hostname), signal)
    } catch {
      throw new PortainerNetworkPolicyError('STACKMAP_PORTAINER_URL HTTP destination could not be resolved securely')
    }
  }
  if (addresses.length === 0 || addresses.some(({ address, family }) => family !== 4 || !isRfc1918Ipv4(address))) {
    throw new PortainerNetworkPolicyError()
  }
  return addresses.map(({ address }) => ({ address, family: 4 }))
}

export async function validatePortainerDestination(
  value: string,
  resolver: PortainerResolver = systemResolver,
  timeoutMs = STARTUP_RESOLUTION_TIMEOUT_MS,
): Promise<void> {
  if (new URL(value).protocol !== 'http:') return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await resolvePrivateHttpAddresses(value, resolver, controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

export function createPortainerNetworkFetcher(
  baseUrl: string,
  resolver: PortainerResolver = systemResolver,
  requester: ValidatedHttpRequester = requestValidatedHttp,
): NetworkPolicyFetcher {
  const configured = new URL(baseUrl)
  if (configured.protocol === 'https:') return (input, init) => fetch(input, init)
  return async (input, init) => {
    const target = new URL(input)
    if (target.protocol !== 'http:' || target.origin !== configured.origin) {
      throw new PortainerNetworkPolicyError('Portainer request destination did not match the configured HTTP origin')
    }
    // Resolve and validate before constructing the token-bearing HTTP request. The
    // socket lookup below is then pinned to this exact validated result set.
    const addresses = await resolvePrivateHttpAddresses(target, resolver, init.signal ?? undefined)
    return requester(target, init, addresses)
  }
}

function abortableResolution<T>(resolution: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return resolution
  if (signal.aborted) return Promise.reject(new PortainerNetworkPolicyError('Portainer HTTP destination validation was cancelled'))
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      callback()
    }
    const abort = () => finish(() => reject(new PortainerNetworkPolicyError('Portainer HTTP destination validation was cancelled')))
    signal.addEventListener('abort', abort, { once: true })
    resolution.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}

function requestValidatedHttp(
  target: URL,
  init: RequestInit,
  addresses: readonly ResolvedAddress[],
): Promise<Response> {
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) callback(null, addresses.map(({ address }) => ({ address, family: 4 })))
    else callback(null, addresses[0].address, 4)
  }
  const headers = Object.fromEntries(new Headers(init.headers).entries())
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      protocol: 'http:',
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method: init.method,
      headers,
      lookup,
      agent: false,
      signal: init.signal ?? undefined,
    }, (incoming) => {
      resolve(new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {
        status: incoming.statusCode ?? 500,
        statusText: incoming.statusMessage,
        headers: responseHeaders(incoming.headers),
      }))
    })
    request.once('error', reject)
    request.end()
  })
}

function responseHeaders(input: IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry))
    else if (value !== undefined) headers.set(name, value)
  }
  return headers
}
