import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../users/entities/user.entity';
import { RolesGuard } from './roles.guard';

function contextFor(user?: { role: Role }): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  it('allows routes without @Roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextFor({ role: Role.Renter }))).toBe(true);
  });

  it('allows a matching role and rejects others', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Agent]);
    expect(guard.canActivate(contextFor({ role: Role.Agent }))).toBe(true);
    expect(guard.canActivate(contextFor({ role: Role.Renter }))).toBe(false);
  });

  it('lets admins through any role check', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Renter]);
    expect(guard.canActivate(contextFor({ role: Role.Admin }))).toBe(true);
  });

  it('rejects when there is no authenticated user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Agent]);
    expect(guard.canActivate(contextFor(undefined))).toBe(false);
  });
});
