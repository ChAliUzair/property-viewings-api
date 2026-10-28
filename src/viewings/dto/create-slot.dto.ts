import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';

export class CreateSlotDto {
  @ApiProperty({ example: '2026-11-20T16:00:00Z' })
  @Type(() => Date)
  @IsDate()
  startsAt: Date;

  @ApiProperty({ example: '2026-11-20T16:30:00Z' })
  @Type(() => Date)
  @IsDate()
  endsAt: Date;
}
