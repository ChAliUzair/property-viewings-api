import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from './redis.token';

/**
 * Read-through cache with namespace versioning.
 *
 * Keys are `cache:<namespace>:v<version>:<key>`. Invalidating a namespace bumps its version
 * (one INCR) instead of scanning and deleting keys; old entries simply expire by TTL.
 * If Redis is down, reads fall through to the database: the cache is an optimisation,
 * never a dependency for correctness.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly ttlSeconds: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.ttlSeconds = Number(config.get('CACHE_TTL_SECONDS') ?? 30);
  }

  async getOrSet<T>(namespace: string, key: string, load: () => Promise<T>): Promise<T> {
    if (this.ttlSeconds === 0) return load();
    let fullKey: string | undefined;
    try {
      const version = (await this.redis.get(this.versionKey(namespace))) ?? '0';
      fullKey = `cache:${namespace}:v${version}:${key}`;
      const hit = await this.redis.get(fullKey);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (err) {
      this.logger.warn(`cache read failed, using database: ${(err as Error).message}`);
      return load();
    }
    const value = await load();
    try {
      await this.redis.set(fullKey, JSON.stringify(value), 'EX', this.ttlSeconds);
    } catch (err) {
      this.logger.warn(`cache write failed: ${(err as Error).message}`);
    }
    return value;
  }

  async invalidate(namespace: string): Promise<void> {
    try {
      await this.redis.incr(this.versionKey(namespace));
    } catch (err) {
      this.logger.warn(`cache invalidate failed: ${(err as Error).message}`);
    }
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  private versionKey(namespace: string): string {
    return `cache:${namespace}:version`;
  }
}
