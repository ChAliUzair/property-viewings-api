import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { paginate, Paginated } from '../common/dto/pagination-query.dto';
import { Role } from '../users/entities/user.entity';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertyQueryDto, PropertySort } from './dto/property-query.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Property } from './entities/property.entity';

export const PROPERTIES_CACHE = 'properties';

const ORDER: Record<PropertySort, [string, 'ASC' | 'DESC']> = {
  newest: ['p.createdAt', 'DESC'],
  rent_asc: ['p.monthlyRentCents', 'ASC'],
  rent_desc: ['p.monthlyRentCents', 'DESC'],
  size_desc: ['p.sizeSqm', 'DESC'],
};

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    private readonly cache: CacheService,
  ) {}

  search(query: PropertyQueryDto): Promise<Paginated<Property>> {
    const key = JSON.stringify([
      query.city?.toLowerCase(),
      query.minRooms,
      query.maxRentCents,
      query.sort,
      query.page,
      query.limit,
    ]);
    return this.cache.getOrSet(PROPERTIES_CACHE, key, async () => {
      const qb = this.properties.createQueryBuilder('p');
      if (query.city) qb.andWhere('lower(p.city) = lower(:city)', { city: query.city });
      if (query.minRooms) qb.andWhere('p.rooms >= :minRooms', { minRooms: query.minRooms });
      if (query.maxRentCents)
        qb.andWhere('p.monthlyRentCents <= :max', { max: query.maxRentCents });
      const [field, dir] = ORDER[query.sort];
      // Tie-breaker on id keeps pages stable when many rows share the same rent or date.
      qb.orderBy(field, dir).addOrderBy('p.id', 'ASC');
      qb.skip((query.page - 1) * query.limit).take(query.limit);
      const [rows, total] = await qb.getManyAndCount();
      return paginate(rows, total, query.page, query.limit);
    });
  }

  async findOne(id: string): Promise<Property> {
    const property = await this.properties.findOneBy({ id });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async create(agent: AuthUser, dto: CreatePropertyDto): Promise<Property> {
    const saved = await this.properties.save(this.properties.create({ ...dto, agentId: agent.id }));
    await this.cache.invalidate(PROPERTIES_CACHE);
    return saved;
  }

  async update(user: AuthUser, id: string, dto: UpdatePropertyDto): Promise<Property> {
    const property = await this.findOwned(user, id);
    Object.assign(property, dto);
    const saved = await this.properties.save(property);
    await this.cache.invalidate(PROPERTIES_CACHE);
    return saved;
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const property = await this.findOwned(user, id);
    await this.properties.remove(property);
    await this.cache.invalidate(PROPERTIES_CACHE);
  }

  /** Agents may only change their own listings; admins may change any. */
  async findOwned(user: AuthUser, id: string): Promise<Property> {
    const property = await this.findOne(id);
    if (user.role !== Role.Admin && property.agentId !== user.id) {
      throw new ForbiddenException('You can only manage your own listings');
    }
    return property;
  }
}
