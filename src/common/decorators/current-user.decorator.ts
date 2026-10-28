import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../../users/entities/user.entity';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return req.user;
});
