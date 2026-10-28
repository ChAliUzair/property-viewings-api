import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const PROPERTY_SORTS = ['newest', 'rent_asc', 'rent_desc', 'size_desc'] as const;
export type PropertySort = (typeof PROPERTY_SORTS)[number];

export class PropertyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'Chemnitz' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  city?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  minRooms?: number;

  @ApiPropertyOptional({ example: 80000, description: 'Maximum rent in euro cents' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRentCents?: number;

  @ApiPropertyOptional({ enum: PROPERTY_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(PROPERTY_SORTS)
  sort: PropertySort = 'newest';
}
