// 登录页面组件

import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '@core/services/auth.service';
import { LoginRequest } from '@core/models/user.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="login-container">
      <div class="login-background">
        <div class="pattern-overlay"></div>
      </div>

      <mat-card class="login-card">
        <div class="login-header">
          <div class="logo-section">
            <div class="ancient-seal">古</div>
            <h1 class="platform-title">古籍数字化勘校平台</h1>
            <p class="platform-subtitle">Ancient Book Digital Collation Platform</p>
          </div>
          <div class="ancient-divider"></div>
          <h2 class="login-title">用户登录</h2>
        </div>

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="login-form">
          <mat-form-field appearance="outline" class="form-field">
            <mat-label>用户名</mat-label>
            <mat-icon matPrefix>person</mat-icon>
            <input
              matInput
              formControlName="username"
              placeholder="请输入用户名"
              required
            />
            <mat-error *ngIf="loginForm.get('username')?.hasError('required')">
              请输入用户名
            </mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline" class="form-field">
            <mat-label>密码</mat-label>
            <mat-icon matPrefix>lock</mat-icon>
            <input
              matInput
              formControlName="password"
              type="{{ hidePassword ? 'password' : 'text' }}"
              placeholder="请输入密码"
              required
            />
            <button
              mat-icon-button
              matSuffix
              type="button"
              (click)="hidePassword = !hidePassword"
              aria-label="切换密码可见性"
            >
              <mat-icon>{{
                hidePassword ? 'visibility_off' : 'visibility'
              }}</mat-icon>
            </button>
            <mat-error *ngIf="loginForm.get('password')?.hasError('required')">
              请输入密码
            </mat-error>
            <mat-error *ngIf="loginForm.get('password')?.hasError('minlength')">
              密码长度不能少于6位
            </mat-error>
          </mat-form-field>

          <div class="form-options">
            <mat-checkbox formControlName="rememberMe">记住我</mat-checkbox>
            <a routerLink="/auth/forgot-password" class="forgot-link">
              忘记密码？
            </a>
          </div>

          <div *ngIf="errorMessage" class="error-message">
            <mat-icon>error</mat-icon>
            {{ errorMessage() }}
          </div>

          <button
            mat-raised-button
            color="primary"
            type="submit"
            class="login-btn"
            [disabled]="loginForm.invalid || isLoading()"
          >
            <mat-spinner
              *ngIf="isLoading()"
              diameter="20"
              class="spinner"
            ></mat-spinner>
            <span *ngIf="!isLoading()">登 录</span>
          </button>

          <div class="register-link">
            还没有账号？
            <a routerLink="/auth/register">立即注册</a>
          </div>
        </form>

        <div class="login-footer">
          <p class="ancient-text">
            「博学之，审问之，慎思之，明辨之，笃行之」
          </p>
        </div>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .login-container {
        position: relative;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .login-background {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, #f5f0e6 0%, #ede6d6 100%);
      }

      .pattern-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        opacity: 0.1;
        background-image: repeating-linear-gradient(
            45deg,
            #5d4e37 0,
            #5d4e37 1px,
            transparent 0,
            transparent 50%
          ),
          repeating-linear-gradient(
            -45deg,
            #5d4e37 0,
            #5d4e37 1px,
            transparent 0,
            transparent 50%
          );
        background-size: 40px 40px;
      }

      .login-card {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 440px;
        padding: 40px;
        background-color: #faf7f0;
        border: 1px solid #d4c9b5;
        box-shadow: 0 8px 32px rgba(93, 78, 55, 0.2);
      }

      .login-header {
        text-align: center;
        margin-bottom: 32px;
      }

      .logo-section {
        margin-bottom: 24px;
      }

      .ancient-seal {
        display: inline-block;
        width: 64px;
        height: 64px;
        line-height: 64px;
        font-size: 32px;
        font-weight: bold;
        color: #c84c3b;
        border: 3px solid #c84c3b;
        border-radius: 4px;
        font-family: 'Noto Serif SC', serif;
        margin-bottom: 16px;
        transform: rotate(-5deg);
      }

      .platform-title {
        font-size: 24px;
        color: #5d4e37;
        margin-bottom: 8px;
        font-family: 'Noto Serif SC', serif;
        font-weight: 600;
      }

      .platform-subtitle {
        font-size: 12px;
        color: #9b8f7a;
        letter-spacing: 1px;
      }

      .login-title {
        font-size: 20px;
        color: #5d4e37;
        font-family: 'Noto Serif SC', serif;
      }

      .login-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .form-field {
        width: 100%;
      }

      .form-options {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .forgot-link {
        color: #c84c3b;
        text-decoration: none;
        font-size: 14px;

        &:hover {
          text-decoration: underline;
        }
      }

      .error-message {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        background-color: rgba(200, 76, 59, 0.1);
        border: 1px solid rgba(200, 76, 59, 0.3);
        border-radius: 4px;
        color: #c84c3b;
        font-size: 14px;
      }

      .login-btn {
        height: 48px;
        font-size: 16px;
        font-family: 'Noto Serif SC', serif;
        background-color: #5d4e37;

        &:hover {
          background-color: #3e3325;
        }

        &:disabled {
          opacity: 0.6;
        }
      }

      .spinner {
        margin-right: 8px;
      }

      .register-link {
        text-align: center;
        font-size: 14px;
        color: #6b5d4a;

        a {
          color: #c84c3b;
          text-decoration: none;
          margin-left: 4px;

          &:hover {
            text-decoration: underline;
          }
        }
      }

      .login-footer {
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid #e5dccb;
        text-align: center;
      }

      .ancient-text {
        font-family: 'Noto Serif SC', serif;
        font-size: 14px;
        color: #9b8f7a;
        font-style: italic;
        margin: 0;
      }
    `
  ]
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loginForm: FormGroup;
  hidePassword = true;
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  constructor() {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false]
    });
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const credentials: LoginRequest = this.loginForm.value;

    this.authService.login(credentials).subscribe({
      next: () => {
        const returnUrl =
          this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
        this.router.navigate([returnUrl]);
      },
      error: (error) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          error?.message || '登录失败，请检查用户名和密码'
        );
      }
    });
  }
}
