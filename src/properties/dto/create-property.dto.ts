import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePropertyDto {
  @ApiProperty({ example: '2-room flat near Kassberg, balcony' })
  @IsString()
  @Length(5, 160)
  title: string;

  @ApiPropertyOptional({ example: 'Bright, renovated 2023, fitted kitchen.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 'Chemnitz' })
  @IsString()
  @Length(2, 80)
  city: string;

  @ApiProperty({ example: '09112', description: 'German postcode (5 digits)' })
  @Matches(/^\d{5}$/, { message: 'postcode must be 5 digits' })
  postcode: string;

  @ApiProperty({ example: 2.5, description: 'German listings count half rooms' })
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(20)
  rooms: number;

  @ApiProperty({ example: 58 })
  @IsInt()
  @Min(10)
  @Max(2000)
  sizeSqm: number;

  @ApiProperty({ example: 64500, description: 'Warm rent in euro cents (645.00 EUR)' })
  @IsInt()
  @Min(1000)
  @Max(5_000_000)
  monthlyRentCents: number;
}
