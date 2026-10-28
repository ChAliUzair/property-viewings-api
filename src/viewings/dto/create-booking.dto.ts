import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBookingDto {
  @ApiPropertyOptional({ example: 'Coming with my partner.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
