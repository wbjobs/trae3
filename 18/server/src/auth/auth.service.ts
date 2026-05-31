import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private users: User[] = [];

  constructor(private jwtService: JwtService) {
    this.initDefaultAdmin();
  }

  private async initDefaultAdmin() {
    const hashed = await this.hashPassword('admin123');
    const admin: User = {
      id: uuidv4(),
      username: 'admin',
      password: hashed,
      displayName: 'System Admin',
      role: UserRole.ADMIN,
      department: 'IT',
      isActive: true,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    this.users.push(admin);
  }

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = this.users.find(
      (u) => u.username === username && u.isActive,
    );
    if (!user) {
      return null;
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return null;
    }
    return user;
  }

  async login(user: User): Promise<{ accessToken: string; user: Partial<User> }> {
    user.lastLoginAt = new Date();
    const payload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    const { password, ...result } = user;
    return { accessToken, user: result };
  }

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async createUser(dto: CreateUserDto): Promise<Partial<User>> {
    const existing = this.users.find((u) => u.username === dto.username);
    if (existing) {
      throw new Error('Username already exists');
    }
    const hashed = await this.hashPassword(dto.password);
    const user: User = {
      id: uuidv4(),
      username: dto.username,
      password: hashed,
      displayName: dto.displayName,
      role: dto.role,
      department: dto.department || null,
      isActive: true,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    this.users.push(user);
    const { password, ...result } = user;
    return result;
  }

  async assignRole(userId: string, role: UserRole): Promise<Partial<User>> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      throw new Error('User not found');
    }
    user.role = role;
    const { password, ...result } = user;
    return result;
  }

  findAll(): Partial<User>[] {
    return this.users.map(({ password, ...result }) => result);
  }

  findById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }
}
