import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  @Public()
  @Get()
  @ApiOkResponse({ description: 'Database and Redis are reachable' })
  async check() {
    const [database, redis] = await Promise.all([
      this.dataSource
        .query('SELECT 1')
        .then(() => true)
        .catch(() => false),
      this.cache.ping(),
    ]);
    const body = { status: database && redis ? 'ok' : 'degraded', database, redis };
    if (!database) throw new ServiceUnavailableException(body);
    return body;
  }
}
