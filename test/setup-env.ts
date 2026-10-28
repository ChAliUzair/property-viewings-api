import { randomUUID } from 'crypto';

// Defaults match the CI service containers and `docker compose up postgres redis`.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://app:app@localhost:5432/viewings_test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_SECRET ??= 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.CACHE_TTL_SECONDS ??= '30';
// A fresh key prefix per run so cached entries from earlier runs can never leak into assertions.
process.env.REDIS_KEY_PREFIX = `test:${randomUUID()}:`;
