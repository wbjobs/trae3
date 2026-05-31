// 404页面组件

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="not-found-container">
      <div class="not-found-content">
        <div class="error-code">404</div>
        <h1 class="error-title">页面未找到</h1>
        <p class="error-message">
          抱歉，您访问的页面不存在或已被移除。
        </p>
        <div class="ancient-divider"></div>
        <p class="ancient-text">
          「山重水复疑无路，柳暗花明又一村」
        </p>
        <button mat-raised-button color="primary" (click)="goHome()">
          <mat-icon>home</mat-icon>
          返回首页
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .not-found-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background-color: #f5f0e6;
        padding: 24px;
      }

      .not-found-content {
        text-align: center;
        max-width: 600px;
        padding: 48px;
        background-color: #faf7f0;
        border: 1px solid #d4c9b5;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(93, 78, 55, 0.16);
      }

      .error-code {
        font-size: 120px;
        font-weight: 700;
        color: #c84c3b;
        font-family: 'Noto Serif SC', serif;
        line-height: 1;
        margin-bottom: 16px;
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
        font-size: 18px;
        color: #5d4e37;
        margin: 24px 0;
        font-style: italic;
      }

      button {
        margin-top: 16px;
      }
    `
  ]
})
export class NotFoundComponent {
  private router = inject(Router);

  goHome(): void {
    this.router.navigate(['/']);
  }
}
