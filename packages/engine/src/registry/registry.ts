import type { BlockDefinition } from './types';

export type Registry = {
  get(type: string): BlockDefinition | undefined;
  has(type: string): boolean;
  list(): BlockDefinition[];
  /** Add a block. Throws on a duplicate type: that is a programming error, not user data. */
  register(block: BlockDefinition): void;
};

export function createRegistry(blocks: readonly BlockDefinition[] = []): Registry {
  const map = new Map<string, BlockDefinition>();
  const registry: Registry = {
    get: (type) => map.get(type),
    has: (type) => map.has(type),
    list: () => Array.from(map.values()),
    register(block) {
      if (map.has(block.type)) throw new Error(`Block type "${block.type}" is already registered`);
      if (!block.variants.some((v) => v.id === block.defaultVariant)) {
        throw new Error(`Block "${block.type}": defaultVariant is not in variants`);
      }
      map.set(block.type, block);
    },
  };
  for (const block of blocks) registry.register(block);
  return registry;
}
