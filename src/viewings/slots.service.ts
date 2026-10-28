import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { isPgError, PG_EXCLUSION_VIOLATION } from '../common/pg-errors';
import { PropertiesService } from '../properties/properties.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { SlotQueryDto } from './dto/slot-query.dto';
import { Booking, BookingStatus } from './entities/booking.entity';
import { ViewingSlot } from './entities/viewing-slot.entity';

export const MIN_SLOT_MINUTES = 10;
export const MAX_SLOT_MINUTES = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

export const slotsCacheNamespace = (propertyId: string) => `slots:${propertyId}`;

@Injectable()
export class SlotsService {
  constructor(
    @InjectRepository(ViewingSlot) private readonly slots: Repository<ViewingSlot>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly properties: PropertiesService,
    private readonly cache: CacheService,
  ) {}

  async create(
    user: AuthUser,
    propertyId: string,
    dto: CreateSlotDto,
    now = new Date(),
  ): Promise<ViewingSlot> {
    await this.properties.findOwned(user, propertyId);
    assertValidSlotRange(dto.startsAt, dto.endsAt, now);
    try {
      const saved = await this.slots.save(
        this.slots.create({ propertyId, startsAt: dto.startsAt, endsAt: dto.endsAt }),
      );
      await this.cache.invalidate(slotsCacheNamespace(propertyId));
      return saved;
    } catch (err) {
      if (isPgError(err, PG_EXCLUSION_VIOLATION, 'ex_slot_no_overlap')) {
        throw new ConflictException('This slot overlaps another viewing slot for the property');
      }
      throw err;
    }
  }

  /** Public availability view: no renter data, just whether each slot is taken. */
  async listForProperty(propertyId: string, query: SlotQueryDto): Promise<ViewingSlot[]> {
    await this.properties.findOne(propertyId);
    const from = query.from ?? new Date();
    const to = query.to ?? new Date(from.getTime() + 30 * DAY_MS);
    if (to <= from) throw new BadRequestException('`to` must be after `from`');
    if (to.getTime() - from.getTime() > 90 * DAY_MS) {
      throw new BadRequestException('The window can be at most 90 days');
    }
    const key = `${from.toISOString()}|${to.toISOString()}`;
    return this.cache.getOrSet(slotsCacheNamespace(propertyId), key, async () => {
      const rows = await this.slots
        .createQueryBuilder('s')
        .leftJoin('bookings', 'b', 'b.slot_id = s.id AND b.status = :confirmed', {
          confirmed: BookingStatus.Confirmed,
        })
        .addSelect('b.id IS NOT NULL', 'is_booked')
        .where('s.propertyId = :propertyId', { propertyId })
        .andWhere('s.startsAt >= :from AND s.startsAt < :to', { from, to })
        .orderBy('s.startsAt', 'ASC')
        .getRawAndEntities<{ is_booked: boolean }>();
      return rows.entities.map((slot, i) => ({ ...slot, isBooked: rows.raw[i].is_booked }));
    });
  }

  async findOne(id: string): Promise<ViewingSlot> {
    const slot = await this.slots.findOneBy({ id });
    if (!slot) throw new NotFoundException('Viewing slot not found');
    return slot;
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const slot = await this.findOne(id);
    await this.properties.findOwned(user, slot.propertyId);
    const booked = await this.bookings.existsBy({ slotId: id, status: BookingStatus.Confirmed });
    if (booked) throw new ConflictException('Cancel the booking before removing this slot');
    await this.slots.delete({ id });
    await this.cache.invalidate(slotsCacheNamespace(slot.propertyId));
  }
}

export function assertValidSlotRange(startsAt: Date, endsAt: Date, now: Date): void {
  if (startsAt <= now) throw new BadRequestException('A slot must start in the future');
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (minutes < MIN_SLOT_MINUTES || minutes > MAX_SLOT_MINUTES) {
    throw new BadRequestException(
      `A slot must last between ${MIN_SLOT_MINUTES} and ${MAX_SLOT_MINUTES} minutes`,
    );
  }
}
