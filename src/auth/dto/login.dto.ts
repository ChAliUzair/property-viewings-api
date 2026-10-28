import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'renter@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'CorrectHorse9' })
  @IsString()
  @MaxLength(72)
  password: string;
}
