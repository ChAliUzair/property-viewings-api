import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isPgError, PG_UNIQUE_VIOLATION } from '../common/pg-errors';
import { Role, User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /** Includes the password hash; only the auth flow should call this. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.email) = lower(:email)', { email })
      .getOne();
  }

  async findById(id: string): Promise<User> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: Pick<User, 'email' | 'passwordHash' | 'fullName' | 'role'>): Promise<User> {
    try {
      const saved = await this.users.save(this.users.create(data));
      return this.findById(saved.id);
    } catch (err) {
      if (isPgError(err, PG_UNIQUE_VIOLATION)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }
  }

  async setRole(id: string, role: Role): Promise<User> {
    const user = await this.findById(id);
    user.role = role;
    return this.users.save(user);
  }
}
