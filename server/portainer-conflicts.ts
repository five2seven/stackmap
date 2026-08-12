import type { InventoryPort } from './inventory.js'

export function portProtocolsOverlap(left: InventoryPort['protocol'], right: InventoryPort['protocol']) {
  if (left === 'unknown' || right === 'unknown') return left === right
  return left === 'both' || right === 'both' || left === right
}
