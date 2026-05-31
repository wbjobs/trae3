// 认证服务 - 处理用户登录、注册、令牌管理等功能

import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, throwError, catchError } from 'rxjs';
import {
  User,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  TokenInfo,
  UserRole
} from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'ancient_book_token';
  private readonly USER_KEY = 'ancient_book_user';
  private readonly REFRESH_TOKEN_KEY = 'ancient_book_refresh_token';

  // 使用 Signal 管理用户状态
  private currentUserSignal = signal<User | null>(null);
  private isAuthenticatedSignal = signal<boolean>(false);
  private tokenInfoSignal = signal<TokenInfo | null>(null);

  // 计算属性
  currentUser = computed(() => this.currentUserSignal());
  isAuthenticated = computed(() => this.isAuthenticatedSignal());
  userRole = computed(() => this.currentUserSignal()?.role ?? UserRole.GUEST);

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.initAuthState();
  }

  /**
   * 初始化认证状态，从本地存储恢复
   */
  private initAuthState(): void {
    try {
      const token = localStorage.getItem(this.TOKEN_KEY);
      const userStr = localStorage.getItem(this.USER_KEY);
      const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);

      if (token && userStr) {
        const user = JSON.parse(userStr) as User;
        const expiresAt = this.decodeTokenExpiry(token);

        if (expiresAt > Date.now()) {
          this.currentUserSignal.set(user);
          this.isAuthenticatedSignal.set(true);
          this.tokenInfoSignal.set({
            accessToken: token,
            refreshToken: refreshToken ?? '',
            expiresAt
          });
        } else {
          this.clearAuth();
        }
      }
    } catch (error) {
      console.error('初始化认证状态失败:', error);
      this.clearAuth();
    }
  }

  /**
   * 用户登录
   * @param credentials 登录凭证
   */
  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', credentials).pipe(
      tap((response) => this.handleLoginSuccess(response)),
      catchError((error) => {
        console.error('登录失败:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * 处理登录成功
   */
  private handleLoginSuccess(response: LoginResponse): void {
    const { accessToken, refreshToken, user, expiresIn } = response;
    const expiresAt = Date.now() + expiresIn * 1000;

    // 存储到本地
    localStorage.setItem(this.TOKEN_KEY, accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));

    // 更新信号状态
    this.currentUserSignal.set(user);
    this.isAuthenticatedSignal.set(true);
    this.tokenInfoSignal.set({ accessToken, refreshToken, expiresAt });
  }

  /**
   * 用户注册
   * @param data 注册信息
   */
  register(data: RegisterRequest): Observable<User> {
    return this.http.post<User>('/api/auth/register', data).pipe(
      catchError((error) => {
        console.error('注册失败:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * 用户登出
   */
  logout(): void {
    this.http.post('/api/auth/logout', {}).subscribe({
      next: () => this.clearAuth(),
      error: () => this.clearAuth()
    });
  }

  /**
   * 刷新访问令牌
   */
  refreshToken(): Observable<{ accessToken: string; expiresIn: number }> {
    const refreshToken = this.tokenInfoSignal()?.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('无刷新令牌'));
    }

    return this.http
      .post<{ accessToken: string; expiresIn: number }>('/api/auth/refresh', {
        refreshToken
      })
      .pipe(
        tap((response) => {
          const { accessToken, expiresIn } = response;
          const expiresAt = Date.now() + expiresIn * 1000;

          localStorage.setItem(this.TOKEN_KEY, accessToken);
          this.tokenInfoSignal.update((info) =>
            info ? { ...info, accessToken, expiresAt } : null
          );
        }),
        catchError((error) => {
          this.clearAuth();
          return throwError(() => error);
        })
      );
  }

  /**
   * 获取当前访问令牌
   */
  getAccessToken(): string | null {
    return this.tokenInfoSignal()?.accessToken ?? null;
  }

  /**
   * 检查用户是否拥有指定角色
   * @param roles 角色列表
   */
  hasRole(roles: UserRole[]): boolean {
    const userRole = this.userRole();
    return roles.includes(userRole);
  }

  /**
   * 清除认证信息
   */
  private clearAuth(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);

    this.currentUserSignal.set(null);
    this.isAuthenticatedSignal.set(false);
    this.tokenInfoSignal.set(null);

    this.router.navigate(['/auth/login']);
  }

  /**
   * 解码令牌过期时间
   */
  private decodeTokenExpiry(token: string): number {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp ? payload.exp * 1000 : Date.now() + 3600 * 1000;
    } catch {
      return Date.now() + 3600 * 1000;
    }
  }

  /**
   * 修改密码
   */
  changePassword(oldPassword: string, newPassword: string): Observable<void> {
    return this.http
      .post<void>('/api/auth/change-password', { oldPassword, newPassword })
      .pipe(
        catchError((error) => {
          console.error('修改密码失败:', error);
          return throwError(() => error);
        })
      );
  }
}
