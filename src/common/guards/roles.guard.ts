import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../users/entities/user.entity';
import { AuthUser } from '../decorators/current-user.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    // Admins can do everything an agent or renter can.
    return !!user && (user.role === Role.Admin || required.includes(user.role));
  }
}
