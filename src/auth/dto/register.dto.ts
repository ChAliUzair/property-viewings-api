import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'renter@example.com' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'CorrectHorse9', minLength: 10 })
  @IsString()
  @Length(10, 72) // bcrypt only uses the first 72 bytes
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'password must contain a letter and a digit' })
  password: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @Length(2, 120)
  fullName: string;
}
