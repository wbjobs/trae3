// 应用配置 - 提供全局依赖注入

import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions
} from '@angular/router';
import {
  HttpClientModule,
  provideHttpClient,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS
} from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { TokenInterceptor } from './core/interceptors/token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    // 路由配置
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),

    // 动画支持
    provideAnimations(),

    // HTTP客户端配置
    importProvidersFrom(HttpClientModule),
    provideHttpClient(withInterceptorsFromDi()),

    // Token拦截器
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TokenInterceptor,
      multi: true
    }
  ]
};
