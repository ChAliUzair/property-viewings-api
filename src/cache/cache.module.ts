import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';
import { REDIS } from './redis.token';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: 2,
          keyPrefix: config.get<string>('REDIS_KEY_PREFIX') || undefined,
        }),
    },
    CacheService,
  ],
  exports: [REDIS, CacheService],
})
export class CacheModule {}
