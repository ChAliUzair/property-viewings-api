import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertiesModule } from '../properties/properties.module';
import { BookingsService } from './bookings.service';
import { Booking } from './entities/booking.entity';
import { ViewingSlot } from './entities/viewing-slot.entity';
import { SlotsService } from './slots.service';
import { ViewingsController } from './viewings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ViewingSlot, Booking]), PropertiesModule],
  controllers: [ViewingsController],
  providers: [SlotsService, BookingsService],
})
export class ViewingsModule {}
