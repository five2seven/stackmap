// @vitest-environment node
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPortainerNetworkFetcher,
  isRfc1918Ipv4,
  resolvePrivateHttpAddresses,
  validatePortainerDestination,
  type PortainerResolver,
} from './portainer-network-policy.js'

const privateResolver = (...addresses: string[]): PortainerResolver => async () => addresses.map((address) => ({ address, family: 4 }))
const servers: Array<ReturnType<typeof createServer>> = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

describe('Portainer HTTP network policy', () => {
  it.each([
    ['10.0.0.0', true], ['10.255.255.255', true], ['9.255.255.255', false], ['11.0.0.0', false],
    ['172.16.0.0', true], ['172.31.255.255', true], ['172.15.255.255', false], ['172.32.0.0', false],
    ['192.168.0.0', true], ['192.168.255.255', true], ['192.167.255.255', false], ['192.169.0.0', false],
    ['127.0.0.1', false], ['169.254.169.254', false], ['224.0.0.1', false], ['0.0.0.0', false],
    ['100.64.0.1', false], ['198.51.100.1', false], ['8.8.8.8', false], ['::1', false], ['::ffff:10.0.0.1', false],
  ])('classifies %s as RFC1918=%s', (address, expected) => {
    expect(isRfc1918Ipv4(address)).toBe(expected)
  })

  it('accepts only non-empty exclusively private IPv4 resolution sets', async () => {
    await expect(resolvePrivateHttpAddresses('http://portainer.lan', privateResolver('10.0.0.2', '192.168.1.3')))
      .resolves.toEqual([{ address: '10.0.0.2', family: 4 }, { address: '192.168.1.3', family: 4 }])
    await expect(resolvePrivateHttpAddresses('http://10.1.2.3:9000', vi.fn())).resolves.toEqual([{ address: '10.1.2.3', family: 4 }])
    await expect(resolvePrivateHttpAddresses('https://public.example', privateResolver('203.0.113.1'))).resolves.toEqual([])
  })

  it.each([
    ['empty', []],
    ['mixed private/public', [{ address: '10.0.0.2', family: 4 }, { address: '8.8.8.8', family: 4 }]],
    ['private plus IPv6', [{ address: '192.168.1.2', family: 4 }, { address: 'fd00::1', family: 6 }]],
    ['IPv6 only', [{ address: 'fd00::1', family: 6 }]],
    ['loopback', [{ address: '127.0.0.1', family: 4 }]],
    ['metadata', [{ address: '169.254.169.254', family: 4 }]],
    ['CGNAT', [{ address: '100.64.0.1', family: 4 }]],
    ['malformed family', [{ address: '10.0.0.2', family: 6 }]],
  ])('rejects %s resolution', async (_label, addresses) => {
    await expect(resolvePrivateHttpAddresses('http://portainer.lan', async () => addresses)).rejects.toThrow(/RFC1918/)
  })

  it('fails closed on resolver errors and validates HTTP at startup but leaves HTTPS unchanged', async () => {
    await expect(validatePortainerDestination('http://portainer.lan', async () => { throw new Error('DNS secret detail') }))
      .rejects.toThrow('could not be resolved securely')
    await expect(validatePortainerDestination('https://portainer.example', async () => { throw new Error('must not resolve') }))
      .resolves.toBeUndefined()
  })

  it('fails closed when startup resolution times out', async () => {
    await expect(validatePortainerDestination('http://portainer.lan', () => new Promise(() => undefined), 5))
      .rejects.toThrow('could not be resolved securely')
  })

  it('revalidates each HTTP request and rejects rebinding before constructing a token-bearing request', async () => {
    const resolver = vi.fn<PortainerResolver>()
      .mockResolvedValueOnce([{ address: '10.0.0.2', family: 4 }])
      .mockResolvedValueOnce([{ address: '203.0.113.2', family: 4 }])
    await validatePortainerDestination('http://portainer.lan:9000', resolver)
    const requester = vi.fn(async () => new Response('[]'))
    const fetcher = createPortainerNetworkFetcher('http://portainer.lan:9000', resolver, requester)
    await expect(fetcher('http://portainer.lan:9000/api/endpoints', {
      method: 'GET', headers: { 'X-API-Key': 'must-not-send' }, redirect: 'error',
    })).rejects.toThrow(/RFC1918/)
    expect(resolver).toHaveBeenCalledTimes(2)
    expect(requester).not.toHaveBeenCalled()
  })

  it('pins the connection to the validated address while preserving the configured Host header', async () => {
    const privateAddress = Object.values(networkInterfaces()).flat().find((address) =>
      address?.family === 'IPv4' && isRfc1918Ipv4(address.address))?.address
    if (!privateAddress) throw new Error('test host requires an RFC1918 IPv4 interface')
    const received: Array<{ host?: string; token?: string; url?: string }> = []
    const server = createServer((request, response) => {
      received.push({ host: request.headers.host, token: request.headers['x-api-key'] as string, url: request.url })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('[]')
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server did not expose a port')
    const fetcher = createPortainerNetworkFetcher(`http://portainer.lan:${address.port}`, privateResolver(privateAddress))
    const response = await fetcher(`http://portainer.lan:${address.port}/api/endpoints`, {
      method: 'GET', headers: { 'X-API-Key': 'test-token' }, redirect: 'error',
    })
    expect(response.status).toBe(200)
    await response.arrayBuffer()
    expect(received).toEqual([{ host: `portainer.lan:${address.port}`, token: 'test-token', url: '/api/endpoints' }])
  })

  it('does not follow redirects or forward the API token', async () => {
    const privateAddress = Object.values(networkInterfaces()).flat().find((address) =>
      address?.family === 'IPv4' && isRfc1918Ipv4(address.address))?.address
    if (!privateAddress) throw new Error('test host requires an RFC1918 IPv4 interface')
    const received: string[] = []
    const server = createServer((request, response) => {
      received.push(`${request.url}:${request.headers['x-api-key']}`)
      response.writeHead(request.url === '/api/endpoints' ? 302 : 200, {
        location: `http://portainer.lan:${(server.address() as { port: number }).port}/redirected`,
        'content-type': 'application/json',
      })
      response.end('{}')
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server did not expose a port')
    const fetcher = createPortainerNetworkFetcher(`http://portainer.lan:${address.port}`, privateResolver(privateAddress))
    const response = await fetcher(`http://portainer.lan:${address.port}/api/endpoints`, {
      method: 'GET', headers: { 'X-API-Key': 'redirect-token' }, redirect: 'error',
    })
    await response.arrayBuffer()
    expect(response.status).toBe(302)
    expect(received).toEqual(['/api/endpoints:redirect-token'])
  })

  it('delegates HTTPS requests to the native fetch implementation unchanged', async () => {
    const nativeFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'))
    const fetcher = createPortainerNetworkFetcher('https://portainer.example')
    const init = { method: 'GET', headers: { 'X-API-Key': 'https-token' }, redirect: 'error' as const }
    await fetcher('https://portainer.example/api/endpoints', init)
    expect(nativeFetch).toHaveBeenCalledWith('https://portainer.example/api/endpoints', init)
  })
})
