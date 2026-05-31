// 工作台首页组件

import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '@core/services/auth.service';

interface StatCard {
  title: string;
  value: number;
  icon: string;
  color: string;
  route: string;
}

interface RecentTask {
  id: string;
  title: string;
  project: string;
  status: 'pending' | 'in-progress' | 'completed' | 'review';
  deadline: string;
}

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatGridListModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule
  ],
  template: `
    <div class="dashboard-container">
      <div class="dashboard-header">
        <div>
          <h1 class="welcome-title">
            欢迎回来，{{ currentUser()?.nickname }}
          </h1>
          <p class="welcome-subtitle">
            {{ greeting }} · {{ today }}
          </p>
        </div>
        <div class="header-actions">
          <button
            mat-raised-button
            color="primary"
            (click)="navigateTo('/project/create')"
          >
            <mat-icon>add</mat-icon>
            新建项目
          </button>
        </div>
      </div>

      <div class="ancient-divider"></div>

      <div class="stats-section">
        <h2 class="section-title">数据概览</h2>
        <div class="stats-grid">
          <mat-card
            class="stat-card"
            *ngFor="let stat of statCards"
            (click)="navigateTo(stat.route)"
          >
            <div class="stat-icon" [style.backgroundColor]="stat.color">
              <mat-icon>{{ stat.icon }}</mat-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stat.value }}</div>
              <div class="stat-label">{{ stat.title }}</div>
            </div>
          </mat-card>
        </div>
      </div>

      <div class="content-grid">
        <mat-card class="content-card progress-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon class="card-icon">trending_up</mat-icon>
              工作进度
            </mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="progress-item">
              <div class="progress-header">
                <span class="progress-label">待勘校</span>
                <span class="progress-value">35%</span>
              </div>
              <mat-progress-bar
                mode="determinate"
                value="35"
                color="primary"
              ></mat-progress-bar>
            </div>
            <div class="progress-item">
              <div class="progress-header">
                <span class="progress-label">待审核</span>
                <span class="progress-value">25%</span>
              </div>
              <mat-progress-bar
                mode="determinate"
                value="25"
                color="accent"
              ></mat-progress-bar>
            </div>
            <div class="progress-item">
              <div class="progress-header">
                <span class="progress-label">已完成</span>
                <span class="progress-value">40%</span>
              </div>
              <mat-progress-bar
                mode="determinate"
                value="40"
                color="warn"
              ></mat-progress-bar>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="content-card tasks-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon class="card-icon">assignment</mat-icon>
              最近任务
            </mat-card-title>
            <button
              mat-button
              color="primary"
              (click)="navigateTo('/dashboard/tasks')"
            >
              查看全部
            </button>
          </mat-card-header>
          <mat-card-content>
            <div
              class="task-item"
              *ngFor="let task of recentTasks"
              (click)="navigateTo('/collation/' + task.id)"
            >
              <div
                class="task-status"
                [ngClass]="'status-' + task.status"
              ></div>
              <div class="task-info">
                <div class="task-title">{{ task.title }}</div>
                <div class="task-meta">
                  <span class="task-project">{{ task.project }}</span>
                  <span class="task-deadline">
                    <mat-icon>schedule</mat-icon>
                    {{ task.deadline }}
                  </span>
                </div>
              </div>
              <mat-icon class="task-arrow">chevron_right</mat-icon>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="content-card projects-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon class="card-icon">folder</mat-icon>
              活跃项目
            </mat-card-title>
            <button
              mat-button
              color="primary"
              (click)="navigateTo('/project')"
            >
              更多
            </button>
          </mat-card-header>
          <mat-card-content>
            <div
              class="project-item"
              *ngFor="let project of activeProjects"
              (click)="navigateTo('/project/' + project.id)"
            >
              <div class="project-cover" [style.backgroundColor]="project.color">
                {{ project.title.charAt(0) }}
              </div>
              <div class="project-info">
                <div class="project-title">{{ project.title }}</div>
                <div class="project-progress">
                  <span class="progress-text">{{ project.progress }}%</span>
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      [style.width.%]="project.progress"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="content-card quick-actions-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon class="card-icon">bolt</mat-icon>
              快捷操作
            </mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="quick-actions-grid">
              <button
                class="quick-action-btn"
                (click)="navigateTo('/project/create')"
              >
                <mat-icon>add_circle</mat-icon>
                <span>创建项目</span>
              </button>
              <button
                class="quick-action-btn"
                (click)="navigateTo('/collation')"
              >
                <mat-icon>edit_note</mat-icon>
                <span>开始勘校</span>
              </button>
              <button
                class="quick-action-btn"
                (click)="navigateTo('/file/upload')"
              >
                <mat-icon>cloud_upload</mat-icon>
                <span>上传文件</span>
              </button>
              <button
                class="quick-action-btn"
                (click)="navigateTo('/search')"
              >
                <mat-icon>search</mat-icon>
                <span>全文检索</span>
              </button>
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [
    `
      .dashboard-container {
        padding: 0;
      }

      .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 24px;
        flex-wrap: wrap;
        gap: 16px;
      }

      .welcome-title {
        font-size: 28px;
        color: #5d4e37;
        margin: 0 0 8px 0;
        font-family: 'Noto Serif SC', serif;
        font-weight: 600;
      }

      .welcome-subtitle {
        font-size: 14px;
        color: #9b8f7a;
        margin: 0;
      }

      .header-actions {
        display: flex;
        gap: 12px;
      }

      .section-title {
        font-size: 18px;
        color: #5d4e37;
        margin: 0 0 16px 0;
        font-family: 'Noto Serif SC', serif;
        font-weight: 600;
      }

      .stats-section {
        margin-bottom: 32px;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
      }

      .stat-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.3s ease;
        background-color: #faf7f0;
        border: 1px solid #d4c9b5;

        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(93, 78, 55, 0.15);
        }
      }

      .stat-icon {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;

        mat-icon {
          font-size: 28px;
          width: 28px;
          height: 28px;
        }
      }

      .stat-content {
        flex: 1;
      }

      .stat-value {
        font-size: 28px;
        font-weight: 700;
        color: #5d4e37;
        line-height: 1;
        margin-bottom: 4px;
      }

      .stat-label {
        font-size: 14px;
        color: #6b5d4a;
      }

      .content-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 24px;
      }

      .content-card {
        background-color: #faf7f0;
        border: 1px solid #d4c9b5;

        mat-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;

          mat-card-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 16px;
            color: #5d4e37;
            font-family: 'Noto Serif SC', serif;
            font-weight: 600;
          }
        }

        mat-card-content {
          padding: 16px 20px 20px;
        }

        .card-icon {
          color: #c84c3b;
        }
      }

      .progress-card .progress-item {
        margin-bottom: 20px;

        &:last-child {
          margin-bottom: 0;
        }
      }

      .progress-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .progress-label {
        font-size: 14px;
        color: #6b5d4a;
      }

      .progress-value {
        font-size: 14px;
        color: #5d4e37;
        font-weight: 600;
      }

      .tasks-card .task-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid #e5dccb;
        cursor: pointer;
        transition: background-color 0.2s;

        &:hover {
          background-color: rgba(93, 78, 55, 0.05);
          padding-left: 8px;
          padding-right: 8px;
          margin-left: -8px;
          margin-right: -8px;
          border-radius: 4px;
        }

        &:last-child {
          border-bottom: none;
        }
      }

      .task-status {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;

        &.status-pending {
          background-color: #c89b3b;
        }
        &.status-in-progress {
          background-color: #3b6c8c;
        }
        &.status-completed {
          background-color: #4a7c59;
        }
        &.status-review {
          background-color: #c84c3b;
        }
      }

      .task-info {
        flex: 1;
        min-width: 0;
      }

      .task-title {
        font-size: 14px;
        color: #2c2416;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .task-meta {
        display: flex;
        gap: 16px;
        font-size: 12px;
        color: #9b8f7a;
      }

      .task-deadline {
        display: flex;
        align-items: center;
        gap: 4px;

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
      }

      .task-arrow {
        color: #9b8f7a;
      }

      .projects-card .project-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid #e5dccb;
        cursor: pointer;
        transition: background-color 0.2s;

        &:hover {
          background-color: rgba(93, 78, 55, 0.05);
          padding-left: 8px;
          padding-right: 8px;
          margin-left: -8px;
          margin-right: -8px;
          border-radius: 4px;
        }

        &:last-child {
          border-bottom: none;
        }
      }

      .project-cover {
        width: 48px;
        height: 48px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 20px;
        font-weight: 600;
        font-family: 'Noto Serif SC', serif;
        flex-shrink: 0;
      }

      .project-info {
        flex: 1;
        min-width: 0;
      }

      .project-title {
        font-size: 14px;
        color: #2c2416;
        margin-bottom: 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .project-progress {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .progress-text {
        font-size: 12px;
        color: #5d4e37;
        font-weight: 600;
        min-width: 36px;
      }

      .progress-bar {
        flex: 1;
        height: 6px;
        background-color: #e5dccb;
        border-radius: 3px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #5d4e37, #c84c3b);
        border-radius: 3px;
        transition: width 0.3s ease;
      }

      .quick-actions-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }

      .quick-action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 20px 12px;
        background-color: #f5f0e6;
        border: 1px solid #d4c9b5;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
          background-color: #ede6d6;
          transform: translateY(-2px);
          border-color: #c84c3b;
        }

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
          color: #5d4e37;
        }

        span {
          font-size: 13px;
          color: #5d4e37;
          font-family: 'Noto Serif SC', serif;
        }
      }

      @media (max-width: 768px) {
        .content-grid {
          grid-template-columns: 1fr;
        }
      }
    `
  ]
})
export class DashboardHomeComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  currentUser = this.authService.currentUser;

  greeting = this.getGreeting();
  today = this.getToday();

  statCards: StatCard[] = [
    {
      title: '参与项目',
      value: 12,
      icon: 'folder',
      color: '#5D4E37',
      route: '/project'
    },
    {
      title: '待勘校',
      value: 48,
      icon: 'edit_note',
      color: '#C84C3B',
      route: '/collation'
    },
    {
      title: '待审核',
      value: 16,
      icon: 'rate_review',
      color: '#C89B3B',
      route: '/collation'
    },
    {
      title: '已批注',
      value: 256,
      icon: 'comment',
      color: '#4A7C59',
      route: '/annotation'
    }
  ];

  recentTasks: RecentTask[] = [
    {
      id: '1',
      title: '《四库全书》卷三勘校',
      project: '四库全书整理项目',
      status: 'in-progress',
      deadline: '2026-06-15'
    },
    {
      id: '2',
      title: '《永乐大典》批注审核',
      project: '永乐大典数字化',
      status: 'review',
      deadline: '2026-06-10'
    },
    {
      id: '3',
      title: '《史记》异文比对',
      project: '二十四史整理工程',
      status: 'pending',
      deadline: '2026-06-20'
    },
    {
      id: '4',
      title: '《资治通鉴》卷五勘校',
      project: '资治通鉴整理',
      status: 'completed',
      deadline: '2026-06-01'
    }
  ];

  activeProjects = [
    {
      id: '1',
      title: '四库全书整理项目',
      color: '#5D4E37',
      progress: 65
    },
    {
      id: '2',
      title: '永乐大典数字化',
      color: '#C84C3B',
      progress: 42
    },
    {
      id: '3',
      title: '二十四史整理工程',
      color: '#4A7C59',
      progress: 28
    }
  ];

  private getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了，注意休息';
    if (hour < 9) return '早上好';
    if (hour < 12) return '上午好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    if (hour < 22) return '晚上好';
    return '夜深了，注意休息';
  }

  private getToday(): string {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    };
    return now.toLocaleDateString('zh-CN', options);
  }

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
}
