import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuditLogService } from './audit-log.service';
import { LoginDto, CreateUserDto } from './dto/login.dto';
import { JwtGuard } from './jwt.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { AuditLog } from './audit-log.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post('login')
  @AuditLog('user_login')
  async login(@Body() dto: LoginDto, @Request() req: any) {
    return this.authService.login(dto);
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @AuditLog('user_logout')
  async logout(@Request() req: any) {
    return { success: true, message: 'Logged out successfully' };
  }

  @Get('profile')
  @UseGuards(JwtGuard)
  async getProfile(@Request() req: any) {
    return {
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.displayName,
      role: req.user.role,
      department: req.user.department,
    };
  }

  @Get('users')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  async getUsers() {
    return this.authService.getAllUsers();
  }

  @Post('users')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  @AuditLog('create_user')
  async createUser(@Body() dto: CreateUserDto) {
    return this.authService.createUser(dto);
  }

  @Put('users/:id/role')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  @AuditLog('update_user_role')
  async updateUserRole(
    @Param('id') id: string,
    @Body() roleDto: { role: string },
  ) {
    return this.authService.assignRole(id, roleDto.role);
  }

  @Delete('users/:id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  @AuditLog('delete_user')
  async deleteUser(@Param('id') id: string) {
    return { success: await this.authService.deleteUser(id) };
  }

  @Get('audit-logs')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  async getAuditLogs(
    @Body()
    filters?: {
      userId?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.auditLogService.queryLogs(filters);
  }
}
