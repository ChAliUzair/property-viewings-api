import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Role } from '../entities/user.entity';

export class UpdateRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;
}
