import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { PropertiesService } from '../properties/properties.service';
import { Role } from '../users/entities/user.entity';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './entities/booking.entity';
import { SlotsService } from './slots.service';

const renter = { id: 'renter-1', email: 'r@example.com', role: Role.Renter };
const now = new Date('2026-11-01T10:00:00Z');
const futureSlot = {
  id: 'slot-1',
  propertyId: 'prop-1',
  startsAt: new Date('2026-11-02T10:00:00Z'),
};

function uniqueViolation(constraint: string) {
  return new QueryFailedError(
    'INSERT ...',
    [],
    Object.assign(new Error('duplicate key'), { code: '23505', constraint }),
  );
}

describe('BookingsService', () => {
  let repo: jest.Mocked<
    Pick<Repository<Booking>, 'create' | 'save' | 'findOne' | 'update' | 'findOneByOrFail'>
  >;
  let slots: { findOne: jest.Mock };
  let cache: { invalidate: jest.Mock };
  let service: BookingsService;

  beforeEach(() => {
    repo = {
      create: jest.fn((x) => x as Booking),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      findOneByOrFail: jest.fn(),
    } as never;
    slots = { findOne: jest.fn().mockResolvedValue(futureSlot) };
    cache = { invalidate: jest.fn() };
    service = new BookingsService(
      repo as unknown as Repository<Booking>,
      slots as unknown as SlotsService,
      {} as PropertiesService,
      cache as unknown as CacheService,
    );
  });

  describe('book', () => {
    it('saves the booking and invalidates the slot cache', async () => {
      repo.save.mockResolvedValue({ id: 'b1' } as Booking);
      await expect(service.book(renter, 'slot-1', {}, now)).resolves.toEqual({ id: 'b1' });
      expect(cache.invalidate).toHaveBeenCalledWith('slots:prop-1');
    });

    it('turns the one-booking-per-slot constraint into a 409', async () => {
      repo.save.mockRejectedValue(uniqueViolation('uq_bookings_one_confirmed_per_slot'));
      await expect(service.book(renter, 'slot-1', {}, now)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(cache.invalidate).not.toHaveBeenCalled();
    });

    it('does not hide unrelated database errors', async () => {
      const other = uniqueViolation('some_other_constraint');
      repo.save.mockRejectedValue(other);
      await expect(service.book(renter, 'slot-1', {}, now)).rejects.toBe(other);
    });

    it('refuses slots that have already started', async () => {
      slots.findOne.mockResolvedValue({ ...futureSlot, startsAt: now });
      await expect(service.book(renter, 'slot-1', {}, now)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    const booking = {
      id: 'b1',
      renterId: renter.id,
      status: BookingStatus.Confirmed,
      slot: { ...futureSlot, property: { id: 'prop-1', agentId: 'agent-1' } },
    } as unknown as Booking;

    it('lets the renter cancel and uses a conditional update', async () => {
      repo.findOne.mockResolvedValue(booking);
      repo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      repo.findOneByOrFail.mockResolvedValue({ ...booking, status: BookingStatus.Cancelled });
      const result = await service.cancel(renter, 'b1', now);
      expect(result.status).toBe(BookingStatus.Cancelled);
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'b1', status: BookingStatus.Confirmed },
        { status: BookingStatus.Cancelled, cancelledAt: now },
      );
    });

    it('lets the listing agent cancel but not another renter', async () => {
      repo.findOne.mockResolvedValue(booking);
      repo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      repo.findOneByOrFail.mockResolvedValue(booking);
      await expect(
        service.cancel({ id: 'agent-1', email: 'a@x', role: Role.Agent }, 'b1', now),
      ).resolves.toBeDefined();
      await expect(
        service.cancel({ id: 'renter-2', email: 'x@x', role: Role.Renter }, 'b1', now),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('reports a 409 when the booking was already cancelled (lost race)', async () => {
      repo.findOne.mockResolvedValue(booking);
      repo.update.mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });
      await expect(service.cancel(renter, 'b1', now)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
