import { LRUCache } from 'lru-cache';

// In-memory cache. On a multi-instance VPS deployment swap this for Redis behind the same interface.
const store = new LRUCache<string, { value: unknown }>({ max: 500, ttl: 5 * 60_000 });

export const cache = {
  async remember<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    const hit = store.get(key);
    if (hit) return hit.value as T;
    const value = await fn();
    store.set(key, { value }, ttlMs ? { ttl: ttlMs } : undefined);
    return value;
  },
  forget(prefix: string) {
    for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
  },
  clear() {
    store.clear();
  },
};
