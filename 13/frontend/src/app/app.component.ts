// 主应用组件

import { Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { AuthService } from './core/services/auth.service';
import { WebSocketService } from './core/services/websocket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule
  ],
  template: `
    <div class="app-container" *ngIf="isAuthenticated()">
      <mat-toolbar color="primary" class="app-header">
        <button
          mat-icon-button
          (click)="sidenav.toggle()"
          class="menu-btn"
          aria-label="切换菜单"
        >
          <mat-icon>menu</mat-icon>
        </button>
        <span class="app-title">古籍数字化勘校平台</span>
        <span class="spacer"></span>
        <div class="user-info">
          <span class="username">{{ currentUser()?.nickname }}</span>
          <button mat-button (click)="logout()">
            <mat-icon>logout</mat-icon>
            退出登录
          </button>
        </div>
      </mat-toolbar>

      <mat-sidenav-container class="app-sidenav-container">
        <mat-sidenav #sidenav mode="side" opened class="app-sidenav">
          <mat-nav-list>
            <a
              mat-list-item
              routerLink="/dashboard"
              routerLinkActive="active"
              class="nav-item"
            >
              <mat-icon matListItemIcon>dashboard</mat-icon>
              <span matListItemTitle>工作台</span>
            </a>
            <a
              mat-list-item
              routerLink="/project"
              routerLinkActive="active"
              class="nav-item"
            >
              <mat-icon matListItemIcon>folder</mat-icon>
              <span matListItemTitle>项目管理</span>
            </a>
            <a
              mat-list-item
              routerLink="/collation"
              routerLinkActive="active"
              class="nav-item"
            >
              <mat-icon matListItemIcon>edit_note</mat-icon>
              <span matListItemTitle>勘校工作台</span>
            </a>
            <a
              mat-list-item
              routerLink="/annotation"
              routerLinkActive="active"
              class="nav-item"
            >
              <mat-icon matListItemIcon>comment</mat-icon>
              <span matListItemTitle>批注管理</span>
            </a>
            <a
              mat-list-item
              routerLink="/search"
              routerLinkActive="active"
              class="nav-item"
            >
              <mat-icon matListItemIcon>search</mat-icon>
              <span matListItemTitle>全文检索</span>
            </a>
            <a
              mat-list-item
              routerLink="/file"
              routerLinkActive="active"
              class="nav-item"
            >
              <mat-icon matListItemIcon>cloud_upload</mat-icon>
              <span matListItemTitle>文件管理</span>
            </a>
            <a
              mat-list-item
              *ngIf="isAdmin()"
              routerLink="/admin"
              routerLinkActive="active"
              class="nav-item"
            >
              <mat-icon matListItemIcon>admin_panel_settings</mat-icon>
              <span matListItemTitle>用户管理</span>
            </a>
          </mat-nav-list>
        </mat-sidenav>

        <mat-sidenav-content class="app-content">
          <router-outlet></router-outlet>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>

    <div *ngIf="!isAuthenticated()">
      <router-outlet></router-outlet>
    </div>
  `,
  styles: [
    `
      .app-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
      }

      .app-header {
        z-index: 2;
        background-color: #5d4e37;
      }

      .menu-btn {
        margin-right: 16px;
      }

      .app-title {
        font-size: 20px;
        font-weight: 600;
        font-family: 'Noto Serif SC', serif;
      }

      .spacer {
        flex: 1 1 auto;
      }

      .user-info {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .username {
        font-size: 14px;
      }

      .app-sidenav-container {
        flex: 1;
        background-color: #f5f0e6;
      }

      .app-sidenav {
        width: 240px;
        background-color: #faf7f0;
        border-right: 1px solid #d4c9b5;
      }

      .nav-item {
        color: #5d4e37;
      }

      .nav-item.active {
        background-color: rgba(200, 76, 59, 0.1);
        color: #c84c3b;
      }

      .nav-item.active::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background-color: #c84c3b;
      }

      .app-content {
        padding: 24px;
        min-height: 100%;
      }
    `
  ]
})
export class AppComponent {
  private authService = inject(AuthService);
  private websocketService = inject(WebSocketService);
  private router = inject(Router);

  currentUser = this.authService.currentUser;
  isAuthenticated = this.authService.isAuthenticated;

  isAdmin = computed(() => {
    return this.currentUser()?.role === 'admin';
  });

  constructor() {
    effect(() => {
      if (this.isAuthenticated()) {
        this.websocketService.connect();
      } else {
        this.websocketService.disconnect();
      }
    });
  }

  logout(): void {
    this.authService.logout();
  }
}
