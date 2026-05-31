// 403禁止访问页面组件

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="forbidden-container">
      <div class="forbidden-content">
        <mat-icon class="error-icon">block</mat-icon>
        <h1 class="error-title">访问被禁止</h1>
        <p class="error-message">
          抱歉，您没有权限访问此页面。
        </p>
        <div class="ancient-divider"></div>
        <p class="ancient-text">
          「非礼勿视，非礼勿听，非礼勿言，非礼勿动」
        </p>
        <div class="action-buttons">
          <button mat-stroked-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
            返回上一页
          </button>
          <button mat-raised-button color="primary" (click)="goHome()">
            <mat-icon>home</mat-icon>
            返回首页
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .forbidden-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background-color: #f5f0e6;
        padding: 24px;
      }

      .forbidden-content {
        text-align: center;
        max-width: 600px;
        padding: 48px;
        background-color: #faf7f0;
        border: 1px solid #d4c9b5;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(93, 78, 55, 0.16);
      }

      .error-icon {
        font-size: 80px;
        width: 80px;
        height: 80px;
        color: #c84c3b;
        margin-bottom: 24px;
      }

      .error-title {
        font-size: 28px;
        color: #5d4e37;
        margin-bottom: 16px;
        font-family: 'Noto Serif SC', serif;
      }

      .error-message {
        font-size: 16px;
        color: #6b5d4a;
        margin-bottom: 24px;
      }

      .ancient-text {
        font-family: 'Noto Serif SC', serif;
        font-size: 16px;
        color: #5d4e37;
        margin: 24px 0;
        font-style: italic;
      }

      .action-buttons {
        display: flex;
        gap: 16px;
        justify-content: center;
        margin-top: 24px;
      }
    `
  ]
})
export class ForbiddenComponent {
  private router = inject(Router);

  goBack(): void {
    window.history.back();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
