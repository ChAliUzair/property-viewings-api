import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiCreatedResponse({ description: 'Creates a renter account' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ description: 'Returns a short-lived access token' })
  @ApiTooManyRequestsResponse({ description: 'More than 10 attempts per minute from one IP' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
