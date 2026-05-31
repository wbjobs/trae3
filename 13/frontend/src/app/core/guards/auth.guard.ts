// 认证守卫 - 保护需要登录的路由

import { Injectable } from '@angular/core';
import {
  CanActivate,
  CanActivateChild,
  CanLoad,
  Route,
  UrlSegment,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
  UrlTree
} from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate, CanActivateChild, CanLoad {
  constructor(private authService: AuthService, private router: Router) {}

  /**
   * 检查是否可以激活路由
   */
  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ):
    | Observable<boolean | UrlTree>
    | Promise<boolean | UrlTree>
    | boolean
    | UrlTree {
    return this.checkAuthentication(route, state.url);
  }

  /**
   * 检查是否可以激活子路由
   */
  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ):
    | Observable<boolean | UrlTree>
    | Promise<boolean | UrlTree>
    | boolean
    | UrlTree {
    return this.checkAuthentication(childRoute, state.url);
  }

  /**
   * 检查是否可以加载模块
   */
  canLoad(
    route: Route,
    segments: UrlSegment[]
  ):
    | Observable<boolean | UrlTree>
    | Promise<boolean | UrlTree>
    | boolean
    | UrlTree {
    return this.checkAuthentication(null, `/${segments.join('/')}`);
  }

  /**
   * 检查认证状态和权限
   */
  private checkAuthentication(
    route: ActivatedRouteSnapshot | null,
    redirectUrl: string
  ): boolean | UrlTree {
    const isAuthenticated = this.authService.isAuthenticated();

    if (!isAuthenticated) {
      return this.router.createUrlTree(['/auth/login'], {
        queryParams: { returnUrl: redirectUrl }
      });
    }

    // 检查路由所需的角色权限
    if (route?.data?.['roles']) {
      const requiredRoles: UserRole[] = route.data['roles'];
      if (!this.authService.hasRole(requiredRoles)) {
        return this.router.createUrlTree(['/forbidden']);
      }
    }

    return true;
  }
}
