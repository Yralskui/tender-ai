/**
 * Кэш приложения: Redis в проде, память в dev.
 * Счётчики, статусы — без тяжёлых COUNT(*) на каждый запрос.
 */

import "server-only";
type CacheBackend = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
};

class MemoryBackend implements CacheBackend {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const row = this.store.get(key);
    if (!row) return null;
    if (row.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return row.value;
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class RedisBackend implements CacheBackend {
  constructor(private url: string) {}

  private client: import("ioredis").default | null = null;

  private async redis() {
    if (this.client) return this.client;
    const { default: Redis } = await import("ioredis");
    this.client = new Redis(this.url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    await this.client.connect();
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    const r = await this.redis();
    return r.get(key);
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    const r = await this.redis();
    await r.set(key, value, "EX", ttlSec);
  }

  async del(key: string): Promise<void> {
    const r = await this.redis();
    await r.del(key);
  }
}

let backend: CacheBackend | null = null;

function getBackend(): CacheBackend {
  if (backend) return backend;
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    backend = new RedisBackend(redisUrl);
  } else {
    backend = new MemoryBackend();
  }
  return backend;
}

export async function cacheGet(key: string): Promise<string | null> {
  try {
    return await getBackend().get(key);
  } catch (e) {
    console.warn("[cache] get failed:", key, e);
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSec: number): Promise<void> {
  try {
    await getBackend().set(key, value, ttlSec);
  } catch (e) {
    console.warn("[cache] set failed:", key, e);
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await getBackend().del(key);
  } catch (e) {
    console.warn("[cache] del failed:", key, e);
  }
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSec: number): Promise<void> {
  await cacheSet(key, JSON.stringify(value), ttlSec);
}
