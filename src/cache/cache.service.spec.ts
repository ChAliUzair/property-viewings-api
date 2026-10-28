import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';

function makeService(redis: Partial<Record<keyof Redis, jest.Mock>>, ttl = 30) {
  const config = { get: () => ttl } as unknown as ConfigService;
  return new CacheService(redis as unknown as Redis, config);
}

describe('CacheService', () => {
  it('returns the cached value without calling the loader', async () => {
    const redis = {
      get: jest.fn().mockResolvedValueOnce('3').mockResolvedValueOnce('{"n":1}'),
      set: jest.fn(),
    };
    const load = jest.fn();
    await expect(makeService(redis).getOrSet('ns', 'k', load)).resolves.toEqual({ n: 1 });
    expect(load).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenLastCalledWith('cache:ns:v3:k');
  });

  it('loads and stores on a miss', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    await expect(
      makeService(redis).getOrSet('ns', 'k', () => Promise.resolve({ n: 2 })),
    ).resolves.toEqual({
      n: 2,
    });
    expect(redis.set).toHaveBeenCalledWith('cache:ns:v0:k', '{"n":2}', 'EX', 30);
  });

  it('falls back to the database when Redis is unavailable', async () => {
    const redis = { get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')), set: jest.fn() };
    await expect(
      makeService(redis).getOrSet('ns', 'k', () => Promise.resolve('fresh')),
    ).resolves.toBe('fresh');
  });

  it('invalidates a namespace by bumping its version', async () => {
    const redis = { incr: jest.fn().mockResolvedValue(4) };
    await makeService(redis).invalidate('ns');
    expect(redis.incr).toHaveBeenCalledWith('cache:ns:version');
  });

  it('bypasses Redis entirely when the TTL is 0', async () => {
    const redis = { get: jest.fn() };
    await expect(
      makeService(redis, 0).getOrSet('ns', 'k', () => Promise.resolve('direct')),
    ).resolves.toBe('direct');
    expect(redis.get).not.toHaveBeenCalled();
  });
});
