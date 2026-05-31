// 用户数据模型

/**
 * 用户角色枚举
 */
export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  REVIEWER = 'reviewer',
  COLLATOR = 'collator',
  ANNOTATOR = 'annotator',
  GUEST = 'guest'
}

/**
 * 用户信息接口
 */
export interface User {
  id: string;
  username: string;
  email: string;
  nickname: string;
  avatar?: string;
  role: UserRole;
  phone?: string;
  department?: string;
  status: 'active' | 'inactive' | 'locked';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

/**
 * 登录请求接口
 */
export interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * 登录响应接口
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

/**
 * 注册请求接口
 */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  nickname: string;
  phone?: string;
}

/**
 * 令牌信息接口
 */
export interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
