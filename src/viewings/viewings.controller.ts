import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Role } from '../users/entities/user.entity';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateSlotDto } from './dto/create-slot.dto';
import { SlotQueryDto } from './dto/slot-query.dto';
import { SlotsService } from './slots.service';

@ApiTags('viewings')
@Controller()
export class ViewingsController {
  constructor(
    private readonly slots: SlotsService,
    private readonly bookings: BookingsService,
  ) {}

  @Public()
  @Get('properties/:propertyId/slots')
  listSlots(@Param('propertyId', ParseUUIDPipe) propertyId: string, @Query() query: SlotQueryDto) {
    return this.slots.listForProperty(propertyId, query);
  }

  @ApiBearerAuth()
  @Roles(Role.Agent)
  @Post('properties/:propertyId/slots')
  @ApiConflictResponse({ description: 'Overlaps another slot of the same property' })
  createSlot(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreateSlotDto,
  ) {
    return this.slots.create(user, propertyId, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.Agent)
  @Delete('slots/:slotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSlot(@CurrentUser() user: AuthUser, @Param('slotId', ParseUUIDPipe) slotId: string) {
    return this.slots.remove(user, slotId);
  }

  @ApiBearerAuth()
  @Roles(Role.Renter)
  @Post('slots/:slotId/bookings')
  @ApiConflictResponse({ description: 'Slot already booked' })
  book(
    @CurrentUser() user: AuthUser,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookings.book(user, slotId, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.Renter)
  @Get('bookings/me')
  myBookings(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.bookings.listMine(user, query);
  }

  @ApiBearerAuth()
  @Roles(Role.Agent)
  @Get('properties/:propertyId/bookings')
  propertyBookings(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.bookings.listForProperty(user, propertyId, query);
  }

  @ApiBearerAuth()
  @Patch('bookings/:bookingId/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.bookings.cancel(user, bookingId);
  }
}
