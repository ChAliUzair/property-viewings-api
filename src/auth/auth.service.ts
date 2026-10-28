import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Role, User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<User> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return this.users.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      fullName: dto.fullName,
      role: Role.Renter,
    });
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; tokenType: 'Bearer' }> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { accessToken: await this.jwt.signAsync(payload), tokenType: 'Bearer' };
  }
}
