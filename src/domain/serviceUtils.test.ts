import { describe, expect, it } from 'vitest'
import {
  createService,
  duplicateContainerNameServiceIds,
  duplicatePortServiceIds,
  filterServices,
  missingServiceFields,
} from './serviceUtils'
import type { Host, ServiceFilters } from './types'

const filters: ServiceFilters = {
  query: '',
  status: 'all',
  hostId: 'all',
  network: 'all',
  exposure: 'all',
}

describe('service utilities', () => {
  it('detects duplicate container names only for non-retired services on the same host', () => {
    const service = (id: string, hostId: string | undefined, containerName: string, status = 'active') => ({
      ...createService(id),
      id,
      hostId,
      containerName,
      status: status as ReturnType<typeof createService>['status'],
    })
    const services = [
      service('first', 'host-1', ' Jellyfin '),
      service('second', 'host-1', 'jELLYfin'),
      service('third', 'host-1', 'JELLYFIN'),
      service('other-host', 'host-2', 'jellyfin'),
      service('blank', 'host-1', '   '),
      service('no-host', undefined, 'jellyfin'),
      service('retired', 'host-1', 'jellyfin', 'retired'),
      service('retired-two', 'host-1', 'jellyfin', 'retired'),
    ]

    expect([...duplicateContainerNameServiceIds(services)].sort()).toEqual([
      'first',
      'second',
      'third',
    ])
    expect(duplicateContainerNameServiceIds([services[0]])).toEqual(new Set())
  })

  it('ignores container-name matches across different hosts', () => {
    const first = { ...createService('First'), id: 'first', hostId: 'one', containerName: 'app' }
    const second = { ...createService('Second'), id: 'second', hostId: 'two', containerName: 'app' }
    expect(duplicateContainerNameServiceIds([first, second])).toEqual(new Set())
  })
  it('detects duplicate host ports on the same host and overlapping protocols', () => {
    const first = {
      ...createService('First'),
      id: 'first',
      hostId: 'host-1',
      ports: [{ hostPort: 8080, containerPort: 80, protocol: 'tcp' as const, description: '' }],
    }
    const second = {
      ...createService('Second'),
      id: 'second',
      hostId: 'host-1',
      ports: [{ hostPort: 8080, containerPort: 80, protocol: 'both' as const, description: '' }],
    }
    const otherHost = { ...second, id: 'third', hostId: 'host-2' }

    expect([...duplicatePortServiceIds([first, second, otherHost])].sort()).toEqual([
      'first',
      'second',
    ])
  })

  it('detects duplicate host ports within one service', () => {
    const service = {
      ...createService('Duplicate'),
      id: 'duplicate',
      hostId: 'host-1',
      ports: [
        { hostPort: 8080, protocol: 'tcp' as const, description: 'first' },
        { hostPort: 8080, protocol: 'both' as const, description: 'second' },
      ],
    }

    expect([...duplicatePortServiceIds([service])]).toEqual(['duplicate'])
  })

  it('searches service and host details and applies filters', () => {
    const host: Host = {
      id: 'host-1',
      name: 'media-server',
      type: 'physical',
      ipAddress: '',
      operatingSystem: '',
      notes: '',
      createdAt: '',
      updatedAt: '',
    }
    const plex = {
      ...createService('Plex'),
      id: 'plex',
      hostId: host.id,
      network: 'media',
      exposure: 'vpn' as const,
      notes: 'Family library',
      containerName: 'plex-app',
      dockerImage: 'linuxserver/plex',
      description: 'Movies at home',
      applicationUrl: 'https://plex.example.test',
      ports: [{ hostPort: 32400, protocol: 'tcp' as const, description: '' }],
    }
    const homeAssistant = { ...createService('Home Assistant'), id: 'home-assistant' }

    expect(filterServices([plex, homeAssistant], [host], { ...filters, query: '32400' })).toEqual([
      plex,
    ])
    expect(
      filterServices([plex, homeAssistant], [host], {
        ...filters,
        query: 'media-server',
        network: 'media',
        exposure: 'vpn',
      }),
    ).toEqual([plex])
    expect(
      filterServices([plex, homeAssistant], [host], { ...filters, status: 'planned' }),
    ).toEqual([])
    for (const query of ['plex-app', 'LINUXSERVER/PLEX', 'movies at home', 'plex.example.test']) {
      expect(filterServices([plex, homeAssistant], [host], { ...filters, query })).toEqual([plex])
    }
  })

  it('identifies incomplete records while allowing them to exist', () => {
    const incomplete = createService('Name only')
    expect(missingServiceFields(incomplete)).toEqual([
      'host',
      'internal URL',
      'ports',
      'configuration path',
      'data path',
      'network',
      'exposure',
    ])

    const complete = {
      ...incomplete,
      hostId: 'host-1',
      internalUrl: 'http://server',
      ports: [{ hostPort: 80, protocol: 'tcp' as const, description: '' }],
      configPath: '/config',
      dataPath: '/data',
      network: 'default',
      exposure: 'local' as const,
    }
    expect(missingServiceFields(complete)).toEqual([])
  })
})
