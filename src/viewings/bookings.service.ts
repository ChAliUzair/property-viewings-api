import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { paginate, Paginated, PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { isPgError, PG_UNIQUE_VIOLATION } from '../common/pg-errors';
import { PropertiesService } from '../properties/properties.service';
import { Role } from '../users/entities/user.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { Booking, BookingStatus } from './entities/booking.entity';
import { slotsCacheNamespace, SlotsService } from './slots.service';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly slots: SlotsService,
    private readonly properties: PropertiesService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Books a slot for the current renter.
   *
   * There is deliberately no "check if free, then insert" step: two requests could both pass
   * the check. The partial unique index `uq_bookings_one_confirmed_per_slot` makes the database
   * the single arbiter; exactly one concurrent insert wins and the rest get a 409.
   */
  async book(
    renter: AuthUser,
    slotId: string,
    dto: CreateBookingDto,
    now = new Date(),
  ): Promise<Booking> {
    const slot = await this.slots.findOne(slotId);
    if (slot.startsAt <= now) throw new BadRequestException('This viewing has already started');
    try {
      const saved = await this.bookings.save(
        this.bookings.create({ slotId, renterId: renter.id, note: dto.note ?? null }),
      );
      await this.cache.invalidate(slotsCacheNamespace(slot.propertyId));
      return saved;
    } catch (err) {
      if (isPgError(err, PG_UNIQUE_VIOLATION, 'uq_bookings_one_confirmed_per_slot')) {
        throw new ConflictException('This viewing slot is already booked');
      }
      throw err;
    }
  }

  async cancel(user: AuthUser, bookingId: string, now = new Date()): Promise<Booking> {
    const booking = await this.bookings.findOne({
      where: { id: bookingId },
      relations: { slot: { property: true } },
    });
    if (!booking?.slot?.property) throw new NotFoundException('Booking not found');

    const isRenter = booking.renterId === user.id;
    const isListingAgent = booking.slot.property.agentId === user.id;
    if (!isRenter && !isListingAgent && user.role !== Role.Admin) {
      throw new ForbiddenException('You cannot cancel this booking');
    }
    if (booking.slot.startsAt <= now) {
      throw new BadRequestException('A viewing cannot be cancelled after it has started');
    }

    // Conditional update: if two cancels race, only one flips the row.
    const result = await this.bookings.update(
      { id: bookingId, status: BookingStatus.Confirmed },
      { status: BookingStatus.Cancelled, cancelledAt: now },
    );
    if (!result.affected) throw new ConflictException('This booking is already cancelled');

    await this.cache.invalidate(slotsCacheNamespace(booking.slot.propertyId));
    return this.bookings.findOneByOrFail({ id: bookingId });
  }

  async listMine(renter: AuthUser, query: PaginationQueryDto): Promise<Paginated<Booking>> {
    const [rows, total] = await this.bookings.findAndCount({
      where: { renterId: renter.id },
      relations: { slot: { property: true } },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return paginate(rows, total, query.page, query.limit);
  }

  async listForProperty(
    user: AuthUser,
    propertyId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<Booking>> {
    await this.properties.findOwned(user, propertyId);
    const [rows, total] = await this.bookings
      .createQueryBuilder('b')
      .innerJoinAndSelect('b.slot', 's')
      .innerJoin('b.renter', 'r')
      .addSelect(['r.id', 'r.fullName', 'r.email'])
      .where('s.propertyId = :propertyId', { propertyId })
      .orderBy('s.startsAt', 'ASC')
      .addOrderBy('b.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return paginate(rows, total, query.page, query.limit);
  }
}
