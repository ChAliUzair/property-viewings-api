import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/user.entity';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.id);
  }

  /** Admin promotes a renter to agent (or back). Agents cannot self-register. */
  @Patch(':id/role')
  @Roles(Role.Admin)
  setRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.users.setRole(id, dto.role);
  }
}
